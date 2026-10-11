//! Socket limits from protocol §5.1 and §5.2, against an in-memory tavern.

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
    let _second = open_socket(port, &cookie).await;
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
