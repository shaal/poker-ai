/**
 * Card representation.
 *
 * We adopt `phe`'s integer encoding wholesale rather than translating at the
 * boundary, because translation layers are where silent card bugs live.
 *
 *   card = rank * 4 + suit      (0..51)
 *   rank: 0 = '2' ... 12 = 'A'
 *   suit: 0 = 's', 1 = 'h', 2 = 'd', 3 = 'c'
 *
 * See ADR-008. Note that `phe.cardCode(...)` takes TWO arguments and returns 0
 * for every single-string input — the plural `cardCodes([...])` is the correct
 * entry point. We do not use either: we compute codes ourselves so the encoding
 * is visible in this file rather than assumed.
 */

export type Card = number
export type Rank = number
export type Suit = number

export const RANKS = '23456789TJQKA'
export const SUITS = 'shdc'

export const DECK: readonly Card[] = Array.from({ length: 52 }, (_, i) => i)

export function rankOf(card: Card): Rank {
  return card >> 2
}

export function suitOf(card: Card): Suit {
  return card & 3
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return rank * 4 + suit
}

export function cardToString(card: Card): string {
  return RANKS[rankOf(card)]! + SUITS[suitOf(card)]!
}

export function cardFromString(s: string): Card {
  const rank = RANKS.indexOf(s[0]!.toUpperCase())
  const suit = SUITS.indexOf(s[1]!.toLowerCase())
  if (rank < 0 || suit < 0) throw new Error(`bad card: ${s}`)
  return makeCard(rank, suit)
}

export function cardsFromString(s: string): Card[] {
  return s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(cardFromString)
}

export function cardsToString(cards: readonly Card[]): string {
  return cards.map(cardToString).join(' ')
}

/**
 * The 169 strategically-distinct starting hands, as an index.
 *
 *   AA .. 22           pairs
 *   AKs, AQs, ...      suited
 *   AKo, AQo, ...      offsuit
 *
 * Canonical index: `hi * 13 + lo` for suited, `lo * 13 + hi` for offsuit,
 * with pairs on the diagonal — the standard 13x13 grid, read row-major.
 * Row = higher rank, column = lower rank, upper triangle suited.
 */
export function handIndex169(a: Card, b: Card): number {
  const ra = rankOf(a)
  const rb = rankOf(b)
  const suited = suitOf(a) === suitOf(b)
  const hi = Math.max(ra, rb)
  const lo = Math.min(ra, rb)
  // Grid is indexed from the ace down, so row 0 = ace.
  const r = 12 - hi
  const c = 12 - lo
  return suited ? r * 13 + c : c * 13 + r
}

export function hand169ToString(index: number): string {
  const r = Math.floor(index / 13)
  const c = index % 13
  const hiRank = RANKS[12 - Math.min(r, c)]!
  const loRank = RANKS[12 - Math.max(r, c)]!
  if (r === c) return hiRank + loRank
  return hiRank + loRank + (c > r ? 's' : 'o')
}

/** How many of the 1326 starting combos map to this 169-index. */
export function combosOf169(index: number): number {
  const r = Math.floor(index / 13)
  const c = index % 13
  if (r === c) return 6
  return c > r ? 4 : 12
}

export const ALL_169: readonly string[] = Array.from({ length: 169 }, (_, i) => hand169ToString(i))

/**
 * Deterministic sfc32, so every bench run is reproducible.
 *
 * This was xorshift128+ and that was a bug worth recording, because it was
 * invisible and it contaminated everything downstream. xorshift128+ is defined
 * over 64-BIT words; its shift constants (23, 17, 26) were being applied to
 * 32-bit words, which is a different and much weaker generator. Measured over
 * 400,000 draws it showed lag-1/2/3 autocorrelation at |z| = 5.4, 3.2 and 5.9,
 * where anything sound sits under 3.
 *
 * That matters far more here than it looks. This generator shuffles the deck,
 * drives the Monte Carlo equity estimates, AND samples the strategy's own mixed
 * actions. Correlated streams meant a strategy could measure as beating a copy
 * of ITSELF — a true edge of exactly zero — with a confidence interval that
 * excluded zero and did not shrink with more hands. Every benchmark number in
 * the project rests on this class, so a subtle defect here is indistinguishable
 * from a strategy result.
 *
 * sfc32 is a 32-bit generator by design, passes PractRand, and is fast.
 */
export class Rng {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed = 0x2545f491) {
    // splitmix32 to expand one seed word into four state words, so that
    // adjacent seeds produce genuinely unrelated streams rather than shifted
    // ones. Cross-stream correlation is what breaks duplicate-hand pairing.
    let x = seed >>> 0
    const mix = () => {
      x = (x + 0x9e3779b9) >>> 0
      let z = x
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
      return (z ^ (z >>> 15)) >>> 0
    }
    this.a = mix()
    this.b = mix()
    this.c = mix()
    this.d = mix()
    // Discard the first outputs so the seeding structure cannot show through.
    for (let i = 0; i < 12; i++) this.next()
  }

  /** Uniform uint32. */
  next(): number {
    this.a >>>= 0
    this.b >>>= 0
    this.c >>>= 0
    this.d >>>= 0
    let t = (this.a + this.b) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.d = (this.d + 1) | 0
    t = (t + this.d) | 0
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next() / 4294967296
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n)
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!
  }
}

/** Fisher-Yates, in place. */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const t = deck[i]!
    deck[i] = deck[j]!
    deck[j] = t
  }
  return deck
}

export function freshDeck(): Card[] {
  return DECK.slice()
}
