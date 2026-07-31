/**
 * Leduc hold'em. Six cards (J, Q, K in two suits), one chip ante each, two
 * betting rounds, one public card. Bets are 2 in the first round and 4 in the
 * second, capped at two per round. 288 information sets.
 *
 * The step up from Kuhn that matters: a public card, so an information set is
 * (own rank, public rank, betting so far) and the second round has to remember
 * how the first one went. Suits are dealt but never named — they exist only so
 * that pairing the board is possible.
 *
 * Decision histories per round: '', 'x', 'b', 'xb', 'br', 'xbr' — six of them.
 * Rounds that reach the second street: 'xx', 'bc', 'brc', 'xbc', 'xbrc' — five.
 * So 3 x 6 = 18 first-round sets, plus 3 x 3 x 5 x 6 = 270 second-round sets.
 *
 * Showdown: pairing the public card beats everything, otherwise the higher
 * private card wins, equal ranks split.
 */

import type { Game } from '../game'

const RANKS = 'JQK'
const BET = [2, 4] as const
const MAX_BETS = 2

export interface LeducState {
  /** Private cards 0..5, rank = card >> 1. [-1, -1] before the deal. */
  cards: [number, number]
  /** Public card 0..5, -1 until the second round is dealt. */
  board: number
  round: 0 | 1
  /** Completed first-round betting, kept because the second round's key needs it. */
  first: string
  /** Betting in the current round. */
  history: string
  /** Chips in from each player, ante included. */
  contrib: [number, number]
}

const DEALS: { next: LeducState; prob: number }[] = []
for (let a = 0; a < 6; a++) {
  for (let b = 0; b < 6; b++) {
    if (a === b) continue
    DEALS.push({
      next: { cards: [a, b], board: -1, round: 0, first: '', history: '', contrib: [1, 1] },
      prob: 1 / 30,
    })
  }
}

const folded = (h: string): boolean => h.endsWith('f')

/** A round closes on a fold, on a call, or on both players checking. */
const roundOver = (h: string): boolean => h === 'xx' || h.endsWith('f') || h.endsWith('c')

const facingBet = (h: string): boolean => h.endsWith('b') || h.endsWith('r')

const betsMade = (h: string): number => {
  let n = 0
  for (const c of h) if (c === 'b' || c === 'r') n++
  return n
}

export const leduc: Game<LeducState> = {
  root: () => ({ cards: [-1, -1], board: -1, round: 0, first: '', history: '', contrib: [1, 1] }),

  isChance: (s) => s.cards[0] < 0 || (s.round === 1 && s.board < 0),

  chanceOutcomes: (s) => {
    if (s.cards[0] < 0) return DEALS
    const out: { next: LeducState; prob: number }[] = []
    for (let c = 0; c < 6; c++) {
      if (c === s.cards[0] || c === s.cards[1]) continue
      out.push({ next: { ...s, board: c }, prob: 1 / 4 })
    }
    return out
  },

  // A fold ends the hand anywhere; a completed second round is a showdown. A
  // completed first round is neither: `next` has already rolled it forward into
  // the public-card chance node.
  isTerminal: (s) => folded(s.history) || (s.round === 1 && roundOver(s.history)),

  // Player 0 opens both rounds, so parity of the current round's history is the
  // seat to act.
  currentPlayer: (s) => (s.history.length % 2) as 0 | 1,

  actions: (s) => {
    if (!facingBet(s.history)) return ['x', 'b']
    return betsMade(s.history) < MAX_BETS ? ['f', 'c', 'r'] : ['f', 'c']
  },

  infoSetKey: (s) => {
    const me = s.history.length % 2
    const mine = RANKS[s.cards[me]! >> 1]!
    if (s.round === 0) return `${mine}|${s.history}`
    return `${mine}${RANKS[s.board >> 1]!}|${s.first}|${s.history}`
  },

  next: (s, action) => {
    const me = s.history.length % 2
    const opp = 1 - me
    const contrib: [number, number] = [s.contrib[0], s.contrib[1]]
    if (action === 'c') contrib[me] = contrib[opp]!
    // A bet and a raise are the same move in fixed limit: match, then add one
    // more bet on top.
    else if (action === 'b' || action === 'r') contrib[me] = contrib[opp]! + BET[s.round]

    const history = s.history + action
    if (s.round === 0 && roundOver(history) && !folded(history)) {
      return { cards: s.cards, board: -1, round: 1, first: history, history: '', contrib }
    }
    return { ...s, history, contrib }
  },

  utility: (s) => {
    if (folded(s.history)) {
      // The folder acted last, and loses exactly what they had already put in.
      const folder = (s.history.length - 1) % 2
      return folder === 0 ? -s.contrib[0] : s.contrib[1]
    }
    // Contributions are equal at a showdown, so the winner takes the loser's.
    const board = s.board >> 1
    const score = (p: 0 | 1): number => {
      const r = s.cards[p]! >> 1
      return r === board ? r + 3 : r
    }
    const a = score(0)
    const b = score(1)
    if (a > b) return s.contrib[1]
    if (a < b) return -s.contrib[0]
    return 0
  },
}
