//! Three bot levels. A bot sees one seat's [`EngineView`], the canonical deck, the table
//! rules, the face-up plays, the cards the Seer showed that seat, and an [`Rng`].
//! It does not take [`GameState`].

use crate::card::{self, Card, lead_suit, lookup, resolve_trick};
use crate::error::StepError;
use crate::ids::{CardId, Seat};
use crate::model::{Ability, AbilityChoice, EngineView, Play, PlayedAs, Suit};
use crate::rng::Rng;
use crate::rules::{BotLevel, Ruleset, Scoring};

/// What this seat has already seen, beyond the current view.
///
/// `plays` is every face-up card this round. `peeked` is the pile the Seer showed
/// this seat, and it is empty for every other seat.
#[derive(Debug, Clone, Copy)]
pub struct BotSight<'a> {
    /// Face-up plays this round, in order, with each Tigress declaration.
    pub plays: &'a [Play],
    /// Cards this seat was shown from the pile. Never another seat's peek.
    pub peeked: &'a [CardId],
}

impl BotSight<'static> {
    /// No plays yet, and no Seer peek.
    pub const EMPTY: Self = Self {
        plays: &[],
        peeked: &[],
    };
}

/// The bid this seat would make.
///
/// `view` must be that seat's view: the hand it bids from is `view.hand`.
///
/// # Errors
///
/// [`StepError::Broken`] when the view names a card that is not in `deck`.
pub fn choose_bid(
    view: &EngineView,
    deck: &[Card],
    rules: Ruleset,
    level: BotLevel,
    sight: BotSight<'_>,
    rng: &mut impl Rng,
) -> Result<u8, StepError> {
    // Human: Bid the tricks this hand is likely to win. Easy still adds a beginner's extra on top.
    // Agent: READS EngineView, deck, Ruleset, BotSight, BotLevel, Rng; does not take GameState; RETURNS a bid in 0..=hand length. Play still uses sure_count, not this bid.
    let read = Read::build(view, deck, rules, level, sight)?;
    let mut bid = likely_bid(view, deck, &read)?;
    if bid == 0 && duck_count(view, deck)? == 0 && has_high_black(view, deck)? {
        bid = 1;
    }
    if level == BotLevel::Easy {
        let slip = rng.next_f64();
        if slip < 0.5 {
            if has_mermaid(view, deck)? {
                bid += 1;
            }
            if has_side_honor(view, deck)? {
                bid += 1;
            }
        }
        if slip < 0.25 && bid == 0 && !view.hand.is_empty() {
            bid = 1;
        }
    }
    let len = i32::try_from(view.hand.len()).map_err(|_| StepError::Broken)?;
    let clamped = bid.clamp(0, len);
    u8::try_from(clamped).map_err(|_| StepError::Broken)
}

/// The card this seat would play, and the Tigress declaration when the card is the Tigress.
///
/// # Errors
///
/// [`StepError::Broken`] when the seat has no legal card or the view names an unknown card.
pub fn choose_play(
    view: &EngineView,
    deck: &[Card],
    rules: Ruleset,
    level: BotLevel,
    sight: BotSight<'_>,
    rng: &mut impl Rng,
) -> Result<(CardId, Option<PlayedAs>), StepError> {
    // Human: Win the tricks the bid still needs, duck the rest, and on Hard lean on the next seat only with a card that keeps that plan.
    // Agent: READS EngineView, deck, Ruleset, BotSight, BotLevel, Rng; does not take GameState; RETURNS a legal card from view.hand.
    let options = options_of(view, deck)?;
    let Some(only) = options.first() else {
        return Err(StepError::Broken);
    };
    if options.len() == 1 {
        return Ok(*only);
    }
    let read = Read::build(view, deck, rules, level, sight)?;
    let plan = plan_of(view, deck, &read)?;
    let ranked = rank_all(view, deck, &options, &read, &plan)?;
    let aim = aim_of(&ranked, &plan);
    let doomed = level == BotLevel::Hard && plan.doomed;
    let mut chosen = pick(&ranked, aim, level == BotLevel::Hard, doomed)?;
    if level == BotLevel::Easy {
        chosen = easy_slip(view, deck, &ranked, chosen, &plan, rng)?;
    }
    Ok(chosen.play)
}

/// The answer this seat would give for the ability open on `view`.
///
/// # Errors
///
/// [`StepError::Broken`] when `view` has no ability for this seat, or the hand cannot supply a discard.
pub fn choose_ability(
    view: &EngineView,
    deck: &[Card],
    rules: Ruleset,
    level: BotLevel,
    sight: BotSight<'_>,
    rng: &mut impl Rng,
) -> Result<AbilityChoice, StepError> {
    // Human: Answer the pirate the way the bid requires. Easy sometimes names the wrong seat, discards the wrong cards, bets anyway, or steps the Giant the wrong way.
    // Agent: READS EngineView, deck, Ruleset, BotSight, BotLevel, Rng; does not take GameState; RETURNS a choice the open ability accepts.
    let pending = view.pending.as_ref().ok_or(StepError::Broken)?;
    if pending.seat != view.me {
        return Err(StepError::Broken);
    }
    let read = Read::build(view, deck, rules, level, sight)?;
    let plan = plan_of(view, deck, &read)?;
    Ok(match pending.kind {
        Ability::Helm => AbilityChoice::Number(helm_seat(view, level, rng)?),
        Ability::Smuggler => {
            AbilityChoice::Cards(smuggler_discards(view, deck, &plan, level, rng)?)
        }
        Ability::Gambler => AbilityChoice::Number(gambler_stake(view, &plan, level, rng)),
        Ability::Giant => AbilityChoice::Number(giant_change(view, level, rng)?),
        Ability::Seer => AbilityChoice::Pass(()),
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    SafeTake,
    RiskyTake,
    Duck,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Note {
    Stopper,
    Escape,
    Kraken,
    Whale,
    Plain,
}

#[derive(Clone, Copy)]
struct Opt {
    play: (CardId, Option<PlayedAs>),
    kind: Kind,
    note: Note,
    spend: i32,
    shed: i32,
    pressure: i32,
    sure: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Aim {
    Duck,
    CashSure,
    MustTake,
}

struct Read {
    players: usize,
    neighbor: Seat,
    rascal: bool,
    level: BotLevel,
    voids: Vec<[bool; 4]>,
    unseen: Vec<Card>,
    holders: i32,
}

struct Plan {
    need: i32,
    left: i32,
    target: i32,
    sure: i32,
    ducks: i32,
    doomed: bool,
    neighbor_need: Option<i32>,
    neighbor_chances: i32,
}

fn plan_of(view: &EngineView, deck: &[Card], read: &Read) -> Result<Plan, StepError> {
    let need = need_of(view).unwrap_or(0);
    let left = i32::try_from(view.hand.len()).map_err(|_| StepError::Broken)?;
    let sure = sure_count(&view.hand, deck, read)?;
    let ducks = duck_count(view, deck)?;
    let target = target_takes(need, left, read.rascal);
    let doomed = read.rascal && (need <= -2 || need > left + 1);
    let neighbor_need = seat_need(view, read.neighbor)?;
    let neighbor_chances = seat_chances(view, read.neighbor)?;
    Ok(Plan {
        need,
        left,
        target,
        sure,
        ducks,
        doomed,
        neighbor_need,
        neighbor_chances,
    })
}

fn target_takes(need: i32, left: i32, rascal: bool) -> i32 {
    if need <= 0 {
        return 0;
    }
    if need <= left {
        return need;
    }
    if rascal && need == left + 1 {
        return left;
    }
    if rascal {
        return 0;
    }
    left
}

fn aim_of(opts: &[Opt], plan: &Plan) -> Aim {
    if plan.target <= 0 {
        return Aim::Duck;
    }
    if plan.target >= plan.left || plan.sure < plan.target {
        return Aim::MustTake;
    }
    if opts
        .iter()
        .any(|opt| opt.kind == Kind::SafeTake && opt.sure)
    {
        Aim::CashSure
    } else {
        Aim::Duck
    }
}

fn pick(opts: &[Opt], aim: Aim, hard: bool, doomed: bool) -> Result<Opt, StepError> {
    // Human: Hard may choose any card once the round can no longer score, and otherwise only a card from the plan.
    // Agent: READS ranked plays, aim, hard, doomed; RETURNS one of those plays; a doomed Hard bid may leave the duck pool, a live bid may not.
    if opts.is_empty() {
        return Err(StepError::Broken);
    }
    if doomed {
        return Ok(*best(opts, false, true)?);
    }
    let pool = match aim {
        Aim::Duck => {
            let ducks = non_takes(opts);
            if ducks.is_empty() {
                return Ok(*best(opts, true, hard)?);
            }
            return Ok(*best(&ducks, false, hard)?);
        }
        Aim::CashSure => opts
            .iter()
            .filter(|opt| opt.kind == Kind::SafeTake && opt.sure)
            .copied()
            .collect::<Vec<_>>(),
        Aim::MustTake => {
            let safe = opts
                .iter()
                .filter(|opt| opt.kind == Kind::SafeTake)
                .copied()
                .collect::<Vec<_>>();
            if safe.is_empty() {
                let risky = opts
                    .iter()
                    .filter(|opt| opt.kind == Kind::RiskyTake)
                    .copied()
                    .collect::<Vec<_>>();
                if risky.is_empty() {
                    opts.to_vec()
                } else {
                    risky
                }
            } else {
                safe
            }
        }
    };
    let pool = if pool.is_empty() { opts.to_vec() } else { pool };
    let taking = matches!(aim, Aim::MustTake | Aim::CashSure);
    Ok(*best(&pool, taking, hard)?)
}

fn non_takes(opts: &[Opt]) -> Vec<Opt> {
    opts.iter()
        .filter(|opt| opt.kind == Kind::Duck)
        .copied()
        .collect()
}

fn best(opts: &[Opt], taking: bool, hard: bool) -> Result<&Opt, StepError> {
    let mut chosen = opts.first().ok_or(StepError::Broken)?;
    for item in opts.iter().skip(1) {
        if better(item, chosen, taking, hard) {
            chosen = item;
        }
    }
    Ok(chosen)
}

fn better(item: &Opt, chosen: &Opt, taking: bool, hard: bool) -> bool {
    if hard && item.pressure != chosen.pressure {
        return item.pressure > chosen.pressure;
    }
    if taking {
        item.spend < chosen.spend
    } else {
        item.shed > chosen.shed
    }
}

fn easy_slip(
    view: &EngineView,
    deck: &[Card],
    opts: &[Opt],
    chosen: Opt,
    plan: &Plan,
    rng: &mut impl Rng,
) -> Result<Opt, StepError> {
    let leading = view.trick.plays.is_empty();
    if leading
        && plan.target > 0
        && let Some(stopper) = strongest(opts, Note::Stopper)
        && rng.next_f64() < 0.33
    {
        return Ok(stopper);
    }
    if chosen.kind == Kind::Duck
        && let Some(take) = opts
            .iter()
            .filter(|opt| opt.kind != Kind::Duck)
            .copied()
            .max_by_key(|opt| opt.spend)
        && rng.next_f64() < 0.25
    {
        return Ok(take);
    }
    if chosen.note != Note::Escape
        && let Some(escape) = opts
            .iter()
            .copied()
            .find(|opt| opt.note == Note::Escape && opt.kind == Kind::Duck)
        && rng.next_f64() < 0.20
    {
        return Ok(escape);
    }
    if chosen.note != Note::Kraken
        && let Some(kraken) = opts.iter().copied().find(|opt| opt.note == Note::Kraken)
        && rng.next_f64() < 0.50
    {
        return Ok(kraken);
    }
    if chosen.note == Note::Escape
        && lookup(deck, chosen.play.0)?.is_tigress()
        && let Some(pirate) = opts
            .iter()
            .copied()
            .find(|opt| opt.play.0 == chosen.play.0 && opt.play.1 == Some(PlayedAs::Pirate))
        && rng.next_f64() < 0.33
    {
        return Ok(pirate);
    }
    Ok(chosen)
}

fn strongest(opts: &[Opt], note: Note) -> Option<Opt> {
    opts.iter()
        .filter(|opt| opt.note == note)
        .copied()
        .max_by_key(|opt| opt.spend)
}

fn rank_all(
    view: &EngineView,
    deck: &[Card],
    options: &[(CardId, Option<PlayedAs>)],
    read: &Read,
    plan: &Plan,
) -> Result<Vec<Opt>, StepError> {
    let mut ranked = Vec::with_capacity(options.len());
    for play in options {
        ranked.push(rank_one(view, deck, *play, read, plan)?);
    }
    Ok(ranked)
}

fn rank_one(
    view: &EngineView,
    deck: &[Card],
    choice: (CardId, Option<PlayedAs>),
    read: &Read,
    plan: &Plan,
) -> Result<Opt, StepError> {
    let card = lookup(deck, choice.0)?;
    let note = note_of(card, choice.1);
    let rivals = rivals_of(view)?;
    let threatened = if rivals.is_empty() {
        false
    } else {
        rival_threat(view, deck, choice, &rivals, read)?
    };
    let wins = wins_now(view, deck, choice)?;
    let kind = kind_of(view, card, note, wins, threatened);
    let sure = is_sure_card(&view.hand, deck, choice.0, read)?;
    let spend = spend_of(card, choice.1);
    let shed = shed_of(card, choice.1, sure, plan.target);
    let pressure = if read.level == BotLevel::Hard {
        pressure_of(view, deck, choice, kind, read, plan)?
    } else {
        0
    };
    Ok(Opt {
        play: choice,
        kind,
        note,
        spend,
        shed,
        pressure,
        sure,
    })
}

fn kind_of(view: &EngineView, card: Card, note: Note, wins: bool, threatened: bool) -> Kind {
    if matches!(note, Note::Escape | Note::Kraken | Note::Whale) {
        return Kind::Duck;
    }
    if view.trick.plays.is_empty() {
        return lead_kind(card, note, threatened);
    }
    if wins && !threatened {
        Kind::SafeTake
    } else if wins {
        Kind::RiskyTake
    } else {
        Kind::Duck
    }
}

fn lead_kind(card: Card, note: Note, threatened: bool) -> Kind {
    // Human: A black 10 or a side 13 is a trick worth bidding, so a threatened one is still a take.
    // Agent: READS card, note, threatened; RETURNS SafeTake when nothing unseen beats it, RiskyTake for a stopper or a high number, Duck otherwise.
    if !threatened {
        return Kind::SafeTake;
    }
    if note == Note::Stopper || contested_winner(card) {
        Kind::RiskyTake
    } else {
        Kind::Duck
    }
}

/// A number high enough to bid, below the stopper line.
fn contested_winner(card: Card) -> bool {
    match card {
        Card::Number {
            suit: Suit::Black,
            rank,
            ..
        } => rank >= 10,
        Card::Number { rank, .. } => rank >= 13,
        _ => false,
    }
}

fn note_of(card: Card, played_as: Option<PlayedAs>) -> Note {
    match card {
        Card::Kraken { .. } => Note::Kraken,
        Card::Whale { .. } => Note::Whale,
        Card::Escape { .. } | Card::Loot { .. } => Note::Escape,
        Card::Tigress { .. } => {
            if played_as == Some(PlayedAs::Escape) {
                Note::Escape
            } else {
                Note::Stopper
            }
        }
        Card::SkullKing { .. } | Card::Pirate { .. } | Card::Mermaid { .. } => Note::Stopper,
        Card::Number { suit, rank, .. } => {
            if suit == Suit::Black && rank >= 12 {
                Note::Stopper
            } else {
                Note::Plain
            }
        }
    }
}

fn spend_of(card: Card, played_as: Option<PlayedAs>) -> i32 {
    match card {
        Card::Escape { .. } | Card::Loot { .. } => 0,
        Card::Tigress { .. } if played_as == Some(PlayedAs::Escape) => 0,
        Card::Number { suit, rank, .. } => {
            let rank = i32::from(rank);
            if suit == Suit::Black { 30 + rank } else { rank }
        }
        Card::Mermaid { .. } => 60,
        Card::Whale { .. } => 70,
        Card::Pirate { .. } | Card::Tigress { .. } => 80,
        Card::Kraken { .. } => 90,
        Card::SkullKing { .. } => 100,
    }
}

fn shed_of(card: Card, played_as: Option<PlayedAs>, sure: bool, target: i32) -> i32 {
    if target > 0 && (sure || matches!(note_of(card, played_as), Note::Stopper)) {
        return 0;
    }
    match note_of(card, played_as) {
        Note::Plain | Note::Stopper => match card {
            Card::Number { suit, rank, .. } => {
                let rank = i32::from(rank);
                if suit == Suit::Black {
                    300 + rank
                } else {
                    200 + rank
                }
            }
            Card::SkullKing { .. }
            | Card::Pirate { .. }
            | Card::Mermaid { .. }
            | Card::Tigress { .. } => 400,
            _ => 200,
        },
        Note::Kraken => 80,
        Note::Escape => 40,
        Note::Whale => 20,
    }
}

fn pressure_of(
    view: &EngineView,
    deck: &[Card],
    choice: (CardId, Option<PlayedAs>),
    kind: Kind,
    read: &Read,
    plan: &Plan,
) -> Result<i32, StepError> {
    let Some(need) = plan.neighbor_need else {
        return Ok(0);
    };
    let mut pressure = 0;
    if view.trick.plays.is_empty() && kind == Kind::Duck {
        pressure += lead_pressure(deck, choice.0, need, plan.neighbor_chances, read)?;
    }
    if rivals_of(view)?.is_empty() {
        let neighbor_wins = neighbor_wins(view, deck, choice, read.neighbor)?;
        pressure += bid_pressure(need, plan.neighbor_chances, neighbor_wins, read.rascal);
    }
    Ok(pressure)
}

fn lead_pressure(
    deck: &[Card],
    card: CardId,
    need: i32,
    chances: i32,
    read: &Read,
) -> Result<i32, StepError> {
    let Some(suit) = card_suit(lookup(deck, card)?) else {
        return Ok(0);
    };
    let void = known_void(read, read.neighbor, suit)?;
    if !void {
        return Ok(0);
    }
    if need <= 0 {
        Ok(2)
    } else if need >= chances.max(1) {
        Ok(-3)
    } else {
        Ok(0)
    }
}

fn bid_pressure(need: i32, chances: i32, neighbor_wins: bool, rascal: bool) -> i32 {
    if rascal && (need <= -2 || need > chances) {
        return 0;
    }
    if need <= 0 {
        return if neighbor_wins { 5 } else { -2 };
    }
    if need > chances {
        return if neighbor_wins { 0 } else { 2 };
    }
    if need == chances {
        return if neighbor_wins { -3 } else { 5 };
    }
    if neighbor_wins { -2 } else { 1 }
}

fn neighbor_wins(
    view: &EngineView,
    deck: &[Card],
    play: (CardId, Option<PlayedAs>),
    neighbor: Seat,
) -> Result<bool, StepError> {
    let mut plays = view.trick.plays.clone();
    plays.push(Play {
        seat: view.me,
        card: play.0,
        played_as: play.1,
    });
    Ok(resolve_trick(&plays, deck)?.winner == Some(neighbor))
}

fn wins_now(
    view: &EngineView,
    deck: &[Card],
    play: (CardId, Option<PlayedAs>),
) -> Result<bool, StepError> {
    if view.trick.plays.is_empty() {
        return Ok(false);
    }
    let mut plays = view.trick.plays.clone();
    plays.push(Play {
        seat: view.me,
        card: play.0,
        played_as: play.1,
    });
    Ok(resolve_trick(&plays, deck)?.winner == Some(view.me))
}

fn rival_threat(
    view: &EngineView,
    deck: &[Card],
    play: (CardId, Option<PlayedAs>),
    rivals: &[Seat],
    read: &Read,
) -> Result<bool, StepError> {
    let mut base = view.trick.plays.clone();
    base.push(Play {
        seat: view.me,
        card: play.0,
        played_as: play.1,
    });
    let lead = lead_suit(&base, deck)?;
    for card in &read.unseen {
        for rival in rivals {
            if !rival_can_play(*rival, *card, lead, read)? {
                continue;
            }
            let played_as = card.is_tigress().then_some(PlayedAs::Pirate);
            let mut plays = base.clone();
            plays.push(Play {
                seat: *rival,
                card: card.id(),
                played_as,
            });
            if resolve_trick(&plays, deck)?.winner != Some(view.me) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn rival_can_play(
    seat: Seat,
    card: Card,
    lead: Option<Suit>,
    read: &Read,
) -> Result<bool, StepError> {
    let Some(lead) = lead else {
        return Ok(true);
    };
    if known_void(read, seat, lead)? {
        Ok(card_suit(card) != Some(lead))
    } else {
        Ok(true)
    }
}

fn known_void(read: &Read, seat: Seat, suit: Suit) -> Result<bool, StepError> {
    let row = read.voids.get(seat.index()).ok_or(StepError::Broken)?;
    row.get(suit_index(suit)).copied().ok_or(StepError::Broken)
}

fn rivals_of(view: &EngineView) -> Result<Vec<Seat>, StepError> {
    let mut rivals = Vec::new();
    for index in 0..view.hand_counts.len() {
        let seat = Seat::from_index(u8::try_from(index).map_err(|_| StepError::Broken)?);
        if seat == view.me {
            continue;
        }
        if view.trick.plays.iter().any(|play| play.seat == seat) {
            continue;
        }
        rivals.push(seat);
    }
    Ok(rivals)
}

fn is_sure_card(
    hand: &[CardId],
    deck: &[Card],
    card: CardId,
    read: &Read,
) -> Result<bool, StepError> {
    let full = sure_count(hand, deck, read)?;
    let mut rest = Vec::with_capacity(hand.len());
    let mut removed = false;
    for id in hand {
        if !removed && *id == card {
            removed = true;
            continue;
        }
        rest.push(*id);
    }
    Ok(full > sure_count(&rest, deck, read)?)
}

fn sure_count(hand: &[CardId], deck: &[Card], read: &Read) -> Result<i32, StepError> {
    let mut tricks = 0i32;
    let mut pirates = 0i32;
    let mut skull = false;
    for id in hand {
        match lookup(deck, *id)? {
            Card::Pirate { .. } | Card::Tigress { .. } => pirates += 1,
            Card::SkullKing { .. } => skull = true,
            _ => {}
        }
    }
    tricks += pirates;
    if skull {
        let mermaids = expected(read, |card| matches!(card, Card::Mermaid { .. }))?;
        if mermaids == 0 || (read.level == BotLevel::Hard && mermaids <= 1 && read.players <= 3) {
            tricks += 1;
        }
    }
    tricks += trump_tricks(hand, deck, read)?;
    tricks += side_tricks(hand, deck, read)?;
    let len = i32::try_from(hand.len()).map_err(|_| StepError::Broken)?;
    Ok(tricks.min(len))
}

fn trump_tricks(hand: &[CardId], deck: &[Card], read: &Read) -> Result<i32, StepError> {
    let mut ranks = Vec::new();
    for id in hand {
        if let Card::Number { suit, rank, .. } = lookup(deck, *id)?
            && suit == Suit::Black
        {
            ranks.push(rank);
        }
    }
    ranks.sort_unstable_by(|left, right| right.cmp(left));
    let mut specials = expected(read, beats_black_special)?;
    let mut tricks = 0i32;
    for rank in ranks {
        let higher = expected(
            read,
            |card| matches!(card, Card::Number { suit: Suit::Black, rank: other, .. } if other > rank),
        )?;
        if higher == 0 && specials == 0 {
            tricks += 1;
        } else if higher == 0 {
            specials -= 1;
        }
    }
    Ok(tricks)
}

fn beats_black_special(card: Card) -> bool {
    matches!(
        card,
        Card::Pirate { .. } | Card::Tigress { .. } | Card::SkullKing { .. } | Card::Mermaid { .. }
    )
}

fn side_tricks(hand: &[CardId], deck: &[Card], read: &Read) -> Result<i32, StepError> {
    let mut tricks = 0i32;
    for suit in [Suit::Green, Suit::Yellow, Suit::Purple] {
        let mut best = 0u8;
        for id in hand {
            if let Card::Number {
                suit: card_suit,
                rank,
                ..
            } = lookup(deck, *id)?
                && card_suit == suit
                && rank > best
            {
                best = rank;
            }
        }
        if best == 0 {
            continue;
        }
        let higher = expected(
            read,
            |card| matches!(card, Card::Number { suit: card_suit, rank, .. } if card_suit == suit && rank > best),
        )?;
        let blacks = expected(read, |card| {
            matches!(
                card,
                Card::Number {
                    suit: Suit::Black,
                    ..
                }
            )
        })?;
        let specials = expected(read, beats_black_special)?;
        if higher + blacks + specials == 0 {
            tricks += 1;
        }
    }
    Ok(tricks)
}

fn expected(read: &Read, pred: impl Fn(Card) -> bool) -> Result<i32, StepError> {
    let count = i32::try_from(read.unseen.iter().filter(|card| pred(**card)).count())
        .map_err(|_| StepError::Broken)?;
    let unseen = i32::try_from(read.unseen.len()).map_err(|_| StepError::Broken)?;
    Ok(expected_in_hands(count, read.holders, unseen))
}

fn expected_in_hands(count: i32, holders: i32, unseen: i32) -> i32 {
    if unseen <= 0 || count <= 0 || holders <= 0 {
        return 0;
    }
    let holders = holders.min(unseen);
    (count * holders + unseen / 2) / unseen
}

/// Tricks a regular player would bid from this hand.
///
/// Each card adds its own share, in tenths. Pirates and the Tigress add a full trick.
/// The total is rounded to a whole bid. A card can be worth bidding before it is safe to cash.
///
/// # Errors
///
/// [`StepError::Broken`] when the hand names a card that is not in `deck`.
fn likely_bid(view: &EngineView, deck: &[Card], read: &Read) -> Result<i32, StepError> {
    // Human: Add up what each card is likely to take, then round. A short table makes the same card worth more.
    // Agent: READS view.hand, deck, Read.players; does not read GameState or another hand; RETURNS a bid in 0..=hand length.
    let mut tenths = 0i32;
    for id in &view.hand {
        tenths += card_tenths(lookup(deck, *id)?, read.players)?;
    }
    let len = i32::try_from(view.hand.len()).map_err(|_| StepError::Broken)?;
    Ok((tenths.saturating_add(5) / 10).clamp(0, len))
}

/// Tenths of a trick this card adds to the bid. One card never adds more than one trick.
///
/// Four players keep [`raw_tenths`]. Other tables use `raw * 4 / players`.
///
/// # Errors
///
/// [`StepError::Broken`] when `players` is zero or does not fit in an `i32`.
fn card_tenths(card: Card, players: usize) -> Result<i32, StepError> {
    let base = raw_tenths(card);
    if base == 0 {
        return Ok(0);
    }
    // A pirate or the Tigress wins the trick it is played in, at any table size.
    if matches!(card, Card::Pirate { .. } | Card::Tigress { .. }) {
        return Ok(base.min(10));
    }
    let players = i32::try_from(players).map_err(|_| StepError::Broken)?;
    if players <= 0 {
        return Err(StepError::Broken);
    }
    Ok((base * 4 / players).clamp(0, 10))
}

/// Tenths of a trick at a four-player table, before the table size scales it.
fn raw_tenths(card: Card) -> i32 {
    match card {
        Card::Pirate { .. } | Card::Tigress { .. } | Card::SkullKing { .. } => 10,
        Card::Mermaid { .. } => 6,
        Card::Number {
            suit: Suit::Black,
            rank,
            ..
        } => match rank {
            14 => 10,
            13 => 8,
            12 => 7,
            11 => 5,
            10 => 4,
            9 => 2,
            8 => 1,
            _ => 0,
        },
        Card::Number { rank, .. } => match rank {
            14 => 6,
            13 => 4,
            12 => 2,
            11 | 10 => 1,
            _ => 0,
        },
        Card::Escape { .. } | Card::Loot { .. } | Card::Kraken { .. } | Card::Whale { .. } => 0,
    }
}

fn duck_count(view: &EngineView, deck: &[Card]) -> Result<i32, StepError> {
    let mut ducks = 0i32;
    for id in &view.hand {
        if matches!(
            lookup(deck, *id)?,
            Card::Escape { .. } | Card::Loot { .. } | Card::Kraken { .. }
        ) {
            ducks += 1;
        }
    }
    Ok(ducks)
}

fn has_high_black(view: &EngineView, deck: &[Card]) -> Result<bool, StepError> {
    for id in &view.hand {
        if let Card::Number {
            suit: Suit::Black,
            rank,
            ..
        } = lookup(deck, *id)?
            && rank >= 12
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn has_side_honor(view: &EngineView, deck: &[Card]) -> Result<bool, StepError> {
    for id in &view.hand {
        if let Card::Number { suit, rank, .. } = lookup(deck, *id)?
            && suit != Suit::Black
            && rank >= 13
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn has_mermaid(view: &EngineView, deck: &[Card]) -> Result<bool, StepError> {
    for id in &view.hand {
        if matches!(lookup(deck, *id)?, Card::Mermaid { .. }) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn helm_seat(view: &EngineView, level: BotLevel, rng: &mut impl Rng) -> Result<i32, StepError> {
    let players = u8::try_from(view.hand_counts.len()).map_err(|_| StepError::Broken)?;
    let last = view.me.next(players)?;
    if level == BotLevel::Easy && rng.next_f64() < 0.40 {
        return Ok(i32::from(view.me.get()));
    }
    Ok(i32::from(last.get()))
}

fn smuggler_discards(
    view: &EngineView,
    deck: &[Card],
    plan: &Plan,
    level: BotLevel,
    rng: &mut impl Rng,
) -> Result<Vec<CardId>, StepError> {
    let drawn = view
        .pending
        .as_ref()
        .and_then(|pending| pending.drawn.as_ref())
        .ok_or(StepError::Broken)?;
    let mut ranked = Vec::with_capacity(view.hand.len());
    for id in &view.hand {
        let card = lookup(deck, *id)?;
        ranked.push((*id, spend_of(card, Some(PlayedAs::Pirate))));
    }
    let invert = level == BotLevel::Easy && rng.next_f64() < 0.30;
    let keep_winners = plan.target > 0;
    // Keep the cards that can win while tricks are still needed. Easy, under 0.30, does the opposite.
    let discard_low = keep_winners != invert;
    if discard_low {
        ranked.sort_by(|left, right| left.1.cmp(&right.1).then(left.0.get().cmp(&right.0.get())));
    } else {
        ranked.sort_by(|left, right| right.1.cmp(&left.1).then(left.0.get().cmp(&right.0.get())));
    }
    let count = drawn.len();
    if ranked.len() < count {
        return Err(StepError::Broken);
    }
    Ok(ranked.iter().take(count).map(|(id, _)| *id).collect())
}

fn gambler_stake(view: &EngineView, plan: &Plan, level: BotLevel, rng: &mut impl Rng) -> i32 {
    if view.hand.is_empty() {
        return if plan.need == 0 { 20 } else { 0 };
    }
    if plan.need < 0 {
        return easy_blind_stake(level, rng);
    }
    let non_sure = plan.left - plan.sure;
    let clear = plan.sure == plan.need && plan.ducks >= non_sure.max(0);
    if clear {
        return 20;
    }
    if level == BotLevel::Hard && plan.sure == plan.need && plan.ducks + 1 >= non_sure.max(0) {
        return 10;
    }
    easy_blind_stake(level, rng)
}

fn easy_blind_stake(level: BotLevel, rng: &mut impl Rng) -> i32 {
    if level == BotLevel::Easy && rng.next_f64() < 0.25 {
        20
    } else {
        0
    }
}

fn giant_change(view: &EngineView, level: BotLevel, rng: &mut impl Rng) -> Result<i32, StepError> {
    let bid = own_bid(view)?;
    let won = own_won(view)?;
    let cards = i32::from(view.cards);
    let toward = (won - bid).clamp(-1, 1);
    let flip = level == BotLevel::Easy && rng.next_f64() < 0.50;
    let change = if flip { -toward } else { toward };
    if (0..=cards).contains(&(bid + change)) {
        Ok(change)
    } else if (0..=cards).contains(&(bid + toward)) {
        Ok(toward)
    } else {
        Ok(0)
    }
}

impl Read {
    fn build(
        view: &EngineView,
        deck: &[Card],
        rules: Ruleset,
        level: BotLevel,
        sight: BotSight<'_>,
    ) -> Result<Self, StepError> {
        let players = view.hand_counts.len();
        let players_u8 = u8::try_from(players).map_err(|_| StepError::Broken)?;
        let neighbor = view.me.next(players_u8)?;
        let mut voids = vec![[false; 4]; players];
        note_voids(sight.plays, deck, &mut voids)?;
        note_voids(&view.trick.plays, deck, &mut voids)?;
        let unseen = unseen_cards(view, deck, sight.peeked);
        let holders = other_cards(view);
        Ok(Self {
            players,
            neighbor,
            rascal: rules.scoring == Scoring::Rascal,
            level,
            voids,
            unseen,
            holders,
        })
    }
}

fn card_suit(card: Card) -> Option<Suit> {
    card.number().map(|(suit, _)| suit)
}

fn unseen_cards(view: &EngineView, deck: &[Card], peeked: &[CardId]) -> Vec<Card> {
    deck.iter()
        .copied()
        .filter(|card| {
            let id = card.id();
            !view.hand.contains(&id) && !view.played.contains(&id) && !peeked.contains(&id)
        })
        .collect()
}

fn other_cards(view: &EngineView) -> i32 {
    let mut total = 0i32;
    for (index, count) in view.hand_counts.iter().enumerate() {
        if index == view.me.index() {
            continue;
        }
        total += i32::from(*count);
    }
    total
}

fn note_voids(plays: &[Play], deck: &[Card], voids: &mut [[bool; 4]]) -> Result<(), StepError> {
    if plays.is_empty() {
        return Ok(());
    }
    let width = voids.len();
    if width == 0 {
        return Err(StepError::Broken);
    }
    let mut start = 0usize;
    while start < plays.len() {
        let end = (start + width).min(plays.len());
        let trick = plays.get(start..end).ok_or(StepError::Broken)?;
        if let Some(suit) = lead_suit(trick, deck)? {
            for play in trick {
                let card = lookup(deck, play.card)?;
                if let Some(found) = card_suit(card)
                    && found != suit
                {
                    let row = voids.get_mut(play.seat.index()).ok_or(StepError::Broken)?;
                    let mark = row.get_mut(suit_index(suit)).ok_or(StepError::Broken)?;
                    *mark = true;
                }
            }
        }
        start = end;
    }
    Ok(())
}

fn suit_index(suit: Suit) -> usize {
    match suit {
        Suit::Green => 0,
        Suit::Yellow => 1,
        Suit::Purple => 2,
        Suit::Black => 3,
    }
}

fn need_of(view: &EngineView) -> Result<i32, StepError> {
    Ok(own_bid(view)? - own_won(view)?)
}

fn seat_need(view: &EngineView, seat: Seat) -> Result<Option<i32>, StepError> {
    let bid = view.bids.get(seat.index()).ok_or(StepError::Broken)?;
    let won = view.won.get(seat.index()).ok_or(StepError::Broken)?;
    Ok(match bid {
        Some(value) if *value >= 0 => Some(i32::from(*value) - i32::from(*won)),
        _ => None,
    })
}

fn seat_chances(view: &EngineView, seat: Seat) -> Result<i32, StepError> {
    let holding = i32::from(
        *view
            .hand_counts
            .get(seat.index())
            .ok_or(StepError::Broken)?,
    );
    let played = view.trick.plays.iter().any(|play| play.seat == seat);
    Ok(if played { holding + 1 } else { holding })
}

fn own_bid(view: &EngineView) -> Result<i32, StepError> {
    match view.bids.get(view.me.index()).ok_or(StepError::Broken)? {
        Some(value) if *value >= 0 => Ok(i32::from(*value)),
        _ => Err(StepError::Broken),
    }
}

fn own_won(view: &EngineView) -> Result<i32, StepError> {
    view.won
        .get(view.me.index())
        .map(|won| i32::from(*won))
        .ok_or(StepError::Broken)
}

fn options_of(
    view: &EngineView,
    deck: &[Card],
) -> Result<Vec<(CardId, Option<PlayedAs>)>, StepError> {
    let legal = card::legal_cards(&view.hand, &view.trick.plays, deck)?;
    let mut options = Vec::new();
    for id in legal {
        if lookup(deck, id)?.is_tigress() {
            options.push((id, Some(PlayedAs::Pirate)));
            options.push((id, Some(PlayedAs::Escape)));
        } else {
            options.push((id, None));
        }
    }
    Ok(options)
}
