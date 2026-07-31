/**
 * Ranges as weights over the 1326 starting combos.
 *
 * This is the representation the whole strategy rests on. ADR-003's argument
 * against a pot-odds calculator is that it "reasons about its own cards rather
 * than about the opposing range" — so the range has to be a first-class object
 * that is narrowed by every action, not a number recomputed from scratch.
 *
 * Weights are in [0, 1] per combo, so a range is both a set and a frequency:
 * 0.5 means "half of the time this player has this combo here".
 */

import { type Card, DECK, handIndex169, rankOf, suitOf } from '../engine/cards'
import { evaluate } from '../engine/evaluator'

export const N_COMBOS = 1326

/** COMBO_A[i] < COMBO_B[i], iterated in a fixed canonical order. */
export const COMBO_A = new Uint8Array(N_COMBOS)
export const COMBO_B = new Uint8Array(N_COMBOS)
/** COMBO_INDEX[a * 52 + b] for either card order. */
export const COMBO_INDEX = new Int16Array(52 * 52).fill(-1)
/** Which of the 169 classes each combo belongs to. */
export const COMBO_169 = new Uint8Array(N_COMBOS)

{
  let i = 0
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      COMBO_A[i] = a
      COMBO_B[i] = b
      COMBO_INDEX[a * 52 + b] = i
      COMBO_INDEX[b * 52 + a] = i
      COMBO_169[i] = handIndex169(a, b)
      i++
    }
  }
}

export function comboIndex(a: Card, b: Card): number {
  return COMBO_INDEX[a * 52 + b]!
}

export type Range = Float64Array

export function emptyRange(): Range {
  return new Float64Array(N_COMBOS)
}

export function fullRange(): Range {
  return new Float64Array(N_COMBOS).fill(1)
}

export function cloneRange(r: Range): Range {
  return r.slice()
}

/**
 * Build a range from a 169-class frequency map, e.g. `{ AA: 1, AKs: 1, T9s: 0.5 }`.
 * Every combo of a class gets the class weight — combos within a class are
 * strategically identical preflop, which is exactly why 169 is lossless there.
 */
export function rangeFrom169(weights: Readonly<Record<string, number>>, index169ToName: readonly string[]): Range {
  const byIndex = new Float64Array(169)
  for (const [name, w] of Object.entries(weights)) {
    const idx = index169ToName.indexOf(name)
    if (idx < 0) throw new Error(`unknown hand class: ${name}`)
    byIndex[idx] = w
  }
  const r = emptyRange()
  for (let i = 0; i < N_COMBOS; i++) r[i] = byIndex[COMBO_169[i]!]!
  return r
}

/**
 * Zero out combos that clash with known cards. Card removal is not a rounding
 * detail: holding an ace makes villain's AA roughly three times less likely,
 * and a range that ignores it systematically over-credits the opponent.
 */
export function removeBlockers(r: Range, dead: readonly Card[]): Range {
  const out = r.slice()
  const blocked = new Uint8Array(52)
  for (const c of dead) blocked[c] = 1
  for (let i = 0; i < N_COMBOS; i++) {
    if (blocked[COMBO_A[i]!] || blocked[COMBO_B[i]!]) out[i] = 0
  }
  return out
}

export function rangeWeight(r: Range): number {
  let t = 0
  for (let i = 0; i < N_COMBOS; i++) t += r[i]!
  return t
}

export function normalizeRange(r: Range): Range {
  const t = rangeWeight(r)
  if (t <= 0) return r
  const out = r.slice()
  for (let i = 0; i < N_COMBOS; i++) out[i] = r[i]! / t
  return out
}

/** Scale a subset of the range — how every action filter is applied. */
export function scaleRange(r: Range, factor: (combo: number) => number): Range {
  const out = r.slice()
  for (let i = 0; i < N_COMBOS; i++) {
    if (out[i]! > 0) out[i] = out[i]! * factor(i)
  }
  return out
}

export interface RankedCombo {
  combo: number
  rank: number
  weight: number
}

/**
 * Rank every live combo in a range on a board. Returned sorted best-first
 * (remember phe's rank is lower-is-better). This is the workhorse behind
 * "where does my hand sit inside my own range", which is the number that
 * decides bluff vs thin value vs give up.
 */
export function rankRangeOnBoard(r: Range, board: readonly Card[], dead: readonly Card[] = []): RankedCombo[] {
  const blocked = new Uint8Array(52)
  for (const c of board) blocked[c] = 1
  for (const c of dead) blocked[c] = 1

  const cards = new Array<Card>(2 + board.length)
  for (let i = 0; i < board.length; i++) cards[2 + i] = board[i]!

  const out: RankedCombo[] = []
  for (let i = 0; i < N_COMBOS; i++) {
    const w = r[i]!
    if (w <= 0) continue
    const a = COMBO_A[i]!
    const b = COMBO_B[i]!
    if (blocked[a] || blocked[b]) continue
    cards[0] = a
    cards[1] = b
    out.push({ combo: i, rank: evaluate(cards), weight: w })
  }
  out.sort((x, y) => x.rank - y.rank)
  return out
}

/**
 * Percentile of `heroRank` within a ranked range, in [0, 1] where 1 is the top.
 * Ties are counted as half, so a hand that chops with the whole range sits at
 * 0.5 rather than at 1.0 — which matters on paired boards where the field is
 * playing the board.
 */
/**
 * Percentile of EVERY entry in a ranked range, in one pass, aligned with the
 * input array. Computing these individually is O(n^2) over a list that can hold
 * a thousand combos, which is fast enough to look fine in a unit test and far
 * too slow to run a twenty-thousand-hand benchmark.
 */
export function percentilesOf(ranked: readonly RankedCombo[]): Float64Array {
  const n = ranked.length
  const out = new Float64Array(n)
  let total = 0
  for (const rc of ranked) total += rc.weight
  if (total <= 0) return out.fill(0.5)

  // ranked is sorted best-first, so accumulate from the worst end.
  let below = 0
  let i = n - 1
  while (i >= 0) {
    // Walk back over a block of equal ranks so ties share a percentile.
    let j = i
    let tieWeight = 0
    while (j >= 0 && ranked[j]!.rank === ranked[i]!.rank) {
      tieWeight += ranked[j]!.weight
      j--
    }
    const p = (below + tieWeight / 2) / total
    for (let k = j + 1; k <= i; k++) out[k] = p
    below += tieWeight
    i = j
  }
  return out
}

export function percentileOf(ranked: readonly RankedCombo[], heroRank: number): number {
  let below = 0
  let equal = 0
  let total = 0
  for (const rc of ranked) {
    total += rc.weight
    if (rc.rank > heroRank) below += rc.weight
    else if (rc.rank === heroRank) equal += rc.weight
  }
  if (total <= 0) return 0.5
  return (below + equal / 2) / total
}

/**
 * Exact showdown equity of a specific hand against a range, on a COMPLETE
 * board. No sampling needed on the river, so this is the number the river
 * policy uses and it has no confidence interval.
 */
export function riverEquityVsRange(
  hero: readonly [Card, Card],
  villain: Range,
  board: readonly Card[],
): { equity: number; ahead: number; combos: number } {
  const heroRank = evaluate([hero[0], hero[1], ...board])
  const blocked = new Uint8Array(52)
  for (const c of board) blocked[c] = 1
  blocked[hero[0]] = 1
  blocked[hero[1]] = 1

  const cards = new Array<Card>(2 + board.length)
  for (let i = 0; i < board.length; i++) cards[2 + i] = board[i]!

  let win = 0
  let tie = 0
  let total = 0
  for (let i = 0; i < N_COMBOS; i++) {
    const w = villain[i]!
    if (w <= 0) continue
    const a = COMBO_A[i]!
    const b = COMBO_B[i]!
    if (blocked[a] || blocked[b]) continue
    cards[0] = a
    cards[1] = b
    const vr = evaluate(cards)
    total += w
    if (heroRank < vr) win += w
    else if (heroRank === vr) tie += w
  }
  if (total <= 0) return { equity: 0.5, ahead: 0.5, combos: 0 }
  return { equity: (win + tie / 2) / total, ahead: win / total, combos: total }
}

/**
 * Equity of a hand against a range with cards still to come, by sampling
 * runouts. Cheaper and lower-variance than sampling both the runout and the
 * villain combo independently, because we enumerate the range and share the
 * runout across all of it.
 */
export function equityVsRangeSampled(
  hero: readonly [Card, Card],
  villain: Range,
  board: readonly Card[],
  runouts: number,
  rng: { int(n: number): number },
): { equity: number; ahead: number; combos: number; ci95: number } {
  if (board.length === 5) {
    const r = riverEquityVsRange(hero, villain, board)
    return { ...r, ci95: 0 }
  }

  const blocked = new Uint8Array(52)
  for (const c of board) blocked[c] = 1
  blocked[hero[0]] = 1
  blocked[hero[1]] = 1

  // Villain combos that are live given hero's cards and the current board.
  const live: number[] = []
  const lw: number[] = []
  let totalW = 0
  for (let i = 0; i < N_COMBOS; i++) {
    const w = villain[i]!
    if (w <= 0) continue
    if (blocked[COMBO_A[i]!] || blocked[COMBO_B[i]!]) continue
    live.push(i)
    lw.push(w)
    totalW += w
  }
  if (live.length === 0) return { equity: 0.5, ahead: 0.5, combos: 0, ci95: 1 }

  const deck: Card[] = []
  for (const c of DECK) if (!blocked[c]) deck.push(c)
  const need = 5 - board.length

  const full = new Array<Card>(7)
  const heroCards = new Array<Card>(2 + 5)
  heroCards[0] = hero[0]
  heroCards[1] = hero[1]
  for (let i = 0; i < board.length; i++) heroCards[2 + i] = board[i]!
  for (let i = 0; i < board.length; i++) full[2 + i] = board[i]!

  let sum = 0
  let sumSq = 0
  let aheadSum = 0
  let n = 0

  for (let t = 0; t < runouts; t++) {
    // Draw the runout once and score the entire range against it.
    const drawn: Card[] = []
    for (let i = 0; i < need; i++) {
      const j = i + rng.int(deck.length - i)
      const tmp = deck[i]!
      deck[i] = deck[j]!
      deck[j] = tmp
      drawn.push(deck[i]!)
    }
    for (let i = 0; i < need; i++) {
      heroCards[2 + board.length + i] = drawn[i]!
      full[2 + board.length + i] = drawn[i]!
    }
    const heroRank = evaluate(heroCards)

    let win = 0
    let tie = 0
    let live2 = 0
    for (let k = 0; k < live.length; k++) {
      const i = live[k]!
      const a = COMBO_A[i]!
      const b = COMBO_B[i]!
      // The runout may collide with a villain combo; drop it for this runout.
      let clash = false
      for (let d = 0; d < need; d++) {
        if (drawn[d] === a || drawn[d] === b) {
          clash = true
          break
        }
      }
      if (clash) continue
      full[0] = a
      full[1] = b
      const vr = evaluate(full)
      const w = lw[k]!
      live2 += w
      if (heroRank < vr) win += w
      else if (heroRank === vr) tie += w
    }
    if (live2 <= 0) continue
    const e = (win + tie / 2) / live2
    sum += e
    sumSq += e * e
    aheadSum += win / live2
    n++
  }

  if (n === 0) return { equity: 0.5, ahead: 0.5, combos: totalW, ci95: 1 }
  const mean = sum / n
  const varr = Math.max(0, sumSq / n - mean * mean)
  return {
    equity: mean,
    ahead: aheadSum / n,
    combos: totalW,
    ci95: 1.96 * Math.sqrt(varr / n),
  }
}

/** Average equity of one range against another — "who has the range advantage". */
export function rangeVsRangeEquity(
  hero: Range,
  villain: Range,
  board: readonly Card[],
  samples: number,
  rng: { int(n: number): number; float(): number },
): number {
  const heroList: number[] = []
  const heroW: number[] = []
  let tw = 0
  for (let i = 0; i < N_COMBOS; i++) {
    if (hero[i]! > 0) {
      heroList.push(i)
      heroW.push(hero[i]!)
      tw += hero[i]!
    }
  }
  if (heroList.length === 0 || tw <= 0) return 0.5

  // Sample hero combos proportional to weight; each gets a small equity run.
  let sum = 0
  let n = 0
  const per = Math.max(1, Math.floor(samples / Math.min(heroList.length, 60)))
  const picks = Math.min(heroList.length, 60)
  for (let p = 0; p < picks; p++) {
    let target = rng.float() * tw
    let idx = 0
    for (; idx < heroList.length - 1; idx++) {
      target -= heroW[idx]!
      if (target <= 0) break
    }
    const combo = heroList[idx]!
    const e = equityVsRangeSampled(
      [COMBO_A[combo]!, COMBO_B[combo]!],
      villain,
      board,
      per,
      rng,
    )
    if (e.combos > 0) {
      sum += e.equity
      n++
    }
  }
  return n > 0 ? sum / n : 0.5
}

export function topFractionThreshold(ranked: readonly RankedCombo[], fraction: number): number {
  let total = 0
  for (const rc of ranked) total += rc.weight
  const target = total * fraction
  let acc = 0
  for (const rc of ranked) {
    acc += rc.weight
    if (acc >= target) return rc.rank
  }
  return ranked.length > 0 ? ranked[ranked.length - 1]!.rank : 7462
}

/** Human-readable summary of a range's shape, for the explanation panel. */
export function describeRange(r: Range, index169ToName: readonly string[]): string {
  const byClass = new Float64Array(169)
  const maxByClass = new Float64Array(169)
  for (let i = 0; i < N_COMBOS; i++) {
    const w = r[i]!
    if (w <= 0) continue
    byClass[COMBO_169[i]!] = byClass[COMBO_169[i]!]! + w
    if (w > maxByClass[COMBO_169[i]!]!) maxByClass[COMBO_169[i]!] = w
  }
  const present: string[] = []
  for (let i = 0; i < 169; i++) if (byClass[i]! > 0) present.push(index169ToName[i]!)
  if (present.length === 0) return 'nothing'
  if (present.length > 12) return `${present.length} hand classes`
  return present.join(', ')
}

/** Suit-aware helpers used by texture classification. */
export function suitCounts(cards: readonly Card[]): number[] {
  const s = [0, 0, 0, 0]
  for (const c of cards) s[suitOf(c)]!++
  return s
}

export function rankCounts(cards: readonly Card[]): number[] {
  const r = new Array<number>(13).fill(0)
  for (const c of cards) r[rankOf(c)]!++
  return r
}
