/**
 * The contract between the AI and the interface.
 *
 * This file is deliberately the widest part of the strategy API, because the
 * product is not the decision — it is the explanation of the decision. Per
 * ADR-005 and the interface plan, the AI has to be able to say what it
 * believed, how sure it was, and how much of the action was a read on the
 * player rather than the baseline. If a field here is hard to fill in honestly,
 * that is a signal about the strategy, not about the interface.
 */

import type { Action, Seat, Street } from '../engine/types'

/** One entry of a mixed strategy. */
export interface WeightedAction {
  action: Action
  prob: number
  /** "check", "bet 66% pot", "call 4.5bb", "fold" — ready to render. */
  label: string
  /** Why this option is in the mix at all. Shown against the chosen action. */
  rationale?: string
}

/**
 * A single belief about the player, in the form ADR-005 requires: a posterior
 * blended from a population prior, with the evidence count attached because the
 * count is part of the sentence.
 */
export interface Belief {
  key: string
  /** "folds to flop c-bets" */
  label: string
  /** Population default before any evidence. */
  prior: number
  /** Raw observed frequency, or null when nothing has been observed yet. */
  observed: number | null
  /** (prior*k + observed*n) / (k+n) */
  posterior: number
  /** Number of opportunities observed, NOT hands played. */
  observations: number
  /** n / (n + k): how much of the posterior is the player rather than the prior. */
  confidence: number
  /** Where the posterior sits relative to the population. */
  direction: 'above' | 'below' | 'typical'
  /**
   * The whole thing as an honest English sentence, observation count included.
   * "You fold to flop c-bets more than most players — I'm about 60% sure of
   * that, from 14 spots."
   */
  sentence: string
}

/** A named factor that moved the decision, ordered by how much it mattered. */
export interface Reason {
  /** Short label for the instrument readout: "range advantage". */
  key: string
  /** One clause, lower case, no full stop: "you have almost no strong hands here". */
  text: string
  /** Signed contribution in big blinds of EV, when it can be attributed. */
  weightBB?: number
}

export interface HandReading {
  /** "top pair, weak kicker" */
  label: string
  /** Equity against the opponent's ESTIMATED RANGE, not against a random hand. */
  equityVsRange: number
  equityCi95: number
  /**
   * Where this hand sits inside our own range on this board, 0..1. This is the
   * number that decides whether a hand is a bluff, a thin value bet or a check,
   * and it is why a pot-odds calculator cannot play poker.
   */
  percentileInOwnRange: number
  /** Fraction of the opponent's range we currently beat. */
  aheadOfRange: number
  /** Our range's equity minus theirs: who is allowed to bet. */
  rangeAdvantage: number
  /** Combos left in the opponent's estimated range. */
  villainCombos: number
}

export interface Decision {
  action: Action
  /** The mixed strategy actually used, after any exploitative shift. */
  policy: WeightedAction[]
  /** The same distribution BEFORE the opponent model touched it. */
  baseline: WeightedAction[]
  /**
   * Total variation distance between baseline and policy. Zero means the read
   * changed nothing, which is the honest and common case early on.
   */
  exploitShift: number
  reading: HandReading
  reasons: Reason[]
  /** Only the beliefs that actually moved this decision. */
  beliefsUsed: Belief[]
  /** Where the strategy came from, so the interface never overclaims. */
  source: 'preflop-chart' | 'postflop-policy' | 'fallback'
  street: Street
  seat: Seat
  potBB: number
  toCallBB: number
  spr: number
  /** Milliseconds actually spent deciding, so the "thinking" pause stays honest. */
  computeMs: number
}

/** Formats chips (hundredths of a bb) as big blinds for display. */
export function bb(chips: number): number {
  return Math.round(chips) / 100
}

export function formatBB(chips: number): string {
  const v = bb(chips)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function labelAction(a: Action, potBefore: number, toCallChips: number): string {
  switch (a.type) {
    case 'fold':
      return 'fold'
    case 'check':
      return 'check'
    case 'call':
      return `call ${formatBB(toCallChips)}`
    case 'bet':
    case 'raise': {
      const pct = potBefore > 0 ? Math.round(((a.to ?? 0) / potBefore) * 100) : 0
      return `${a.type} to ${formatBB(a.to ?? 0)} (${pct}% pot)`
    }
  }
}
