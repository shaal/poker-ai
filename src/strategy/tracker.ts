/**
 * Range tracking through a betting line.
 *
 * This is defence #4 from ADR-003: "responds only to fold frequency, not to the
 * line the opponent took". A pot-odds calculator has no memory of how the hand
 * was played. This module keeps both players' ranges and narrows them on every
 * action, so by the river the AI is reasoning about a range that a check-raise
 * on the flop and a bet on the turn actually produced.
 *
 * The narrowing model starts from a POPULATION picture of what a bet means, not
 * from a copy of our own strategy, and the opponent model in `exploit.ts` moves
 * it from there as evidence accrues. See the note on `NarrowOptions.polarisation`
 * — assuming the opponent plays like us is a self-model wearing the costume of a
 * read, and it fails hardest against exactly the opponents this project will
 * actually meet.
 */

import type { Card } from '../engine/cards'
import { handIndex169 } from '../engine/cards'
import type { ActionRecord, Seat, Street } from '../engine/types'
import {
  BB_VS_4BET_5BET,
  BB_VS_4BET_CALL,
  BB_VS_OPEN_3BET,
  BB_VS_OPEN_CALL,
  chartToRange,
  passiveRange,
  SB_OPEN,
  SB_VS_3BET_4BET,
  SB_VS_3BET_CALL,
} from './charts'
import {
  COMBO_A,
  COMBO_B,
  fullRange,
  N_COMBOS,
  percentilesOf,
  type Range,
  rankRangeOnBoard,
} from './ranges'
import { mdf } from './policy'

/** How many aggressive actions have happened preflop: 1 = open, 2 = 3-bet... */
export function preflopLevel(history: readonly ActionRecord[]): number {
  let n = 0
  for (const a of history) {
    if (a.street !== 'preflop') break
    if (a.type === 'raise' || a.type === 'bet') n++
  }
  return n
}

/**
 * Preflop range for a seat given the action so far. Uses the charts directly,
 * which is why preflop is `source: 'preflop-chart'` in the Decision — it is a
 * lookup, and saying so is more honest than implying a computation.
 */
export function preflopRange(seat: Seat, history: readonly ActionRecord[]): Range {
  const pre = history.filter((a) => a.street === 'preflop')
  const raises = pre.filter((a) => a.type === 'raise' || a.type === 'bet')

  // Seat 0 is the button/SB and opens; seat 1 is the big blind.
  if (raises.length === 0) return fullRange()

  if (seat === 0) {
    if (raises.length === 1) return chartToRange(SB_OPEN)
    if (raises.length >= 3) return chartToRange(SB_VS_3BET_4BET)
    // Faced a 3-bet: either the 4-bet range or the calling range.
    const sbActedAfter3bet = pre.some(
      (a, i) => a.seat === 0 && i > pre.findIndex((x) => x.seat === 1 && x.type === 'raise'),
    )
    if (!sbActedAfter3bet) return chartToRange(SB_OPEN)
    const called = pre.some((a) => a.seat === 0 && a.type === 'call' && a.street === 'preflop')
    return called
      ? passiveRange(SB_VS_3BET_4BET, SB_VS_3BET_CALL)
      : chartToRange(SB_VS_3BET_4BET)
  }

  // Big blind.
  if (raises.length === 1) {
    // Called the open.
    return passiveRange(BB_VS_OPEN_3BET, BB_VS_OPEN_CALL)
  }
  if (raises.length === 2) return chartToRange(BB_VS_OPEN_3BET)
  if (raises.length >= 4) return chartToRange(BB_VS_4BET_5BET)
  // Faced a 4-bet and continued.
  return passiveRange(BB_VS_4BET_5BET, BB_VS_4BET_CALL)
}

export interface NarrowOptions {
  /**
   * Multiplicative shading applied to the opponent's aggressive region. The
   * opponent model supplies this: a player who bluffs more than the population
   * gets a wider betting range, which is exactly the read that should change
   * how often we call. Neutral is 1.
   */
  bluffTendency?: number
  /** Shading on how much they continue when facing a bet. Neutral is 1. */
  continueTendency?: number
  /**
   * How polarised we assume their betting range is: 0 = the population model,
   * 1 = the same balanced construction our own baseline uses.
   *
   * This defaults LOW on purpose, and the reason is the most important comment
   * in this file. The obvious implementation assumes the opponent plays like
   * us — value from the top, bluffs from the bottom, middle checked. Against
   * the players this project will actually meet that is badly wrong in a
   * specific direction: a calling station bets a fat, merged, value-heavy range
   * with almost no bluffs, and crediting them with our bluff frequency makes
   * every equity number on screen too optimistic, which is precisely how a
   * "range-aware" strategy turns into a calling station itself.
   *
   * So the prior is the POPULATION, not us, and evidence moves it — the same
   * structure ADR-005 uses for action frequencies, applied one level up to the
   * range model. Assuming the opponent is a copy of the AI is a self-model
   * masquerading as a read.
   */
  polarisation?: number
}

/**
 * What a bet means, for a player we know nothing about.
 *
 * Typical players bet a merged range: they bet good-but-not-great hands that a
 * solver would check, and they under-bluff badly. So the value region is WIDER
 * and the bluff region NARROWER than balanced play, and the middle of their
 * range is far from excluded.
 */
const POPULATION_MODEL = {
  valueTop: 0.46,
  bluffBottom: 0.1,
  middleWeight: 0.5,
  checkTopWeight: 0.45,
  slowplay: 0.45,
}

/** What a bet means from someone constructing ranges the way our baseline does. */
const BALANCED_MODEL = {
  valueTop: 0.32,
  /**
   * Not read anywhere, and it was already dead before the bluff region stopped
   * depending on bet size — the old code derived the balanced bluff budget from
   * `valueTop` and the bet size instead of using this. Kept because it states
   * what the balanced model's bluff region would be, and deleting it would make
   * the two models look asymmetric for no reason. It is documentation, not a
   * knob: nothing changes if you edit it.
   */
  bluffBottom: 0.35,
  middleWeight: 0.12,
  checkTopWeight: 0.25,
  slowplay: 0.25,
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Narrow a range given one postflop action, by interpolating between a
 * population picture of the action and a balanced one, weighted by how much
 * evidence we have that this player constructs ranges deliberately.
 */
export function narrowOnAction(
  range: Range,
  board: readonly Card[],
  dead: readonly Card[],
  action: { type: string; size: number },
  opts: NarrowOptions = {},
): Range {
  const ranked = rankRangeOnBoard(range, board, dead)
  if (ranked.length === 0) return range

  const bluffMul = opts.bluffTendency ?? 1
  const contMul = opts.continueTendency ?? 1
  // Default sits nearer the population than nearer us, per the note above.
  const t = Math.max(0, Math.min(1, opts.polarisation ?? 0.3))

  const valueTop = lerp(POPULATION_MODEL.valueTop, BALANCED_MODEL.valueTop, t)
  const middleWeight = lerp(POPULATION_MODEL.middleWeight, BALANCED_MODEL.middleWeight, t)
  const checkTopWeight = lerp(POPULATION_MODEL.checkTopWeight, BALANCED_MODEL.checkTopWeight, t)

  const out = range.slice()
  const setWeight = (combo: number, factor: number) => {
    out[combo] = out[combo]! * factor
  }

  const pct = percentilesOf(ranked)

  if (action.type === 'bet' || action.type === 'raise') {
    // The bluff region does NOT depend on the bet size, and that is a deletion,
    // not an oversight. It used to: `bluffBottom` interpolated toward the
    // balanced budget `BALANCED_MODEL.valueTop * a / (1 - a)` for
    // `a = bluffFraction(s)`, so a bigger bet credited the villain with more
    // bluffs and we called wider.
    //
    // `s/(1+s)` is a theorem about what a BALANCED opponent must do to make us
    // indifferent. It is a prescription for them, and this function was using
    // it as a description of them — which quietly assumes the opponent is
    // balanced. For the players this project targets the assumption is not just
    // weak, it is anti-correlated: recreational players bet big with strong
    // hands and small with weak ones, so the inference ran backwards on exactly
    // the population it was written for.
    //
    // Measured, against a familiar opponent built for this and its flat-sized
    // control (see docs/results.md): removing the size dependence is worth
    // +11.43 ± 6.32 bb/100 against the sizing opponent and +1.96 ± 5.29 against
    // the control, a difference of +9.47 ± 8.24 that excludes zero. Three other
    // candidate fixes were measured and none of them cleared that bar, notably
    // including the clever one — keeping the term and inverting its sign scored
    // WORSE than deleting it.
    //
    // The cost is real and is not hidden here: against `maniac`, who genuinely
    // does bluff constantly with big bets, this loses 51.66 ± 48.16 bb/100,
    // because the wrong-signed model was accidentally right about him. That is
    // the price of refusing to read a signal whose direction we cannot
    // determine in advance, and it buys not being exploited by the far more
    // common opponent who has it the other way round.
    //
    // Reading size CORRECTLY is still on the table and is strictly better than
    // either. It needs the sign to be estimated per opponent rather than
    // assumed, which is opponent modelling, which per ADR-005 measures negative
    // and ships off. So: not now, and not by guessing.
    const bluffBottom = POPULATION_MODEL.bluffBottom * bluffMul
    for (let i = 0; i < ranked.length; i++) {
      const p = pct[i]!
      if (p >= 1 - valueTop) setWeight(ranked[i]!.combo, 1)
      else if (p <= bluffBottom) setWeight(ranked[i]!.combo, 0.85 * bluffMul)
      else setWeight(ranked[i]!.combo, middleWeight)
    }
    return out
  }

  if (action.type === 'check') {
    // Checking is the complement: mostly the middle, some slowplayed top. A
    // typical player traps less than a balanced one, so their check excludes
    // the top of their range more sharply.
    for (let i = 0; i < ranked.length; i++) {
      if (pct[i]! >= 1 - valueTop) setWeight(ranked[i]!.combo, checkTopWeight)
      else setWeight(ranked[i]!.combo, 1)
    }
    return out
  }

  if (action.type === 'call') {
    // Calling keeps roughly the MDF top of the range, minus the very top that
    // would have raised. Bluff-catchers live here, which is why a river call
    // range is so much weaker than a river raise range.
    //
    // The population calls WIDER than MDF — that is the defining leak of the
    // most common opponent type — so the unknown-player band is stretched.
    const s = Math.max(0.1, action.size)
    const balancedDefend = mdf(s)
    const populationDefend = Math.min(1, balancedDefend * 1.35)
    const defend = Math.min(1, lerp(populationDefend, balancedDefend, t) * contMul)
    const slowplay = lerp(POPULATION_MODEL.slowplay, BALANCED_MODEL.slowplay, t)
    for (let i = 0; i < ranked.length; i++) {
      const p = pct[i]!
      if (p >= 0.95) setWeight(ranked[i]!.combo, slowplay)
      else if (p >= 1 - defend) setWeight(ranked[i]!.combo, 1)
      else setWeight(ranked[i]!.combo, 0.08)
    }
    return out
  }

  return out
}

/** Remove combos that clash with cards we can see. */
export function applyBlockers(range: Range, dead: readonly Card[]): Range {
  const blocked = new Uint8Array(52)
  for (const c of dead) blocked[c] = 1
  const out = range.slice()
  for (let i = 0; i < N_COMBOS; i++) {
    if (blocked[COMBO_A[i]!] || blocked[COMBO_B[i]!]) out[i] = 0
  }
  return out
}

/**
 * Rebuild the villain's range from scratch for the current state. Replaying
 * rather than incrementally mutating means a range can never drift out of sync
 * with the history, which is a class of bug that is almost impossible to find
 * once it starts.
 */
export function villainRangeFor(
  villainSeat: Seat,
  history: readonly ActionRecord[],
  board: readonly Card[],
  dead: readonly Card[],
  opts: NarrowOptions = {},
): Range {
  let range = preflopRange(villainSeat, history)
  range = applyBlockers(range, dead)

  const streets: Street[] = ['flop', 'turn', 'river']
  const cardsBy: Record<string, number> = { flop: 3, turn: 4, river: 5 }

  for (const street of streets) {
    const acts = history.filter((a) => a.street === street && a.seat === villainSeat)
    if (acts.length === 0) continue
    const visible = board.slice(0, Math.min(board.length, cardsBy[street]!))
    if (visible.length < 3) continue
    for (const a of acts) {
      const size = a.potBefore > 0 ? a.paid / a.potBefore : 0
      range = narrowOnAction(range, visible, dead, { type: a.type, size }, opts)
    }
  }
  return applyBlockers(range, dead)
}

/** Our own range, tracked the same way so percentiles mean something. */
export function heroRangeFor(
  heroSeat: Seat,
  history: readonly ActionRecord[],
  board: readonly Card[],
  dead: readonly Card[],
): Range {
  let range = preflopRange(heroSeat, history)
  range = applyBlockers(range, dead)
  const cardsBy: Record<string, number> = { flop: 3, turn: 4, river: 5 }
  for (const street of ['flop', 'turn', 'river'] as Street[]) {
    const acts = history.filter((a) => a.street === street && a.seat === heroSeat)
    if (acts.length === 0) continue
    const visible = board.slice(0, Math.min(board.length, cardsBy[street]!))
    if (visible.length < 3) continue
    for (const a of acts) {
      const size = a.potBefore > 0 ? a.paid / a.potBefore : 0
      range = narrowOnAction(range, visible, dead, { type: a.type, size })
    }
  }
  return applyBlockers(range, dead)
}

/** 169-class index of a specific holding, for chart lookups. */
export function classOf(hole: readonly [Card, Card]): number {
  return handIndex169(hole[0], hole[1])
}
