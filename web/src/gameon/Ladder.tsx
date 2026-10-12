/* The ladder (plan item W5), as design/gameon.pen draws it (`Ladder · desktop`, `Ladder · phone`,
   `Ladder · states`): the season the server named and one row for each rated account, a page at a
   time. It is a page of the frame: it needs no connection, it asks for no session and it makes no
   guest (`GET /ladder` is public). Another player's page is not public, so a name leads to it only
   for a browser that has a session.

   A row is what the server sent: the rank, the name, the colour, the tier and the rating. It has
   no username. The page works no rank out: a player whose row is not on a page it has loaded is
   not on it, and no "you are 40th" line is made up for them. */
import { useEffect, useState } from 'react';
import type { Online } from '../net/online';
import { initialOf } from '../online/parts';
import type { LadderEntry, Season, UserId } from '../protocol/generated';
import { playerAt } from '../router/addresses';
import { Sound } from '../sound/sound';
import { cssColor, whole } from '../tableview/dom';
import { Footer, Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import { RETRY_MS } from './Profile';

type Ladder =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; season: Season; entries: LadderEntry[]; next: string | null };

/** One rated account. With a session, the name leads to that player's page. */
function Row({ entry, you, linked }: { entry: LadderEntry; you: boolean; linked: boolean }) {
  const { user, rating } = entry,
    at = linked ? playerAt(user.id) : null;
  const who = (
    <>
      <span className="avatar go-ladder-avatar" style={{ background: cssColor(user.color) }} aria-hidden="true">
        {initialOf(user.name)}
      </span>
      <span className="go-ladder-name">
        <span>
          <b>{user.name}</b>
          {you && <span className="pill green">You</span>}
        </span>
        <small className="narrow-only">{rating.provisional ? `${rating.tier} · Provisional` : rating.tier}</small>
      </span>
    </>
  );
  return (
    <li>
      <span className="go-ladder-rank">{entry.rank}</span>
      {at ? (
        <Link to={at} className="go-ladder-who">
          {who}
        </Link>
      ) : (
        <span className="go-ladder-who">{who}</span>
      )}
      <span className="go-ladder-tier wide-only">
        <span className="pill gold">{rating.tier}</span>
        {rating.provisional && <span className="pill blue">Provisional</span>}
      </span>
      <b className="go-ladder-rating">{whole(rating.value)}</b>
    </li>
  );
}

export interface LadderPageProps {
  online: Online;
  who: Who;
  /** The live season, null when the server has none, undefined until it has said. */
  season: Season | null | undefined;
  /** Back to Skull King's ranked page. */
  onBack: () => void;
}

export function LadderPage({ online, who, season, onBack }: LadderPageProps) {
  const title = useTitle('GameOn · Ladder');
  const [ladder, setLadder] = useState<Ladder>({ state: 'loading' });
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [round, setRound] = useState(0);
  /** The player looking at it, so their own row can be marked where it is on a page. */
  const me: UserId | null = who.is === 'player' ? who.me.user.id : null;

  useEffect(() => {
    let stale = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    void online.ladder().then((r) => {
      if (stale) return;
      if (r.ok)
        return setLadder({
          state: 'ready',
          season: r.value.season,
          entries: r.value.entries,
          next: r.value.next ?? null,
        });
      setLadder({ state: 'failed' });
      timer = setTimeout(() => setRound((n) => n + 1), RETRY_MS);
    });
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [online, round]);

  const again = (): void => {
    Sound.play('tap');
    setLadder({ state: 'loading' });
    setMore('idle');
    setRound((n) => n + 1);
  };
  const loadMore = (): void => {
    if (ladder.state !== 'ready' || ladder.next == null || more === 'loading') return;
    Sound.play('tap');
    setMore('loading');
    const from = ladder;
    void online.ladder(ladder.next).then((r) => {
      if (!r.ok) return setMore('failed');
      setMore('idle');
      // The page belongs behind the rows it was asked after: if the ladder was read again meanwhile, it is dropped.
      setLadder((now) =>
        now === from ? { ...from, entries: [...from.entries, ...r.value.entries], next: r.value.next ?? null } : now,
      );
    });
  };

  // The season is the one the ladder came with. Until it has, the one `GET /config` named.
  const named = ladder.state === 'ready' ? ladder.season : season;
  return (
    <>
      <Nav page="ladder" who={who} />
      <main className="go-ladder">
        <div className="go-in">
          <div className="go-ladder-head">
            <button
              type="button"
              className="go-text-link go-back"
              onClick={() => {
                Sound.play('back');
                onBack();
              }}
            >
              <Icon name="chevronLeft" />
              Ranked
            </button>
            <div className="go-ladder-title">
              <h1 tabIndex={-1} ref={title}>
                Ladder
              </h1>
              {named && <span className="pill gold">{named.name}</span>}
            </div>
            <p>Ranked players this quarter, by rating.</p>
          </div>
          {ladder.state === 'loading' ? (
            <div className="go-skeleton" role="status" aria-label="Loading the ladder">
              <div className="go-card">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row}>
                    <span>
                      <i></i>
                      {row > 0 && <i></i>}
                    </span>
                    {row > 0 && <i></i>}
                  </div>
                ))}
              </div>
            </div>
          ) : ladder.state === 'failed' ? (
            <div className="go-card go-failed">
              <p className="alert" role="alert">
                The ladder could not be loaded.
              </p>
              <button type="button" className="btn ghost go-btn full" onClick={again}>
                Try again
              </button>
            </div>
          ) : (
            <section className="go-card go-ladder-list" aria-label={`The ladder of ${ladder.season.name}`}>
              {ladder.entries.length === 0 ? (
                <p className="go-ladder-empty">Nobody is rated this quarter yet.</p>
              ) : (
                <>
                  <div className="go-ladder-cols wide-only" aria-hidden="true">
                    <span className="go-ladder-rank">Rank</span>
                    <span className="go-ladder-who">Player</span>
                    <span className="go-ladder-tier">Tier</span>
                    <span className="go-ladder-rating">Rating</span>
                  </div>
                  <ol>
                    {ladder.entries.map((entry) => (
                      <Row key={entry.user.id} entry={entry} you={entry.user.id === me} linked={who.is === 'player'} />
                    ))}
                  </ol>
                  {ladder.next != null && (
                    <div className="go-more">
                      {more === 'failed' && (
                        <p className="alert" role="alert">
                          The next rows could not be loaded.
                        </p>
                      )}
                      <button type="button" className="go-text-link" disabled={more === 'loading'} onClick={loadMore}>
                        {more === 'failed' ? 'Try again' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>
      <Footer page="ladder" who={who} />
    </>
  );
}
