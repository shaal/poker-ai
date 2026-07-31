/**
 * HELD OUT suite — the suite that decides whether a change ships.
 *
 * ============================ THE FREEZE RULE ============================
 * Every constant in this file is FROZEN. Do not edit a threshold, a size, a
 * mixing weight or a range in this file because a held-out row came back
 * looking bad. Doing that converts the opponent into a familiar one and spends
 * it permanently — ADR-009 rule 1, and the exact mistake that shipped a
 * regression in the sibling project.
 *
 * Do not add an opponent here in the same change that needs it (rule 2).
 * New held-out opponents are written cold, before the strategy that will face
 * them, and only ever added.
 * ========================================================================
 *
 * Rule 3 shaped the contents. The AI will track fold-to-c-bet, VPIP, 3-bet% and
 * aggression frequency, so an opponent whose defining trait is "folds to 70% of
 * c-bets" would be a mirror of the model, not a test of it. Every opponent below
 * is keyed to something the model does not measure:
 *
 *   boardTextureReactive — acts off the SHAPE of the board, not off frequencies
 *   stackDepthShover     — behaviour keyed to SPR, which cuts across every street
 *   tiltAfterLoss        — state carried from the PREVIOUS hand's result
 *   positionBlind        — a structural blind spot: position never enters
 *   sizingTell           — bet SIZE correlates with strength; frequencies do not
 *
 * A frequency-tracking model can measure all five of these for a thousand hands
 * and still be reading the wrong variable.
 */

import type { Rng } from '../../engine/cards'
import { spr, type Policy } from '../../engine/holdem'
import { BB, type HandState, type Seat } from '../../engine/types'
import type { Opponent } from '../types'
import {
  aggro,
  doCall,
  doCheck,
  doFold,
  madeHand,
  owed,
  potBet,
  preflopScore,
  price,
  shove,
  texture,
} from './helpers'

/**
 * Plays the board, not the hand.
 *
 * Its aggression is a function of board texture: it barrels dry boards because
 * "nobody hit that" and shuts down on wet ones. Its continuing range is set by
 * texture too, so the same holding is a call on one flop and a fold on another
 * with identical action. Preflop it has no board to read, so it plays a fixed
 * price rule and gets going on the flop.
 */
export function boardTextureReactive(rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      if (c <= 0) return doCheck(s)
      return c <= 3 * BB && preflopScore(me.hole) >= 0.3 ? doCall(s) : doFold(s)
    }

    const t = texture(s.board)
    const m = madeHand(me.hole, s.board)
    if (c <= 0) {
      if (t.wetness < 0.3) return aggro(s, potBet(s, seat, 0.8)) // dry: attack
      if (t.wetness < 0.6) return rng.float() < 0.5 ? aggro(s, potBet(s, seat, 0.4)) : doCheck(s)
      return doCheck(s) // wet: refuses to build a pot
    }
    // Facing a bet, texture sets the bar rather than the price does.
    if (t.wetness >= 0.6) return m.cat <= 7 ? doCall(s) : doFold(s)
    if (t.paired) return m.strong || price(s, seat) < 0.3 ? doCall(s) : doFold(s)
    return m.cat <= 7 || price(s, seat) < 0.35 ? doCall(s) : doFold(s)
  }
}

/**
 * Everything is stack-to-pot ratio.
 *
 * Below an SPR of about 1.5 it treats the hand as already committed and shoves;
 * in the middle it bets pot; deep it refuses to play a big pot at all. The
 * hand only breaks ties. This is orthogonal to street-indexed frequency stats
 * because the same SPR arises on the flop of a raised pot and the river of a
 * limped one.
 */
export function stackDepthShover(_rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    const r = spr(s)
    const v = s.street === 'preflop' ? preflopScore(me.hole) : 0
    const m = madeHand(me.hole, s.board)
    const playable = s.street === 'preflop' ? v >= 0.42 : m.cat <= 7

    if (r <= 1.5) {
      // Committed: the pot is already worth more than what is behind.
      if (playable) return shove(s)
      return c <= 0 ? doCheck(s) : doFold(s)
    }
    if (r <= 4) {
      if (playable) return aggro(s, potBet(s, seat, 1.0))
      return c <= 0 ? doCheck(s) : doFold(s)
    }
    // Deep: small pots only, whatever it holds.
    if (c <= 0) return playable && s.street !== 'preflop' ? aggro(s, potBet(s, seat, 0.25)) : doCheck(s)
    return price(s, seat) <= 0.25 && playable ? doCall(s) : doFold(s)
  }
}

export interface TiltMemory {
  /** 0 = composed, 3 = fully gone. */
  tilt: number
  handsSeen: number
}

/**
 * Its state is the previous hand's result, which is a variable no per-hand
 * statistic contains. A model that averages this opponent over a session sees a
 * blurred mixture of two completely different players and reads it as "loose
 * aggressive, sometimes".
 *
 * The bench does not tell a policy when a hand ended, so the boundary is
 * detected here: `act` mutates one HandState object per hand, so the first call
 * with a different object means the previous one is finished and its `.result`
 * is readable.
 */
export function tiltAfterLoss(
  rng: Rng,
  memory: TiltMemory = { tilt: 0, handsSeen: 0 },
): Policy {
  let last: HandState | null = null
  let lastSeat: Seat = 0

  return (s, seat) => {
    if (s !== last) {
      if (last?.result) {
        const d = last.result.delta[lastSeat]
        if (d <= -3 * BB) memory.tilt = Math.min(3, memory.tilt + 1)
        else if (d > 0) memory.tilt = 0
      }
      last = s
      lastSeat = seat
      memory.handsSeen++
    }

    const me = s.players[seat]
    const c = owed(s, seat)
    const t = memory.tilt

    if (t === 0) {
      // Composed: tight and straightforward.
      if (s.street === 'preflop') {
        const v = preflopScore(me.hole)
        if (v >= 0.72) return aggro(s, potBet(s, seat, 0.7))
        if (v >= 0.52) return c > 0 ? (c <= 3 * BB ? doCall(s) : doFold(s)) : doCheck(s)
        return c > 0 ? doFold(s) : doCheck(s)
      }
      const m = madeHand(me.hole, s.board)
      if (c <= 0) return m.strong ? aggro(s, potBet(s, seat, 0.6)) : doCheck(s)
      return m.strong ? doCall(s) : doFold(s)
    }

    // On tilt. Aggression scales with how badly the last hand went.
    const heat = 0.3 + t * 0.2
    if (rng.float() < heat) return aggro(s, potBet(s, seat, 0.9 + t * 0.2))
    if (c <= 0) return doCheck(s)
    return c <= me.stack * (0.3 + t * 0.2) ? doCall(s) : doFold(s)
  }
}

/**
 * Position never enters. It plays the same range from the button and the big
 * blind, and it bets the same way whether it acts first or last.
 *
 * This is a structural blind spot rather than a frequency, and it is the one
 * held-out opponent whose leak is invisible to any aggregate statistic that is
 * not split by seat — which is exactly the split a model tracking global VPIP
 * and aggression frequency does not make.
 */
export function positionBlind(_rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      const v = preflopScore(me.hole)
      if (v >= 0.68) return aggro(s, potBet(s, seat, 0.7))
      if (v >= 0.44) return c > 0 ? (c <= 3 * BB ? doCall(s) : doFold(s)) : aggro(s, potBet(s, seat, 0.5))
      return c > 0 ? doFold(s) : doCheck(s)
    }
    const m = madeHand(me.hole, s.board)
    if (m.cat <= 6) return c > 0 ? aggro(s, potBet(s, seat, 0.75)) : aggro(s, potBet(s, seat, 0.6))
    if (m.cat === 7) return c > 0 ? doCall(s) : aggro(s, potBet(s, seat, 0.5))
    return c > 0 ? doFold(s) : doCheck(s)
  }
}

/**
 * Its bet size is a tell: weak bets small, strong bets big, and it does this
 * consistently on every street. An opponent model that only counts how often it
 * bets learns nothing at all; one that conditions on size beats it immediately.
 *
 * Included because "the AI never looks at sizing" is a plausible blind spot and
 * this is the row that would expose it.
 */
export function sizingTell(_rng: Rng): Policy {
  return (s, seat) => {
    const me = s.players[seat]
    const c = owed(s, seat)
    if (s.street === 'preflop') {
      const v = preflopScore(me.hole)
      if (v >= 0.78) return aggro(s, potBet(s, seat, 1.1)) // monster: oversized
      if (v >= 0.6) return aggro(s, potBet(s, seat, 0.6))
      if (v >= 0.42) return c > 0 ? (c <= 2 * BB ? doCall(s) : doFold(s)) : aggro(s, potBet(s, seat, 0.2))
      return c > 0 ? doFold(s) : doCheck(s)
    }
    const m = madeHand(me.hole, s.board)
    if (c <= 0) {
      if (m.cat <= 5) return aggro(s, potBet(s, seat, 1.1))
      if (m.strong) return aggro(s, potBet(s, seat, 0.6))
      if (m.cat === 7) return aggro(s, potBet(s, seat, 0.3))
      return doCheck(s)
    }
    if (m.cat <= 5) return aggro(s, potBet(s, seat, 1.1))
    if (m.strong) return doCall(s)
    return price(s, seat) < 0.25 && m.cat === 7 ? doCall(s) : doFold(s)
  }
}

export const HELD_OUT: readonly Opponent[] = [
  { name: 'boardTextureReactive', make: boardTextureReactive },
  { name: 'stackDepthShover', make: stackDepthShover },
  { name: 'tiltAfterLoss', make: (rng) => tiltAfterLoss(rng) },
  { name: 'positionBlind', make: positionBlind },
  { name: 'sizingTell', make: sizingTell },
]
