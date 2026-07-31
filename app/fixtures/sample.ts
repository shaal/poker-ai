/**
 * Fixture data for the interface.
 *
 * Every value here is typed against the real contracts in `~core`, and the
 * money is in the engine's unit throughout — integer hundredths of a big
 * blind, so 100 = 1bb. The point is that when the live game loop is wired in,
 * nothing in the components has to change: they are already rendering the
 * shapes the engine produces.
 *
 * The scenario: heads-up, 100bb deep. You are on the button (seat 0). The AI
 * is in the big blind (seat 1). You raised, it called, you bet the K94 flop,
 * it called, and the Q turn has just come. It has led out for two thirds —
 * which is not what the baseline strategy would mostly do, and the reasoning
 * panel says why.
 */

import { cardsFromString } from '~core/engine/cards'
import { BB, START_STACK } from '~core/engine/types'
import type { ActionRecord, HandState } from '~core/engine/types'
import type { Belief, Decision } from '~core/strategy/decision'
import type { SeatView } from '~/types/ui'

const [KD, NH, FS, QC] = cardsFromString('Kd 9h 4s Qc') as [number, number, number, number]
const [AS, JD] = cardsFromString('As Jd') as [number, number]
const [KS, TH] = cardsFromString('Ks Th') as [number, number]

export const board = [KD!, NH!, FS!, QC!]

/** Pot from completed streets. The turn bet is still "committed", not pot. */
const POT_COMPLETED = 850
const AI_TURN_BET = 550

export const history: ActionRecord[] = [
  { seat: 0, street: 'preflop', type: 'raise', to: 250, potBefore: 150, paid: 200 },
  { seat: 1, street: 'preflop', type: 'call', potBefore: 350, paid: 150 },
  { seat: 1, street: 'flop', type: 'check', potBefore: 500, paid: 0 },
  { seat: 0, street: 'flop', type: 'bet', to: 175, potBefore: 500, paid: 175 },
  { seat: 1, street: 'flop', type: 'call', potBefore: 675, paid: 175 },
  { seat: 1, street: 'turn', type: 'bet', to: AI_TURN_BET, potBefore: POT_COMPLETED, paid: AI_TURN_BET },
]

export const handState: HandState = {
  street: 'turn',
  board,
  players: [
    {
      hole: [AS!, JD!],
      stack: START_STACK - 425,
      committed: 0,
      invested: 425,
      folded: false,
      allIn: false,
      actedThisStreet: false,
    },
    {
      hole: [KS!, TH!],
      stack: START_STACK - 425 - AI_TURN_BET,
      committed: AI_TURN_BET,
      invested: 425 + AI_TURN_BET,
      folded: false,
      allIn: false,
      actedThisStreet: true,
    },
  ],
  toAct: 0,
  pot: POT_COMPLETED,
  currentBet: AI_TURN_BET,
  minRaise: AI_TURN_BET,
  lastAggressor: 1,
  history,
  finished: false,
  // The river and the rest of the stub. Not shown anywhere; present so the
  // fixture is a genuinely valid HandState rather than a lookalike.
  deck: cardsFromString('7c 2h 8d 3s'),
}

/** Everything currently in the middle, including this street's bets. */
export const potDisplay =
  handState.pot + handState.players[0].committed + handState.players[1].committed

/** The human. Cards face up. */
export const heroSeat: SeatView = {
  name: 'You',
  position: 'BTN',
  stack: handState.players[0].stack,
  committed: handState.players[0].committed,
  cards: [AS!, JD!],
  folded: false,
  allIn: false,
  lastAction: 'bet 1.8bb',
}

/** The AI. Hole cards stay face down mid-hand — hatched, like every other
    thing on screen that exists and is not yet known. */
export const aiSeat: SeatView = {
  name: 'Opponent',
  position: 'BB',
  stack: handState.players[1].stack,
  committed: handState.players[1].committed,
  cards: [null, null],
  folded: false,
  allIn: false,
  lastAction: 'bet 5.5bb',
}

/** Same seat, cards up. Used in the gallery to show the showdown state. */
export const aiSeatRevealed: SeatView = {
  ...aiSeat,
  cards: [KS!, TH!],
  lastAction: 'shows top pair',
}

export const aiSeatFolded: SeatView = {
  ...aiSeat,
  cards: [null, null],
  folded: true,
  committed: 0,
  lastAction: 'folded',
}

// ------------------------------------------------------------------ beliefs

export const beliefs: Belief[] = [
  {
    key: 'fold-to-turn-barrel',
    label: 'folds to turn barrels',
    prior: 0.42,
    observed: 0.79,
    posterior: 0.63,
    observations: 14,
    confidence: 0.58,
    direction: 'above',
    sentence:
      "You fold to turn barrels more than most players — I'm about 58% sure of that, from 14 spots.",
  },
  {
    key: 'vpip',
    label: 'hands played',
    prior: 0.46,
    observed: 0.52,
    posterior: 0.5,
    observations: 118,
    confidence: 0.79,
    direction: 'above',
    sentence:
      'You play more hands than most people do heads-up. That one I am fairly sure of, from 118 hands.',
  },
  {
    key: 'three-bet',
    label: 'three-bets preflop',
    prior: 0.09,
    observed: 0.04,
    posterior: 0.07,
    observations: 31,
    confidence: 0.44,
    direction: 'below',
    sentence:
      "You three-bet less often than most players — I'm about 44% sure of that, from 31 chances.",
  },
  {
    key: 'fold-to-flop-cbet',
    label: 'folds to flop c-bets',
    prior: 0.55,
    observed: 0.33,
    posterior: 0.52,
    observations: 3,
    confidence: 0.13,
    direction: 'typical',
    sentence:
      'You might continue against flop c-bets more than average, but three spots is close to nothing, so I am still mostly using the population number.',
  },
  {
    key: 'wtsd',
    label: 'goes to showdown',
    prior: 0.31,
    observed: null,
    posterior: 0.31,
    observations: 0,
    confidence: 0,
    direction: 'typical',
    sentence:
      'I have not seen you reach a showdown yet, so I am assuming you get there about as often as anyone else.',
  },
]

/** Only the reads that moved the current decision. */
export const beliefsUsed: Belief[] = [beliefs[0]!, beliefs[2]!]

export const beliefsSettled: Belief[] = [beliefs[1]!, beliefs[0]!]
export const beliefsProvisional: Belief[] = [beliefs[3]!, beliefs[4]!]
export const beliefsEmpty: Belief[] = []

// ----------------------------------------------------------------- decision

/**
 * The AI's turn decision. The baseline mostly checks this back; the read on
 * your turn folding moves a chunk of that into a two-thirds bet. That gap is
 * the whole argument of the product, so the fixture makes it a visible one.
 */
export const decision: Decision = {
  action: { type: 'bet', to: AI_TURN_BET },
  policy: [
    { action: { type: 'bet', to: AI_TURN_BET }, prob: 0.62, label: 'bet 66% pot' },
    { action: { type: 'check' }, prob: 0.31, label: 'check' },
    { action: { type: 'bet', to: 850 }, prob: 0.07, label: 'bet pot' },
  ],
  baseline: [
    { action: { type: 'bet', to: AI_TURN_BET }, prob: 0.44, label: 'bet 66% pot' },
    { action: { type: 'check' }, prob: 0.52, label: 'check' },
    { action: { type: 'bet', to: 850 }, prob: 0.04, label: 'bet pot' },
  ],
  exploitShift: 0.21,
  reading: {
    label: 'top pair, gutshot to Broadway',
    equityVsRange: 0.683,
    equityCi95: 0.021,
    percentileInOwnRange: 0.78,
    aheadOfRange: 0.71,
    rangeAdvantage: 0.084,
    villainCombos: 214,
  },
  reasons: [
    {
      key: 'range advantage',
      text: 'the queen improves my range far more often than it improves yours',
      weightBB: 0.62,
    },
    {
      key: 'turn fold read',
      text: 'you have folded the turn in eleven of the last fourteen spots like this',
      weightBB: 0.41,
    },
    {
      key: 'equity denial',
      text: 'checking gives two overcards and a gutshot a free river',
      weightBB: 0.23,
    },
    {
      key: 'sizing',
      text: 'two thirds keeps worse kings in and still charges the draws',
      weightBB: 0.09,
    },
  ],
  beliefsUsed,
  source: 'postflop-policy',
  street: 'turn',
  seat: 1,
  potBB: POT_COMPLETED / BB,
  toCallBB: 0,
  spr: 10.6,
  computeMs: 34,
}

/** The honest common case: the read exists but has not earned a deviation. */
export const decisionNoShift: Decision = {
  action: { type: 'raise', to: 250 },
  policy: [
    { action: { type: 'raise', to: 250 }, prob: 0.82, label: 'raise to 2.5bb' },
    { action: { type: 'fold' }, prob: 0.18, label: 'fold' },
  ],
  baseline: [
    { action: { type: 'raise', to: 250 }, prob: 0.82, label: 'raise to 2.5bb' },
    { action: { type: 'fold' }, prob: 0.18, label: 'fold' },
  ],
  exploitShift: 0,
  reading: {
    label: 'K-ten suited',
    equityVsRange: 0.541,
    equityCi95: 0.008,
    percentileInOwnRange: 0.62,
    aheadOfRange: 0.55,
    rangeAdvantage: 0.011,
    villainCombos: 1326,
  },
  reasons: [
    { key: 'chart', text: 'this is a standard button open at 100bb', weightBB: 0.34 },
    { key: 'no read yet', text: 'nothing I know about you changes a preflop open this wide' },
  ],
  beliefsUsed: [],
  source: 'preflop-chart',
  street: 'preflop',
  seat: 1,
  potBB: 1.5,
  toCallBB: 1,
  spr: 66.7,
  computeMs: 2,
}

/** No solved entry for the spot. The panel says so rather than dressing it up. */
export const decisionFallback: Decision = {
  action: { type: 'check' },
  policy: [
    { action: { type: 'check' }, prob: 0.7, label: 'check' },
    { action: { type: 'bet', to: 300 }, prob: 0.3, label: 'bet 33% pot' },
  ],
  baseline: [
    { action: { type: 'check' }, prob: 0.7, label: 'check' },
    { action: { type: 'bet', to: 300 }, prob: 0.3, label: 'bet 33% pot' },
  ],
  exploitShift: 0,
  reading: {
    label: 'ace high, no draw',
    equityVsRange: 0.38,
    equityCi95: 0.061,
    percentileInOwnRange: 0.34,
    aheadOfRange: 0.36,
    rangeAdvantage: -0.042,
    villainCombos: 388,
  },
  reasons: [
    {
      key: 'no policy',
      text: 'this river node is not in the solved set, so this is a heuristic and not a strategy',
    },
  ],
  beliefsUsed: [],
  source: 'fallback',
  street: 'river',
  seat: 1,
  potBB: 18.4,
  toCallBB: 0,
  spr: 3.1,
  computeMs: 1,
}

// ----------------------------------------------------------------- variance

/**
 * 80 hands. At sigma ~ 90bb/100 the 95% interval half-width is
 * 1.96 * 90 / sqrt(80/100) ~ 197bb/100, which is the arithmetic ADR-010 exists
 * to put on screen.
 */
export const variance = {
  hands: 80,
  bb100: -12.4,
  ci95: 197.3,
  allIn: { street: 'turn' as const, equity: 0.82, evBB: 41.2, actualBB: -46 },
}

/** The same panel after a long stretch, and after a win from behind. */
export const varianceLongRun = {
  hands: 24800,
  bb100: 6.8,
  ci95: 11.2,
  allIn: { street: 'river' as const, equity: 0.18, evBB: -32.8, actualBB: 46 },
}

export const varianceNoAllIn = {
  hands: 340,
  bb100: 3.1,
  ci95: 95.8,
  allIn: null,
}

// ------------------------------------------------------------------ betting

/** What the controls need, in engine units. */
export const betting = {
  potChips: potDisplay,
  toCallChips: AI_TURN_BET,
  stackChips: handState.players[0].stack,
  committedChips: handState.players[0].committed,
  minRaiseToChips: AI_TURN_BET * 2,
  maxToChips: Math.min(
    handState.players[0].stack,
    handState.players[1].stack + AI_TURN_BET,
  ),
}
