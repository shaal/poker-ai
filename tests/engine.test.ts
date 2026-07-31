import { describe, expect, it } from 'vitest'
import {
  cardFromString,
  cardsFromString,
  cardToString,
  combosOf169,
  hand169ToString,
  handIndex169,
  rankOf,
  Rng,
  suitOf,
} from '~core/engine/cards'
import { categoryName, equity, equityExact, evaluate, strengthOf } from '~core/engine/evaluator'
import {
  act,
  deal,
  effectiveStack,
  legalActions,
  playHand,
  potOdds,
  totalPot,
} from '~core/engine/holdem'
import { BB, SB, START_STACK, type Action, type HandState, type Seat } from '~core/engine/types'

describe('card encoding', () => {
  it('round-trips every card', () => {
    for (let c = 0; c < 52; c++) expect(cardFromString(cardToString(c))).toBe(c)
  })

  it('matches phe: rank * 4 + suit', () => {
    expect(cardFromString('2s')).toBe(0)
    expect(cardFromString('Ac')).toBe(51)
    expect(rankOf(cardFromString('Ac'))).toBe(12)
    expect(suitOf(cardFromString('Ac'))).toBe(3)
  })

  it('indexes the 169 starting hands consistently', () => {
    expect(hand169ToString(handIndex169(...(cardsFromString('Ac Ad') as [number, number])))).toBe('AA')
    expect(hand169ToString(handIndex169(...(cardsFromString('Ac Kc') as [number, number])))).toBe('AKs')
    expect(hand169ToString(handIndex169(...(cardsFromString('Ac Kd') as [number, number])))).toBe('AKo')
    expect(hand169ToString(handIndex169(...(cardsFromString('2c 7d') as [number, number])))).toBe('72o')
    // The 169 buckets must account for all 1326 combos exactly once.
    let total = 0
    for (let i = 0; i < 169; i++) total += combosOf169(i)
    expect(total).toBe(1326)
  })
})

describe('the random number generator', () => {
  // This class shuffles the deck, drives Monte Carlo equity AND samples the
  // strategy's own mixed actions, so a subtle defect here is indistinguishable
  // from a strategy result. It was xorshift128+ with 64-bit shift constants
  // applied to 32-bit words, which measured lag-1/2/3 autocorrelation at
  // |z| = 5.4 / 3.2 / 5.9 and let a strategy "beat" a copy of itself by
  // 10 bb/100 with a significant interval. These bounds are the tripwire.
  const N = 200_000

  function autocorrelation(vals: readonly number[], lag: number): number {
    let mean = 0
    for (const v of vals) mean += v
    mean /= vals.length
    let num = 0
    let den = 0
    for (let i = 0; i + lag < vals.length; i++) num += (vals[i]! - mean) * (vals[i + lag]! - mean)
    for (const v of vals) den += (v - mean) * (v - mean)
    return num / den
  }

  it('is uncorrelated with itself at short lags', () => {
    const rng = new Rng(1)
    const vals: number[] = []
    for (let i = 0; i < N; i++) vals.push(rng.float())
    for (const lag of [1, 2, 3, 5]) {
      // z = r * sqrt(N); anything sound sits well under 3.
      expect(Math.abs(autocorrelation(vals, lag)) * Math.sqrt(N)).toBeLessThan(3.5)
    }
  })

  it('gives unrelated streams for adjacent seeds', () => {
    // Correlated streams are what let a duplicate-hand bench invent an edge
    // between two copies of the same strategy.
    const a = new Rng(1)
    const b = new Rng(2)
    const va: number[] = []
    const vb: number[] = []
    for (let i = 0; i < N; i++) {
      va.push(a.float())
      vb.push(b.float())
    }
    let ma = 0
    let mb = 0
    for (let i = 0; i < N; i++) {
      ma += va[i]!
      mb += vb[i]!
    }
    ma /= N
    mb /= N
    let cov = 0
    let sa = 0
    let sb = 0
    for (let i = 0; i < N; i++) {
      cov += (va[i]! - ma) * (vb[i]! - mb)
      sa += (va[i]! - ma) ** 2
      sb += (vb[i]! - mb) ** 2
    }
    expect(Math.abs(cov / Math.sqrt(sa * sb)) * Math.sqrt(N)).toBeLessThan(3.5)
  })

  it('is uniform in mean and across buckets', () => {
    const rng = new Rng(12345)
    const buckets = new Array<number>(10).fill(0)
    let sum = 0
    for (let i = 0; i < N; i++) {
      const v = rng.float()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      sum += v
      buckets[Math.floor(v * 10)]!++
    }
    expect(Math.abs(sum / N - 0.5) * Math.sqrt(12 * N)).toBeLessThan(3.5)
    // Chi-square with 9 degrees of freedom: 27.9 is the 0.999 critical value.
    const expected = N / 10
    let chi2 = 0
    for (const b of buckets) chi2 += ((b - expected) ** 2) / expected
    expect(chi2).toBeLessThan(27.9)
  })

  it('is reproducible from a seed', () => {
    const a = new Rng(7)
    const b = new Rng(7)
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next())
  })

  it('produces integers strictly inside the requested range', () => {
    const rng = new Rng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 20_000; i++) {
      const v = rng.int(52)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(52)
      seen.add(v)
    }
    expect(seen.size).toBe(52)
  })
})

describe('hand evaluation', () => {
  it('ranks a royal flush best (phe: lower is better)', () => {
    expect(evaluate(cardsFromString('As Ks Qs Js Ts 2h 3d'))).toBe(1)
    expect(strengthOf(1)).toBe(1)
  })

  it('orders hands correctly', () => {
    const quads = evaluate(cardsFromString('Ac Ad Ah As Kc 2h 3d'))
    const boat = evaluate(cardsFromString('Ac Ad Ah Kd Kc 2h 3d'))
    const flush = evaluate(cardsFromString('2c 5c 7c 9c Jc Ad Kh'))
    const pair = evaluate(cardsFromString('Ac Ad 2h 5s 7c 9d Jh'))
    expect(quads).toBeLessThan(boat)
    expect(boat).toBeLessThan(flush)
    expect(flush).toBeLessThan(pair)
    expect(categoryName(quads)).toBe('Four of a Kind')
    expect(categoryName(flush)).toBe('Flush')
  })

  it('detects the wheel', () => {
    const wheel = evaluate(cardsFromString('Ac 2d 3h 4s 5c Kd Qh'))
    expect(categoryName(wheel)).toBe('Straight')
  })
})

describe('equity', () => {
  // ADR-008's non-negotiable gate. The `phe.cardCode` trap produced a
  // plausible 50.00% before it was caught, so this number is the tripwire.
  it('AA vs KK is 82.4% (Phase 0 exit criterion)', () => {
    const e = equity(cardsFromString('Ac Ad'), cardsFromString('Kc Kd'), [], 200_000, new Rng(7))
    expect(e.equity).toBeGreaterThan(0.814)
    expect(e.equity).toBeLessThan(0.834)
  })

  it('AKs vs 22 is a coin flip (~50%)', () => {
    const e = equity(cardsFromString('Ac Kc'), cardsFromString('2d 2h'), [], 200_000, new Rng(11))
    expect(e.equity).toBeGreaterThan(0.45)
    expect(e.equity).toBeLessThan(0.52)
  })

  it('Monte Carlo agrees with exact enumeration on a flop', () => {
    const hero = cardsFromString('Ac Kd')
    const vill = cardsFromString('Qh Qs')
    const board = cardsFromString('Ah 7c 2d')
    const exact = equityExact(hero, vill, board)
    const mc = equity(hero, vill, board, 100_000, new Rng(3))
    expect(Math.abs(mc.equity - exact.equity)).toBeLessThan(0.01)
  })

  it('reports a confidence interval that shrinks with trials', () => {
    const a = equity(cardsFromString('Ac Ad'), undefined, [], 1_000, new Rng(1))
    const b = equity(cardsFromString('Ac Ad'), undefined, [], 100_000, new Rng(1))
    expect(b.ci95).toBeLessThan(a.ci95 / 5)
  })
})

const fold: Action = { type: 'fold' }
const check: Action = { type: 'check' }
const call: Action = { type: 'call' }

describe('heads-up rules', () => {
  it('posts blinds and gives the button first action preflop', () => {
    const s = deal(new Rng(1))
    expect(s.players[0].committed).toBe(SB)
    expect(s.players[1].committed).toBe(BB)
    expect(s.toAct).toBe(0) // button/SB acts first preflop
    expect(totalPot(s)).toBe(SB + BB)
  })

  it('gives the big blind first action postflop', () => {
    const s = deal(new Rng(1))
    act(s, call) // button limps
    act(s, check) // bb checks option
    expect(s.street).toBe('flop')
    expect(s.board).toHaveLength(3)
    expect(s.toAct).toBe(1) // bb acts first postflop
  })

  it('lets the big blind exercise the option after a limp', () => {
    const s = deal(new Rng(2))
    act(s, call)
    expect(s.street).toBe('preflop')
    expect(s.toAct).toBe(1)
    const legal = legalActions(s).map((l) => l.type)
    expect(legal).toContain('check')
    expect(legal).toContain('raise')
  })

  it('awards the pot on a fold and conserves chips', () => {
    const s = deal(new Rng(3))
    act(s, fold) // button folds preflop
    expect(s.finished).toBe(true)
    expect(s.result!.winner).toBe(1)
    expect(s.result!.delta[0]).toBe(-SB)
    expect(s.result!.delta[1]).toBe(SB)
    expect(s.result!.delta[0] + s.result!.delta[1]).toBe(0)
  })

  it('enforces minimum raise sizes', () => {
    const s = deal(new Rng(4))
    const legal = legalActions(s).find((l) => l.type === 'raise')!
    expect(legal.min).toBe(BB * 2) // min raise-to preflop is 2bb
    expect(legal.max).toBe(START_STACK)
    expect(() => act(s, { type: 'raise', to: BB + 1 })).toThrow()
  })

  it('runs the board out when both players are all-in', () => {
    // Seeded across many deals rather than one: seed 5 happens to be a genuine
    // chop (both players play the same 8-high straight), which is a correct
    // outcome and would make a single-seed assertion flaky-by-construction.
    let stacked = 0
    let chopped = 0
    for (let seed = 1; seed <= 60; seed++) {
      const s = deal(new Rng(seed))
      act(s, { type: 'raise', to: START_STACK })
      act(s, call)
      expect(s.finished).toBe(true)
      expect(s.board).toHaveLength(5)
      expect(s.street).toBe('showdown')
      expect(s.result!.showdown).toBe(true)
      expect(s.result!.delta[0] + s.result!.delta[1]).toBe(0)
      const won = Math.abs(s.result!.delta[0])
      expect(won === START_STACK || won === 0).toBe(true)
      if (won === START_STACK) stacked++
      else chopped++
    }
    expect(stacked).toBeGreaterThan(50)
    expect(chopped).toBeLessThan(10)
  })

  it('returns the uncalled portion of a bet', () => {
    // Unequal stacks: the short stack cannot lose more than it has.
    const s = deal(new Rng(6), { stacks: [START_STACK, 30 * BB] })
    expect(effectiveStack(s)).toBe(30 * BB)
    act(s, { type: 'raise', to: START_STACK })
    act(s, call)
    expect(s.finished).toBe(true)
    expect(Math.abs(s.result!.delta[0])).toBe(30 * BB)
    expect(s.result!.delta[0] + s.result!.delta[1]).toBe(0)
  })

  it('computes pot odds', () => {
    const s = deal(new Rng(7))
    // Button faces 0.5bb to call into a 1.5bb pot => 0.5 / 2.0 = 0.25
    expect(potOdds(s, 0)).toBeCloseTo(0.25, 6)
  })
})

describe('full hands play out headlessly (Phase 0 exit criterion)', () => {
  const randomPolicy = (rng: Rng) => (s: HandState, seat: Seat): Action => {
    const legal = legalActions(s)
    const pick = legal[rng.int(legal.length)]!
    if (pick.type === 'bet' || pick.type === 'raise') {
      const min = pick.min!
      const max = pick.max!
      return { type: pick.type, to: min + rng.int(Math.max(1, max - min + 1)) }
    }
    return { type: pick.type }
  }

  it('plays 5000 random hands without an illegal state and conserves chips', () => {
    const rng = new Rng(20240731)
    const p = randomPolicy(rng)
    let sumDelta = 0
    let showdowns = 0
    for (let i = 0; i < 5000; i++) {
      const s = playHand(rng, [p, p])
      const r = s.result!
      expect(r.delta[0] + r.delta[1]).toBe(0)
      // Nobody can win or lose more than the effective stack.
      expect(Math.abs(r.delta[0])).toBeLessThanOrEqual(START_STACK)
      // Cards dealt must never repeat.
      const seen = new Set([...s.players[0].hole, ...s.players[1].hole, ...s.board])
      expect(seen.size).toBe(4 + s.board.length)
      if (r.showdown) showdowns++
      sumDelta += r.delta[0]
    }
    expect(showdowns).toBeGreaterThan(0)
    expect(Number.isFinite(sumDelta)).toBe(true)
  })
})
