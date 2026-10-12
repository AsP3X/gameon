/* Suggest a game: a game's name and a short note. There is no server behind this page, and it says
   so. "Save" keeps the note on this device and sends nothing. One note is kept: saving again puts
   the new one in its place. A page that opens later shows the note that is kept. */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Sound } from '../sound/sound';
import type { TextPageProps } from './Pages';
import { TextPage } from './Pages';

/** Where the one note is kept in this browser. */
export const SUGGESTION_KEY = 'skullking-tavern.suggestion.v1';
export const GAME_MAX = 60;
export const NOTE_MAX = 280;

export interface Suggestion {
  game: string;
  note: string;
}

/** The note this device keeps, when it keeps one that reads as one. */
export function keptSuggestion(): Suggestion | null {
  try {
    const raw = localStorage.getItem(SUGGESTION_KEY);
    const kept: unknown = raw ? JSON.parse(raw) : null;
    if (typeof kept !== 'object' || kept === null || !('game' in kept) || !('note' in kept)) return null;
    const { game, note } = kept;
    if (typeof game !== 'string' || typeof note !== 'string') return null;
    return { game: game.slice(0, GAME_MAX), note: note.slice(0, NOTE_MAX) };
  } catch {
    return null;
  }
}

/** Keep the note in the place of the one before it. False when this browser would not keep it. */
function keep(suggestion: Suggestion): boolean {
  try {
    localStorage.setItem(SUGGESTION_KEY, JSON.stringify(suggestion));
    return true;
  } catch {
    // Private mode or a full quota.
    return false;
  }
}

type Said = { is: 'saved' } | { is: 'nameless' } | { is: 'refused' } | null;

export function SuggestPage({ who, onBack }: TextPageProps) {
  const [kept] = useState(keptSuggestion);
  const [game, setGame] = useState(kept?.game ?? '');
  const [note, setNote] = useState(kept?.note ?? '');
  const [said, setSaid] = useState<Said>(null);
  const edit = (set: (value: string) => void) => (value: string) => {
    setSaid(null);
    set(value);
  };
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const named = game.trim();
    if (!named) return setSaid({ is: 'nameless' });
    Sound.play('tap');
    setSaid(keep({ game: named, note: note.trim() }) ? { is: 'saved' } : { is: 'refused' });
  };
  return (
    <TextPage
      page="suggest"
      who={who}
      onBack={onBack}
      name="Suggest a game"
      lead="Tell us the game your table always ends up playing."
    >
      <form className="go-card go-suggest-form" onSubmit={submit} noValidate>
        <div className="go-field">
          <label htmlFor="suggest-game">Game</label>
          <input
            id="suggest-game"
            type="text"
            value={game}
            maxLength={GAME_MAX}
            autoComplete="off"
            aria-invalid={said?.is === 'nameless'}
            aria-describedby={said?.is === 'nameless' ? 'suggest-game-help' : undefined}
            onChange={(e) => edit(setGame)(e.target.value)}
          />
          {said?.is === 'nameless' && (
            <p id="suggest-game-help" className="alert" role="alert">
              Name the game first.
            </p>
          )}
        </div>
        <div className="go-field">
          <label htmlFor="suggest-note">A short note</label>
          <textarea
            id="suggest-note"
            rows={4}
            value={note}
            maxLength={NOTE_MAX}
            aria-describedby="suggest-note-help"
            onChange={(e) => edit(setNote)(e.target.value)}
          />
          <p id="suggest-note-help">Why this one? Up to {NOTE_MAX} characters, or nothing at all.</p>
        </div>
        <p className="go-form-note">
          There is no inbox behind this page yet. Your note is kept on this device and is sent nowhere.
        </p>
        <div className="go-send">
          {said?.is === 'saved' ? (
            <p className="go-saved" role="status">
              Saved on this device.
            </p>
          ) : (
            said?.is === 'refused' && (
              <p className="alert" role="alert">
                This browser would not keep the note.
              </p>
            )
          )}
          <button type="submit" className="btn go-btn full">
            Save
          </button>
        </div>
      </form>
    </TextPage>
  );
}
