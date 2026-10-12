//! Ranked ratings, the ladder, and the leave penalty, against Postgres.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::AppState;
use crate::rate::Budgets;
use crate::rating::{PlayerSkill, prior};
use crate::world::RatedResult;

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

fn budgets() -> Budgets {
    Budgets {
        register: 100,
        login: 100,
        window: Duration::from_mins(1),
    }
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn ladder_pages_hide_usernames_and_reject_a_bad_query(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let (status, _, body) = http(port, "GET", "/api/v1/ladder", "", "").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"entries\":[]"), "{body}");
    let (cookie, _) = account(port, "Zara").await;
    let (status, _, body) = http(port, "GET", "/api/v1/ladder?limit=0", &cookie, "").await;
    assert_eq!(status, 400, "{body}");
    assert!(body.contains("VALIDATION"));
    let (status, _, body) = http(port, "GET", "/api/v1/ladder?season=999", &cookie, "").await;
    assert_eq!(status, 404, "{body}");
    assert!(body.contains("NOT_FOUND"));
    let (status, _, body) = http(port, "GET", "/api/v1/ladder?limit=25", &cookie, "").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"entries\":[]"), "{body}");
    assert!(!body.contains("Zara"), "{body}");
    assert!(!body.contains("\"username\""), "{body}");
    let id = me_id(&cookie, port).await;
    state
        .record_for_test(crate::world::GameReport {
            id: "ladder-game".to_owned(),
            mode: "ranked",
            table_kind: None,
            seats: vec![],
            overs: vec![],
            penalise: vec![],
            log: vec![],
            rated: vec![rated(&id, 0, 1, 30.0)],
        })
        .await;
    let (status, _, page) = http(port, "GET", "/api/v1/ladder?limit=25", &cookie, "").await;
    assert_eq!(status, 200, "{page}");
    assert!(page.contains("\"rank\":1"), "{page}");
    assert!(!page.contains("\"username\""), "{page}");
    assert!(!page.contains("Zara"), "{page}");
    assert!(page.contains("\"tier\":"), "{page}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_ranked_leave_is_last_and_rated_and_cooled_down(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool.clone(), Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let mut sockets = Vec::new();
    let mut cookies = Vec::new();
    for name in ["Rook", "Mara", "Ned", "Odo"] {
        let (cookie, socket) = account(port, name).await;
        cookies.push(cookie);
        sockets.push(socket);
    }
    for (index, socket) in sockets.iter_mut().enumerate() {
        let id = index + 2;
        send(
            socket,
            &format!(r#"{{"t":"queue.join","id":{id},"mode":"ranked"}}"#),
        )
        .await;
        let ok = read_text(socket).await;
        assert!(ok.contains("\"t\":\"ok\""), "{ok}");
        if index + 1 == 4 {
            assert!(ok.contains("\"found\":4"), "{ok}");
        }
    }
    for socket in &mut sockets {
        let start = next_kind(socket, "game.start").await;
        assert!(start.contains("\"mode\":\"ranked\""), "{start}");
        assert!(start.contains("\"lobbyId\":null"), "{start}");
        assert!(!start.contains("\"bot\":true"), "{start}");
        let opening = read_text(socket).await;
        assert!(opening.contains("\"t\":\"game.update\""), "{opening}");
    }
    send(&mut sockets[0], r#"{"t":"game.leave","id":9}"#).await;
    let left = read_text(&mut sockets[0]).await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");
    let _ = read_text(&mut sockets[0]).await;
    for _ in 0..600 {
        state.advance(Duration::from_secs(45)).await;
    }
    let mut overs = Vec::new();
    for socket in &mut sockets {
        overs.push(until_over(socket).await);
    }
    for over in &overs {
        assert!(over.contains("\"places\":[4,4,4,4]"), "{over}");
        assert!(over.contains("\"forfeited\":[0,1,2,3]"), "{over}");
        assert!(over.contains("\"rating\":{"), "{over}");
        assert!(over.contains("\"games\":1"), "{over}");
        assert_eq!(over.matches("\"rating\":").count(), 1, "{over}");
        assert!(!over.contains("Rook"), "{over}");
    }
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookies[0], "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"games\":0"), "{me}");
    assert!(me.contains("\"cooldownUntil\":"), "{me}");
    assert!(!me.contains("\"cooldownUntil\":null"), "{me}");
    let (status, _, other) = http(port, "GET", "/api/v1/me", &cookies[1], "").await;
    assert_eq!(status, 200, "{other}");
    assert!(!other.contains("\"cooldownUntil\":null"), "{other}");
    send(
        &mut sockets[0],
        r#"{"t":"queue.join","id":10,"mode":"ranked"}"#,
    )
    .await;
    let cooled = read_text(&mut sockets[0]).await;
    assert!(cooled.contains("QUEUE_COOLDOWN"), "{cooled}");
    assert!(cooled.contains("You cannot queue yet."), "{cooled}");
    send(
        &mut sockets[0],
        r#"{"t":"queue.join","id":11,"mode":"casual"}"#,
    )
    .await;
    let casual = read_text(&mut sockets[0]).await;
    assert!(casual.contains("\"mode\":\"casual\""), "{casual}");
    let (status, _, page) = http(port, "GET", "/api/v1/ladder?limit=2", &cookies[1], "").await;
    assert_eq!(status, 200, "{page}");
    assert!(page.contains("\"rank\":1"), "{page}");
    assert!(page.contains("\"next\":"), "{page}");
    assert!(!page.contains("\"username\""), "{page}");
    let next = page
        .split("\"next\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    let (status, _, page) = http(
        port,
        "GET",
        &format!("/api/v1/ladder?limit=2&after={next}"),
        &cookies[1],
        "",
    )
    .await;
    assert_eq!(status, 200, "{page}");
    assert!(page.contains("\"rank\":3"), "{page}");
    assert_action_log(&pool).await;
}

async fn assert_action_log(pool: &sqlx::PgPool) {
    let rows: Vec<(String, i32, String, Option<i32>, String)> = sqlx::query_as(
        "SELECT game_id, seq, kind, seat, body FROM action_log ORDER BY game_id, seq",
    )
    .fetch_all(pool)
    .await
    .expect("action log");
    assert!(!rows.is_empty());
    let mut game = String::new();
    let mut next_seq = 0_i32;
    let mut saw_deal = false;
    let mut saw_advance = false;
    let mut saw_step = false;
    for (id, seq, kind, seat, body) in &rows {
        if id != &game {
            assert_eq!(*seq, 0, "{id}");
            game.clone_from(id);
            next_seq = 0;
        }
        assert_eq!(*seq, next_seq, "{id}");
        next_seq += 1;
        match kind.as_str() {
            "deal" => {
                assert!(seat.is_none(), "{body}");
                assert!(body.contains("\"round\""), "{body}");
                assert!(body.contains("\"cards\""), "{body}");
                saw_deal = true;
            }
            "advance" => {
                assert!(seat.is_none(), "{body}");
                assert_eq!(body, "{}");
                saw_advance = true;
            }
            "bid" | "play" | "ability" => {
                assert!(seat.is_some(), "{body}");
                saw_step = true;
            }
            other => panic!("unknown action log kind {other}"),
        }
    }
    assert!(saw_deal && saw_advance && saw_step);
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_far_rating_waits_for_the_window_to_widen(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let (cookie, mut high) = account(port, "High").await;
    let id = me_id(&cookie, port).await;
    state
        .record_for_test(crate::world::GameReport {
            id: "seed-rating".to_owned(),
            mode: "ranked",
            table_kind: None,
            seats: vec![],
            overs: vec![],
            penalise: vec![],
            log: vec![],
            rated: vec![rated(&id, 0, 1, 105.0)],
        })
        .await;
    send(&mut high, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut high).await.contains("\"t\":\"ok\""));
    let mut others = Vec::new();
    for name in ["Ann", "Bea", "Cid"] {
        let (_, mut socket) = account(port, name).await;
        send(&mut socket, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
        assert!(read_text(&mut socket).await.contains("\"t\":\"ok\""));
        others.push(socket);
    }
    for _ in 0..3 {
        let status = read_text(&mut high).await;
        assert!(status.contains("\"t\":\"queue.status\""), "{status}");
        assert!(!status.contains("\"t\":\"game.start\""), "{status}");
    }
    let early = tokio::time::timeout(Duration::from_millis(150), read_text(&mut high)).await;
    assert!(
        early.is_err(),
        "a rating of 80 must not sit with new accounts yet"
    );
    state.advance(Duration::from_mins(2)).await;
    let start = read_text(&mut high).await;
    assert!(start.contains("\"t\":\"game.start\""), "{start}");
    assert!(start.contains("\"mode\":\"ranked\""), "{start}");
    assert!(!start.contains("\"bot\":true"), "{start}");
}

fn rated(user: &str, seat: u8, place: u32, mu: f64) -> RatedResult {
    let skill = PlayerSkill {
        mu,
        sigma: prior().sigma,
        games: 10,
    };
    RatedResult {
        user: skt_protocol::UserId::new(user),
        seat,
        total: 10,
        place,
        after: skill,
    }
}

async fn next_kind(socket: &mut Socket, kind: &str) -> String {
    let needle = format!("\"t\":\"{kind}\"");
    for _ in 0..20 {
        let frame = read_text(socket).await;
        if frame.contains(&needle) {
            return frame;
        }
    }
    panic!("no {kind}");
}

async fn until_over(socket: &mut Socket) -> String {
    for _ in 0..2_000 {
        let frame = tokio::time::timeout(Duration::from_millis(200), read_text(socket))
            .await
            .expect("game.over");
        if frame.contains("\"t\":\"game.over\"") {
            return frame;
        }
    }
    panic!("no game.over");
}

async fn me_id(cookie: &str, port: u16) -> String {
    let (status, _, body) = http(port, "GET", "/api/v1/me", cookie, "").await;
    assert_eq!(status, 200, "{body}");
    body.split("\"id\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned()
}

async fn account(port: u16, username: &str) -> (String, Socket) {
    let (cookie, _) = guest(port).await;
    let body = format!(r#"{{"username":"{username}","password":"secret"}}"#);
    let (status, _, registered) = http(port, "POST", "/api/v1/auth/register", &cookie, &body).await;
    assert_eq!(status, 200, "{registered}");
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    (cookie, socket)
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

async fn guest(port: u16) -> (String, String) {
    let (status, head, body) = http(port, "POST", "/api/v1/auth/guest", "", "").await;
    assert_eq!(status, 200, "{body}");
    (cookie_of(&head), body)
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

async fn http(
    port: u16,
    method: &str,
    path: &str,
    cookie: &str,
    body: &str,
) -> (u16, String, String) {
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
    (status, head.to_owned(), body.to_owned())
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

async fn greet(socket: &mut Socket) {
    send(
        socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(socket).await;
    let _ = read_text(socket).await;
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

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_player_can_read_the_log_of_a_game_they_sat(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let (cookie, _) = account(port, "Aud").await;
    let (other, _) = account(port, "Out").await;
    let id = me_id(&cookie, port).await;
    let game = "018f6b4a-6a2e-7c3a-8b1d-9e0f1a2b3c4f";
    state
        .record_for_test(crate::world::GameReport {
            id: game.to_owned(),
            mode: "casual",
            table_kind: None,
            seats: vec![crate::world::SeatTally {
                user: skt_protocol::UserId::new(id),
                seat: 0,
                total: 10,
                place: 1,
                win: true,
                bids_made: 1,
                bids_total: 1,
            }],
            rated: Vec::new(),
            overs: Vec::new(),
            penalise: Vec::new(),
            log: vec![
                crate::world::LogEntry {
                    kind: "deal",
                    seat: None,
                    body: r#"{"round":0,"cards":[1,2]}"#.to_owned(),
                },
                crate::world::LogEntry {
                    kind: "bid",
                    seat: Some(0),
                    body: r#"{"bid":1}"#.to_owned(),
                },
            ],
        })
        .await;
    let (status, _, body) = http(
        port,
        "GET",
        &format!("/api/v1/games/{game}/log"),
        &cookie,
        "",
    )
    .await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"kind\":\"deal\""), "{body}");
    assert!(body.contains("\"kind\":\"bid\""), "{body}");
    assert!(body.contains(&format!("\"gameId\":\"{game}\"")), "{body}");
    let (status, _, body) = http(
        port,
        "GET",
        &format!("/api/v1/games/{game}/log"),
        &other,
        "",
    )
    .await;
    assert_eq!(status, 404, "{body}");
    let (status, _, body) = http(port, "GET", &format!("/api/v1/games/{game}/log"), "", "").await;
    assert_eq!(status, 401, "{body}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_private_party_waits_two_hours_before_ranked(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let mut ada = account(port, "Ada").await.1;
    let mut bea = account(port, "Bea").await.1;
    let mut cid = account(port, "Cid").await.1;
    let mut dee = account(port, "Dee").await.1;
    send(
        &mut ada,
        &format!(r#"{{"t":"lobby.create","id":2,"visibility":"private","settings":{PRIVATE}}}"#),
    )
    .await;
    let created = read_text(&mut ada).await;
    let code = created
        .split("\"code\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned();
    send(
        &mut bea,
        &format!(r#"{{"t":"lobby.join","id":2,"code":"{code}"}}"#),
    )
    .await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut ada).await;
    send(&mut ada, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_text(&mut ada).await;
    let _ = read_text(&mut ada).await;
    let _ = read_text(&mut bea).await;
    send(&mut bea, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut ada).await;
    send(&mut ada, r#"{"t":"lobby.start","id":4}"#).await;
    assert!(saw(&mut ada, "game.start").await);
    assert!(saw(&mut bea, "game.start").await);
    for socket in [&mut ada, &mut bea] {
        send(socket, r#"{"t":"game.leave","id":5}"#).await;
        assert!(saw(socket, "\"t\":\"ok\"").await);
    }
    for socket in [&mut ada, &mut bea, &mut cid, &mut dee] {
        send(socket, r#"{"t":"queue.join","id":6,"mode":"ranked"}"#).await;
        assert!(saw(socket, "\"t\":\"ok\"").await);
    }
    assert!(!saw(&mut ada, "\"t\":\"game.start\"").await);
    state.advance(Duration::from_hours(2)).await;
    assert!(saw(&mut ada, "\"t\":\"game.start\"").await);
    assert!(saw(&mut bea, "\"t\":\"game.start\"").await);
    assert!(saw(&mut cid, "\"t\":\"game.start\"").await);
    assert!(saw(&mut dee, "\"t\":\"game.start\"").await);
}

async fn saw(socket: &mut Socket, needle: &str) -> bool {
    for _ in 0..12 {
        let frame = tokio::time::timeout(Duration::from_millis(40), read_text(socket)).await;
        let Ok(frame) = frame else {
            return false;
        };
        if frame.contains(needle) {
            return true;
        }
    }
    false
}

const PRIVATE: &str = r#"{"maxPlayers":2,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}"#;

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_restart_replays_the_same_hand(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state.clone()).await;
    let (status, _, body) = http(port, "GET", "/api/v1/metrics", "", "").await;
    assert_eq!(status, 200, "{body}");
    assert!(body.contains("\"games\":0"), "{body}");
    let mut checks = Vec::new();
    for _ in 0..16 {
        checks.push(http(port, "GET", "/api/v1/health", "", ""));
    }
    for check in checks {
        assert_eq!(check.await.0, 200);
    }
    let mut ada = account(port, "Ada").await.1;
    let mut bea = account(port, "Bea").await.1;
    send(
        &mut ada,
        &format!(r#"{{"t":"lobby.create","id":2,"visibility":"private","settings":{PRIVATE}}}"#),
    )
    .await;
    let created = read_text(&mut ada).await;
    let code = created
        .split("\"code\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned();
    send(
        &mut bea,
        &format!(r#"{{"t":"lobby.join","id":2,"code":"{code}"}}"#),
    )
    .await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut ada).await;
    send(&mut ada, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_text(&mut ada).await;
    let _ = read_text(&mut ada).await;
    let _ = read_text(&mut bea).await;
    send(&mut bea, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut bea).await;
    let _ = read_text(&mut ada).await;
    send(&mut ada, r#"{"t":"lobby.start","id":4}"#).await;
    assert!(saw(&mut ada, "game.start").await);
    let Some((user, before)) = state.live_hand().await else {
        panic!("no hand");
    };
    let again = state.restored_hand(&user).await;
    assert_eq!(again.as_deref(), Some(before.as_slice()));
}
