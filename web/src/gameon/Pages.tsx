/* The pages the footer leads to that only say something: how a hand of Skull King goes, what this
   site keeps, and who publishes it. Every word on them is the page's own. They ask the server for
   nothing but who is looking, which the bar at the top shows on every page of the frame.

   The guide is a short one in the page's own words, not a rulebook: every number of the scoring is
   on the rules sheet at Skull King's home. The imprint names nobody, because nobody has been named
   to it yet, and it says so. */
import type { ReactNode } from 'react';
import { AT } from '../router/addresses';
import type { FramePage } from '../router/addresses';
import { Sound } from '../sound/sound';
import { IconKey } from './art';
import type { KeyTone } from './art';
import { Footer, Link, Nav, useTitle } from './Frame';
import type { Who } from './Frame';
import { Icon } from './icons';
import type { IconName } from './icons';

export interface TextPageProps {
  who: Who;
  /** Back to the page this one was reached from. */
  onBack: () => void;
}

interface TextProps extends TextPageProps {
  page: FramePage;
  /** The page's name: its heading, and the tab's title after "GameOn". */
  name: string;
  lead: string;
  children: ReactNode;
}

/** What the four pages share: the bar, the way back, the heading, and the footer that led here. */
export function TextPage({ page, who, onBack, name, lead, children }: TextProps) {
  const title = useTitle(`GameOn · ${name}`);
  return (
    <>
      <Nav page={page} who={who} />
      <main className="go-doc">
        <div className="go-in">
          <div className="go-doc-head">
            <button
              type="button"
              className="go-text-link go-back"
              onClick={() => {
                Sound.play('back');
                onBack();
              }}
            >
              <Icon name="chevronLeft" />
              Back
            </button>
            <h1 tabIndex={-1} ref={title}>
              {name}
            </h1>
            <p>{lead}</p>
          </div>
          {children}
        </div>
      </main>
      <Footer page={page} who={who} />
    </>
  );
}

/** One block of a page, on its card. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="go-card go-doc-block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const WAYS: { name: string; line: string; icon: IconName; tone: KeyTone; to: string }[] = [
  {
    name: 'Against bots',
    line: 'Alone, at your own pace. The game waits for you when you leave.',
    icon: 'bot',
    tone: 'blue',
    to: AT.solo,
  },
  {
    name: 'One screen',
    line: 'Pass one device around the table. A curtain hides each hand between turns.',
    icon: 'smartphone',
    tone: 'gold',
    to: AT.oneScreen,
  },
  {
    name: 'Tables',
    line: 'Quick play finds you a table, and the public tables are open to anybody.',
    icon: 'globe',
    tone: 'green',
    to: AT.online,
  },
  {
    name: 'Friends',
    line: 'Open a private table and share its code.',
    icon: 'lock',
    tone: 'orange',
    to: AT.newTable,
  },
  {
    name: 'Ranked',
    line: 'Queue alone for the season’s ladder. It takes a free account, and no bot sits down.',
    icon: 'crown',
    tone: 'purple',
    to: AT.ranked,
  },
];

export function HowToPlayPage({ who, onBack }: TextPageProps) {
  return (
    <TextPage
      page="howToPlay"
      who={who}
      onBack={onBack}
      name="How to play"
      lead="Skull King in three minutes: a bid, a trick, and five ways to sit down."
    >
      <div className="go-doc-cols">
        <div className="go-doc-main">
          <Block title="A hand">
            <p>
              A game is a run of rounds, and in most games each round deals one card more than the last. Every round
              goes the same way: first everybody bids, then the tricks are played.
            </p>
          </Block>
          <Block title="A bid">
            <p>
              Look at your cards and say how many tricks you will win. Zero is a bid too. Everybody bids in secret, and
              the bids are turned over together.
            </p>
            <p>From then on that number is yours to hit. One trick too many is as wrong as one too few.</p>
          </Block>
          <Block title="A trick">
            <p>
              One player leads a card and the others follow in turn. If you hold the suit that was led, you play it. A
              special card may be played at any time. The highest card of the suit that was led takes the trick, unless
              something stronger is on the table.
            </p>
            <ul>
              <li>The black Jolly Roger suit beats the three colours.</li>
              <li>A Mermaid beats every number, a Pirate beats a Mermaid, and the Skull King beats a Pirate.</li>
              <li>A Mermaid in the same trick catches the Skull King.</li>
              <li>An Escape gives the trick away, which is what you want once your bid is made.</li>
            </ul>
            <p>Whoever takes the trick leads the next one.</p>
          </Block>
          <Block title="The score">
            <p>
              Hit your bid and every trick of it counts for you. Miss it and every trick you were off counts against
              you. A bid of zero pays more the more cards were dealt, and costs as much when it fails.
            </p>
            <p>
              The table adds it up for you. Every number, the bonuses and the pirates’ powers are on the rules sheet at{' '}
              <Link to={AT.home} className="go-inline-link">
                Skull King’s home
              </Link>
              .
            </p>
          </Block>
        </div>
        <section className="go-card go-doc-ways" aria-labelledby="go-ways-five">
          <h2 id="go-ways-five">Five ways to sit down</h2>
          <ul>
            {WAYS.map((way) => (
              <li key={way.name}>
                <Link to={way.to} className="go-doc-way">
                  <IconKey icon={way.icon} tone={way.tone} />
                  <span>
                    <b>{way.name}</b>
                    <small>{way.line}</small>
                  </span>
                  <Icon name="chevronRight" />
                </Link>
              </li>
            ))}
          </ul>
          <Link to={AT.home} className="btn go-btn full">
            Play Skull King
          </Link>
        </section>
      </div>
    </TextPage>
  );
}

export function PrivacyPage({ who, onBack }: TextPageProps) {
  return (
    <TextPage page="privacy" who={who} onBack={onBack} name="Privacy" lead="What this site keeps about you, and where.">
      <div className="go-doc-main">
        <Block title="Your account">
          <p>
            A guest has a display name and a colour, and is asked for nothing else. An account adds a username and a
            password. The password is stored as a hash: the site cannot read it back.
          </p>
        </Block>
        <Block title="The session cookie">
          <p>
            One cookie keeps this browser signed in. The page cannot read it, and it is sent to this site only. Signing
            out ends it. The page loads nothing from other sites.
          </p>
        </Block>
        <Block title="The games the server stores">
          <p>
            A game played on the server is stored with its deals and its moves in order, so that it can be replayed
            exactly. Your results, your stats and your rating come from those games. Your finished games are listed on
            your profile, and only the players who sat in a game can open its record.
          </p>
        </Block>
        <Block title="What other players see">
          <p>
            The ladder is public. It shows your display name, your colour, your tier and your rating. It does not show
            your username, and neither does your page as other players see it.
          </p>
        </Block>
        <Block title="On this device">
          <p>
            One game against bots or on one screen is saved in this browser, so that you can pick it up later. It never
            leaves the device, and “Forget this game” at Skull King’s home drops it.
          </p>
          <p>
            A scoresheet for a game with real cards, your sound settings, this device’s own stats, your last table
            settings and a note from Suggest a game are kept the same way: in this browser, and nowhere else.
          </p>
        </Block>
        <p className="go-doc-note">
          Who publishes this site is on the{' '}
          <Link to={AT.imprint} className="go-inline-link">
            imprint
          </Link>
          .
        </p>
      </div>
    </TextPage>
  );
}

export function ImprintPage({ who, onBack }: TextPageProps) {
  return (
    <TextPage page="imprint" who={who} onBack={onBack} name="Imprint" lead="Who publishes this site.">
      <div className="go-doc-main">
        <Block title="Not filled in yet">
          <p>The imprint is not filled in yet. The publisher’s name and address belong here.</p>
        </Block>
      </div>
    </TextPage>
  );
}
