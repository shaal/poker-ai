/**
 * Hand evaluation and Monte Carlo equity. ADR-008.
 *
 * `phe.evaluateCardCodes` returns a rank in [1, 7462] where **1 is the best
 * hand** (royal flush) and 7462 is the worst (7-5-4-3-2 offsuit). Every
 * comparison in this file is therefore "lower wins", which is the opposite of
 * intuition and the single easiest thing to get backwards.
 */

import { evaluateCardCodes, rankDescription } from 'phe'
import { type Card, DECK, Rng } from './cards'

export const BEST_RANK = 1
export const WORST_RANK = 7462

/** Category names, best first, indexed by `handCategory`. */
export const CATEGORIES = [
  'Straight Flush',
  'Four of a Kind',
  'Full House',
  'Flush',
  'Straight',
  'Three of a Kind',
  'Two Pair',
  'One Pair',
  'High Card',
] as const

/**
 * Rank a 5-, 6- or 7-card hand. Lower is better.
 * Hot path — called millions of times per equity run.
 */
export function evaluate(cards: readonly Card[]): number {
  return evaluateCardCodes(cards as number[])
}

export function describe(cards: readonly Card[]): string {
  return rankDescription[Math.floor(handRankCategoryIndex(evaluate(cards)))] ?? 'Unknown'
}

/**
 * phe's own category boundaries. Kept here as a named function because the
 * magic numbers are otherwise unreadable at the call site.
 */
export function handRankCategoryIndex(rank: number): number {
  if (rank > 6185) return 8 // high card
  if (rank > 3325) return 7 // one pair
  if (rank > 2467) return 6 // two pair
  if (rank > 1609) return 5 // trips
  if (rank > 1599) return 4 // straight
  if (rank > 322) return 3 // flush
  if (rank > 166) return 2 // full house
  if (rank > 10) return 1 // quads
  return 0 // straight flush
}

export function categoryName(rank: number): string {
  return CATEGORIES[handRankCategoryIndex(rank)]!
}

/**
 * Normalised hand strength in [0, 1], 1 = nuts. Used for display and for
 * bucketing. NOT a substitute for equity against a range.
 */
export function strengthOf(rank: number): number {
  return (WORST_RANK - rank) / (WORST_RANK - BEST_RANK)
}

export interface EquityResult {
  /** Share of the pot won on average, ties counted as a half. */
  equity: number
  win: number
  tie: number
  lose: number
  trials: number
  /** Half-width of the 95% confidence interval on `equity`. */
  ci95: number
  exhaustive: boolean
}

/**
 * Monte Carlo equity of `hero` against `villain` on a partial `board`.
 *
 * If `villain` is undefined the villain is drawn uniformly from the remaining
 * deck — i.e. equity against a random hand, which is what a naive calculator
 * shows and is almost never the number you actually want. Prefer
 * `equityVsRange`.
 *
 * ADR-008 measured 10,000 trials at ~2 ms with a 95% CI of +/-0.80%, which is
 * the default here.
 */
export function equity(
  hero: readonly Card[],
  villain: readonly Card[] | undefined,
  board: readonly Card[],
  trials = 10_000,
  rng: Rng = new Rng(),
): EquityResult {
  const dead = new Set<Card>([...hero, ...board])
  if (villain) for (const c of villain) dead.add(c)
  const live: Card[] = []
  for (const c of DECK) if (!dead.has(c)) live.push(c)

  const needBoard = 5 - board.length
  const needVillain = villain ? 0 : 2
  const draw = needBoard + needVillain

  let win = 0
  let tie = 0
  let lose = 0

  const heroCards = new Array<Card>(7)
  const villCards = new Array<Card>(7)
  for (let i = 0; i < hero.length; i++) heroCards[i] = hero[i]!
  if (villain) for (let i = 0; i < villain.length; i++) villCards[i] = villain[i]!

  const pool = live.slice()

  for (let t = 0; t < trials; t++) {
    // Partial Fisher-Yates: we only need `draw` cards, not a full shuffle.
    for (let i = 0; i < draw; i++) {
      const j = i + rng.int(pool.length - i)
      const tmp = pool[i]!
      pool[i] = pool[j]!
      pool[j] = tmp
    }

    let k = 0
    if (!villain) {
      villCards[0] = pool[k++]!
      villCards[1] = pool[k++]!
    }
    // Board: known cards then the drawn remainder.
    for (let i = 0; i < board.length; i++) {
      heroCards[2 + i] = board[i]!
      villCards[2 + i] = board[i]!
    }
    for (let i = 0; i < needBoard; i++) {
      const c = pool[k++]!
      heroCards[2 + board.length + i] = c
      villCards[2 + board.length + i] = c
    }

    const hr = evaluateCardCodes(heroCards)
    const vr = evaluateCardCodes(villCards)
    if (hr < vr) win++
    else if (hr > vr) lose++
    else tie++
  }

  const eq = (win + tie / 2) / trials
  return {
    equity: eq,
    win: win / trials,
    tie: tie / trials,
    lose: lose / trials,
    trials,
    ci95: 1.96 * Math.sqrt((eq * (1 - eq)) / trials),
    exhaustive: false,
  }
}

/**
 * Equity against a weighted range of villain combos — the number that actually
 * matters for a strategy. `range` is a list of two-card combos with weights.
 *
 * Combos that conflict with hero's cards or the board are skipped, which is
 * card removal and is not optional: it is why AA is less likely when you hold
 * an ace.
 */
export function equityVsRange(
  hero: readonly Card[],
  range: ReadonlyArray<{ cards: readonly [Card, Card]; weight: number }>,
  board: readonly Card[],
  trials = 5_000,
  rng: Rng = new Rng(),
): EquityResult {
  const blocked = new Set<Card>([...hero, ...board])
  const live: Card[] = []
  for (const c of DECK) if (!blocked.has(c)) live.push(c)

  const usable = range.filter(
    (r) => r.weight > 0 && !blocked.has(r.cards[0]) && !blocked.has(r.cards[1]),
  )
  if (usable.length === 0) {
    return { equity: 0.5, win: 0, tie: 1, lose: 0, trials: 0, ci95: 1, exhaustive: false }
  }

  // Alias-free cumulative sampling. The range is small (<= 1326) so a linear
  // scan per trial would dominate; prebuild a cumulative table and binary search.
  const cum = new Float64Array(usable.length)
  let total = 0
  for (let i = 0; i < usable.length; i++) {
    total += usable[i]!.weight
    cum[i] = total
  }

  const needBoard = 5 - board.length
  let win = 0
  let tie = 0
  let ties = 0
  const heroCards = new Array<Card>(7)
  const villCards = new Array<Card>(7)
  heroCards[0] = hero[0]!
  heroCards[1] = hero[1]!
  for (let i = 0; i < board.length; i++) {
    heroCards[2 + i] = board[i]!
    villCards[2 + i] = board[i]!
  }

  const pool = live.slice()
  let counted = 0

  for (let t = 0; t < trials; t++) {
    // Pick a villain combo proportional to weight.
    const target = rng.float() * total
    let lo = 0
    let hi = usable.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid]! < target) lo = mid + 1
      else hi = mid
    }
    const combo = usable[lo]!.cards
    villCards[0] = combo[0]
    villCards[1] = combo[1]

    // Draw the runout from cards that clash with neither hero nor this combo.
    let filled = 0
    let guard = 0
    while (filled < needBoard && guard < 64) {
      const j = filled + rng.int(pool.length - filled)
      const tmp = pool[filled]!
      pool[filled] = pool[j]!
      pool[j] = tmp
      const c = pool[filled]!
      guard++
      if (c === combo[0] || c === combo[1]) {
        // Swap it out of the way and retry this slot.
        const k = pool.length - 1 - (guard % Math.max(1, pool.length - filled - 1))
        const t2 = pool[filled]!
        pool[filled] = pool[k]!
        pool[k] = t2
        continue
      }
      heroCards[2 + board.length + filled] = c
      villCards[2 + board.length + filled] = c
      filled++
    }
    if (filled < needBoard) continue

    counted++
    const hr = evaluateCardCodes(heroCards)
    const vr = evaluateCardCodes(villCards)
    if (hr < vr) win++
    else if (hr === vr) ties++
  }

  tie = ties
  const n = Math.max(1, counted)
  const eq = (win + tie / 2) / n
  return {
    equity: eq,
    win: win / n,
    tie: tie / n,
    lose: (n - win - tie) / n,
    trials: counted,
    ci95: 1.96 * Math.sqrt((eq * (1 - eq)) / n),
    exhaustive: false,
  }
}

/**
 * Exact equity by full enumeration of the runout, for a known villain hand.
 * Only tractable from the flop onward; used in tests to pin the Monte Carlo.
 */
export function equityExact(
  hero: readonly Card[],
  villain: readonly Card[],
  board: readonly Card[],
): EquityResult {
  const dead = new Set<Card>([...hero, ...villain, ...board])
  const live = DECK.filter((c) => !dead.has(c))
  const need = 5 - board.length

  let win = 0
  let tie = 0
  let lose = 0
  const h = [...hero, ...board] as Card[]
  const v = [...villain, ...board] as Card[]

  const run = (start: number, depth: number) => {
    if (depth === 0) {
      const hr = evaluateCardCodes(h)
      const vr = evaluateCardCodes(v)
      if (hr < vr) win++
      else if (hr > vr) lose++
      else tie++
      return
    }
    for (let i = start; i <= live.length - depth; i++) {
      h.push(live[i]!)
      v.push(live[i]!)
      run(i + 1, depth - 1)
      h.pop()
      v.pop()
    }
  }
  run(0, need)

  const n = win + tie + lose
  const eq = (win + tie / 2) / n
  return { equity: eq, win: win / n, tie: tie / n, lose: lose / n, trials: n, ci95: 0, exhaustive: true }
}
