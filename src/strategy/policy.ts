/**
 * The postflop baseline.
 *
 * ADR-003 is explicit that "Monte Carlo equity compared against pot odds is not
 * a strategy". Everything in this file is organised around the four specific
 * failures it names, so each one has a named defence you can go and check:
 *
 *  1. over-calls, because equity realised is not equity share
 *       -> `realisationFactor`, applied before any call is priced
 *  2. never bluffs at a coherent frequency
 *       -> `bluffBudget`, derived from bet size: bluffs/(value+bluffs) = s/(1+s)
 *  3. cannot value-bet thin, cannot fold strong-but-dominated hands
 *       -> every threshold is a PERCENTILE INSIDE OUR OWN RANGE, not an
 *          absolute hand strength, so "top pair" is strong on one board and a
 *          bluff-catcher on another
 *  4. responds only to fold frequency, not to the line taken
 *       -> the villain range is narrowed by each action and is the thing every
 *          decision is measured against
 *
 * It is a heuristic, and the roadmap's fallback plan says a heuristic must be
 * LABELLED as one rather than dressed up. `Decision.source` reports
 * 'postflop-policy' and the README says what that means. The benchmark, not
 * this comment, decides whether it is any good.
 */

import type { Card } from '../engine/cards'
import { evaluate } from '../engine/evaluator'
import type { Street } from '../engine/types'
import {
  equityVsRangeSampled,
  percentileOf,
  type RankedCombo,
  type Range,
  rankRangeOnBoard,
  riverEquityVsRange,
  topFractionThreshold,
} from './ranges'
import { classifyBoard, sprBucket, type Texture } from './texture'

export interface PolicyContext {
  street: Street
  board: readonly Card[]
  hole: readonly [Card, Card]
  heroRange: Range
  villainRange: Range
  /** Chips in the middle before this action. */
  pot: number
  /** Chips it costs hero to continue. Zero when hero can check. */
  toCall: number
  heroStack: number
  villainStack: number
  /** Hero acts after villain on this street. */
  inPosition: boolean
  /** Hero took the last aggressive action on the previous street. */
  wasAggressor: boolean
  /** Anyone has bet or raised at some point in this hand. */
  anyAggression: boolean
  /** Villain's bet as a fraction of the pot before it, when facing one. */
  facingSize: number
  runouts: number
  rng: { int(n: number): number; float(): number }
}

export interface PolicyOption {
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise'
  /** Total to commit this street, for bet/raise. */
  to?: number
  prob: number
  /** Why this option exists, for the reasoning panel. */
  rationale: string
}

export interface PolicyOutput {
  options: PolicyOption[]
  percentileInOwnRange: number
  aheadOfRange: number
  equity: number
  equityCi95: number
  rangeAdvantage: number
  villainCombos: number
  texture: Texture
  notes: string[]
}

/**
 * How much of raw equity a hand actually gets to keep.
 *
 * This is defence #1 and it is the single most important correction in the
 * file. A hand with 35% equity out of position against a polarised range does
 * not realise 35% — it gets bet off its equity. Position, whether we have
 * initiative, and whether the hand can improve all move it.
 *
 * Values are in the range the literature puts them: roughly 0.85-1.10.
 */
export function realisationFactor(ctx: PolicyContext, hasDraw: boolean, madeHand: boolean): number {
  let r = 1
  r *= ctx.inPosition ? 1.06 : 0.92
  if (ctx.wasAggressor) r *= 1.03
  // A draw realises its equity whenever it gets there, so it suffers less from
  // being out of position than a weak made hand that must call down.
  if (hasDraw) r *= 1.05
  else if (!madeHand) r *= 0.9
  // Deep stacks amplify positional disadvantage: more streets to be outplayed.
  const spr = ctx.pot > 0 ? Math.min(ctx.heroStack, ctx.villainStack) / ctx.pot : 0
  if (!ctx.inPosition && spr > 4) r *= 0.96
  return r
}

/**
 * The fraction of a betting range that should be bluffs, given a bet sized at
 * `s` times the pot. Villain is indifferent to calling when
 * bluffs/(value+bluffs) = s/(1+s). This is defence #2 and it is a theorem, not
 * a tuning knob — which is why it has no constant in it.
 */
export function bluffFraction(s: number): number {
  return s / (1 + s)
}

/** Minimum defence frequency against a bet of `s` times the pot. */
export function mdf(s: number): number {
  return 1 / (1 + s)
}

/** Pot odds a caller is getting, as required equity. */
export function requiredEquity(pot: number, toCall: number): number {
  if (toCall <= 0) return 0
  return toCall / (pot + 2 * toCall)
}

/** Candidate bet sizes as a fraction of the pot, per street and texture. */
export function candidateSizes(street: Street, texture: Texture, spr: number): number[] {
  if (spr < 1.6) return [1.0]
  if (street === 'flop') {
    // Dry boards favour a small, high-frequency bet with the whole range; wet
    // boards favour a bigger, more polarised one because there is something to
    // charge and something to protect against.
    return texture.wetness < 0.35 ? [0.33, 0.66] : [0.66, 1.0]
  }
  if (street === 'turn') return texture.wetness < 0.35 ? [0.5, 0.75] : [0.75, 1.0]
  return [0.6, 1.0] // river polarises
}

interface RangeShape {
  ranked: RankedCombo[]
  total: number
}

function shapeOf(range: Range, board: readonly Card[], dead: readonly Card[]): RangeShape {
  const ranked = rankRangeOnBoard(range, board, dead)
  let total = 0
  for (const rc of ranked) total += rc.weight
  return { ranked, total }
}

/** Does this hand have a meaningful draw? Cheap structural check, no sampling. */
function drawStrength(hole: readonly [Card, Card], board: readonly Card[]): number {
  if (board.length >= 5) return 0
  const all = [...hole, ...board]
  const suits = [0, 0, 0, 0]
  for (const c of all) suits[c & 3]!++
  const holeSuits = [hole[0] & 3, hole[1] & 3]
  let flushDraw = 0
  for (const s of holeSuits) {
    if (suits[s]! === 4) flushDraw = Math.max(flushDraw, 1)
    else if (suits[s]! === 3) flushDraw = Math.max(flushDraw, 0.35)
  }

  const ranks = new Set(all.map((c) => c >> 2))
  if (ranks.has(12)) ranks.add(-1)
  let best = 0
  for (let low = -1; low <= 8; low++) {
    let have = 0
    let usesHole = false
    for (let k = 0; k < 5; k++) {
      if (ranks.has(low + k)) {
        have++
        if ((hole[0] >> 2) === low + k || (hole[1] >> 2) === low + k) usesHole = true
      }
    }
    if (have === 4 && usesHole) best = Math.max(best, 0.8)
    else if (have === 3 && usesHole) best = Math.max(best, 0.2)
  }
  return Math.min(1, flushDraw + best * 0.6)
}

/**
 * The core. Returns a MIXED strategy — never a single action — because a pure
 * postflop strategy is trivially exploitable and because the opponent model
 * needs a frequency to shade. See ADR-005.
 */
export function postflopPolicy(ctx: PolicyContext): PolicyOutput {
  const notes: string[] = []
  const texture = classifyBoard(ctx.board)
  const dead = [...ctx.hole]

  const hero = shapeOf(ctx.heroRange, ctx.board, [])
  const villain = shapeOf(ctx.villainRange, ctx.board, dead)

  const heroRank = heroRankOnBoard(ctx.hole, ctx.board)
  const percentile = percentileOf(hero.ranked, heroRank)

  // How much of villain's range we are ahead of RIGHT NOW. Cheap, exact, and
  // the right signal for whether a bet is value.
  let ahead = 0
  for (const rc of villain.ranked) if (rc.rank > heroRank) ahead += rc.weight
  const aheadFrac = villain.total > 0 ? ahead / villain.total : 0.5

  const complete = ctx.board.length === 5
  const eq = complete
    ? { ...riverEquityVsRange(ctx.hole, ctx.villainRange, ctx.board), ci95: 0 }
    : equityVsRangeSampled(ctx.hole, ctx.villainRange, ctx.board, ctx.runouts, ctx.rng)

  const draw = drawStrength(ctx.hole, ctx.board)
  const madeHand = aheadFrac > 0.45
  const realisation = realisationFactor(ctx, draw > 0.3, madeHand)

  const spr = ctx.pot > 0 ? Math.min(ctx.heroStack, ctx.villainStack) / ctx.pot : Infinity

  // Range advantage: does OUR range beat THEIR range on this board. It decides
  // who is allowed to bet, independently of what we happen to hold.
  const rangeAdvantage = rangeAdvantageOf(hero, villain)

  const options: PolicyOption[] =
    ctx.toCall > 0
      ? facingBet(ctx, { hero, villain, percentile, aheadFrac, eq, draw, realisation, texture, spr, notes })
      : unopened(ctx, { hero, villain, percentile, aheadFrac, eq, draw, realisation, texture, spr, rangeAdvantage, notes })

  normalise(options)

  return {
    options,
    percentileInOwnRange: percentile,
    aheadOfRange: aheadFrac,
    equity: eq.equity,
    equityCi95: eq.ci95,
    rangeAdvantage,
    villainCombos: villain.total,
    texture,
    notes,
  }
}

function heroRankOnBoard(hole: readonly [Card, Card], board: readonly Card[]): number {
  return evaluate([hole[0], hole[1], ...board])
}


function rangeAdvantageOf(hero: RangeShape, villain: RangeShape): number {
  // Compare the two ranked distributions by asking: if a random hand from each
  // range met at showdown right now, how often would ours be in front? This is
  // a shape comparison, not a per-hand equity, and it is cheap.
  if (hero.total <= 0 || villain.total <= 0) return 0.5
  let wins = 0
  let vi = 0
  let vAcc = 0
  // Both lists are sorted best-first (lower rank = better).
  const v = villain.ranked
  for (const h of hero.ranked) {
    while (vi < v.length && v[vi]!.rank < h.rank) {
      vAcc += v[vi]!.weight
      vi++
    }
    wins += h.weight * (villain.total - vAcc)
  }
  return wins / (hero.total * villain.total)
}

interface Signals {
  hero: RangeShape
  villain: RangeShape
  percentile: number
  aheadFrac: number
  eq: { equity: number; ci95: number }
  draw: number
  realisation: number
  texture: Texture
  spr: number
  rangeAdvantage?: number
  notes: string[]
}

/** Hero can check or bet. */
function unopened(ctx: PolicyContext, s: Signals): PolicyOption[] {
  const out: PolicyOption[] = []
  const sizes = candidateSizes(ctx.street, s.texture, s.spr)
  const size = pickSize(ctx, s, sizes)
  const betChips = Math.min(ctx.heroStack, Math.round(ctx.pot * size))
  const allIn = betChips >= ctx.heroStack

  // Value region: hands that beat enough of villain's CONTINUING range that
  // betting profits. Villain continues with roughly MDF of their range, so the
  // bar is "beat the part of their range that calls", not "beat their range".
  const defend = mdf(size)
  const valueBar = 1 - defend * 0.62
  const isValue = s.aheadFrac >= Math.max(0.55, valueBar)

  // Bluff budget, from the theorem. Bluffs come from the BOTTOM of our range,
  // preferring hands with equity when called and blockers when not.
  const alpha = bluffFraction(size)
  const valueFrac = valueRegionFraction(s.hero, s.villain, Math.max(0.55, valueBar))
  const bluffBudget = Math.min(0.5, (valueFrac * alpha) / Math.max(0.05, 1 - alpha))

  // Bluff candidates: bottom 45% of our range by showdown value. A hand with
  // real showdown value is a bad bluff — betting it folds out what it beats.
  const bluffPool = 0.45
  const inBluffPool = s.percentile < bluffPool
  const bluffProb = inBluffPool
    ? Math.min(1, (bluffBudget / bluffPool) * (0.55 + 0.9 * s.draw))
    : 0

  let betProb = 0
  let rationale = ''
  if (isValue) {
    betProb = 0.85
    rationale = `ahead of ${(s.aheadFrac * 100).toFixed(0)}% of their range — value`
  } else if (bluffProb > 0) {
    betProb = bluffProb
    rationale =
      s.draw > 0.3
        ? `bottom of range with a draw — semi-bluff, ${(alpha * 100).toFixed(0)}% bluff budget`
        : `bottom of range, no showdown value — bluff, ${(alpha * 100).toFixed(0)}% bluff budget`
  } else {
    rationale = 'middling showdown value — checking keeps the pot small'
  }

  // Range advantage gates how often we are allowed to bet at all. Betting a
  // range that is behind is how a strategy bleeds money while looking active.
  if (s.rangeAdvantage !== undefined && s.rangeAdvantage < 0.47 && !isValue) {
    betProb *= 0.45
    s.notes.push('their range is stronger than ours here, so we bet less often')
  }

  // Checking to the aggressor. Leading into the player who raised last street
  // ("donk betting") is rare in solved play: their range is capped upward by
  // our own calling range, so we keep the initiative with them and check-raise
  // instead. Without this the out-of-position seat bluffs its air into the
  // raiser at absurd frequencies, which looks active and loses money.
  if (!ctx.wasAggressor && !ctx.inPosition && hadAggression(ctx)) {
    const keep = isValue ? 0.3 : 0.12
    if (betProb > 0) {
      betProb *= keep
      s.notes.push('they took the initiative last street, so we check to them rather than lead')
    }
  }

  if (s.spr < 1.6 && (isValue || s.draw > 0.55)) {
    betProb = Math.max(betProb, 0.9)
    s.notes.push('stacks are shallow relative to the pot — the decision is commit or fold')
  }

  betProb = clamp(betProb, 0, 1)
  if (betProb > 0.005 && betChips > 0) {
    out.push({
      kind: 'bet',
      to: betChips,
      prob: betProb,
      rationale: allIn ? `${rationale} (all-in)` : rationale,
    })
  }
  out.push({
    kind: 'check',
    prob: 1 - betProb,
    rationale:
      betProb > 0.5
        ? 'the balancing half of a mixed strategy'
        : s.percentile > 0.7
          ? 'strong but happier letting them bet — trapping'
          : 'no value in betting and nothing worth bluffing with',
  })
  return out
}

/** Hero faces a bet: fold, call or raise. */
function facingBet(ctx: PolicyContext, s: Signals): PolicyOption[] {
  const out: PolicyOption[] = []
  const size = ctx.facingSize > 0 ? ctx.facingSize : ctx.toCall / Math.max(1, ctx.pot)
  const defend = mdf(size)

  // Defence #1 in action: price the call on REALISED equity, not raw equity.
  const need = requiredEquity(ctx.pot, ctx.toCall)
  const realised = s.eq.equity * s.realisation
  const priceOk = realised >= need

  // MDF sets how much of our range must continue. Which part continues is
  // decided by percentile, so we fold the bottom even when it has raw equity.
  const foldCut = 1 - defend
  const aboveMdf = s.percentile >= foldCut

  // Raise region: the top of our range plus a bluff budget of the very bottom,
  // in the same ratio the theorem gives for our own raise size.
  const raiseSize = ctx.street === 'river' ? 0.75 : 0.85
  const raiseTo = Math.min(
    ctx.heroStack + 0,
    Math.round(ctx.toCall + (ctx.pot + 2 * ctx.toCall) * raiseSize),
  )
  const raiseAlpha = bluffFraction(raiseSize)
  const valueRaiseCut = 0.9
  const isValueRaise = s.percentile >= valueRaiseCut && s.aheadFrac > 0.75
  const bluffRaisePool = 0.12
  const canBluffRaise =
    s.percentile < bluffRaisePool && s.draw > 0.45 && ctx.street !== 'river' && s.spr > 1.2

  let raiseProb = 0
  if (isValueRaise) raiseProb = 0.7
  else if (canBluffRaise) raiseProb = Math.min(0.6, (raiseAlpha / (1 - raiseAlpha)) * 0.7)

  let callProb = 0
  let foldProb = 0
  let callWhy = ''
  let foldWhy = ''

  if (aboveMdf && priceOk) {
    callProb = 1 - raiseProb
    callWhy = `${(realised * 100).toFixed(0)}% realised equity against ${(need * 100).toFixed(0)}% needed`
  } else if (aboveMdf && !priceOk) {
    // In our defending region on shape, but the price is wrong. Mix rather than
    // fold outright — folding the whole band is what makes a strategy readable.
    callProb = (1 - raiseProb) * clamp(realised / Math.max(0.01, need), 0, 1) * 0.8
    foldProb = 1 - raiseProb - callProb
    callWhy = 'top of our defending range, but the price is marginal'
    foldWhy = `${(realised * 100).toFixed(0)}% realised equity does not meet the ${(need * 100).toFixed(0)}% the price demands`
  } else if (!aboveMdf && priceOk && s.draw > 0.4) {
    // Bottom of range by showdown value, but a draw with the right price is a
    // call regardless of percentile — percentile measures showdown value only.
    callProb = (1 - raiseProb) * 0.75
    foldProb = 1 - raiseProb - callProb
    callWhy = 'a draw getting the right price, even though it has no showdown value yet'
    foldWhy = 'the rest of the time, folding keeps this hand from being a calling station'
  } else {
    foldProb = 1 - raiseProb
    foldWhy = aboveMdf
      ? 'the price is wrong'
      : `bottom ${(foldCut * 100).toFixed(0)}% of our range — folding here is what makes the rest of it credible`
  }

  if (raiseProb > 0.005 && raiseTo > ctx.toCall) {
    out.push({
      kind: 'raise',
      to: raiseTo,
      prob: raiseProb,
      rationale: isValueRaise
        ? `top ${((1 - valueRaiseCut) * 100).toFixed(0)}% of our range — raising for value`
        : 'a draw raised as a semi-bluff, at the frequency the size supports',
    })
  }
  if (callProb > 0.005) out.push({ kind: 'call', prob: callProb, rationale: callWhy })
  if (foldProb > 0.005) out.push({ kind: 'fold', prob: foldProb, rationale: foldWhy })
  if (out.length === 0) out.push({ kind: 'fold', prob: 1, rationale: 'no profitable continuation' })

  s.notes.push(
    `their bet is ${(size * 100).toFixed(0)}% of pot, so we must defend ${(defend * 100).toFixed(0)}% of our range`,
  )
  return out
}

/** What fraction of our range clears the value bar. */
function valueRegionFraction(hero: RangeShape, villain: RangeShape, bar: number): number {
  if (hero.total <= 0 || villain.total <= 0) return 0.2
  // The rank at which a hand beats `bar` of villain's range.
  const target = topFractionThreshold(villain.ranked, 1 - bar)
  let above = 0
  for (const h of hero.ranked) if (h.rank < target) above += h.weight
  return above / hero.total
}

function pickSize(ctx: PolicyContext, s: Signals, sizes: number[]): number {
  if (sizes.length === 1) return sizes[0]!
  // Polarised ranges want the big size, condensed ones the small size. Our own
  // percentile spread on this board is a reasonable proxy for polarisation.
  const polar = s.percentile > 0.8 || s.percentile < 0.25
  const wet = s.texture.wetness > 0.45
  return polar || wet ? sizes[sizes.length - 1]! : sizes[0]!
}

/** Has there been aggression to have initiative FROM? Preflop limps have none. */
function hadAggression(ctx: PolicyContext): boolean {
  return ctx.anyAggression
}

function normalise(options: PolicyOption[]) {
  let t = 0
  for (const o of options) t += o.prob
  if (t <= 0) {
    options.length = 0
    options.push({ kind: 'check', prob: 1, rationale: 'degenerate spot' })
    return
  }
  for (const o of options) o.prob /= t
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}
