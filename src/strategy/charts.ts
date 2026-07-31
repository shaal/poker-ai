/**
 * Heads-up 100bb preflop charts.
 *
 * ADR-003 calls preflop "close to a solved problem" and budgets 169 lossless
 * buckets for it. These charts are frequency-based rather than binary: a value
 * of 0.5 means the hand takes that action half the time. Pure strategies
 * preflop are trivially exploitable, and a mixed chart is also what makes the
 * opponent model's job coherent — you cannot shade a frequency that is already
 * 0 or 1.
 *
 * Ranges are expressed as compact class lists rather than 169 literals, because
 * a wall of literals is unreviewable and this file has to be checkable by eye.
 */

import { ALL_169, hand169ToString, RANKS } from '../engine/cards'
import { type Range, emptyRange, N_COMBOS, COMBO_169 } from './ranges'

export type Chart = Record<string, number>

const R = RANKS // '23456789TJQKA'

function idx(rank: string): number {
  return R.indexOf(rank)
}

/** "AA-99" / "AKs-ATs" / "76s+" / "T9o" — the notation charts are written in. */
function expand(token: string): string[] {
  const t = token.trim()
  if (!t) return []

  // Range with a dash: "AA-99", "AKs-ATs"
  if (t.includes('-')) {
    const [a, b] = t.split('-') as [string, string]
    return expandSpan(a, b)
  }
  // Plus notation: "99+", "ATs+", "KJo+"
  if (t.endsWith('+')) {
    const base = t.slice(0, -1)
    return expandPlus(base)
  }
  return [base169(t)]
}

function base169(t: string): string {
  const hi = t[0]!
  const lo = t[1]!
  const suffix = t[2]
  if (hi === lo) return hi + lo
  const a = idx(hi) > idx(lo) ? hi : lo
  const b = idx(hi) > idx(lo) ? lo : hi
  return a + b + (suffix ?? 'o')
}

function expandPlus(base: string): string[] {
  const name = base169(base)
  const hi = name[0]!
  const lo = name[1]!
  const suf = name[2]
  const out: string[] = []
  if (hi === lo) {
    // Pairs go up: 99+ = 99, TT, JJ, QQ, KK, AA
    for (let r = idx(hi); r <= 12; r++) out.push(R[r]! + R[r]!)
    return out
  }
  // Non-pairs: the kicker climbs toward the high card. ATs+ = ATs, AJs, AQs, AKs
  for (let r = idx(lo); r < idx(hi); r++) out.push(hi + R[r]! + suf)
  return out
}

function expandSpan(a: string, b: string): string[] {
  const na = base169(a)
  const nb = base169(b)
  const out: string[] = []
  if (na[0] === na[1] && nb[0] === nb[1]) {
    const lo = Math.min(idx(na[0]!), idx(nb[0]!))
    const hi = Math.max(idx(na[0]!), idx(nb[0]!))
    for (let r = lo; r <= hi; r++) out.push(R[r]! + R[r]!)
    return out
  }
  if (na[0] !== nb[0] || na[2] !== nb[2]) {
    throw new Error(`cannot span ${a}-${b}`)
  }
  const hi = na[0]!
  const suf = na[2]!
  const lo1 = idx(na[1]!)
  const lo2 = idx(nb[1]!)
  for (let r = Math.min(lo1, lo2); r <= Math.max(lo1, lo2); r++) out.push(hi + R[r]! + suf)
  return out
}

/** Build a chart from `{ '1.0': 'AA-TT, AKs+', '0.5': 'A5s-A2s' }` style groups. */
export function chart(groups: Record<string, string>): Chart {
  const out: Chart = {}
  for (const [freqStr, tokens] of Object.entries(groups)) {
    const freq = Number(freqStr)
    for (const token of tokens.split(',')) {
      for (const name of expand(token)) {
        if (!ALL_169.includes(name)) throw new Error(`bad hand class "${name}" from "${token}"`)
        out[name] = freq
      }
    }
  }
  return out
}

export function chartToRange(c: Chart): Range {
  const byIndex = new Float64Array(169)
  for (const [name, w] of Object.entries(c)) {
    const i = ALL_169.indexOf(name)
    if (i < 0) throw new Error(`unknown hand class ${name}`)
    byIndex[i] = w
  }
  const r = emptyRange()
  for (let i = 0; i < N_COMBOS; i++) r[i] = byIndex[COMBO_169[i]!]!
  return r
}

export function chartFreq(c: Chart, hand169Index: number): number {
  return c[hand169ToString(hand169Index)] ?? 0
}

/**
 * Heads-up button (small blind) opening strategy at 100bb.
 *
 * The button is getting 3:1 on a limp and closes the action on every later
 * street, so the correct opening range is enormous — solved HU button opens are
 * upwards of 80% of hands. The folding region is small and specifically the
 * offsuit trash that flops badly and cannot continue against a 3-bet.
 */
export const SB_OPEN: Chart = chart({
  1: 'AA-22, AKs-A2s, KQs-K2s, QJs-Q2s, JTs-J2s, T9s-T2s, 98s-92s, 87s-82s, 76s-72s, 65s-62s, 54s-52s, 43s-42s, 32s, AKo-A2o, KQo-K2o, QJo-Q4o, JTo-J6o, T9o-T6o, 98o-96o, 87o-86o, 76o',
  0.6: 'Q3o, Q2o, J5o, T5o, 95o, 85o, 75o, 65o',
  0.3: 'J4o, J3o, J2o, T4o, T3o, T2o, 94o, 84o, 74o, 64o, 54o',
})

/** Hands the button raises rather than limps. This project does not limp. */
export const SB_RAISE_SIZE_BB = 250 // 2.5bb, the standard HU open

/**
 * Big blind response to a 2.5bb button open.
 *
 * The BB is closing the action getting 1.5:1 and is out of position for the
 * rest of the hand. Defence is wide but the 3-bet region is polarised: strong
 * value plus suited wheel aces and suited connectors that play well when called
 * and have blockers when they do not.
 */
export const BB_VS_OPEN_3BET: Chart = chart({
  1: 'AA-JJ, AKs, AQs, AKo',
  0.7: 'TT, AJs, KQs',
  0.5: '99, ATs, A5s, A4s, AQo',
  0.45: '88, 77, A3s, A2s, KJs, KTs, QJs, QTs, JTs, J9s, T9s, 98s, 87s, 76s, 65s, AJo, KQo',
})

/**
 * Calling range. Hands that also appear in the 3-bet chart are listed at full
 * frequency here and capped by `passiveRange` to whatever the 3-bet leaves
 * over, so the two charts cannot double-count.
 *
 * Total defence lands near 65%, which is the shape solved heads-up play takes
 * against a 2.5bb open: wide, but nowhere near the 99% that "the big blind gets
 * a price" intuition suggests. The blind is already dead money; the 1.5bb still
 * to be put in is not.
 */
export const BB_VS_OPEN_CALL: Chart = chart({
  1: 'TT-22, AJs-A2s, KQs-K2s, QJs-Q2s, JTs-J2s, T9s-T2s, 98s-92s, 87s-82s, 76s-72s, 65s-62s, 54s-52s, 43s-42s, 32s, AJo-A7o, KQo-K7o, QJo-Q8o, JTo-J8o, T9o-T8o, 98o, 87o',
  0.6: 'A6o-A2o, K6o-K5o, Q7o, J7o, T7o, 97o, 86o, 76o',
  0.35: 'K4o-K2o, Q6o-Q5o, J6o, T6o, 96o, 85o, 75o, 65o, 54o',
})

/** Button response to a big blind 3-bet. */
export const SB_VS_3BET_4BET: Chart = chart({
  1: 'AA, KK, AKs',
  0.8: 'QQ, AKo',
  0.55: 'JJ, AQs',
  0.4: 'A5s, A4s, KQs',
  0.2: 'A3s, A2s, KJs, T9s, 76s',
})

export const SB_VS_3BET_CALL: Chart = chart({
  1: 'QQ-55, AQs, AJs, ATs, KQs, KJs, KTs, QJs, QTs, JTs, J9s, T9s, 98s, 87s, 76s, 65s, AQo, AJo, KQo',
  0.6: '44-22, A9s-A5s, K9s, Q9s, J8s, T8s, 97s, 54s, ATo, KJo',
  0.35: 'A4s-A2s, K8s-K6s, Q8s, J7s, T7s, 86s, A9o, QJo',
})

/** Big blind response to a 4-bet. */
export const BB_VS_4BET_5BET: Chart = chart({
  1: 'AA, KK',
  0.75: 'AKs',
  0.4: 'QQ, AKo',
  0.2: 'A5s, A4s',
})

export const BB_VS_4BET_CALL: Chart = chart({
  1: 'JJ, TT, AQs',
  0.5: 'QQ, AKo, AJs, KQs',
  0.25: '99, ATs',
})

export interface PreflopNode {
  name: string
  /** Aggressive action frequency by hand class. */
  aggressive: Chart
  /** Calling frequency by hand class, applied to hands not taking the aggressive line. */
  passive: Chart
  /** Raise-to size in chips, for the aggressive action. */
  raiseTo: number
}

/**
 * A frequency triple for one hand class at one node, always summing to 1.
 * The residual is the fold, which is why fold is never listed explicitly.
 */
export function actionFreqs(
  aggressive: Chart,
  passive: Chart,
  handIndex: number,
): { aggro: number; passive: number; fold: number } {
  const name = hand169ToString(handIndex)
  const aggro = Math.min(1, aggressive[name] ?? 0)
  const pass = Math.min(1 - aggro, passive[name] ?? 0)
  return { aggro, passive: pass, fold: Math.max(0, 1 - aggro - pass) }
}

/** Range of hands that took the aggressive line at a node, as combo weights. */
export function aggressiveRange(aggressive: Chart): Range {
  return chartToRange(aggressive)
}

/** Range of hands that took the passive line, accounting for the aggressive split. */
export function passiveRange(aggressive: Chart, passive: Chart): Range {
  const r = emptyRange()
  const agg = new Float64Array(169)
  const pas = new Float64Array(169)
  for (const [name, w] of Object.entries(aggressive)) agg[ALL_169.indexOf(name)] = w
  for (const [name, w] of Object.entries(passive)) pas[ALL_169.indexOf(name)] = w
  for (let i = 0; i < N_COMBOS; i++) {
    const c = COMBO_169[i]!
    r[i] = Math.min(1 - agg[c]!, pas[c]!)
  }
  return r
}

/** Total combo weight of a chart, as a fraction of all 1326 combos. */
export function chartFraction(c: Chart): number {
  const r = chartToRange(c)
  let t = 0
  for (let i = 0; i < N_COMBOS; i++) t += r[i]!
  return t / N_COMBOS
}
