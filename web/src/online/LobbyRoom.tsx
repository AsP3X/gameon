/* A table before its game, as design/skt.pen draws it (`Friends · waiting`, `Public · waiting` and
   their states): who is at it, who is ready, the rules, and the host's start. Everything on it is
   the lobby the server sent. */
import { useEffect, useState } from 'react';
import type { Go } from '../gameon/Frame';
import type { Online, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import type { Lobby, Me, Member, UserId } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import { failureText } from './copy';
import { CloseIcon } from './icons';
import { Bar, initialOf, Page } from './parts';
import { describeRules } from './settings';

const nameOf = (m: Member): string => (m.kind === 'bot' ? m.name : m.user.name);

/** The line by the buttons: what the table is waiting for. */
function hint(lobby: Lobby, me: Me, host: boolean): string {
  if (lobby.state !== 'open') return 'The game is starting…';
  const humans = lobby.members.flatMap((m) => (m.kind === 'human' ? [m] : []));
  const mine = humans.find((m) => m.user.id === me.user.id);
  const waiting = humans.find((m) => !m.ready && m.user.id !== me.user.id);
  // A bot fills a seat, but it is not one of the two people a table waits for.
  if (humans.length < 2) {
    if (!host) return 'Waiting for more pirates.';
    return lobby.visibility === 'public'
      ? 'A public table can start once a second pirate sits down.'
      : 'The table can start once a second pirate sits down. Share the code.';
  }
  if (!mine?.ready) return host ? 'Say you are ready, then start the game.' : 'Say you are ready when you are set.';
  if (waiting) return `Waiting for ${waiting.user.name} to be ready.`;
  return host ? 'Everyone is ready. Start when you like.' : 'Everyone is ready. The host starts the game.';
}

export interface LobbyRoomProps {
  online: Online;
  go: Go;
  lobby: Lobby;
  me: Me;
  status: LinkStatus;
  /** Something that ended while the player was away, until they have read it. */
  notice: { title: string; text: string } | null;
  onRules: () => void;
  /** A human at the table was tapped: show who they are. */
  onPlayer: (id: UserId) => void;
}

export function LobbyRoom({ online, go, lobby, me, status, notice, onRules, onPlayer }: LobbyRoomProps) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const host = lobby.hostId === me.user.id,
    open = lobby.state === 'open',
    live = status === 'online',
    listed = lobby.visibility === 'public',
    // Left out, the table seats bots. On one that does not, nothing here asks for a bot.
    seatsBots = lobby.allowBots !== false,
    n = lobby.members.length,
    max = lobby.settings.maxPlayers;
  const mine = lobby.members.find((m) => m.kind === 'human' && m.user.id === me.user.id);
  const ready = mine?.kind === 'human' && mine.ready;
  // For feedback only: the server decides. A table waits for two people, and a bot is not one of them.
  const canStart =
    lobby.members.filter((m) => m.kind === 'human').length >= 2 &&
    lobby.members.every((m) => m.kind === 'bot' || m.ready);
  const rules = describeRules(lobby.settings);

  const ask = (what: Promise<Outcome>): void => {
    setError(null);
    void what.then((r) => {
      if (!r.ok) setError(failureText(r));
    });
  };
  const copy = (): void => {
    Sound.play('tap');
    // Copying is a convenience: where the browser refuses, the code is still on the screen to read out.
    navigator.clipboard?.writeText(lobby.code).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <Page go={go}>
      <Bar
        title={listed ? 'Public table' : host ? 'Your table' : 'Table'}
        back="Leave table"
        onBack={() => ask(online.leaveLobby())}
        me={me}
      >
        <span className="pill blue">{listed ? 'Public' : 'Private'}</span>
      </Bar>
      <main className="on-body wide">
        {!live && (
          <div className="notice" role="status">
            <b>Connection lost</b>
            <p>Trying again. Your seat is kept while you are away.</p>
          </div>
        )}
        {notice && (
          <div className="notice gold" role="status">
            <b>{notice.title}</b>
            <p>{notice.text}</p>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                Sound.play('tap');
                online.dismissNotice();
              }}
            >
              OK
            </button>
          </div>
        )}
        <div className={listed ? 'on-grid on-waiting' : 'on-grid on-waiting coded'}>
          {!listed && (
            <div className="plate on-code">
              <span className="grow">
                <span className="label">Table code</span>
                <b className="code">{lobby.code}</b>
              </span>
              <button type="button" className="mini" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <section className="on-crew" aria-labelledby="on-crew">
            <h2 className="label" id="on-crew">
              Crew · {n} of {max}
            </h2>
            {lobby.members.map((m, i) => {
              const isMe = m.kind === 'human' && m.user.id === me.user.id,
                isHost = m.kind === 'human' && m.user.id === lobby.hostId;
              const role =
                m.kind === 'bot'
                  ? 'Bot'
                  : [isHost ? 'Host' : '', isMe ? 'you' : '', m.connected ? '' : 'away']
                      .filter(Boolean)
                      .join(' · ')
                      .replace(/^./, (c) => c.toUpperCase()) || 'Guest';
              return (
                <div className="row member" key={m.kind === 'bot' ? `bot-${i}` : m.user.id}>
                  <span
                    className="avatar sm"
                    style={{ background: cssColor(m.kind === 'bot' ? m.color : m.user.color) }}
                    aria-hidden="true"
                  >
                    {initialOf(nameOf(m))}
                  </span>
                  {m.kind === 'human' ? (
                    <button
                      type="button"
                      className="member-link grow"
                      onClick={() => {
                        Sound.play('tap');
                        onPlayer(m.user.id);
                      }}
                    >
                      <b>{m.user.name}</b>
                      <small>{role}</small>
                    </button>
                  ) : (
                    <span className="grow">
                      <b>{m.name}</b>
                      <small>{role}</small>
                    </span>
                  )}
                  {m.kind === 'human' ? (
                    <span className={`pill ${m.ready ? 'green' : 'soft'}`}>{m.ready ? 'Ready' : 'Not ready'}</span>
                  ) : (
                    host &&
                    open &&
                    seatsBots && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${m.name}`}
                        disabled={!live}
                        onClick={() => {
                          Sound.play('back');
                          ask(online.removeBot(i));
                        }}
                      >
                        <CloseIcon />
                      </button>
                    )
                  )}
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, max - n) }, (_, i) => (
              <div className="row member open" key={`open-${i}`}>
                <span className="avatar sm empty" aria-hidden="true">
                  ?
                </span>
                Open seat
              </div>
            ))}
            {host && open && seatsBots && n < max && (
              <button
                type="button"
                className="btn ghost"
                disabled={!live}
                onClick={() => {
                  Sound.play('select');
                  ask(online.addBot());
                }}
              >
                Add a bot
              </button>
            )}
          </section>
          <section className="on-rules" aria-labelledby="on-rules">
            <h2 className="label" id="on-rules">
              Rules
            </h2>
            <div className="plate">
              <span className="grow">
                <b>{rules.title}</b>
                <small>{rules.detail}</small>
              </span>
              {host && open && (
                <button
                  type="button"
                  className="mini"
                  onClick={() => {
                    Sound.play('tap');
                    onRules();
                  }}
                >
                  Change
                </button>
              )}
            </div>
          </section>
          <div className="footbar on-foot">
            <div>
              {error ? (
                <p className="foot-hint alert" role="alert">
                  {error}
                </p>
              ) : (
                <p className="foot-hint" role="status">
                  {hint(lobby, me, host)}
                </p>
              )}
              <div className="foot-row">
                <button
                  type="button"
                  className={ready ? 'btn ghost' : 'btn'}
                  disabled={!live || !open}
                  onClick={() => {
                    Sound.play(ready ? 'toggleOff' : 'toggleOn');
                    ask(online.setReady(!ready));
                  }}
                >
                  {ready ? 'Not ready' : "I'm ready"}
                </button>
                {host && (
                  <button
                    type="button"
                    className="btn"
                    disabled={!live || !open || !canStart}
                    onClick={() => {
                      Sound.play('start');
                      ask(online.startGame());
                    }}
                  >
                    Start
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </Page>
  );
}
