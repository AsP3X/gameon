import { useEffect, useState } from 'react';
import type { Online, Outcome } from '../net/online';
import type { LinkStatus } from '../net/socket';
import type { Lobby, Me, Member, UserId } from '../protocol/generated';
import { Sound } from '../sound/sound';
import { cssColor } from '../tableview/dom';
import { failureText } from './copy';
import { BackIcon, CloseIcon } from './icons';
import { describeSettings } from './settings';

const LEVEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;
const initialOf = (name: string): string => (name.trim()[0] || '?').toUpperCase();
const nameOf = (m: Member): string => (m.kind === 'bot' ? m.name : m.user.name);

/** The line above the buttons: what the table is waiting for. */
function hint(lobby: Lobby, me: Me, host: boolean): string {
  if (lobby.state !== 'open') return 'The game is starting…';
  const humans = lobby.members.flatMap((m) => (m.kind === 'human' ? [m] : []));
  const mine = humans.find((m) => m.user.id === me.user.id);
  const waiting = humans.find((m) => !m.ready && m.user.id !== me.user.id);
  if (lobby.members.length < 2)
    return host ? 'A game needs two pirates. Add a bot or share the code.' : 'Waiting for more pirates.';
  if (!mine?.ready) return host ? 'Say you are ready, then start the game.' : 'Say you are ready when you are set.';
  if (waiting) return `Waiting for ${waiting.user.name} to be ready.`;
  return host ? 'Everyone is ready. Start when you like.' : 'Everyone is ready. The host starts the game.';
}

export interface LobbyRoomProps {
  online: Online;
  lobby: Lobby;
  me: Me;
  status: LinkStatus;
  /** Something that ended while the player was away, until they have read it. */
  notice: { title: string; text: string } | null;
  onRules: () => void;
  /** A human at the table was tapped: show who they are. */
  onPlayer: (id: UserId) => void;
}

/** The table before the game: who is at it, who is ready, the rules, and the host's start. */
export function LobbyRoom({ online, lobby, me, status, notice, onRules, onPlayer }: LobbyRoomProps) {
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
    n = lobby.members.length,
    max = lobby.settings.maxPlayers;
  const mine = lobby.members.find((m) => m.kind === 'human' && m.user.id === me.user.id);
  const ready = mine?.kind === 'human' && mine.ready;
  const canStart = n >= 2 && lobby.members.every((m) => m.kind === 'bot' || m.ready);
  const rules = describeSettings(lobby.settings);

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
    <>
      <div className="wrap">
        <div className="row head">
          <button
            type="button"
            className="icon-btn"
            aria-label="Leave table"
            onClick={() => {
              Sound.play('back');
              ask(online.leaveLobby());
            }}
          >
            <BackIcon />
          </button>
          <h2 className="grow">Table</h2>
          <span className="pill blue">{lobby.visibility === 'private' ? 'Private' : 'Public'}</span>
        </div>
        <div className="stack sections">
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
          <div className="plate">
            <span className="grow">
              <span className="label">Table code</span>
              <b className="code">{lobby.code}</b>
            </span>
            <button type="button" className="mini" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <section className="stack" aria-label="Crew">
            <span className="label">
              Crew · {n} of {max}
            </span>
            {lobby.members.map((m, i) => {
              const isMe = m.kind === 'human' && m.user.id === me.user.id,
                isHost = m.kind === 'human' && m.user.id === lobby.hostId;
              const role =
                m.kind === 'bot'
                  ? `Bot · ${LEVEL[m.level]}`
                  : [isHost ? 'Host' : '', isMe ? 'you' : '', m.connected ? '' : 'away']
                      .filter(Boolean)
                      .join(' · ')
                      .replace(/^./, (c) => c.toUpperCase()) || 'Guest';
              return (
                <div className="row member" key={m.kind === 'bot' ? `bot-${i}` : m.user.id}>
                  <span
                    className="avatar sm"
                    style={{ background: cssColor(m.kind === 'bot' ? m.color : m.user.color) }}
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
                  ) : host && open ? (
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
                  ) : (
                    <span className="pill soft">Bot</span>
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
            {host && open && n < max && (
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
          <section className="stack" aria-label="Rules">
            <span className="label">Rules</span>
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
        </div>
      </div>
      <div className="footbar">
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
                Start game
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
