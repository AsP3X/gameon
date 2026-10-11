//! Socket limits, lobby host rules, and reconnect from protocol §5, against an in-memory tavern.

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

use crate::AppState;

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

#[tokio::test]
async fn a_silent_socket_closes_and_bad_json_closes_1003() {
    let state = AppState::for_socket_tests(Duration::from_millis(200), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    let closed = tokio::time::timeout(Duration::from_secs(2), socket.next()).await;
    let frame = closed.expect("timeout").expect("frame").expect("ok");
    assert!(frame.is_close(), "{frame:?}");

    let mut socket = open_socket(port, &cookie).await;
    send(&mut socket, "hello").await;
    let frame = next_frame(&mut socket).await;
    assert_eq!(frame, Message::Close(Some(close_frame(1003))), "{frame:?}");
}

#[tokio::test]
async fn twenty_one_frames_in_a_second_are_rate_limited_and_a_stray_bid_is_rejected() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    send(
        &mut socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let hello = read_text(&mut socket).await;
    assert!(hello.contains("\"t\":\"ok\""), "{hello}");
    let _welcome = read_text(&mut socket).await;
    for id in 2..=20 {
        send(&mut socket, &format!(r#"{{"t":"ping","id":{id}}}"#)).await;
        let reply = read_text(&mut socket).await;
        assert!(reply.contains("\"t\":\"ok\""), "{reply}");
    }
    send(&mut socket, r#"{"t":"ping","id":21}"#).await;
    let limited = read_text(&mut socket).await;
    assert!(limited.contains("RATE_LIMITED"), "{limited}");
    assert!(limited.contains("\"re\":21"), "{limited}");
    tokio::time::sleep(Duration::from_secs(1)).await;
    send(
        &mut socket,
        r#"{"t":"game.bid","id":22,"at":{"round":0,"trick":0},"bid":1}"#,
    )
    .await;
    let rejected = read_text(&mut socket).await;
    assert!(rejected.contains("NOT_IN_GAME"), "{rejected}");
}

#[tokio::test]
async fn a_second_socket_closes_the_first_with_4001() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut first = open_socket(port, &cookie).await;
    send(
        &mut first,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut first).await;
    let _ = read_text(&mut first).await;
    let (frames_tx, mut frames) = tokio::sync::mpsc::unbounded_channel();
    tokio::spawn(async move {
        while let Some(Ok(frame)) = first.next().await {
            if frames_tx.send(frame).is_err() {
                break;
            }
        }
    });
    let mut second = open_socket(port, &cookie).await;
    send(
        &mut second,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let mut saw_text = false;
    let mut saw_close = false;
    for _ in 0..4 {
        let Some(frame) = tokio::time::timeout(Duration::from_secs(2), frames.recv())
            .await
            .expect("timed out")
        else {
            break;
        };
        if let Message::Text(text) = &frame {
            assert!(text.contains("superseded"), "{text}");
            saw_text = true;
        }
        if let Message::Close(Some(frame)) = &frame {
            assert_eq!(u16::from(frame.code), 4001);
            saw_close = true;
        }
    }
    assert!(saw_text && saw_close, "text {saw_text} close {saw_close}");
}

#[tokio::test]
async fn an_ungreeted_socket_does_not_replace_the_live_one() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut first = open_socket(port, &cookie).await;
    send(
        &mut first,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut first).await;
    let _ = read_text(&mut first).await;
    let mut second = open_socket(port, &cookie).await;
    send(&mut first, r#"{"t":"ping","id":2}"#).await;
    let reply = read_text(&mut first).await;
    assert!(reply.contains("\"t\":\"ok\""), "{reply}");
    second.close(None).await.expect("close");
    send(&mut first, r#"{"t":"ping","id":3}"#).await;
    let again = read_text(&mut first).await;
    assert!(again.contains("\"t\":\"ok\""), "{again}");
    assert!(!again.contains("superseded"), "{again}");
}

#[tokio::test]
async fn a_long_frame_closes_1009() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    let mut body = String::from("{\"t\":\"ping\",\"id\":1,\"x\":\"");
    body.push_str(&"a".repeat(4100));
    body.push_str("\"}");
    send(&mut socket, &body).await;
    let frame = next_frame(&mut socket).await;
    assert_eq!(frame, Message::Close(Some(close_frame(1009))), "{frame:?}");
}

#[tokio::test]
async fn silence_after_hello_closes_the_socket() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_millis(200));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    send(
        &mut socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut socket).await;
    let _ = read_text(&mut socket).await;
    let frame = next_frame(&mut socket).await;
    assert_eq!(frame, Message::Close(Some(close_frame(1000))), "{frame:?}");
}

#[tokio::test]
async fn an_emote_is_refused_while_the_list_is_empty() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    send(
        &mut socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut socket).await;
    let _ = read_text(&mut socket).await;
    send(&mut socket, r#"{"t":"game.emote","id":2,"emote":"yoho"}"#).await;
    let reply = read_text(&mut socket).await;
    assert!(reply.contains("VALIDATION"), "{reply}");
    assert!(reply.contains("\"re\":2"), "{reply}");
}

#[tokio::test]
async fn the_host_can_kick_and_leaving_hands_the_table_on() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let host_cookie = guest(port).await;
    let mate_cookie = guest(port).await;
    let mut host = open_socket(port, &host_cookie).await;
    let mut mate = open_socket(port, &mate_cookie).await;
    let mate_id = hello(&mut mate).await;
    let host_id = hello(&mut host).await;
    send(&mut host, &create(2)).await;
    let created = read_text(&mut host).await;
    let code = quoted(&created, "code");
    send(&mut mate, &join(2, &code)).await;
    assert!(read_text(&mut mate).await.contains("\"t\":\"ok\""));
    assert!(read_text(&mut mate).await.contains("lobby.state"));
    assert!(read_text(&mut host).await.contains("lobby.state"));
    send(
        &mut host,
        &format!(r#"{{"t":"lobby.kick","id":3,"userId":"{mate_id}"}}"#),
    )
    .await;
    let closed = read_text(&mut mate).await;
    assert!(closed.contains("lobby.closed"), "{closed}");
    assert!(closed.contains("kicked"), "{closed}");
    let state_after = read_text(&mut host).await;
    assert!(state_after.contains("lobby.state"), "{state_after}");
    assert!(!state_after.contains(&mate_id), "{state_after}");
    let mut next = open_socket(port, &mate_cookie).await;
    let next_id = hello(&mut next).await;
    send(&mut next, &join(2, &code)).await;
    assert!(read_text(&mut next).await.contains("\"t\":\"ok\""));
    let _ = read_text(&mut next).await;
    let _ = read_text(&mut host).await;
    send(&mut host, r#"{"t":"lobby.leave","id":4}"#).await;
    let passed = read_until(&mut next, "lobby.state").await;
    assert!(
        passed.contains(&format!("\"hostId\":\"{next_id}\"")),
        "{passed}"
    );
    assert!(!passed.contains(&host_id), "{passed}");
    let left = read_until(&mut host, "\"t\":\"ok\"").await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");
}

#[tokio::test]
async fn a_reload_returns_the_same_hand_and_a_long_drop_becomes_a_bot() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state.clone()).await;
    let host_cookie = guest(port).await;
    let mate_cookie = guest(port).await;
    let mut host = open_socket(port, &host_cookie).await;
    let mut mate = open_socket(port, &mate_cookie).await;
    hello(&mut host).await;
    hello(&mut mate).await;
    send(&mut host, &create(2)).await;
    let code = quoted(&read_text(&mut host).await, "code");
    send(&mut mate, &join(2, &code)).await;
    let _ = read_text(&mut mate).await;
    let _ = read_text(&mut mate).await;
    let _ = read_text(&mut host).await;
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    let _ = read_until(&mut mate, "lobby.state").await;
    send(&mut mate, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.start","id":4}"#).await;
    let update = read_until(&mut host, "\"t\":\"game.update\"").await;
    let hand = hand_of(&update);
    host.close(None).await.expect("close");
    let dropped = read_until(&mut mate, "\"status\":\"offline\"").await;
    assert!(dropped.contains("seatStatus"), "{dropped}");
    let mut back = open_socket(port, &host_cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let welcome = read_until(&mut back, "\"t\":\"welcome\"").await;
    assert!(welcome.contains(&hand), "{welcome}");
    assert!(welcome.contains("\"events\":[]"), "{welcome}");
    back.close(None).await.expect("close");
    let _ = read_until(&mut mate, "\"status\":\"offline\"").await;
    state.advance(Duration::from_secs(61)).await;
    let taken = read_until(&mut mate, "\"status\":\"bot\"").await;
    assert!(taken.contains("seatStatus"), "{taken}");
}

fn close_frame(code: u16) -> tokio_tungstenite::tungstenite::protocol::CloseFrame {
    tokio_tungstenite::tungstenite::protocol::CloseFrame {
        code: code.into(),
        reason: "".into(),
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

async fn guest(port: u16) -> String {
    let request = "POST /api/v1/auth/guest HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("connect");
    tokio::io::AsyncWriteExt::write_all(&mut stream, request.as_bytes())
        .await
        .expect("write");
    let mut bytes = Vec::new();
    tokio::io::AsyncReadExt::read_to_end(&mut stream, &mut bytes)
        .await
        .expect("read");
    let text = String::from_utf8_lossy(&bytes);
    text.lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("set-cookie")
                .then(|| value.trim().split(';').next().unwrap_or("").to_owned())
        })
        .unwrap_or_default()
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
    socket.send(Message::Text(text.into())).await.expect("send");
}

async fn read_text(socket: &mut Socket) -> String {
    match next_frame(socket).await {
        Message::Text(text) => text.to_string(),
        other => panic!("text frame, got {other:?}"),
    }
}

async fn next_frame(socket: &mut Socket) -> Message {
    socket.next().await.expect("frame").expect("ok")
}

async fn hello(socket: &mut Socket) -> String {
    send(
        socket,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(socket).await;
    let welcome = read_text(socket).await;
    quoted(&welcome, "id")
}

async fn read_until(socket: &mut Socket, needle: &str) -> String {
    let mut last = String::new();
    for _ in 0..16 {
        last = read_text(socket).await;
        if last.contains(needle) {
            return last;
        }
    }
    panic!("never saw {needle} in {last}");
}

fn create(id: u32) -> String {
    format!(r#"{{"t":"lobby.create","id":{id},"visibility":"private","settings":{SETTINGS}}}"#)
}

fn join(id: u32, code: &str) -> String {
    format!(r#"{{"t":"lobby.join","id":{id},"code":"{code}"}}"#)
}

fn quoted(text: &str, key: &str) -> String {
    let needle = format!("\"{key}\":\"");
    text.split(&needle)
        .nth(1)
        .unwrap_or_else(|| panic!("no {key} in {text}"))
        .split('"')
        .next()
        .unwrap_or_default()
        .to_owned()
}

fn hand_of(frame: &str) -> String {
    let start = frame.find("\"hand\":").expect("hand");
    let rest = &frame[start..];
    let end = rest.find(']').expect("hand end");
    rest[..=end].to_owned()
}

const SETTINGS: &str = r#"{"maxPlayers":4,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}"#;
