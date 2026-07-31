/**
 * Board texture.
 *
 * Two things live here. First, a feature vector per board — the thing that
 * actually gets clustered. Second, a deterministic fallback classifier so the
 * strategy works whether or not a clustering asset has been generated.
 *
 * The feature vector is the honest input to similarity search: boards ARE
 * naturally embeddable (a flop is a point in a continuous space of wetness,
 * connectedness and high-card content), which is exactly the case ADR-006
 * carves out as legitimate — "clustering board textures" is named in it as a
 * reason the no-vector-database decision might be revisited.
 */

import { type Card, rankOf, suitOf } from '../engine/cards'

export const TEXTURE_FEATURES = 8

/**
 * Feature vector for a board, all components normalised to roughly [0, 1] so
 * that no single axis dominates a euclidean or cosine distance.
 *
 *  0 top card rank
 *  1 middle card rank
 *  2 bottom card rank
 *  3 flushiness      (max suit count beyond one)
 *  4 pairedness      (0 unpaired, 0.5 paired, 1 trips+)
 *  5 connectedness   (how tightly the ranks cluster)
 *  6 straightiness   (how many distinct straights the board can complete)
 *  7 broadway weight (fraction of cards T or above)
 */
export function textureFeatures(board: readonly Card[]): Float64Array {
  const f = new Float64Array(TEXTURE_FEATURES)
  if (board.length === 0) return f

  const ranks = board.map(rankOf).sort((a, b) => b - a)
  const suits = [0, 0, 0, 0]
  for (const c of board) suits[suitOf(c)]!++

  f[0] = (ranks[0] ?? 0) / 12
  f[1] = (ranks[1] ?? ranks[0] ?? 0) / 12
  f[2] = (ranks[2] ?? ranks[1] ?? ranks[0] ?? 0) / 12

  const maxSuit = Math.max(...suits)
  f[3] = Math.min(1, (maxSuit - 1) / (board.length - 1 || 1))

  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const maxRep = Math.max(...counts.values())
  f[4] = maxRep >= 3 ? 1 : maxRep === 2 ? 0.5 : 0

  const spread = (ranks[0] ?? 0) - (ranks[ranks.length - 1] ?? 0)
  f[5] = 1 - Math.min(1, spread / 12)

  f[6] = straightPotential(ranks) / 10
  f[7] = ranks.filter((r) => r >= 8).length / ranks.length

  return f
}

/** How many distinct 5-card straights this board participates in. */
function straightPotential(ranks: readonly number[]): number {
  const present = new Set(ranks)
  // The ace plays low as well as high.
  if (present.has(12)) present.add(-1)
  let count = 0
  for (let low = -1; low <= 8; low++) {
    let have = 0
    for (let k = 0; k < 5; k++) if (present.has(low + k)) have++
    // A window the board already fills three of is a real straight threat.
    if (have >= 2) count += have - 1
  }
  return Math.min(10, count)
}

export type Suitedness = 'rainbow' | 'two-tone' | 'monotone'
export type Pairing = 'unpaired' | 'paired' | 'trips'
export type Height = 'low' | 'middling' | 'broadway'

export interface Texture {
  suitedness: Suitedness
  pairing: Pairing
  height: Height
  connected: boolean
  /** 0 = dry as a bone, 1 = every draw is out there. */
  wetness: number
  /** Stable class id used as a policy table key. */
  klass: string
  features: Float64Array
}

export function classifyBoard(board: readonly Card[]): Texture {
  const features = textureFeatures(board)
  if (board.length === 0) {
    return {
      suitedness: 'rainbow',
      pairing: 'unpaired',
      height: 'middling',
      connected: false,
      wetness: 0,
      klass: 'preflop',
      features,
    }
  }

  const suits = [0, 0, 0, 0]
  for (const c of board) suits[suitOf(c)]!++
  const maxSuit = Math.max(...suits)
  const suitedness: Suitedness =
    maxSuit >= (board.length >= 4 ? 4 : 3) ? 'monotone' : maxSuit >= 2 ? 'two-tone' : 'rainbow'

  const counts = new Map<number, number>()
  for (const c of board) {
    const r = rankOf(c)
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  const maxRep = Math.max(...counts.values())
  const pairing: Pairing = maxRep >= 3 ? 'trips' : maxRep === 2 ? 'paired' : 'unpaired'

  const ranks = board.map(rankOf).sort((a, b) => b - a)
  const top = ranks[0]!
  const height: Height = top >= 10 ? 'broadway' : top >= 6 ? 'middling' : 'low'

  const connected = features[5]! > 0.72 || features[6]! > 0.3

  // Wetness combines the three ways a board can be dangerous. Weights are a
  // judgement call and are labelled as such; the bench decides whether they are
  // any good, not this comment.
  const wetness = Math.min(
    1,
    0.45 * features[3]! + 0.35 * features[6]! + 0.2 * (connected ? 1 : 0),
  )

  const klass = `${suitedness}-${pairing}-${height}${connected ? '-conn' : ''}`
  return { suitedness, pairing, height, connected, wetness, klass, features }
}

/**
 * Every texture class the fallback classifier can produce. Used to size the
 * policy table and to assert that generation covered every key.
 */
export const TEXTURE_CLASSES: readonly string[] = (() => {
  const out: string[] = []
  for (const s of ['rainbow', 'two-tone', 'monotone'] as const) {
    for (const p of ['unpaired', 'paired', 'trips'] as const) {
      for (const h of ['low', 'middling', 'broadway'] as const) {
        out.push(`${s}-${p}-${h}`)
        out.push(`${s}-${p}-${h}-conn`)
      }
    }
  }
  return out
})()

/**
 * Stack-to-pot ratio bucket. SPR is the main driver of how committed a hand is,
 * and ADR-001's fixed 100bb start is what makes four buckets enough.
 */
export type SprBucket = 0 | 1 | 2 | 3
export const SPR_EDGES = [1.5, 4, 10] as const

export function sprBucket(spr: number): SprBucket {
  if (!Number.isFinite(spr)) return 3
  if (spr < SPR_EDGES[0]) return 0
  if (spr < SPR_EDGES[1]) return 1
  if (spr < SPR_EDGES[2]) return 2
  return 3
}

export const SPR_LABELS: Record<SprBucket, string> = {
  0: 'committed (SPR < 1.5)',
  1: 'shallow (SPR 1.5-4)',
  2: 'medium (SPR 4-10)',
  3: 'deep (SPR 10+)',
}
