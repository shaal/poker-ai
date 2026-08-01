/**
 * FAMILIAR suite — the opponents used during development.
 *
 * ADR-009: these are useful for iterating and worthless as evidence. Anything
 * tuned against this file will look good on this file. Nothing here decides
 * whether a change ships; that is `heldout.ts`.
 *
 * Constants here are allowed to move. That is exactly what makes them familiar.
 *
 * The archetypes ADR-009 names are all present: calling station, nit, maniac,
 * always-min-raise, never-folds-to-a-c-bet (the station), and one that mixes
 * probabilistically rather than being a lookup table (`loosePassiveMixer`).
 */

import type { Rng } from '../../engine/cards'
import type { Policy } from '../../engine/holdem'
import { BB, BUTTON } from '../../engine/types'
import type { Opponent } from '../types'
import {
  aggro,
  doCall,
  doCheck,
  doFold,
  type Made,
  madeHand,
  owed,
  potBet,
  preflopScore,
  price,
} from './helpers'

/** True once someone has put in more than the big blind preflop. */
function opened(s: { currentBet: number }): boolean {
  return s.currentBet > BB
}

/**
 * Pays off anything. The classic leak: it never folds to a c-bet, and it only
 * raises with a hand it has already made, so its aggression carries perfect
 * information. Distinct from `alwaysCall` in that it does bet and does fold to
 * an all-in with total air — a real station, not a wall.
 */
export function callingStation(_rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      if (c <= 0) return doCheck(s)
      if (c > me.stack * 0.6 && preflopScore(me.hole) < 0.3) return doFold(s)
      return doCall(s)
    }
    const m = madeHand(me.hole, s.board)
    if (c <= 0) return m.cat <= 6 ? aggro(s, potBet(s, seat, 0.35)) : doCheck(s)
    if (c >= me.stack * 0.8 && m.cat >= 8) return doFold(s)
    return doCall(s)
  }
}

/** Plays the top of the deck and nothing else, then plays it straightforwardly. */
export function nit(_rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    const v = preflopScore(me.hole)
    if (s.street === 'preflop') {
      if (v >= 0.79) return aggro(s, potBet(s, seat, 0.75))
      if (v >= 0.66) return c > 0 ? doCall(s) : doCheck(s)
      return c > 0 ? doFold(s) : doCheck(s)
    }
    const m = madeHand(me.hole, s.board)
    if (c <= 0) return m.strong ? aggro(s, potBet(s, seat, 0.6)) : doCheck(s)
    if (m.cat <= 5) return aggro(s, potBet(s, seat, 0.8)) // sets and better only
    return m.strong ? doCall(s) : doFold(s)
  }
}

/** Raises with everything, big, forever. Folds only when it is priced out. */
export function maniac(rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      if (preflopScore(me.hole) >= 0.18) return aggro(s, potBet(s, seat, 1.0))
      return c > 0 && c > me.stack * 0.5 ? doFold(s) : doCall(s)
    }
    if (rng.float() < 0.7) return aggro(s, potBet(s, seat, 1.0))
    return c > 0 ? doCall(s) : doCheck(s)
  }
}

/**
 * Min-raises whenever a raise is legal. Terminates because each min-raise is at
 * least one big blind, so the escalation runs out of stack rather than looping.
 */
export function alwaysMinRaise(_rng: Rng): Policy {
  // Target 0 clamps up to the legal minimum, and falls back to call/check when
  // no raise is available at all.
  return (s) => aggro(s, 0)
}

/** Folds every time folding is legal. The floor the bench has to be able to see. */
export function alwaysFold(_rng: Rng): Policy {
  return (s) => doFold(s)
}

/** Calls every time calling is legal. Never folds, never raises. */
export function alwaysCall(_rng: Rng): Policy {
  return (s) => doCall(s)
}

/**
 * Mixes rather than deciding. Every action is a draw from a frozen distribution
 * that depends only on the price, never on the cards — so an opponent model that
 * works by memorising "in this spot they always X" has nothing to memorise, and
 * a model that measures frequencies gets the right answer.
 */
export function loosePassiveMixer(rng: Rng): Policy {
  return (s, seat) => {
    const r = rng.float()
    const c = owed(s, seat)
    if (c <= 0) {
      if (r < 0.65) return doCheck(s)
      if (r < 0.9) return aggro(s, potBet(s, seat, 0.33))
      return aggro(s, potBet(s, seat, 0.75))
    }
    // Loose-passive: calls too much, folds mostly to price, raises rarely.
    const foldChance = 0.08 + price(s, seat) * 0.5
    if (r < foldChance) return doFold(s)
    if (r > 0.96) return aggro(s, potBet(s, seat, 0.6))
    return doCall(s)
  }
}

/**
 * A competent-ish reference. Not the AI and not a claim about strategy — it
 * exists so the bench has something that beats the obvious losers, which is the
 * only way to demonstrate that the bench can tell a loser from noise.
 */
export function tightAggressive(rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      const v = preflopScore(me.hole)
      if (v >= 0.74) return aggro(s, potBet(s, seat, 0.75))
      if (v >= 0.5) {
        if (!opened(s)) return aggro(s, potBet(s, seat, 0.6))
        return c <= 3 * BB ? doCall(s) : doFold(s)
      }
      if (c <= 0) return doCheck(s)
      if (!opened(s) && seat === BUTTON && v >= 0.3) return doCall(s)
      return doFold(s)
    }

    const m = madeHand(me.hole, s.board)
    if (c <= 0) {
      if (m.cat <= 6 || m.overpair) return aggro(s, potBet(s, seat, 0.7))
      if (m.cat === 7 && m.hitsTop) return aggro(s, potBet(s, seat, 0.5))
      // A c-bet bluff, mixed, and only with position. Frozen at 45%.
      if (seat === BUTTON && s.street === 'flop' && rng.float() < 0.45) {
        return aggro(s, potBet(s, seat, 0.4))
      }
      return doCheck(s)
    }
    if (m.cat <= 5) return aggro(s, potBet(s, seat, 0.8))
    if (m.strong) return doCall(s)
    // Bluff-catch only when the price is small relative to the pot.
    if (m.cat === 7 && price(s, seat) < 0.25) return doCall(s)
    return doFold(s)
  }
}

// ------------------------------------------- sizing as information, and its control

/**
 * The four strength tiers `sizedValue` and `flatValue` share.
 *
 * Deliberately cut differently from `tightAggressive`'s `cat <= 6 || overpair`
 * test, so these two are not the same partition wearing a new name.
 */
type Tier = 'nuts' | 'strong' | 'thin' | 'air'

function tierOf(m: Made): Tier {
  if (m.cat <= 4) return 'nuts' // straight or better
  if (m.cat <= 6) return 'strong' // trips, two pair
  if (m.cat === 7 && (m.hitsTop || m.overpair)) return 'thin' // top pair, overpair
  return 'air'
}

/**
 * A value-heavy recreational bettor, parameterised ONLY by how it picks a size.
 *
 * The two opponents below share this function and differ in exactly one lambda,
 * which is the entire point of them. `sizedValue` scales its size with its
 * strength; `flatValue` bets one size with the same hands in the same spots.
 * They are a matched pair, and the comparison between them is the measurement:
 *
 *   A change that reads bet size better should help against `sizedValue` and
 *   NOT against `flatValue`. A change that helps both equally did not fix size
 *   inference — it fixed how we play against value-heavy ranges generally, and
 *   the difference between those two claims is the whole question.
 *
 * Preflop sizing is identical in both on purpose. Range narrowing from bet size
 * only happens postflop (`narrowOnAction`), so holding preflop constant keeps
 * the contrast on the one channel being tested.
 *
 * Note the bluff. It stabs air at its SMALLEST size and never at any other, so
 * for `sizedValue` a small bet really is bluff-heavy and a large one really is
 * pure value. That makes it able to distinguish "ignore bet size entirely" from
 * "read bet size correctly" — the first leaves money on the table against the
 * small stabs, the second does not. An opponent that only ever punishes
 * over-calling could not tell those two apart.
 */
function valueBettor(rng: Rng, sizeFor: (tier: Tier) => number): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)

    if (s.street === 'preflop') {
      const v = preflopScore(me.hole)
      if (v >= 0.66) return aggro(s, potBet(s, seat, 0.5))
      if (v >= 0.38) return c <= 2.5 * BB ? doCall(s) : doFold(s)
      return c <= 0 ? doCheck(s) : doFold(s)
    }

    const tier = tierOf(madeHand(me.hole, s.board))

    if (c <= 0) {
      if (tier === 'air') {
        // The only bluff it ever makes, and always at its smallest size.
        return rng.float() < 0.28 ? aggro(s, potBet(s, seat, sizeFor('air'))) : doCheck(s)
      }
      return aggro(s, potBet(s, seat, sizeFor(tier)))
    }

    if (tier === 'nuts') return aggro(s, potBet(s, seat, sizeFor('nuts')))
    if (tier === 'strong') return doCall(s)
    if (tier === 'thin') return price(s, seat) < 0.3 ? doCall(s) : doFold(s)
    return doFold(s)
  }
}

/**
 * Size climbs with strength: air stabs small, the nuts overbet.
 *
 * The rungs are spread wider than they look like they need to be, because the
 * minimum bet is 1 BB and a limped pot is 2 BB — in which anything under half
 * the pot clamps to the same 1 BB and two rungs become one. The tell therefore
 * only exists in built pots, which is a fact about no-limit rather than a
 * property of this opponent, and `bench.test.ts` asserts the ladder only where
 * the engine lets it be expressed.
 */
export function sizedValue(rng: Rng): Policy {
  const ladder: Record<Tier, number> = { nuts: 1.7, strong: 1.15, thin: 0.7, air: 0.35 }
  return valueBettor(rng, (tier) => ladder[tier])
}

/** The control. Same hands, same spots, one size — so size says nothing at all. */
export function flatValue(rng: Rng): Policy {
  return valueBettor(rng, () => 0.7)
}

export const FAMILIAR: readonly Opponent[] = [
  { name: 'callingStation', make: callingStation },
  { name: 'nit', make: nit },
  { name: 'maniac', make: maniac },
  { name: 'alwaysMinRaise', make: alwaysMinRaise },
  { name: 'alwaysFold', make: alwaysFold },
  { name: 'alwaysCall', make: alwaysCall },
  { name: 'loosePassiveMixer', make: loosePassiveMixer },
  { name: 'tightAggressive', make: tightAggressive },
  { name: 'sizedValue', make: sizedValue },
  { name: 'flatValue', make: flatValue },
]
