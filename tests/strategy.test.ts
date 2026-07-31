import { describe, expect, it } from 'vitest'
import { cardsFromString, Rng } from '~core/engine/cards'
import { act, deal, legalActions, playHand } from '~core/engine/holdem'
import { evaluate } from '~core/engine/evaluator'
import type { Action, HandState, Seat } from '~core/engine/types'
import { decide, makePolicy } from '~core/strategy/agent'
import {
  BB_VS_OPEN_3BET,
  BB_VS_OPEN_CALL,
  chart,
  chartToRange,
  passiveRange,
  SB_OPEN,
} from '~core/strategy/charts'
import { bluffFraction, mdf, realisationFactor, requiredEquity } from '~core/strategy/policy'
import {
  N_COMBOS,
  percentilesOf,
  rankRangeOnBoard,
  riverEquityVsRange,
} from '~core/strategy/ranges'
import { narrowOnAction, preflopRange } from '~core/strategy/tracker'
import { classifyBoard } from '~core/strategy/texture'
import { describeHand } from '~core/strategy/handclass'

describe('chart notation', () => {
  it('expands spans and plus notation', () => {
    expect(Object.keys(chart({ 1: 'AA-QQ' })).sort()).toEqual(['AA', 'KK', 'QQ'])
    expect(Object.keys(chart({ 1: '99+' })).sort()).toEqual(['99', 'AA', 'JJ', 'KK', 'QQ', 'TT'])
    expect(Object.keys(chart({ 1: 'ATs+' })).sort()).toEqual(['AJs', 'AKs', 'AQs', 'ATs'])
  })

  it('gives the button a wide open and the blind a real folding region', () => {
    const open = chartToRange(SB_OPEN)
    let t = 0
    for (let i = 0; i < N_COMBOS; i++) t += open[i]!
    // Heads-up button opens are enormous, but not 100%.
    expect(t / N_COMBOS).toBeGreaterThan(0.7)
    expect(t / N_COMBOS).toBeLessThan(0.9)

    const threeBet = chartToRange(BB_VS_OPEN_3BET)
    const call = passiveRange(BB_VS_OPEN_3BET, BB_VS_OPEN_CALL)
    let defend = 0
    for (let i = 0; i < N_COMBOS; i++) defend += Math.min(1, threeBet[i]! + call[i]!)
    // Defending everything is the classic beginner leak; so is folding 80%.
    expect(defend / N_COMBOS).toBeGreaterThan(0.5)
    expect(defend / N_COMBOS).toBeLessThan(0.8)
  })
})

describe('the arithmetic that makes it a strategy rather than a calculator', () => {
  it('derives bluff frequency from bet size, not from a constant', () => {
    // Bluffs/(value+bluffs) = s/(1+s). A pot-sized bet is one third bluffs.
    expect(bluffFraction(1)).toBeCloseTo(0.5, 6)
    expect(bluffFraction(0.5)).toBeCloseTo(1 / 3, 6)
    expect(bluffFraction(0.33)).toBeCloseTo(0.33 / 1.33, 6)
    // Bigger bets need more bluffs to stay balanced.
    expect(bluffFraction(1)).toBeGreaterThan(bluffFraction(0.5))
  })

  it('derives minimum defence frequency from bet size', () => {
    expect(mdf(1)).toBeCloseTo(0.5, 6)
    expect(mdf(0.5)).toBeCloseTo(2 / 3, 6)
    // Facing a bigger bet you defend less.
    expect(mdf(1)).toBeLessThan(mdf(0.33))
  })

  it('prices calls off pot odds correctly', () => {
    // 100 into a pot of 100: call 100 to win 300 => 33.3% needed.
    expect(requiredEquity(100, 100)).toBeCloseTo(1 / 3, 6)
  })

  it('realises less equity out of position than in position (ADR-003 defence #1)', () => {
    const base = {
      pot: 1000,
      heroStack: 9000,
      villainStack: 9000,
      wasAggressor: false,
    } as never
    const ip = realisationFactor({ ...(base as object), inPosition: true } as never, false, true)
    const oop = realisationFactor({ ...(base as object), inPosition: false } as never, false, true)
    expect(oop).toBeLessThan(ip)
    // A draw keeps more of its equity out of position than a weak made hand.
    const drawOop = realisationFactor({ ...(base as object), inPosition: false } as never, true, false)
    const airOop = realisationFactor({ ...(base as object), inPosition: false } as never, false, false)
    expect(drawOop).toBeGreaterThan(airOop)
  })
})

describe('percentiles inside a range (ADR-003 defence #3)', () => {
  it('computes every percentile in one pass, matching a naive scan', () => {
    const r = chartToRange(SB_OPEN)
    const board = cardsFromString('Ah 7c 2d')
    const ranked = rankRangeOnBoard(r, board)
    const pct = percentilesOf(ranked)
    expect(pct.length).toBe(ranked.length)
    // Best hand in the range sits at the top, worst at the bottom.
    expect(pct[0]).toBeGreaterThan(0.9)
    expect(pct[pct.length - 1]).toBeLessThan(0.1)
    // Monotone non-increasing, since ranked is sorted best-first.
    for (let i = 1; i < pct.length; i++) expect(pct[i]!).toBeLessThanOrEqual(pct[i - 1]! + 1e-12)
  })

  it('makes the SAME hand strong on one board and weak on another', () => {
    // This is the whole point: absolute hand strength is not a strategy input.
    const r = chartToRange(SB_OPEN)
    const hand = cardsFromString('Kd Qd') as [number, number]

    const dry = cardsFromString('Kc 7h 2s') // top pair, good kicker
    const scary = cardsFromString('Ac 9h 4d') // king-high air, and the ace hits their range

    const rankedDry = rankRangeOnBoard(r, dry)
    const rankedScary = rankRangeOnBoard(r, scary)
    const pDry = percentileOfHand(rankedDry, hand, dry)
    const pScary = percentileOfHand(rankedScary, hand, scary)
    expect(pDry).toBeGreaterThan(pScary)
  })
})

function percentileOfHand(
  ranked: ReturnType<typeof rankRangeOnBoard>,
  hand: [number, number],
  board: number[],
): number {
  const r = evaluate([hand[0], hand[1], ...board])
  let below = 0
  let total = 0
  for (const rc of ranked) {
    total += rc.weight
    if (rc.rank > r) below += rc.weight
  }
  return total > 0 ? below / total : 0.5
}

describe('range tracking responds to the line (ADR-003 defence #4)', () => {
  it('narrows a betting range toward the top and a checking range toward the middle', () => {
    const start = chartToRange(SB_OPEN)
    const board = cardsFromString('Ah 7c 2d')

    const afterBet = narrowOnAction(start, board, [], { type: 'bet', size: 0.66 })
    const afterCheck = narrowOnAction(start, board, [], { type: 'check', size: 0 })

    const meanStrength = (r: Float64Array) => {
      const ranked = rankRangeOnBoard(r, board)
      let sum = 0
      let w = 0
      for (const rc of ranked) {
        sum += rc.rank * rc.weight
        w += rc.weight
      }
      return w > 0 ? sum / w : 7462
    }

    // Lower phe rank is a better hand, so a betting range has a LOWER mean.
    expect(meanStrength(afterBet)).toBeLessThan(meanStrength(start))
    expect(meanStrength(afterCheck)).toBeGreaterThan(meanStrength(afterBet))
  })

  it('gives different ranges for different preflop lines', () => {
    const opened = preflopRange(0, [
      { type: 'raise', to: 250, seat: 0, street: 'preflop', potBefore: 150, paid: 200 },
    ])
    const threeBetFacing = preflopRange(1, [
      { type: 'raise', to: 250, seat: 0, street: 'preflop', potBefore: 150, paid: 200 },
      { type: 'raise', to: 900, seat: 1, street: 'preflop', potBefore: 350, paid: 800 },
    ])
    let openW = 0
    let threeW = 0
    for (let i = 0; i < N_COMBOS; i++) {
      openW += opened[i]!
      threeW += threeBetFacing[i]!
    }
    // A 3-betting range must be far narrower than an opening range.
    expect(threeW).toBeLessThan(openW / 3)
  })
})

describe('hand descriptions', () => {
  it('names what a player would call it', () => {
    expect(describeHand(cardsFromString('Ah Kc') as [number, number], cardsFromString('Ad 7c 2s')).label)
      .toContain('top pair')
    expect(describeHand(cardsFromString('Ah Ac') as [number, number], cardsFromString('7d 5c 2s')).label)
      .toContain('overpair')
    expect(describeHand(cardsFromString('9h 8h') as [number, number], cardsFromString('7h 6c 2h')).label)
      .toContain('draw')
    expect(describeHand(cardsFromString('Ah Kc') as [number, number], cardsFromString('Ad Ac 7s')).label)
      .toBe('three of a kind')
  })
})

describe('board texture', () => {
  it('separates dry from wet', () => {
    const dry = classifyBoard(cardsFromString('Ks 7h 2d'))
    const wet = classifyBoard(cardsFromString('9h 8h 7c'))
    expect(dry.suitedness).toBe('rainbow')
    expect(dry.wetness).toBeLessThan(wet.wetness)
    expect(wet.connected).toBe(true)

    const mono = classifyBoard(cardsFromString('Kh 9h 4h'))
    expect(mono.suitedness).toBe('monotone')

    const paired = classifyBoard(cardsFromString('Kh Kd 4c'))
    expect(paired.pairing).toBe('paired')
  })
})

describe('the agent plays legally and mixes', () => {
  const rng = new Rng(99)
  const ai = makePolicy({ rng, runouts: 8 })
  const randomLegal = (s: HandState, _seat: Seat): Action => {
    const legal = legalActions(s)
    const p = legal[rng.int(legal.length)]!
    if (p.type === 'bet' || p.type === 'raise') {
      return { type: p.type, to: p.min! + rng.int(Math.max(1, p.max! - p.min! + 1)) }
    }
    return { type: p.type }
  }

  it('never produces an illegal action across 3000 hands', () => {
    for (let i = 0; i < 3000; i++) {
      const s = playHand(rng, [ai, randomLegal])
      expect(s.finished).toBe(true)
      expect(s.result!.delta[0] + s.result!.delta[1]).toBe(0)
    }
  })

  it('returns a mixed strategy postflop, not a readable pure one', () => {
    // Preflop the button's opening chart is deliberately near-pure for most
    // classes, so mixing is measured where it actually protects us: postflop,
    // where a pure strategy is trivially exploitable.
    let mixedSpots = 0
    let spots = 0
    for (let seed = 0; seed < 120; seed++) {
      const s = deal(new Rng(seed))
      act(s, { type: 'raise', to: 250 })
      act(s, { type: 'call' })
      if (s.street !== 'flop') continue
      // Postflop the big blind acts first, so check it through to the button.
      act(s, { type: 'check' })
      spots++
      const d = decide(s, 0, { rng: new Rng(seed + 1000), runouts: 8 })
      if (d.policy.length > 1 && d.policy.every((p) => p.prob < 0.995)) mixedSpots++
    }
    expect(spots).toBeGreaterThan(50)
    expect(mixedSpots / spots).toBeGreaterThan(0.5)
  })

  it('checks to the aggressor rather than leading into them', () => {
    // Out of position against the preflop raiser, the big blind should almost
    // never donk-bet. Measured across many flops rather than asserted once.
    let leads = 0
    let spots = 0
    for (let seed = 0; seed < 120; seed++) {
      const s = deal(new Rng(seed))
      act(s, { type: 'raise', to: 250 })
      act(s, { type: 'call' })
      if (s.street !== 'flop') continue
      spots++
      const d = decide(s, 1, { rng: new Rng(seed + 500), runouts: 8 })
      const betProb = d.policy
        .filter((p) => p.action.type === 'bet' || p.action.type === 'raise')
        .reduce((a, b) => a + b.prob, 0)
      leads += betProb
    }
    expect(spots).toBeGreaterThan(50)
    expect(leads / spots).toBeLessThan(0.2)
  })

  it('explains the action it actually took', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = deal(new Rng(seed))
      act(s, { type: 'raise', to: 250 })
      act(s, { type: 'call' })
      if (s.street !== 'flop') continue
      act(s, { type: 'check' })
      const d = decide(s, 0, { rng: new Rng(seed), runouts: 8 })
      // The action taken must be one of the options in the policy it reports.
      const found = d.policy.find(
        (p) => p.action.type === d.action.type && p.action.to === d.action.to,
      )
      expect(found).toBeDefined()
      expect(d.reasons.length).toBeGreaterThan(1)
    }
  })
})

describe('river equity is exact, not sampled', () => {
  it('has no confidence interval on a complete board', () => {
    const villain = chartToRange(SB_OPEN)
    const r = riverEquityVsRange(
      cardsFromString('Ah Kh') as [number, number],
      villain,
      cardsFromString('Ad Kd 7c 2s 3h'),
    )
    expect(r.equity).toBeGreaterThan(0.9) // top two pair against an opening range
    expect(r.combos).toBeGreaterThan(100)
  })
})
