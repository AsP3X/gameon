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

#[test]
fn config_lists_the_eight_emotes() {
    assert_eq!(
        crate::world::World::config().emotes,
        [
            "yoho", "arr", "nice", "oops", "thinking", "laugh", "cry", "gg"
        ]
    );
}

#[tokio::test]
async fn an_emote_outside_a_game_is_not_in_game() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let mut socket = open_socket(port, &guest(port).await).await;
    hello(&mut socket).await;
    send(&mut socket, r#"{"t":"game.emote","id":2,"emote":"yoho"}"#).await;
    let reply = read_text(&mut socket).await;
    assert!(reply.contains("NOT_IN_GAME"), "{reply}");
}

#[tokio::test]
async fn an_emote_reaches_both_seats_and_the_next_one_waits() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state.clone()).await;
    let mut host = open_socket(port, &guest(port).await).await;
    let mut mate = open_socket(port, &guest(port).await).await;
    hello(&mut host).await;
    hello(&mut mate).await;
    send(&mut host, &create(2)).await;
    let code = quoted(&read_text(&mut host).await, "code");
    send(&mut mate, &join(2, &code)).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    let _ = read_until(&mut mate, "lobby.state").await;
    send(&mut mate, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.start","id":4}"#).await;
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;
    let _ = read_until(&mut mate, "\"t\":\"game.update\"").await;
    send(&mut host, r#"{"t":"game.emote","id":5,"emote":"yoho"}"#).await;
    let accepted = read_text(&mut host).await;
    assert!(accepted.contains("\"t\":\"ok\""), "{accepted}");
    let pushed = read_text(&mut host).await;
    assert!(pushed.contains("\"emote\":\"yoho\""), "{pushed}");
    let seen = read_until(&mut mate, "\"t\":\"game.emote\"").await;
    assert!(seen.contains("yoho"), "{seen}");
    send(&mut host, r#"{"t":"game.emote","id":6,"emote":"nope"}"#).await;
    let unknown = read_text(&mut host).await;
    assert!(unknown.contains("VALIDATION"), "{unknown}");
    send(&mut host, r#"{"t":"game.emote","id":7,"emote":"gg"}"#).await;
    let limited = read_text(&mut host).await;
    assert!(limited.contains("RATE_LIMITED"), "{limited}");
    state.advance(Duration::from_secs(2)).await;
    send(&mut host, r#"{"t":"game.emote","id":8,"emote":"gg"}"#).await;
    let again = read_text(&mut host).await;
    assert!(again.contains("\"t\":\"ok\""), "{again}");
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
async fn a_public_lobby_does_not_start_until_two_humans_are_seated() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;

    let mut host = open_socket(port, &guest(port).await).await;
    hello(&mut host).await;
    send(&mut host, &create_with(2, "public")).await;
    let code = quoted(&read_text(&mut host).await, "code");
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.addBot","id":4}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.start","id":5}"#).await;
    let refused = read_text(&mut host).await;
    assert!(refused.contains("NOT_READY"), "{refused}");

    let mut mate = open_socket(port, &guest(port).await).await;
    hello(&mut mate).await;
    send(&mut mate, &join(2, &code)).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.ready","id":6,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut mate, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.start","id":7}"#).await;
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;
    let _ = read_until(&mut mate, "\"t\":\"game.update\"").await;
}

#[tokio::test]
async fn the_host_starts_a_private_table_without_a_second_player() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;

    let mut host = open_socket(port, &guest(port).await).await;
    hello(&mut host).await;
    send(&mut host, &create_with(2, "private")).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.start","id":4}"#).await;
    let alone = read_text(&mut host).await;
    assert!(alone.contains("NOT_READY"), "{alone}");
    assert!(!alone.contains("game.start"), "{alone}");
    send(&mut host, r#"{"t":"lobby.addBot","id":5}"#).await;
    let seated = read_until(&mut host, "\"t\":\"ok\"").await;
    assert!(!seated.contains("game.start"), "{seated}");
    let early = tokio::time::timeout(Duration::from_millis(200), read_text(&mut host)).await;
    assert!(
        early.is_err(),
        "a private table waits for the host to start"
    );
    send(&mut host, r#"{"t":"lobby.start","id":6}"#).await;
    let started = read_until(&mut host, "\"t\":\"game.update\"").await;
    assert!(started.contains("\"t\":\"game.update\""), "{started}");

    let mut owner = open_socket(port, &guest(port).await).await;
    let mut mate = open_socket(port, &guest(port).await).await;
    hello(&mut owner).await;
    hello(&mut mate).await;
    send(&mut owner, &create_with(2, "private")).await;
    let code = quoted(&read_text(&mut owner).await, "code");
    send(&mut mate, &join(2, &code)).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut owner, "lobby.state").await;
    send(&mut owner, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut owner, "\"t\":\"ok\"").await;
    let _ = read_until(&mut mate, "lobby.state").await;
    send(&mut owner, r#"{"t":"lobby.start","id":4}"#).await;
    let unready = read_text(&mut owner).await;
    assert!(unready.contains("NOT_READY"), "{unready}");
    send(&mut mate, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut owner, "lobby.state").await;
    let waited = tokio::time::timeout(Duration::from_millis(200), read_text(&mut owner)).await;
    assert!(waited.is_err(), "ready friends do not start the table");
    send(&mut owner, r#"{"t":"lobby.start","id":5}"#).await;
    let _ = read_until(&mut owner, "\"t\":\"game.update\"").await;
    let _ = read_until(&mut mate, "\"t\":\"game.update\"").await;
}

#[tokio::test]
async fn a_private_table_keeps_every_bot_at_the_chosen_skill() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let mut host = open_socket(port, &guest(port).await).await;
    hello(&mut host).await;

    let hard = r#"{"maxPlayers":4,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"hard","pace":"standard"}"#;
    send(
        &mut host,
        &format!(r#"{{"t":"lobby.create","id":2,"visibility":"private","settings":{hard}}}"#),
    )
    .await;
    let created = read_text(&mut host).await;
    assert!(created.contains("\"botLevel\":\"hard\""), "{created}");
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.addBot","id":4}"#).await;
    let seated = read_until(&mut host, "\"t\":\"lobby.state\"").await;
    assert_eq!(bot_levels(&seated), ["hard"]);
    let added = read_text(&mut host).await;
    assert!(added.contains("\"t\":\"ok\""), "{added}");

    let easy = r#"{"maxPlayers":4,"scoring":"classic","format":"swift","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"easy","pace":"standard"}"#;
    send(
        &mut host,
        &format!(r#"{{"t":"lobby.settings","id":5,"settings":{easy}}}"#),
    )
    .await;
    let changed = read_until(&mut host, "\"t\":\"lobby.state\"").await;
    assert!(changed.contains("\"botLevel\":\"easy\""), "{changed}");
    assert!(changed.contains("\"ready\":false"), "{changed}");
    assert_eq!(bot_levels(&changed), ["easy"]);
    let saved = read_text(&mut host).await;
    assert!(saved.contains("\"t\":\"ok\""), "{saved}");

    send(&mut host, r#"{"t":"lobby.addBot","id":6}"#).await;
    let both = read_until(&mut host, "\"t\":\"lobby.state\"").await;
    assert_eq!(bot_levels(&both), ["easy", "easy"]);
    let second = read_text(&mut host).await;
    assert!(second.contains("\"t\":\"ok\""), "{second}");

    send(&mut host, r#"{"t":"lobby.ready","id":7,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.start","id":8}"#).await;
    let started = read_until(&mut host, "\"t\":\"game.start\"").await;
    assert!(started.contains("\"botLevel\":\"easy\""), "{started}");
    assert!(!started.contains("\"botLevel\":\"hard\""), "{started}");
}

fn bot_levels(frame: &str) -> Vec<String> {
    let value: serde_json::Value =
        serde_json::from_str(frame).unwrap_or_else(|err| panic!("{err} in {frame}"));
    value["lobby"]["members"]
        .as_array()
        .unwrap_or_else(|| panic!("members in {frame}"))
        .iter()
        .filter(|member| member["kind"] == "bot")
        .map(|member| {
            member["level"]
                .as_str()
                .unwrap_or_else(|| panic!("level in {frame}"))
                .to_owned()
        })
        .collect()
}

#[tokio::test]
async fn a_drop_stays_offline_and_one_miss_can_return() {
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
    let _ = read_until(&mut mate, "\"t\":\"game.update\"").await;
    host.close(None).await.expect("close");
    let dropped = read_until(&mut mate, "\"status\":\"offline\"").await;
    assert!(dropped.contains("seatStatus"), "{dropped}");
    state.advance(Duration::from_secs(61)).await;
    let still = read_until(&mut mate, "timedOut").await;
    assert!(!still.contains("\"status\":\"bot\""), "{still}");
    assert!(!still.contains("\"status\":\"out\""), "{still}");
    assert!(!still.contains("seat.lost"), "{still}");
    let mut back = open_socket(port, &host_cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let welcome = read_until(&mut back, "\"t\":\"welcome\"").await;
    assert!(welcome.contains(&hand), "{welcome}");
    assert!(welcome.contains("\"events\":[]"), "{welcome}");
    assert!(!welcome.contains("seat.lost"), "{welcome}");
}

#[tokio::test]
async fn two_misses_while_offline_close_the_seat_and_tell_only_that_player() {
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
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;
    let mate_open = read_until(&mut mate, "\"t\":\"game.update\"").await;
    send(
        &mut mate,
        r#"{"t":"game.bid","id":5,"at":{"round":0,"trick":0},"bid":0}"#,
    )
    .await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    host.close(None).await.expect("close");
    let _ = read_until(&mut mate, "\"status\":\"offline\"").await;
    state.advance(Duration::from_secs(46)).await;
    let first = read_until(&mut mate, "timedOut").await;
    assert!(!first.contains("\"status\":\"out\""), "{first}");
    let card = first_card(&mate_open);
    send(
        &mut mate,
        &format!(
            r#"{{"t":"game.play","id":6,"at":{{"round":0,"trick":0}},{}}}"#,
            play_fields(&card)
        ),
    )
    .await;
    let played = read_until(&mut mate, "\"t\":\"ok\"").await;
    assert!(played.contains("\"t\":\"ok\""), "{played}");
    state.advance(Duration::from_secs(31)).await;
    let kicked = read_until(&mut mate, "\"status\":\"out\"").await;
    assert!(kicked.contains("timedOut"), "{kicked}");
    assert!(!kicked.contains("seat.lost"), "{kicked}");
    assert!(!kicked.contains("\"status\":\"bot\""), "{kicked}");
    let mut back = open_socket(port, &host_cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let welcome = read_until(&mut back, "\"t\":\"welcome\"").await;
    assert!(welcome.contains("\"game\":null"), "{welcome}");
    assert!(welcome.contains("\"lobby\":null"), "{welcome}");
    let lost = read_text(&mut back).await;
    assert!(lost.contains("\"t\":\"seat.lost\""), "{lost}");
    assert!(lost.contains("\"reason\":\"inactivity\""), "{lost}");
    assert!(lost.contains("\"mode\":\"custom\""), "{lost}");
    back.close(None).await.expect("close");
    let mut again = open_socket(port, &host_cookie).await;
    send(
        &mut again,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let second = read_until(&mut again, "\"t\":\"welcome\"").await;
    assert!(second.contains("\"game\":null"), "{second}");
    let extra = tokio::time::timeout(Duration::from_millis(200), read_text(&mut again)).await;
    assert!(extra.is_err(), "seat.lost is sent once");
    let mut round_end = String::new();
    for _ in 0..40 {
        state.advance(Duration::from_secs(4)).await;
        if let Ok(frame) =
            tokio::time::timeout(Duration::from_millis(80), read_text(&mut mate)).await
            && frame.contains("roundEnd")
        {
            round_end = frame;
            break;
        }
    }
    assert!(round_end.contains("roundEnd"), "{round_end}");
    send(&mut mate, r#"{"t":"game.ready","id":7}"#).await;
    let advanced = read_until(&mut mate, "\"phase\":\"bidding\"").await;
    assert!(advanced.contains("\"round\":1"), "{advanced}");
}

#[tokio::test]
async fn a_miss_while_connected_does_not_count_after_the_drop() {
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
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;
    let mate_open = read_until(&mut mate, "\"t\":\"game.update\"").await;
    send(
        &mut mate,
        r#"{"t":"game.bid","id":5,"at":{"round":0,"trick":0},"bid":0}"#,
    )
    .await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    state.advance(Duration::from_secs(46)).await;
    let connected = read_until(&mut mate, "timedOut").await;
    assert!(!connected.contains("\"status\":\"out\""), "{connected}");
    assert!(!connected.contains("\"status\":\"offline\""), "{connected}");
    host.close(None).await.expect("close");
    let _ = read_until(&mut mate, "\"status\":\"offline\"").await;
    let card = first_card(&mate_open);
    send(
        &mut mate,
        &format!(
            r#"{{"t":"game.play","id":6,"at":{{"round":0,"trick":0}},{}}}"#,
            play_fields(&card)
        ),
    )
    .await;
    let played = read_until(&mut mate, "\"t\":\"ok\"").await;
    assert!(played.contains("\"t\":\"ok\""), "{played}");
    state.advance(Duration::from_secs(31)).await;
    let first_offline = read_until(&mut mate, "timedOut").await;
    assert!(
        !first_offline.contains("\"status\":\"out\""),
        "{first_offline}"
    );
}

/// Card field for `game.play`. The 70-card deck's Tigress is id 66 and needs a declaration.
fn play_fields(card: &str) -> String {
    if card == "66" {
        format!(r#""card":{card},"as":"escape""#)
    } else {
        format!(r#""card":{card}"#)
    }
}

fn first_card(frame: &str) -> String {
    let hand = hand_of(frame);
    hand.split('[')
        .nth(1)
        .unwrap()
        .split(',')
        .next()
        .unwrap()
        .trim()
        .trim_end_matches(']')
        .to_owned()
}

#[tokio::test]
async fn a_player_table_omits_standing_and_a_house_table_sends_it() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let cookie = guest(port).await;
    let mut socket = open_socket(port, &cookie).await;
    hello(&mut socket).await;

    send(&mut socket, &create(2)).await;
    let private_table = read_text(&mut socket).await;
    assert!(
        private_table.contains("\"visibility\":\"private\""),
        "{private_table}"
    );
    assert!(!private_table.contains("\"standing\""), "{private_table}");

    send(&mut socket, r#"{"t":"lobby.leave","id":3}"#).await;
    let left = read_text(&mut socket).await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");

    send(&mut socket, &create_with(4, "public")).await;
    let created = read_text(&mut socket).await;
    assert!(created.contains("\"visibility\":\"public\""), "{created}");
    assert!(!created.contains("\"standing\""), "{created}");

    send(&mut socket, r#"{"t":"lobby.leave","id":5}"#).await;
    let left_public = read_text(&mut socket).await;
    assert!(left_public.contains("\"t\":\"ok\""), "{left_public}");

    let list = http_body(port, "GET", "/api/v1/lobbies", &cookie).await;
    assert!(!list.contains("\"standing\""), "{list}");
    let house = quoted(&list, "id");
    send(
        &mut socket,
        &format!(r#"{{"t":"lobby.join","id":6,"lobbyId":"{house}"}}"#),
    )
    .await;
    let joined = read_text(&mut socket).await;
    assert!(joined.contains("\"standing\":true"), "{joined}");
    assert_eq!(quoted(&joined, "code").len(), 6, "{joined}");
    let pushed = read_text(&mut socket).await;
    assert!(pushed.contains("\"t\":\"lobby.state\""), "{pushed}");
    assert!(pushed.contains("\"standing\":true"), "{pushed}");

    send(
        &mut socket,
        r#"{"t":"lobby.settings","id":7,"settings":{"maxPlayers":4,"scoring":"classic","format":"brawl","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}}"#,
    )
    .await;
    let refused = read_text(&mut socket).await;
    assert!(refused.contains("RULES_LOCKED"), "{refused}");
    assert!(
        refused.contains("A public table keeps its rules."),
        "{refused}"
    );
    assert!(joined.contains("\"format\":\"classic\""), "{joined}");
    assert!(!refused.contains("\"format\":\"brawl\""), "{refused}");
}

#[tokio::test]
async fn a_private_table_changes_its_rules_and_a_public_one_does_not() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state).await;
    let mut host = open_socket(port, &guest(port).await).await;
    let mut mate = open_socket(port, &guest(port).await).await;
    hello(&mut host).await;
    hello(&mut mate).await;

    send(&mut host, &create(2)).await;
    let created = read_text(&mut host).await;
    assert!(created.contains("\"visibility\":\"private\""), "{created}");
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(
        &mut host,
        r#"{"t":"lobby.settings","id":4,"settings":{"maxPlayers":4,"scoring":"rascal","format":"brawl","loot":true,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}}"#,
    )
    .await;
    let changed = read_until(&mut host, "\"format\":\"brawl\"").await;
    assert!(changed.contains("\"t\":\"lobby.state\""), "{changed}");
    assert!(changed.contains("\"scoring\":\"rascal\""), "{changed}");
    assert!(changed.contains("\"loot\":true"), "{changed}");
    assert!(changed.contains("\"ready\":false"), "{changed}");
    let accepted = read_text(&mut host).await;
    assert!(accepted.contains("\"t\":\"ok\""), "{accepted}");
    send(&mut host, r#"{"t":"lobby.leave","id":5}"#).await;
    let left = read_text(&mut host).await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");

    send(&mut host, &create_with(6, "public")).await;
    let public_table = read_text(&mut host).await;
    assert!(
        public_table.contains("\"visibility\":\"public\""),
        "{public_table}"
    );
    assert!(
        public_table.contains("\"format\":\"swift\""),
        "{public_table}"
    );
    let code = quoted(&public_table, "code");
    send(&mut host, r#"{"t":"lobby.ready","id":7,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut mate, &join(2, &code)).await;
    let joined = read_text(&mut mate).await;
    assert!(joined.contains("\"t\":\"ok\""), "{joined}");
    let mate_seated = read_text(&mut mate).await;
    assert!(
        mate_seated.contains("\"t\":\"lobby.state\""),
        "{mate_seated}"
    );
    assert!(
        mate_seated.contains("\"format\":\"swift\""),
        "{mate_seated}"
    );
    let host_seated = read_text(&mut host).await;
    assert!(
        host_seated.contains("\"t\":\"lobby.state\""),
        "{host_seated}"
    );
    assert!(host_seated.contains("\"ready\":true"), "{host_seated}");

    send(
        &mut host,
        r#"{"t":"lobby.settings","id":8,"settings":{"maxPlayers":4,"scoring":"classic","format":"even","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"normal","pace":"standard"}}"#,
    )
    .await;
    let host_refused = read_text(&mut host).await;
    assert!(host_refused.contains("RULES_LOCKED"), "{host_refused}");
    assert!(
        host_refused.contains("A public table keeps its rules."),
        "{host_refused}"
    );
    send(
        &mut mate,
        r#"{"t":"lobby.settings","id":3,"settings":{"maxPlayers":4,"scoring":"classic","format":"whirl","loot":false,"kraken":false,"whale":false,"abilities":false,"botLevel":"hard","pace":"fast"}}"#,
    )
    .await;
    let mate_refused = read_text(&mut mate).await;
    assert!(mate_refused.contains("RULES_LOCKED"), "{mate_refused}");
    assert!(!mate_refused.contains("NOT_HOST"), "{mate_refused}");

    send(&mut host, r#"{"t":"ping","id":9}"#).await;
    let pong = read_text(&mut host).await;
    assert!(pong.contains("\"t\":\"ok\""), "{pong}");
    assert!(!pong.contains("lobby.state"), "{pong}");
    assert!(!pong.contains("\"format\":\"even\""), "{pong}");
    send(&mut mate, r#"{"t":"ping","id":4}"#).await;
    let mate_pong = read_text(&mut mate).await;
    assert!(mate_pong.contains("\"t\":\"ok\""), "{mate_pong}");
    assert!(!mate_pong.contains("\"format\":\"whirl\""), "{mate_pong}");
}

async fn http_body(port: u16, method: &str, path: &str, cookie: &str) -> String {
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nOrigin: http://localhost\r\nCookie: {cookie}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
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
    let (head, body) = text
        .split_once("\r\n\r\n")
        .unwrap_or_else(|| panic!("no body in {text}"));
    assert!(head.starts_with("HTTP/1.1 200"), "{head}");
    body.to_owned()
}

fn close_frame(code: u16) -> tokio_tungstenite::tungstenite::protocol::CloseFrame {
    tokio_tungstenite::tungstenite::protocol::CloseFrame {
        code: code.into(),
        reason: "".into(),
    }
}

#[tokio::test]
async fn the_last_human_to_resign_cancels_the_game() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state.clone()).await;
    let cookie = guest(port).await;
    let mut host = open_socket(port, &cookie).await;
    hello(&mut host).await;
    send(&mut host, &create(2)).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.addBot","id":4}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    send(&mut host, r#"{"t":"lobby.start","id":5}"#).await;
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;

    send(&mut host, r#"{"t":"game.leave","id":6}"#).await;
    let left = read_text(&mut host).await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");
    let update = read_text(&mut host).await;
    assert!(update.contains("\"t\":\"game.update\""), "{update}");
    assert!(update.contains("\"type\":\"seatStatus\""), "{update}");
    assert!(update.contains("\"status\":\"out\""), "{update}");

    state.advance(Duration::from_secs(30)).await;
    let later = tokio::time::timeout(Duration::from_millis(200), read_text(&mut host)).await;
    assert!(
        later.is_err(),
        "a cancelled game sends nothing more: {later:?}"
    );

    let mut back = open_socket(port, &cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut back).await;
    let welcome = read_text(&mut back).await;
    assert!(welcome.contains("\"game\":null"), "{welcome}");
}

#[tokio::test]
async fn a_resign_removes_that_player_and_the_others_play_on() {
    let state = AppState::for_socket_tests(Duration::from_secs(5), Duration::from_secs(45));
    let port = serve(state.clone()).await;
    let mut host = open_socket(port, &guest(port).await).await;
    let mate_cookie = guest(port).await;
    let mut mate = open_socket(port, &mate_cookie).await;
    hello(&mut host).await;
    hello(&mut mate).await;
    send(&mut host, &create(2)).await;
    let code = quoted(&read_text(&mut host).await, "code");
    send(&mut mate, &join(2, &code)).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut host, "\"t\":\"ok\"").await;
    let _ = read_until(&mut mate, "lobby.state").await;
    send(&mut mate, r#"{"t":"lobby.ready","id":3,"ready":true}"#).await;
    let _ = read_until(&mut mate, "\"t\":\"ok\"").await;
    let _ = read_until(&mut host, "lobby.state").await;
    send(&mut host, r#"{"t":"lobby.start","id":4}"#).await;
    let _ = read_until(&mut host, "\"t\":\"game.update\"").await;
    let _ = read_until(&mut mate, "\"t\":\"game.update\"").await;

    send(&mut host, r#"{"t":"game.leave","id":5}"#).await;
    let left = read_text(&mut host).await;
    assert!(left.contains("\"t\":\"ok\""), "{left}");
    let host_update = read_text(&mut host).await;
    assert!(host_update.contains("\"status\":\"out\""), "{host_update}");
    assert!(!host_update.contains("\"status\":\"bot\""), "{host_update}");
    let mate_update = read_text(&mut mate).await;
    assert!(
        mate_update.contains("\"t\":\"game.update\""),
        "{mate_update}"
    );
    assert!(mate_update.contains("\"status\":\"out\""), "{mate_update}");
    assert!(!mate_update.contains("\"status\":\"bot\""), "{mate_update}");
    let _ = tokio::time::timeout(Duration::from_millis(200), read_text(&mut mate)).await;

    state.advance(Duration::from_secs(3)).await;
    let continued = read_until(&mut mate, "\"t\":\"game.update\"").await;
    assert!(continued.contains("\"type\":\"bidPlaced\""), "{continued}");
    assert!(!continued.contains("\"type\":\"timedOut\""), "{continued}");

    send(&mut mate, r#"{"t":"game.leave","id":4}"#).await;
    let mate_ok = read_text(&mut mate).await;
    assert!(mate_ok.contains("\"t\":\"ok\""), "{mate_ok}");
    let mate_last = read_text(&mut mate).await;
    assert!(mate_last.contains("\"status\":\"out\""), "{mate_last}");
    state.advance(Duration::from_secs(30)).await;
    let done = tokio::time::timeout(Duration::from_millis(200), read_text(&mut mate)).await;
    assert!(done.is_err(), "the last resign cancels the game: {done:?}");

    let mut back = open_socket(port, &mate_cookie).await;
    send(
        &mut back,
        r#"{"t":"hello","id":1,"protocol":1,"build":"test"}"#,
    )
    .await;
    let _ = read_text(&mut back).await;
    let welcome = read_text(&mut back).await;
    assert!(welcome.contains("\"game\":null"), "{welcome}");
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
    create_with(id, "private")
}

fn create_with(id: u32, visibility: &str) -> String {
    format!(r#"{{"t":"lobby.create","id":{id},"visibility":"{visibility}","settings":{SETTINGS}}}"#)
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
