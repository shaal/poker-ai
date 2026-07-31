/**
 * Kuhn poker. Three cards (J, Q, K), one chip ante each, one bet of size 1.
 * 12 information sets.
 *
 * It is here because it is the only poker game in this repository with a known
 * closed-form answer: the first player's game value at equilibrium is exactly
 * -1/18. ADR-007 makes that the sanctioned correctness check for any CFR code
 * written here, and `tests/solver.test.ts` is the gate.
 *
 * Betting histories, in full:
 *   xx    both check, showdown for 1
 *   xbf   check, bet, fold      player 0 loses 1
 *   xbc   check, bet, call      showdown for 2
 *   bf    bet, fold             player 0 wins 1
 *   bc    bet, call             showdown for 2
 */

import type { Game } from '../game'

const RANKS = 'JQK'

export interface KuhnState {
  /** Private card per player, 0 = J, 1 = Q, 2 = K. [-1, -1] before the deal. */
  cards: [number, number]
  history: string
}

const DEALS: { next: KuhnState; prob: number }[] = []
for (let a = 0; a < 3; a++) {
  for (let b = 0; b < 3; b++) {
    if (a === b) continue
    DEALS.push({ next: { cards: [a, b], history: '' }, prob: 1 / 6 })
  }
}

const facingBet = (history: string): boolean => history.endsWith('b')

export const kuhn: Game<KuhnState> = {
  root: () => ({ cards: [-1, -1], history: '' }),

  isChance: (s) => s.cards[0] < 0,

  chanceOutcomes: () => DEALS,

  // The four decision histories are '', 'x', 'b' and 'xb'; everything else ends
  // the hand.
  isTerminal: (s) =>
    s.cards[0] >= 0 && (s.history === 'xx' || s.history.endsWith('f') || s.history.endsWith('c')),

  // Play alternates from player 0, so parity of the history is the seat.
  currentPlayer: (s) => (s.history.length % 2) as 0 | 1,

  actions: (s) => (facingBet(s.history) ? ['f', 'c'] : ['x', 'b']),

  infoSetKey: (s) => `${RANKS[s.cards[s.history.length % 2]!]!}|${s.history}`,

  next: (s, action) => ({ cards: s.cards, history: s.history + action }),

  utility: (s) => {
    const h = s.history
    if (h.endsWith('f')) {
      // The folder is whoever acted last. 'bf' loses player 1 the ante, 'xbf'
      // loses player 0 the ante.
      return (h.length - 1) % 2 === 0 ? -1 : 1
    }
    const stake = h === 'xx' ? 1 : 2
    return s.cards[0]! > s.cards[1]! ? stake : -stake
  },
}
