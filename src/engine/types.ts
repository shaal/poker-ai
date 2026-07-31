import type { Card } from './cards'

/**
 * All money is in integer hundredths of a big blind, so 100 = 1 bb. Poker
 * arithmetic with floats produces pots that do not balance, and a pot that does
 * not balance is indistinguishable from a strategy bug three layers up.
 */
export const BB = 100
export const SB = 50
export const START_STACK = 100 * BB // ADR-001: fixed 100bb

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export const STREETS: readonly Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

/** Seat 0 is the button, which in heads-up is also the small blind. */
export type Seat = 0 | 1
export const BUTTON: Seat = 0
export const BIG_BLIND: Seat = 1

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface Action {
  type: ActionType
  /**
   * For bet/raise: the TOTAL this player will have committed on this street
   * once the action is made ("raise to"), not the increment. Increments are the
   * classic source of off-by-one-blind bugs.
   */
  to?: number
}

export interface ActionRecord extends Action {
  seat: Seat
  street: Street
  /** Pot size before the action, for post-hoc sizing analysis. */
  potBefore: number
  /** What it actually cost the player to make this action. */
  paid: number
}

export interface PlayerState {
  hole: readonly [Card, Card]
  stack: number
  /** Committed on the current street. */
  committed: number
  /** Committed across the whole hand. */
  invested: number
  folded: boolean
  allIn: boolean
  actedThisStreet: boolean
}

export interface HandResult {
  /** Chip delta for each seat, net of what they put in. Sums to zero. */
  delta: [number, number]
  /** Seat that won, or null for a chop. */
  winner: Seat | null
  showdown: boolean
  /** Final board, however far it got. */
  board: readonly Card[]
  /** Set when the hand ended with money in and cards still to come. */
  allInEquity?: [number, number]
}

export interface HandState {
  street: Street
  board: Card[]
  players: [PlayerState, PlayerState]
  toAct: Seat
  /** Chips collected from completed streets. */
  pot: number
  /** Highest committed-this-street. */
  currentBet: number
  /** Minimum legal raise increment. */
  minRaise: number
  lastAggressor: Seat | null
  history: ActionRecord[]
  finished: boolean
  result?: HandResult
  /** Undealt cards, in the order they will come out. */
  deck: Card[]
}

export interface LegalAction {
  type: ActionType
  /** Present for bet/raise. */
  min?: number
  max?: number
}
