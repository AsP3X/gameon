//! Solo on the server: one human, bots, a pause on drop, and no stats for an abandon.

use std::collections::HashSet;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::AppState;
use crate::rate::Budgets;

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

fn budgets() -> Budgets {
    Budgets {
        register: 100,
        login: 100,
        window: Duration::from_mins(1),
    }
}

async fn serve(state: AppState) -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let port = listener.local_addr().expect("port").port();
    tokio::spawn(async move {
        let _ = axum::serve(
            listener,
            crate::router(state).into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await;
    });
    port
}

async fn http(port: u16, method: &str, path: &str, cookie: &str, body: &str) -> (u16, String) {
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCookie: {cookie}\r\n\r\n{body}",
        body.len()
    );
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("connect");
    stream.write_all(request.as_bytes()).await.expect("write");
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await.expect("read");
    let text = String::from_utf8_lossy(&bytes);
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or(("", ""));
    let status = head
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    (status, body.to_owned())
}

fn cookie_of(head: &str) -> String {
    head.lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            (name.eq_ignore_ascii_case("set-cookie"))
                .then(|| value.trim().split(';').next().unwrap_or("").to_owned())
        })
        .unwrap_or_default()
}

async fn guest(port: u16) -> (String, String) {
    let request_body = "";
    let request = format!(
        "POST /api/v1/auth/guest HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n{request_body}"
    );
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("connect");
    stream.write_all(request.as_bytes()).await.expect("write");
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await.expect("read");
    let text = String::from_utf8_lossy(&bytes);
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or(("", ""));
    let status: u16 = head
        .split_whitespace()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    assert_eq!(status, 200, "{body}");
    (cookie_of(head), body.to_owned())
}

fn user_id_of(body: &str) -> String {
    body.split("\"id\":\"")
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .unwrap_or("")
        .to_owned()
}

async fn open_socket(port: u16, cookie: &str) -> Socket {
    let mut request = format!("ws://127.0.0.1:{port}/api/v1/ws")
        .into_client_request()
        .expect("request");
    request
        .headers_mut()
        .insert("origin", "http://localhost".parse().expect("origin"));
    request
        .headers_mut()
        .insert("cookie", cookie.parse().expect("cookie"));
    let (socket, _) = tokio_tungstenite::connect_async(request)
        .await
        .expect("socket");
    socket
}

async fn send(socket: &mut Socket, text: &str) {
    socket
        .send(tokio_tungstenite::tungstenite::Message::Text(text.into()))
        .await
        .expect("send");
}

async fn read_text(socket: &mut Socket) -> String {
    let frame = socket.next().await.expect("frame").expect("ok");
    frame.into_text().expect("text").to_string()
}

fn parse(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_owned()))
}

async fn hello(socket: &mut Socket) -> Value {
    send(
        socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let ok = parse(&read_text(socket).await);
    assert_eq!(ok["t"].as_str(), Some("ok"), "{ok}");
    parse(&read_text(socket).await)
}

fn start_message(id: u32, max_players: u8, format: &str, pace: &str) -> String {
    format!(
        r#"{{"t":"solo.start","id":{id},"settings":{{"maxPlayers":{max_players},"scoring":"classic","format":"{format}","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"{pace}"}}}}"#
    )
}

async fn frames_of(socket: &mut Socket, first: Duration) -> Vec<Value> {
    let mut frames = Vec::new();
    let Ok(text) = tokio::time::timeout(first, read_text(socket)).await else {
        return frames;
    };
    frames.push(parse(&text));
    loop {
        let Ok(text) = tokio::time::timeout(Duration::from_millis(200), read_text(socket)).await
        else {
            break;
        };
        frames.push(parse(&text));
    }
    frames
}

fn refuse_err(frames: &[Value]) {
    for frame in frames {
        assert!(
            frame["t"].as_str() != Some("err"),
            "the table rejected a legal solo step: {frame}"
        );
    }
}

fn pick(frames: &[Value]) -> Value {
    if let Some(over) = frames
        .iter()
        .rev()
        .find(|frame| frame["t"].as_str() == Some("game.over"))
    {
        return over.clone();
    }
    frames
        .iter()
        .rev()
        .find(|frame| frame["t"].as_str() == Some("game.update"))
        .cloned()
        .unwrap_or_else(|| panic!("no table frame in {frames:?}"))
}

fn at_of(view: &Value) -> (u64, u64) {
    let round = view["round"].as_u64().unwrap_or(0);
    let won = view["won"].as_array().map_or(0, |rows| {
        rows.iter().map(|trick| trick.as_u64().unwrap_or(0)).sum()
    });
    let index = usize::try_from(round).unwrap_or(0);
    let destroyed = view["log"]
        .as_array()
        .and_then(|log| log.get(index))
        .and_then(|row| row["destroyed"].as_u64())
        .unwrap_or(0);
    (round, won.saturating_add(destroyed))
}

fn needs_bid(view: &Value) -> bool {
    let me = usize::try_from(view["me"].as_u64().unwrap_or(0)).unwrap_or(0);
    view["bids"].get(me).is_none_or(Value::is_null)
}

fn legal_cards(view: &Value) -> Vec<u64> {
    view["legal"]
        .as_array()
        .map(|cards| cards.iter().filter_map(Value::as_u64).collect())
        .unwrap_or_default()
}

fn play_message(id: u32, round: u64, trick: u64, card: u64, tigress: bool) -> String {
    if tigress {
        format!(
            r#"{{"t":"game.play","id":{id},"at":{{"round":{round},"trick":{trick}}},"card":{card},"as":"escape"}}"#
        )
    } else {
        format!(
            r#"{{"t":"game.play","id":{id},"at":{{"round":{round},"trick":{trick}}},"card":{card}}}"#
        )
    }
}

async fn acted(socket: &mut Socket) -> Value {
    let frames = frames_of(socket, Duration::from_secs(3)).await;
    refuse_err(&frames);
    pick(&frames)
}

async fn drive(
    state: &AppState,
    socket: &mut Socket,
    mut current: Value,
    tigress: &HashSet<u64>,
) -> Value {
    let mut id = 10u32;
    for _ in 0..400 {
        if current["t"].as_str() == Some("game.over") {
            return current;
        }
        let phase = current["view"]["phase"].as_str().unwrap_or("");
        if phase == "gameOver" {
            state.advance(Duration::from_secs(1)).await;
            current = acted(socket).await;
            continue;
        }
        let view = &current["view"];
        let (round, trick) = at_of(view);
        if phase == "bidding" && needs_bid(view) {
            id = id.saturating_add(1);
            send(
                socket,
                &format!(
                    r#"{{"t":"game.bid","id":{id},"at":{{"round":{round},"trick":{trick}}},"bid":0}}"#
                ),
            )
            .await;
            current = acted(socket).await;
            continue;
        }
        if phase == "playing" {
            let me = view["me"].as_u64().unwrap_or(0);
            if view["turn"].as_u64() == Some(me)
                && let Some(card) = legal_cards(view).first().copied()
            {
                id = id.saturating_add(1);
                send(
                    socket,
                    &play_message(id, round, trick, card, tigress.contains(&card)),
                )
                .await;
                current = acted(socket).await;
                continue;
            }
        }
        if phase == "roundEnd" {
            let me = usize::try_from(view["me"].as_u64().unwrap_or(0)).unwrap_or(0);
            let ready = current["table"]["ready"]
                .get(me)
                .and_then(Value::as_bool)
                .unwrap_or(false);
            if !ready {
                id = id.saturating_add(1);
                send(socket, &format!(r#"{{"t":"game.ready","id":{id}}}"#)).await;
                current = acted(socket).await;
                continue;
            }
        }
        assert_ne!(phase, "ability", "abilities are off: {current}");
        let wait = if phase == "trickEnd" { 3 } else { 2 };
        state.advance(Duration::from_secs(wait)).await;
        let frames = frames_of(socket, Duration::from_secs(2)).await;
        assert!(
            !frames.is_empty(),
            "the table did not move from {phase}: {current}"
        );
        refuse_err(&frames);
        current = pick(&frames);
    }
    panic!("the solo game did not finish: {current}");
}

async fn wait_offline(state: &AppState, user: &skt_protocol::UserId) {
    for _ in 0..50 {
        if state.solo_seat_offline(user).await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("the solo seat stayed online after the socket closed");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_solo_table_pauses_on_drop_and_an_abandon_writes_nothing(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool.clone(), Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, body) = guest(port).await;
    let user = skt_protocol::UserId::new(user_id_of(&body));
    let mut socket = open_socket(port, &cookie).await;
    let welcome = hello(&mut socket).await;
    assert_eq!(welcome["t"].as_str(), Some("welcome"), "{welcome}");
    assert!(welcome["game"].is_null(), "{welcome}");

    send(&mut socket, &start_message(2, 1, "classic", "standard")).await;
    let too_small = parse(&read_text(&mut socket).await);
    assert_eq!(
        too_small["code"].as_str(),
        Some("VALIDATION"),
        "{too_small}"
    );
    send(&mut socket, &start_message(3, 9, "classic", "standard")).await;
    let too_big = parse(&read_text(&mut socket).await);
    assert_eq!(too_big["code"].as_str(), Some("VALIDATION"), "{too_big}");

    send(&mut socket, &start_message(4, 4, "classic", "relaxed")).await;
    let opened = parse(&read_text(&mut socket).await);
    let start = parse(&read_text(&mut socket).await);
    let update = parse(&read_text(&mut socket).await);
    assert_eq!(opened["t"].as_str(), Some("ok"), "{opened}");
    assert_eq!(start["t"].as_str(), Some("game.start"), "{start}");
    assert_eq!(start["table"].as_str(), Some("solo"), "{start}");
    assert_eq!(start["mode"].as_str(), Some("custom"), "{start}");
    assert!(start["lobbyId"].is_null(), "{start}");
    assert_eq!(start["me"].as_u64(), Some(0), "{start}");
    assert_eq!(
        start["settings"]["format"].as_str(),
        Some("classic"),
        "{start}"
    );
    assert_eq!(
        start["settings"]["pace"].as_str(),
        Some("standard"),
        "{start}"
    );
    assert_eq!(
        start["schedule"].as_array().map(Vec::as_slice),
        Some(
            [
                Value::from(1),
                Value::from(2),
                Value::from(3),
                Value::from(4),
                Value::from(5),
                Value::from(6),
                Value::from(7),
                Value::from(8),
                Value::from(9),
                Value::from(10),
            ]
            .as_slice()
        ),
        "{start}"
    );
    assert_eq!(
        start["seats"].as_array().map(|seats| {
            seats
                .iter()
                .filter(|seat| seat["bot"].as_bool() == Some(true))
                .count()
        }),
        Some(3),
        "{start}"
    );
    assert_eq!(update["t"].as_str(), Some("game.update"), "{update}");
    assert_eq!(update["rev"].as_u64(), Some(0), "{update}");
    assert!(update["table"]["deadline"].is_null(), "{update}");
    let hand = update["view"]["hand"].clone();

    let (status, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"table\":\"solo\""), "{me}");
    assert!(me.contains("\"round\":1"), "{me}");
    assert!(me.contains("\"rounds\":10"), "{me}");
    assert!(me.contains("\"bots\":3"), "{me}");
    assert!(me.contains("\"byMode\""), "{me}");
    let (status, config) = http(port, "GET", "/api/v1/config", "", "").await;
    assert_eq!(status, 200, "{config}");
    assert!(config.contains("\"format\":\"classic\""), "{config}");

    send(&mut socket, &start_message(5, 4, "classic", "standard")).await;
    let second = parse(&read_text(&mut socket).await);
    assert_eq!(second["code"].as_str(), Some("ALREADY_SEATED"), "{second}");

    // The reply does not wait on the log. The tick is what writes the open game.
    state.persist_open().await;
    let kind: Option<String> = sqlx::query_scalar("SELECT table_kind FROM open_games")
        .fetch_one(&pool)
        .await
        .expect("open game");
    assert_eq!(kind.as_deref(), Some("solo"));

    socket.close(None).await.expect("close");
    wait_offline(&state, &user).await;
    state.advance(Duration::from_secs(30)).await;
    let (before, after) = state
        .reloaded_log_len(&user)
        .await
        .expect("reloaded solo game");
    assert_eq!(before, after);
    assert!(before >= 1, "{before}");

    let mut back = open_socket(port, &cookie).await;
    let restored = hello(&mut back).await;
    assert_eq!(
        restored["game"]["update"]["view"]["hand"], hand,
        "{restored}"
    );
    assert!(
        restored["game"]["update"]["view"]["bids"]
            .as_array()
            .is_some_and(|bids| bids.iter().all(Value::is_null)),
        "{restored}"
    );
    assert_eq!(
        restored["game"]["update"]["table"]["status"][0].as_str(),
        Some("offline"),
        "{restored}"
    );
    assert_eq!(restored["game"]["start"]["table"].as_str(), Some("solo"));

    for _ in 0..4 {
        state.advance(Duration::from_secs(2)).await;
    }
    let caught_up = frames_of(&mut back, Duration::from_secs(2)).await;
    let latest = pick(&caught_up);
    let bids = latest["view"]["bids"].as_array().expect("bids");
    assert!(bids[0].is_null(), "{latest}");
    assert!(
        bids.iter().skip(1).all(|bid| bid.as_i64() == Some(-1)),
        "{latest}"
    );
    assert!(latest["table"]["deadline"].is_null(), "{latest}");
    assert_ne!(
        latest["table"]["status"][0].as_str(),
        Some("bot"),
        "{latest}"
    );

    send(&mut back, r#"{"t":"game.leave","id":6}"#).await;
    let left = frames_of(&mut back, Duration::from_secs(2)).await;
    assert_eq!(left.len(), 1, "{left:?}");
    assert_eq!(left[0]["t"].as_str(), Some("ok"), "{left:?}");
    let (status, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"games\":0"), "{me}");
    assert!(me.contains("\"active\":null"), "{me}");
    assert!(me.contains("\"cooldownUntil\":null"), "{me}");
    state.persist_open().await;
    let open_rows: i64 = sqlx::query_scalar("SELECT count(*) FROM open_games")
        .fetch_one(&pool)
        .await
        .expect("count open");
    let stored_rows: i64 = sqlx::query_scalar("SELECT count(*) FROM games")
        .fetch_one(&pool)
        .await
        .expect("count games");
    assert_eq!((open_rows, stored_rows), (0, 0));

    send(&mut back, &start_message(7, 2, "swift", "standard")).await;
    let again = parse(&read_text(&mut back).await);
    let restarted = parse(&read_text(&mut back).await);
    assert_eq!(again["t"].as_str(), Some("ok"), "{again}");
    assert_eq!(restarted["table"].as_str(), Some("solo"), "{restarted}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_finished_solo_game_counts_in_the_headline(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool.clone(), Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, _) = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    let _ = hello(&mut socket).await;
    send(&mut socket, &start_message(2, 2, "swift", "standard")).await;
    let opened = parse(&read_text(&mut socket).await);
    let start = parse(&read_text(&mut socket).await);
    let update = parse(&read_text(&mut socket).await);
    assert_eq!(opened["t"].as_str(), Some("ok"), "{opened}");
    assert_eq!(start["t"].as_str(), Some("game.start"), "{start}");
    let tigress = start["deck"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|card| card["kind"].as_str() == Some("tigress"))
        .filter_map(|card| card["id"].as_u64())
        .collect();
    let over = drive(&state, &mut socket, update, &tigress).await;
    assert_eq!(over["t"].as_str(), Some("game.over"), "{over}");
    assert!(over["result"]["lobbyId"].is_null(), "{over}");

    let (status, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"games\":1"), "{me}");
    assert!(me.contains("\"bidsTotal\":5"), "{me}");
    assert!(me.contains("\"byMode\""), "{me}");
    let row: (String, Option<String>) = sqlx::query_as("SELECT mode, table_kind FROM games")
        .fetch_one(&pool)
        .await
        .expect("finished game");
    assert_eq!(row.0, "custom");
    assert_eq!(row.1.as_deref(), Some("solo"));
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn registering_a_guest_keeps_the_solo_game(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state).await;
    let (cookie, body) = guest(port).await;
    let user_id = user_id_of(&body);
    let mut socket = open_socket(port, &cookie).await;
    let _ = hello(&mut socket).await;
    send(&mut socket, &start_message(2, 2, "classic", "standard")).await;
    let _ = parse(&read_text(&mut socket).await);
    let start = parse(&read_text(&mut socket).await);
    let _ = parse(&read_text(&mut socket).await);
    let game_id = start["gameId"].as_str().unwrap_or("").to_owned();
    assert!(!game_id.is_empty(), "{start}");

    let (status, registered) = http(
        port,
        "POST",
        "/api/v1/auth/register",
        &cookie,
        r#"{"username":"Nell","password":"secret"}"#,
    )
    .await;
    assert_eq!(status, 200, "{registered}");
    assert!(registered.contains(&user_id), "{registered}");
    socket.close(None).await.expect("close");

    let mut again = open_socket(port, &cookie).await;
    let welcome = hello(&mut again).await;
    assert!(welcome.to_string().contains(&game_id), "{welcome}");
    assert_eq!(
        welcome["game"]["start"]["table"].as_str(),
        Some("solo"),
        "{welcome}"
    );
    assert_eq!(welcome["me"]["user"]["id"].as_str(), Some(user_id.as_str()));
    assert_eq!(welcome["me"]["guest"], Value::Bool(false));
}
