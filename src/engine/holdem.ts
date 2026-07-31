/**
 * Heads-up No-Limit Hold'em rules, as pure functions. No interface attached,
 * no randomness except what is handed in. ADR-001 fixes the format: two
 * players, cash, 100bb, seat 0 is the button and the small blind.
 *
 * Position, which is the rule people get wrong: in heads-up the button posts
 * the SMALL blind and acts FIRST preflop, then acts LAST on every later street.
 */

import { type Card, freshDeck, type Rng, shuffle } from './cards'
import { equity, evaluate } from './evaluator'
import {
  type ActionRecord,
  BB,
  BIG_BLIND,
  BUTTON,
  type HandState,
  type LegalAction,
  type PlayerState,
  SB,
  type Seat,
  START_STACK,
  type Street,
  type Action,
} from './types'

export function other(seat: Seat): Seat {
  return (1 - seat) as Seat
}

export interface DealOptions {
  stacks?: [number, number]
  /** Supply a fixed deck to replay a hand — this is how duplicate bench hands work. */
  deck?: Card[]
}

export function deal(rng: Rng, opts: DealOptions = {}): HandState {
  const deck = opts.deck ? opts.deck.slice() : shuffle(freshDeck(), rng)
  const stacks = opts.stacks ?? [START_STACK, START_STACK]

  const mk = (hole: readonly [Card, Card], stack: number, blind: number): PlayerState => ({
    hole,
    stack: stack - blind,
    committed: blind,
    invested: blind,
    folded: false,
    allIn: stack - blind === 0,
    actedThisStreet: false,
  })

  // Deal alternating, button first, as at a real table. It changes nothing
  // statistically and costs nothing to get right.
  const players: [PlayerState, PlayerState] = [
    mk([deck[0]!, deck[2]!], stacks[0], Math.min(SB, stacks[0])),
    mk([deck[1]!, deck[3]!], stacks[1], Math.min(BB, stacks[1])),
  ]

  return {
    street: 'preflop',
    board: [],
    players,
    toAct: BUTTON, // heads-up: the button acts first preflop
    pot: 0,
    currentBet: Math.min(BB, stacks[1]),
    minRaise: BB,
    lastAggressor: null,
    history: [],
    finished: false,
    deck: deck.slice(4),
  }
}

export function legalActions(s: HandState): LegalAction[] {
  if (s.finished) return []
  const me = s.players[s.toAct]
  const them = s.players[other(s.toAct)]
  const toCall = s.currentBet - me.committed
  const out: LegalAction[] = []

  if (toCall > 0) {
    out.push({ type: 'fold' })
    out.push({ type: 'call' })
  } else {
    out.push({ type: 'check' })
  }

  // You can only put more in if you have chips left AND the opponent has chips
  // left to call with. Betting into a player who is already all-in is not a
  // thing, and forgetting that silently inflates the pot.
  const opponentCanCover = them.stack > 0
  const maxTo = me.committed + me.stack
  if (me.stack > 0 && opponentCanCover && maxTo > s.currentBet) {
    const minTo = Math.min(maxTo, s.currentBet + s.minRaise)
    // Classified by whether a bet is already live on this street, NOT by
    // whether it costs us anything to continue. After a limp the big blind
    // faces nothing to call, but the blind is a live bet, so putting more in is
    // a RAISE. Opponent modelling counts raises; calling that a bet would
    // quietly under-report preflop aggression for the seat that shows it most.
    out.push({ type: s.currentBet > 0 ? 'raise' : 'bet', min: minTo, max: maxTo })
  }

  return out
}

export function isLegal(s: HandState, a: Action): boolean {
  const legals = legalActions(s)
  const match = legals.find((l) => l.type === a.type)
  if (!match) return false
  if (a.type === 'bet' || a.type === 'raise') {
    if (a.to === undefined) return false
    // An all-in for less than a full raise is always legal.
    const maxTo = s.players[s.toAct].committed + s.players[s.toAct].stack
    if (a.to === maxTo) return a.to > s.currentBet
    return a.to >= (match.min ?? 0) && a.to <= (match.max ?? 0)
  }
  return true
}

/**
 * Apply an action. Mutates and returns `s` — hands are played in tight loops in
 * the bench and cloning per action was measurably the hot spot.
 */
export function act(s: HandState, a: Action): HandState {
  if (s.finished) throw new Error('hand is over')
  if (!isLegal(s, a)) {
    throw new Error(`illegal action ${a.type}${a.to !== undefined ? ' to ' + a.to : ''} on ${s.street}`)
  }

  const seat = s.toAct
  const me = s.players[seat]
  const potBefore = totalPot(s)
  let paid = 0

  switch (a.type) {
    case 'fold':
      me.folded = true
      break
    case 'check':
      break
    case 'call': {
      paid = Math.min(s.currentBet - me.committed, me.stack)
      me.stack -= paid
      me.committed += paid
      me.invested += paid
      if (me.stack === 0) me.allIn = true
      break
    }
    case 'bet':
    case 'raise': {
      const to = a.to!
      paid = to - me.committed
      const increment = to - s.currentBet
      // A raise only reopens the betting if it is a full legal raise. An all-in
      // for less does not, which matters when the third action comes back round.
      if (increment >= s.minRaise) s.minRaise = increment
      me.stack -= paid
      me.committed = to
      me.invested += paid
      s.currentBet = to
      s.lastAggressor = seat
      if (me.stack === 0) me.allIn = true
      // A raise reopens action for the opponent.
      s.players[other(seat)].actedThisStreet = false
      break
    }
  }

  me.actedThisStreet = true
  const rec: ActionRecord = { ...a, seat, street: s.street, potBefore, paid }
  s.history.push(rec)

  if (me.folded) {
    finishByFold(s, other(seat))
    return s
  }

  if (streetComplete(s)) advanceStreet(s)
  else s.toAct = other(seat)

  return s
}

function streetComplete(s: HandState): boolean {
  const [p0, p1] = s.players
  if (p0.folded || p1.folded) return true
  // If both are all-in (or one is all-in and the other has matched), nothing
  // further can be wagered.
  const level = p0.committed === p1.committed
  const bothActed = p0.actedThisStreet && p1.actedThisStreet
  if (level && bothActed) return true
  // Someone all-in for less than the current bet: the other has already had the
  // chance to match, so the street is over once they have acted.
  if ((p0.allIn || p1.allIn) && bothActed) return true
  if (p0.allIn && p1.allIn) return true
  return false
}

function collect(s: HandState) {
  s.pot += s.players[0].committed + s.players[1].committed
  s.players[0].committed = 0
  s.players[1].committed = 0
  s.players[0].actedThisStreet = false
  s.players[1].actedThisStreet = false
  s.currentBet = 0
  s.minRaise = BB
}

const NEXT: Record<Street, Street> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
  showdown: 'showdown',
}

const CARDS_FOR: Record<Street, number> = {
  preflop: 0,
  flop: 3,
  turn: 1,
  river: 1,
  showdown: 0,
}

function advanceStreet(s: HandState) {
  collect(s)

  // If neither player can act again, run the board out and go to showdown.
  const noMoreBetting = s.players[0].allIn || s.players[1].allIn

  let next = NEXT[s.street]
  while (next !== 'showdown') {
    s.street = next
    for (let i = 0; i < CARDS_FOR[next]; i++) s.board.push(s.deck.shift()!)
    if (!noMoreBetting) {
      // Postflop the big blind acts first — the button keeps position.
      s.toAct = BIG_BLIND
      if (s.players[s.toAct].allIn || s.players[s.toAct].folded) s.toAct = other(s.toAct)
      return
    }
    next = NEXT[next]
  }

  s.street = 'showdown'
  finishByShowdown(s)
}

function finishByFold(s: HandState, winner: Seat) {
  collect(s)
  const loser = other(winner)
  const delta: [number, number] = [0, 0]
  delta[winner] = s.players[loser].invested
  delta[loser] = -s.players[loser].invested
  // The winner's own uncalled money comes straight back, so their delta is
  // simply what the loser put in.
  s.finished = true
  s.result = { delta, winner, showdown: false, board: s.board.slice() }
}

function finishByShowdown(s: HandState) {
  const [p0, p1] = s.players
  // In heads-up there are no side pots, only an uncalled remainder to return.
  const matched = Math.min(p0.invested, p1.invested)
  const r0 = evaluate([...p0.hole, ...s.board])
  const r1 = evaluate([...p1.hole, ...s.board])

  const delta: [number, number] = [0, 0]
  let winner: Seat | null = null
  if (r0 < r1) {
    winner = 0
    delta[0] = matched
    delta[1] = -matched
  } else if (r1 < r0) {
    winner = 1
    delta[0] = -matched
    delta[1] = matched
  }
  s.finished = true
  s.result = { delta, winner, showdown: true, board: s.board.slice() }
}

export function totalPot(s: HandState): number {
  return s.pot + s.players[0].committed + s.players[1].committed
}

/** What it costs the player to act to call, in chips. */
export function toCall(s: HandState, seat: Seat = s.toAct): number {
  return Math.max(0, Math.min(s.currentBet - s.players[seat].committed, s.players[seat].stack))
}

/** Pot odds as the fraction of the final pot the caller must contribute. */
export function potOdds(s: HandState, seat: Seat = s.toAct): number {
  const c = toCall(s, seat)
  if (c === 0) return 0
  return c / (totalPot(s) + c)
}

/** Effective stack: the most that can actually be wagered by either player. */
export function effectiveStack(s: HandState): number {
  return Math.min(
    s.players[0].stack + s.players[0].committed,
    s.players[1].stack + s.players[1].committed,
  )
}

/** Stack-to-pot ratio, the main driver of postflop strategy. */
export function spr(s: HandState): number {
  const pot = totalPot(s)
  if (pot === 0) return Infinity
  return Math.min(s.players[0].stack, s.players[1].stack) / pot
}

/**
 * When both players are all-in before the river, the chips are settled by the
 * cards but the DECISION should be judged by the equity at the moment the money
 * went in. ADR-010 requires both numbers, so we compute both.
 */
export function allInEquity(s: HandState, rng: Rng, trials = 20_000): [number, number] {
  const e = equity(s.players[0].hole, s.players[1].hole, s.board, trials, rng)
  return [e.equity, 1 - e.equity]
}

/** Play a hand to completion with two policies. Returns the finished state. */
export type Policy = (s: HandState, seat: Seat) => Action

export function playHand(
  rng: Rng,
  policies: [Policy, Policy],
  opts: DealOptions = {},
): HandState {
  const s = deal(rng, opts)
  let guard = 0
  while (!s.finished) {
    if (++guard > 400) throw new Error('betting did not terminate')
    const seat = s.toAct
    const a = policies[seat](s, seat)
    act(s, a)
  }
  return s
}
