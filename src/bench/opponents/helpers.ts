/**
 * Action construction for scripted opponents.
 *
 * Every terminal action in this directory goes through one of these helpers,
 * and every helper consults `legalActions` before it decides. That is not
 * defensive style for its own sake: a thrown "illegal action" 80,000 hands into
 * a 100,000-hand run costs the whole run, and the failure mode is a rare state
 * (all-in for less, betting into a covered opponent) that no amount of staring
 * at the policy will surface.
 */

import { type Card, rankOf, suitOf } from '../../engine/cards'
import { evaluate, handRankCategoryIndex } from '../../engine/evaluator'
import { legalActions, totalPot } from '../../engine/holdem'
import type { Action, ActionType, HandState, Seat } from '../../engine/types'

function has(s: HandState, type: ActionType): boolean {
  for (const l of legalActions(s)) if (l.type === type) return true
  return false
}

/** What it costs this seat to continue, before any stack clamp. */
export function owed(s: HandState, seat: Seat): number {
  return s.currentBet - s.players[seat].committed
}

/** The call price as a fraction of the pot we would be playing for. */
export function price(s: HandState, seat: Seat): number {
  const c = owed(s, seat)
  if (c <= 0) return 0
  return c / (totalPot(s) + c)
}

/** Check when it is free, otherwise call. Never folds a free option away. */
export function doCheck(s: HandState): Action {
  if (has(s, 'check')) return { type: 'check' }
  return has(s, 'call') ? { type: 'call' } : { type: 'fold' }
}

export function doCall(s: HandState): Action {
  if (has(s, 'call')) return { type: 'call' }
  return { type: 'check' }
}

/** Folding is not legal when checking is free, so fold-or-check, never fold. */
export function doFold(s: HandState): Action {
  if (has(s, 'fold')) return { type: 'fold' }
  return { type: 'check' }
}

/**
 * Bet or raise to `target` (a total-committed-this-street figure), clamped into
 * the legal band. Clamping rather than rejecting is deliberate: an opponent
 * that wants to bet 70% of the pot when only an all-in is available should go
 * all-in, not silently check.
 */
export function aggro(s: HandState, target: number): Action {
  const legals = legalActions(s)
  const r = legals.find((l) => l.type === 'bet' || l.type === 'raise')
  if (!r) return doCall(s)
  const min = r.min ?? 0
  const max = r.max ?? 0
  const to = Math.max(min, Math.min(max, Math.round(target)))
  return { type: r.type, to }
}

/** All-in, or the closest legal thing to it. */
export function shove(s: HandState): Action {
  return aggro(s, Number.MAX_SAFE_INTEGER)
}

/**
 * Total-to for a bet or raise of `frac` of the pot.
 *
 * The raise increment is measured against the pot AFTER our call, which is the
 * standard definition and the one that makes "pot-sized raise" mean 3bb from
 * the button preflop rather than 2bb.
 */
export function potBet(s: HandState, seat: Seat, frac: number): number {
  const c = Math.max(0, owed(s, seat))
  return s.currentBet + frac * (totalPot(s) + c)
}

export interface Made {
  /** phe category index: 0 = straight flush ... 8 = high card. Lower is better. */
  cat: number
  /** One of our cards pairs the highest board card. */
  hitsTop: boolean
  /** Pocket pair above every board card. */
  overpair: boolean
  /** Two pair or better, or top pair / overpair. */
  strong: boolean
}

const AIR: Made = { cat: 8, hitsTop: false, overpair: false, strong: false }

/**
 * Coarse made-hand read. Deliberately cheap — one 7-card table lookup, no Monte
 * Carlo — because these policies run tens of millions of times and a scripted
 * opponent's job is to be a consistent target, not to play well.
 */
export function madeHand(hole: readonly [Card, Card], board: readonly Card[]): Made {
  if (board.length < 3) return AIR
  const cat = handRankCategoryIndex(evaluate([hole[0], hole[1], ...board]))
  let top = -1
  for (const b of board) {
    const r = rankOf(b)
    if (r > top) top = r
  }
  const h0 = rankOf(hole[0])
  const h1 = rankOf(hole[1])
  const hitsTop = h0 === top || h1 === top
  const overpair = h0 === h1 && h0 > top
  return { cat, hitsTop, overpair, strong: cat <= 6 || (cat === 7 && (hitsTop || overpair)) }
}

/**
 * Rough preflop hand value in [0, 1], monotone in the things that actually
 * matter: high cards, pairs, suitedness, connectedness. It is not a solved
 * ranking and does not need to be — it exists so that "a nit plays the top 12%"
 * is expressible as one number rather than a 169-entry table per opponent.
 */
export function preflopScore(hole: readonly [Card, Card]): number {
  const a = rankOf(hole[0])
  const b = rankOf(hole[1])
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (a === b) return 0.58 + (hi / 12) * 0.42
  let v = (hi * 2 + lo) / 48
  if (suitOf(hole[0]) === suitOf(hole[1])) v += 0.06
  v -= Math.min(0.1, Math.max(0, hi - lo - 1) * 0.02)
  if (lo >= 9) v += 0.05 // both broadway
  return Math.max(0, Math.min(1, v))
}

export interface Texture {
  /** 0 = bone dry, 1 = every draw is out there. */
  wetness: number
  paired: boolean
  /** Three or more of a suit. */
  monotone: boolean
  twoTone: boolean
  connected: boolean
  /** Highest board rank, 0 = deuce. */
  top: number
}

/** Board shape only. No hole cards enter here — that is the point of it. */
export function texture(board: readonly Card[]): Texture {
  if (board.length < 3) {
    return { wetness: 0, paired: false, monotone: false, twoTone: false, connected: false, top: 0 }
  }
  const suits = [0, 0, 0, 0]
  const ranks: number[] = []
  const rankSeen = new Set<number>()
  let paired = false
  for (const c of board) {
    suits[suitOf(c)]! += 1
    const r = rankOf(c)
    if (rankSeen.has(r)) paired = true
    rankSeen.add(r)
    ranks.push(r)
  }
  ranks.sort((x, y) => x - y)
  const maxSuit = Math.max(...suits)
  const uniq = [...rankSeen].sort((x, y) => x - y)
  // Straightiness: the tightest three-card window on the board.
  let span = 12
  for (let i = 0; i + 2 < uniq.length; i++) span = Math.min(span, uniq[i + 2]! - uniq[i]!)
  if (uniq.length < 3) span = 12
  const connected = span <= 4

  let wetness = 0
  if (maxSuit >= 3) wetness += 0.45
  else if (maxSuit === 2) wetness += 0.18
  if (connected) wetness += 0.3
  if (span <= 2) wetness += 0.1
  if (paired) wetness -= 0.2
  return {
    wetness: Math.max(0, Math.min(1, wetness)),
    paired,
    monotone: maxSuit >= 3,
    twoTone: maxSuit === 2,
    connected,
    top: ranks[ranks.length - 1]!,
  }
}
