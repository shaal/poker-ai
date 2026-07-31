/**
 * Duplicate hands: the variance reduction ADR-009 makes mandatory.
 *
 * Every deal is played TWICE from the same deck with the seats swapped, so hero
 * holds the button cards in one leg and the big blind cards in the other, and
 * so does villain. Whatever the cards did for one of them, they did for the
 * other. The paired result is the sum of hero's two deltas, and most of the
 * card luck has cancelled out of it before any statistic is computed.
 *
 * `deal()` takes a fixed `deck` in DealOptions and copies it, which is what
 * makes the second leg an exact replay of the first from the other side.
 *
 * How much it buys depends on how alike the two strategies are, and that is not
 * a defect — it is the estimator telling the truth. Two instances of the same
 * deterministic policy give a paired standard deviation of exactly ZERO, because
 * every deal is played identically from both sides and the two legs are exact
 * negatives. `bench.test.ts` asserts that, and it is the check that fails loudly
 * if the pairing is ever subtly broken. Between strategies that differ a lot the
 * cancellation is partial: measured here, σ per hand falls by roughly a third
 * against a scripted opponent, i.e. about 2x fewer hands for the same interval.
 * Useful, and nowhere near the ~85% an AIVAT-style estimator gets — ADR-009 says
 * "and/or" for a reason, and AIVAT is still on the table.
 *
 * What does NOT cancel: randomness inside the policies themselves. A mixing
 * opponent may bluff in one leg and not the other. Index-aligned common random
 * numbers (replaying each policy's draws in the second leg) were tried and
 * measured at no benefit, which makes sense — a policy's k-th decision in leg B
 * is a different spot with different cards, so handing it the same coin flip
 * aligns nothing. Aligning by spot rather than by index would be a real change
 * and is not worth it while AIVAT is the bigger prize.
 */

import { type Card, freshDeck, Rng, shuffle } from '../engine/cards'
import { playHand, type Policy } from '../engine/holdem'

export interface PairedDeal {
  /** Hero's chip delta summed over both legs. The unit of analysis. */
  paired: number
  /** Hero's delta in each leg: [as button, as big blind]. */
  legs: [number, number]
}

/** Play one deal from both sides. `deck` is not mutated. */
export function playPair(hero: Policy, villain: Policy, deck: Card[], rng: Rng): PairedDeal {
  const a = playHand(rng, [hero, villain], { deck })
  const b = playHand(rng, [villain, hero], { deck })
  const l0 = a.result!.delta[0]
  const l1 = b.result!.delta[1]
  return { paired: l0 + l1, legs: [l0, l1] }
}

/** `deals` duplicate deals, i.e. `2 * deals` hands. Returns paired chip results. */
export function runDuplicate(hero: Policy, villain: Policy, deals: number, rng: Rng): number[] {
  const out = new Array<number>(deals)
  const deck = freshDeck()
  for (let i = 0; i < deals; i++) {
    shuffle(deck, rng)
    out[i] = playPair(hero, villain, deck, rng).paired
  }
  return out
}

/**
 * The control: independent hands, no pairing, hero's seat alternating so the
 * result is not just a measurement of the button. Exists so the bench can show
 * what the pairing is actually buying rather than assert it.
 */
export function runUnpaired(hero: Policy, villain: Policy, hands: number, rng: Rng): number[] {
  const out = new Array<number>(hands)
  const deck = freshDeck()
  for (let i = 0; i < hands; i++) {
    shuffle(deck, rng)
    const heroOnButton = i % 2 === 0
    const s = heroOnButton
      ? playHand(rng, [hero, villain], { deck })
      : playHand(rng, [villain, hero], { deck })
    out[i] = s.result!.delta[heroOnButton ? 0 : 1]
  }
  return out
}
