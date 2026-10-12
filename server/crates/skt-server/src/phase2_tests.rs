//! Accounts, the public list, and the casual queue, against Postgres.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

use crate::AppState;
use crate::rate::Budgets;

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

async fn http_forwarded(port: u16, forwarded_for: &str) -> u16 {
    let body = r#"{"username":"nobody","password":"x"}"#;
    let request = format!(
        "POST /api/v1/auth/login HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nX-Forwarded-For: {forwarded_for}\r\n\r\n{body}",
        body.len()
    );
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("connect");
    stream.write_all(request.as_bytes()).await.expect("write");
    let mut bytes = Vec::new();
    stream.read_to_end(&mut bytes).await.expect("read");
    let text = String::from_utf8_lossy(&bytes);
    text.split_whitespace()
        .nth(1)
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn eleven_logins_on_separate_connections_share_one_address(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, crate::rate::Budgets::standard());
    let port = serve(state).await;
    let mut codes = Vec::new();
    for index in 0..11 {
        codes.push(http_forwarded(port, &format!("203.0.113.{index}")).await);
    }
    assert_eq!(
        codes,
        vec![401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429]
    );
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
    let (status, head, body) = http(port, "POST", "/api/v1/auth/guest", "", "").await;
    assert_eq!(status, 200, "{body}");
    (cookie_of(&head), body)
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn guest_upgrade_keeps_the_id_and_a_taken_name_is_refused(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state).await;
    let (cookie, body) = guest(port).await;
    let id = body
        .split("\"id\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned();
    let (status, _, registered) = http(
        port,
        "POST",
        "/api/v1/auth/register",
        &cookie,
        "{\"username\":\"Ada\",\"password\":\"secret\"}",
    )
    .await;
    assert_eq!(status, 200, "{registered}");
    assert!(registered.contains(&id));
    assert!(registered.contains("\"guest\":false"));
    assert!(registered.contains("\"username\":\"Ada\""));
    let (status, _, taken) = http(port, "POST", "/api/v1/auth/guest", "", "").await;
    assert_eq!(status, 200);
    let other = cookie_of(&taken);
    let _ = other;
    let (other_cookie, _) = guest(port).await;
    let (status, _, body) = http(
        port,
        "POST",
        "/api/v1/auth/register",
        &other_cookie,
        "{\"username\":\"ada\",\"password\":\"secret\"}",
    )
    .await;
    assert_eq!(status, 409, "{body}");
    assert!(body.contains("USERNAME_TAKEN"));
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_bad_login_logout_and_a_bad_colour(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state).await;
    let (cookie, _) = guest(port).await;
    let _ = http(
        port,
        "POST",
        "/api/v1/auth/register",
        &cookie,
        "{\"username\":\"Bea\",\"password\":\"secret\"}",
    )
    .await;
    let (status, _, body) = http(
        port,
        "POST",
        "/api/v1/auth/login",
        "",
        "{\"username\":\"Bea\",\"password\":\"nope\"}",
    )
    .await;
    assert_eq!(status, 401, "{body}");
    assert!(body.contains("INVALID_CREDENTIALS"));
    let (status, head, _) = http(
        port,
        "POST",
        "/api/v1/auth/login",
        "",
        "{\"username\":\"bea\",\"password\":\"secret\"}",
    )
    .await;
    assert_eq!(status, 200);
    let logged = cookie_of(&head);
    let (status, _, _) = http(port, "POST", "/api/v1/auth/logout", &logged, "").await;
    assert_eq!(status, 204);
    let (status, _, body) = http(port, "GET", "/api/v1/me", &logged, "").await;
    assert_eq!(status, 401, "{body}");
    let (cookie, _) = guest(port).await;
    let (status, _, body) = http(
        port,
        "PATCH",
        "/api/v1/me",
        &cookie,
        "{\"color\":\"#000000\"}",
    )
    .await;
    assert_eq!(status, 400, "{body}");
    assert!(body.contains("VALIDATION"));
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn the_public_list_hides_private_lobbies_and_usernames(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool.clone(), Duration::ZERO, budgets());
    let port = serve(state).await;
    let (cookie, me) = guest(port).await;
    let _ = http(
        port,
        "POST",
        "/api/v1/auth/register",
        &cookie,
        "{\"username\":\"Cara\",\"password\":\"secret\"}",
    )
    .await;
    let id = me
        .split("\"id\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap();
    let (status, _, profile) = http(port, "GET", &format!("/api/v1/users/{id}"), &cookie, "").await;
    assert_eq!(status, 200, "{profile}");
    assert!(!profile.contains("Cara"));
    assert!(!profile.contains("password"));
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    send(
        &mut socket,
        r#"{"t":"lobby.create","id":2,"visibility":"private","settings":{"maxPlayers":4,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}}"#,
    )
    .await;
    let created = read_text(&mut socket).await;
    assert!(created.contains("\"visibility\":\"private\""));
    let (status, _, list) = http(port, "GET", "/api/v1/lobbies", &cookie, "").await;
    assert_eq!(status, 200, "{list}");
    assert_eq!(list, "{\"lobbies\":[]}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_casual_queue_starts_a_game_and_a_guest_cannot_play_ranked(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, _) = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    send(&mut socket, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    let refused = read_text(&mut socket).await;
    assert!(refused.contains("ACCOUNT_REQUIRED"), "{refused}");
    send(&mut socket, r#"{"t":"queue.join","id":3,"mode":"casual"}"#).await;
    let joined = read_text(&mut socket).await;
    assert!(joined.contains("\"mode\":\"casual\""), "{joined}");
    assert!(!joined.contains("Sailor"), "{joined}");
    state.tick().await;
    let started = read_text(&mut socket).await;
    assert!(started.contains("\"t\":\"game.start\""), "{started}");
    assert!(started.contains("\"mode\":\"casual\""));
    assert!(started.contains("\"lobbyId\":null"));
    assert!(started.contains("\"bot\":true"));
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn two_missed_deadlines_mark_the_seat_away(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, _) = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    send(&mut socket, r#"{"t":"queue.join","id":2,"mode":"casual"}"#).await;
    let _ = read_text(&mut socket).await;
    state.tick().await;
    for _ in 0..40 {
        state.advance(Duration::from_secs(3)).await;
    }
    let mut saw_timeout = false;
    let mut saw_away = false;
    for _ in 0..80 {
        let frame = tokio::time::timeout(Duration::from_millis(50), read_text(&mut socket)).await;
        let Ok(frame) = frame else { break };
        if frame.contains("timedOut") {
            saw_timeout = true;
        }
        if frame.contains("\"status\":\"away\"") {
            saw_away = true;
        }
    }
    assert!(saw_timeout, "a missed deadline is played for the seat");
    assert!(saw_away, "the second miss marks the seat away");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn already_seated_while_queued_or_in_a_lobby(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::from_mins(1), budgets());
    let port = serve(state).await;
    let (cookie, _) = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    send(&mut socket, r#"{"t":"queue.join","id":2,"mode":"casual"}"#).await;
    let _ = read_text(&mut socket).await;
    send(
        &mut socket,
        r#"{"t":"lobby.create","id":3,"visibility":"public","settings":{"maxPlayers":4,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}}"#,
    )
    .await;
    let refused = read_text(&mut socket).await;
    assert!(refused.contains("ALREADY_SEATED"), "{refused}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn stats_are_visible_on_me_after_a_recorded_game(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, body) = guest(port).await;
    let id = body
        .split("\"id\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned();
    state
        .record_for_test(crate::world::GameReport {
            id: "game-1".to_owned(),
            mode: "casual",
            table_kind: None,
            rated: vec![],
            overs: vec![],
            penalise: vec![],
            log: vec![],
            seats: vec![crate::world::SeatTally {
                user: skt_protocol::UserId::new(id),
                seat: 0,
                total: -10,
                place: 1,
                win: true,
                bids_made: 2,
                bids_total: 3,
            }],
        })
        .await;
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"games\":1"), "{me}");
    assert!(me.contains("\"wins\":1"), "{me}");
    assert!(me.contains("\"bestScore\":-10"), "{me}");
    assert!(me.contains("\"bidsMade\":2"), "{me}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn four_accounts_open_a_ranked_table_and_a_waiter_is_not_filled(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, mut first) = account(port, "Rook").await;
    send(&mut first, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    let joined = read_text(&mut first).await;
    assert!(joined.contains("\"mode\":\"ranked\""), "{joined}");
    assert!(joined.contains("\"found\":1"), "{joined}");
    assert!(joined.contains("\"needed\":4"), "{joined}");
    state.tick().await;
    let filled = tokio::time::timeout(Duration::from_millis(200), read_text(&mut first)).await;
    assert!(
        filled.is_err(),
        "one ranked player must not be seated with bots"
    );
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"id\":\"ranked\""), "{me}");
    send(&mut first, r#"{"t":"queue.join","id":3,"mode":"casual"}"#).await;
    let busy = read_text(&mut first).await;
    assert!(busy.contains("ALREADY_SEATED"), "{busy}");
    let mut second = account(port, "Mara").await.1;
    let mut third = account(port, "Ned").await.1;
    let mut fourth = account(port, "Odo").await.1;
    send(&mut second, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut second).await.contains("\"found\":2"));
    let status = read_text(&mut first).await;
    assert!(status.contains("\"t\":\"queue.status\""), "{status}");
    assert!(status.contains("\"found\":2"), "{status}");
    send(&mut third, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut third).await.contains("\"found\":3"));
    assert!(read_text(&mut first).await.contains("\"found\":3"));
    assert!(read_text(&mut second).await.contains("\"found\":3"));
    send(&mut fourth, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    let ready = read_text(&mut fourth).await;
    assert!(ready.contains("\"found\":4"), "{ready}");
    assert!(!ready.contains("\"t\":\"queue.status\""), "{ready}");
    for socket in [&mut first, &mut second, &mut third] {
        let status = read_text(socket).await;
        assert!(status.contains("\"t\":\"queue.status\""), "{status}");
        assert!(status.contains("\"found\":4"), "{status}");
    }
    for socket in [&mut first, &mut second, &mut third, &mut fourth] {
        assert_ranked_start(&read_text(socket).await);
    }
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_casual_kick_sets_no_cooldown(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, _) = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    greet(&mut socket).await;
    send(&mut socket, r#"{"t":"queue.join","id":2,"mode":"casual"}"#).await;
    let _ = read_text(&mut socket).await;
    state.tick().await;
    let started = read_text(&mut socket).await;
    assert!(started.contains("\"t\":\"game.start\""), "{started}");
    assert!(started.contains("\"mode\":\"casual\""), "{started}");
    drop(socket);
    for _ in 0..40 {
        state.advance(Duration::from_secs(2)).await;
        state.advance(Duration::from_secs(46)).await;
    }
    let mut back = open_socket(port, &cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let welcome = read_text(&mut back).await;
    assert!(welcome.contains("\"t\":\"ok\""), "{welcome}");
    let snapshot = read_text(&mut back).await;
    assert!(snapshot.contains("\"game\":null"), "{snapshot}");
    let lost = read_text(&mut back).await;
    assert!(lost.contains("\"t\":\"seat.lost\""), "{lost}");
    assert!(lost.contains("\"mode\":\"casual\""), "{lost}");
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"cooldownUntil\":null"), "{me}");
    let mut over = String::new();
    if let Ok(frame) = tokio::time::timeout(Duration::from_millis(300), read_text(&mut back)).await
        && frame.contains("\"t\":\"game.over\"")
    {
        over = frame;
    }
    for _ in 0..400 {
        if !over.is_empty() {
            break;
        }
        state.advance(Duration::from_secs(3)).await;
        while let Ok(frame) =
            tokio::time::timeout(Duration::from_millis(20), read_text(&mut back)).await
        {
            if frame.contains("\"t\":\"game.over\"") {
                over = frame;
                break;
            }
        }
    }
    assert!(
        over.contains("\"t\":\"game.over\""),
        "the casual table finished"
    );
    assert!(over.contains("\"forfeited\":[]"), "{over}");
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"stats\":{\"games\":0,\"wins\":0"), "{me}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_ranked_kick_forfeits_and_starts_the_cooldown(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, mut first) = account(port, "Kick").await;
    let mut second = account(port, "Stay").await.1;
    let mut third = account(port, "Also").await.1;
    let mut fourth = account(port, "Last").await.1;
    send(&mut first, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut first).await.contains("\"found\":1"));
    send(&mut second, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut second).await.contains("\"found\":2"));
    assert!(read_text(&mut first).await.contains("\"found\":2"));
    send(&mut third, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut third).await.contains("\"found\":3"));
    let _ = read_text(&mut first).await;
    let _ = read_text(&mut second).await;
    send(&mut fourth, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut fourth).await.contains("\"found\":4"));
    for socket in [&mut first, &mut second, &mut third] {
        assert!(read_text(socket).await.contains("\"found\":4"));
    }
    for socket in [&mut first, &mut second, &mut third, &mut fourth] {
        assert_ranked_start(&read_text(socket).await);
    }
    drop(first);
    for _ in 0..40 {
        state.advance(Duration::from_secs(2)).await;
        state.advance(Duration::from_secs(46)).await;
    }
    let mut back = open_socket(port, &cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut back).await;
    let welcome = read_text(&mut back).await;
    assert!(welcome.contains("\"game\":null"), "{welcome}");
    assert!(welcome.contains("\"cooldownUntil\":"), "{welcome}");
    assert!(!welcome.contains("\"cooldownUntil\":null"), "{welcome}");
    let lost = read_text(&mut back).await;
    assert!(lost.contains("\"mode\":\"ranked\""), "{lost}");
    let mut saw_out = false;
    let mut saw_over = false;
    // Classic is ten rounds, 1 through 10 cards. Each bid, play, and trick end is one tick.
    for _ in 0..600 {
        state.advance(Duration::from_secs(46)).await;
        while let Ok(frame) =
            tokio::time::timeout(Duration::from_millis(20), read_text(&mut second)).await
        {
            if frame.contains("\"status\":\"out\"") {
                saw_out = true;
            }
            if frame.contains("\"t\":\"game.over\"") && frame.contains("\"forfeited\":[") {
                assert!(!frame.contains("\"forfeited\":[]"), "{frame}");
                saw_over = true;
                break;
            }
        }
        if saw_over {
            break;
        }
    }
    assert!(saw_out, "the table shows out");
    assert!(saw_over, "ranked game.over lists the kick in forfeited");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_leave_is_listed_before_a_kick(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let mut first = account(port, "Ada").await.1;
    let mut second = account(port, "Bea").await.1;
    let mut third = account(port, "Cal").await.1;
    let mut fourth = account(port, "Dee").await.1;
    send(&mut first, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut first).await.contains("\"found\":1"));
    send(&mut second, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut second).await.contains("\"found\":2"));
    assert!(read_text(&mut first).await.contains("\"found\":2"));
    send(&mut third, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut third).await.contains("\"found\":3"));
    let _ = read_text(&mut first).await;
    let _ = read_text(&mut second).await;
    send(&mut fourth, r#"{"t":"queue.join","id":2,"mode":"ranked"}"#).await;
    assert!(read_text(&mut fourth).await.contains("\"found\":4"));
    for socket in [&mut first, &mut second, &mut third] {
        assert!(read_text(socket).await.contains("\"found\":4"));
    }
    for socket in [&mut first, &mut second, &mut third, &mut fourth] {
        assert_ranked_start(&read_text(socket).await);
        let opening = read_text(socket).await;
        assert!(opening.contains("\"t\":\"game.update\""), "{opening}");
    }
    drop(second);
    let mut saw_out = false;
    for _ in 0..80 {
        state.advance(Duration::from_secs(46)).await;
        while let Ok(frame) =
            tokio::time::timeout(Duration::from_millis(20), read_text(&mut first)).await
        {
            if frame.contains("\"status\":\"out\"") {
                saw_out = true;
            }
        }
        if saw_out {
            break;
        }
    }
    assert!(saw_out, "the dropped seat closes");
    send(&mut fourth, r#"{"t":"game.leave","id":3}"#).await;
    let mut left = String::new();
    for _ in 0..400 {
        left = tokio::time::timeout(Duration::from_secs(2), read_text(&mut fourth))
            .await
            .expect("leave reply");
        if left.contains("\"t\":\"ok\"") || left.contains("\"t\":\"err\"") {
            break;
        }
    }
    assert!(left.contains("\"t\":\"ok\""), "{left}");
    let mut over = String::new();
    // Classic is ten rounds, 1 through 10 cards. Each bid, play, and trick end is one tick.
    for _ in 0..600 {
        state.advance(Duration::from_secs(46)).await;
        while let Ok(frame) =
            tokio::time::timeout(Duration::from_millis(20), read_text(&mut first)).await
        {
            if frame.contains("\"t\":\"game.over\"") {
                over = frame;
                break;
            }
        }
        if !over.is_empty() {
            break;
        }
    }
    assert!(over.contains("\"t\":\"game.over\""), "ranked game ended");
    let seats = forfeited_seats(&over);
    let leave_at = seats.iter().position(|seat| *seat == 3).expect(&over);
    let kick_at = seats.iter().position(|seat| *seat == 1).expect(&over);
    assert!(leave_at < kick_at, "{seats:?} {over}");
}

fn forfeited_seats(frame: &str) -> Vec<u8> {
    let marker = "\"forfeited\":[";
    let start = frame.find(marker).expect("forfeited");
    let rest = &frame[start + marker.len()..];
    let end = rest.find(']').expect("forfeited end");
    let body = &rest[..end];
    if body.is_empty() {
        return Vec::new();
    }
    body.split(',')
        .map(|part| part.trim().parse().expect("seat"))
        .collect()
}

fn assert_ranked_start(frame: &str) {
    assert!(frame.contains("\"t\":\"game.start\""), "{frame}");
    assert!(frame.contains("\"mode\":\"ranked\""), "{frame}");
    assert!(frame.contains("\"lobbyId\":null"), "{frame}");
    assert!(frame.contains("\"format\":\"classic\""), "{frame}");
    assert!(
        frame.contains("\"schedule\":[1,2,3,4,5,6,7,8,9,10]"),
        "{frame}"
    );
    assert!(!frame.contains("\"bot\":true"), "{frame}");
    assert!(!frame.contains("\"t\":\"queue.status\""), "{frame}");
}

#[sqlx::test(migrations = "../../migrations/postgres")]
async fn a_ranked_result_does_not_change_casual_stats(pool: sqlx::PgPool) {
    let state = AppState::for_tests(pool, Duration::ZERO, budgets());
    let port = serve(state.clone()).await;
    let (cookie, body) = guest(port).await;
    let id = body
        .split("\"id\":\"")
        .nth(1)
        .unwrap()
        .split('"')
        .next()
        .unwrap()
        .to_owned();
    state
        .record_for_test(crate::world::GameReport {
            id: "game-ranked".to_owned(),
            mode: "ranked",
            table_kind: None,
            rated: vec![],
            overs: vec![],
            penalise: vec![],
            log: vec![],
            seats: vec![crate::world::SeatTally {
                user: skt_protocol::UserId::new(id),
                seat: 0,
                total: 40,
                place: 1,
                win: true,
                bids_made: 1,
                bids_total: 1,
            }],
        })
        .await;
    let (status, _, me) = http(port, "GET", "/api/v1/me", &cookie, "").await;
    assert_eq!(status, 200, "{me}");
    assert!(me.contains("\"games\":0"), "{me}");
    assert!(me.contains("\"wins\":0"), "{me}");
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

async fn greet(
    socket: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>,
) {
    send(
        socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(socket).await;
    let _ = read_text(socket).await;
}

async fn send(
    socket: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>,
    text: &str,
) {
    socket
        .send(tokio_tungstenite::tungstenite::Message::Text(text.into()))
        .await
        .expect("send");
}

async fn read_text(
    socket: &mut tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>,
) -> String {
    let frame = socket.next().await.expect("frame").expect("ok");
    frame.into_text().expect("text").to_string()
}
