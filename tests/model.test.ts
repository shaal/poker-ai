import { describe, expect, it } from 'vitest'
import { Rng } from '~core/engine/cards'
import { act, deal } from '~core/engine/holdem'
import { decide } from '~core/strategy/agent'
import {
  applyExploit,
  beliefsFor,
  lambdaFor,
  LAMBDA_MAX,
  MAX_TOTAL_VARIATION,
  narrowOptionsFor,
  totalVariation,
} from '~core/model/exploit'
import {
  deserialiseProfile,
  emptyProfile,
  modelFrom,
  observeHand,
  serialiseProfile,
  STAT_BY_KEY,
} from '~core/model/opponent'

function profileWith(key: string, n: number, x: number) {
  const p = emptyProfile()
  p.counters[key] = { n, x }
  return p
}

describe('Bayesian blending (ADR-005 part 2)', () => {
  it('starts at the population prior, so the AI is never blind', () => {
    const m = modelFrom(emptyProfile())
    expect(m.posterior('foldToCbetFlop')).toBeCloseTo(STAT_BY_KEY.foldToCbetFlop!.prior, 9)
    expect(m.observed('foldToCbetFlop')).toBeNull()
    expect(m.confidence('foldToCbetFlop')).toBe(0)
  })

  it('blends continuously toward the player, with no threshold anywhere', () => {
    const def = STAT_BY_KEY.foldToCbetFlop!
    // A player folding every single time, observed at increasing sample sizes.
    const posteriors = [1, 5, 20, 100, 1000].map((n) =>
      modelFrom(profileWith('foldToCbetFlop', n, n)).posterior('foldToCbetFlop'),
    )
    // Strictly increasing, never jumping — a gate would produce a step.
    for (let i = 1; i < posteriors.length; i++) {
      expect(posteriors[i]!).toBeGreaterThan(posteriors[i - 1]!)
    }
    expect(posteriors[0]!).toBeGreaterThan(def.prior)
    expect(posteriors[0]! - def.prior).toBeLessThan(0.02) // one observation barely moves it
    expect(posteriors[4]!).toBeGreaterThan(0.95) // a thousand moves it a long way

    // At n = k the posterior is exactly halfway between prior and observed.
    const atK = modelFrom(profileWith('foldToCbetFlop', def.k, def.k)).posterior('foldToCbetFlop')
    expect(atK).toBeCloseTo((def.prior + 1) / 2, 9)
  })

  it('holds fold-to-c-bet more firmly than VPIP, per the sample-size research', () => {
    // Fold-to-c-bet needs ~3,840 hands to pin to +/-5%; VPIP needs ~290. The
    // priors must reflect that or the model will act on the noisiest statistic
    // soonest, which is exactly backwards.
    expect(STAT_BY_KEY.foldToCbetFlop!.k).toBeGreaterThan(STAT_BY_KEY.vpip!.k)
  })
})

describe('regularised deviation (ADR-005 part 3)', () => {
  it('lambda rises with sample size and is capped', () => {
    expect(lambdaFor(0)).toBe(0)
    expect(lambdaFor(10)).toBeLessThan(lambdaFor(100))
    expect(lambdaFor(100)).toBeLessThan(lambdaFor(10_000))
    expect(lambdaFor(10_000_000)).toBeLessThanOrEqual(LAMBDA_MAX)
  })

  it('does nothing at all with an empty profile', () => {
    const s = deal(new Rng(1))
    const m = modelFrom(emptyProfile())
    const d = decide(s, 0, { rng: new Rng(2), runouts: 8, model: m, exploit: true })
    expect(d.exploitShift).toBe(0)
    expect(d.beliefsUsed).toHaveLength(0)
  })

  it('shifts toward betting against a player who folds too much', () => {
    // The classic c-bet spot: we raised preflop, they called, they checked the
    // flop to us. We are seat 0 and in position, so betting is a live option.
    const s = deal(new Rng(3))
    act(s, { type: 'raise', to: 250 })
    act(s, { type: 'call' })
    if (s.street !== 'flop') throw new Error('expected a flop')
    act(s, { type: 'check' })
    expect(s.toAct).toBe(0)

    const nit = emptyProfile()
    nit.counters.foldToCbetFlop = { n: 400, x: 360 } // folds 90% of flops
    const m = modelFrom(nit)

    const beliefs = beliefsFor(m, s, 0)
    const baseline = decide(s, 0, { rng: new Rng(4), runouts: 16 }).baseline
    const res = applyExploit(baseline, beliefs, s, 0, m)

    const betMass = (p: typeof baseline) =>
      p.filter((w) => w.action.type === 'bet' || w.action.type === 'raise').reduce((a, b) => a + b.prob, 0)

    expect(res.shift).toBeGreaterThan(0)
    if (betMass(baseline) > 0 && betMass(baseline) < 1) {
      expect(betMass(res.policy)).toBeGreaterThan(betMass(baseline))
    }
  })

  it('never departs further than the hard cap, however extreme the read', () => {
    const s = deal(new Rng(5))
    act(s, { type: 'raise', to: 250 })
    act(s, { type: 'call' })
    if (s.street !== 'flop') throw new Error('expected a flop')
    act(s, { type: 'check' })

    // An absurd profile: folds everything, a million observations.
    const extreme = emptyProfile()
    extreme.counters.foldToCbetFlop = { n: 1_000_000, x: 1_000_000 }
    extreme.counters.aggression = { n: 1_000_000, x: 0 }
    extreme.counters.wtsd = { n: 1_000_000, x: 0 }
    const m = modelFrom(extreme)

    const baseline = decide(s, 0, { rng: new Rng(6), runouts: 16 }).baseline
    const res = applyExploit(baseline, beliefsFor(m, s, 0), s, 0, m)
    expect(res.shift).toBeLessThanOrEqual(MAX_TOTAL_VARIATION + 1e-9)
  })

  it('never drives a baseline action to zero (keeps its support)', () => {
    // This is the property that makes exponential weights the right form: a
    // confidently WRONG read still cannot make the strategy readable.
    const s = deal(new Rng(7))
    act(s, { type: 'raise', to: 250 })
    act(s, { type: 'call' })
    if (s.street !== 'flop') throw new Error('expected a flop')
    act(s, { type: 'check' })

    const extreme = emptyProfile()
    extreme.counters.foldToCbetFlop = { n: 500_000, x: 500_000 }
    const m = modelFrom(extreme)
    const baseline = decide(s, 0, { rng: new Rng(8), runouts: 16 }).baseline
    const res = applyExploit(baseline, beliefsFor(m, s, 0), s, 0, m)
    for (let i = 0; i < baseline.length; i++) {
      if (baseline[i]!.prob > 0.01) expect(res.policy[i]!.prob).toBeGreaterThan(0)
    }
  })

  it('is a probability distribution afterwards', () => {
    const s = deal(new Rng(9))
    const p = emptyProfile()
    p.counters.vpip = { n: 300, x: 280 }
    const m = modelFrom(p)
    const baseline = decide(s, 0, { rng: new Rng(10), runouts: 8 }).baseline
    const res = applyExploit(baseline, beliefsFor(m, s, 0), s, 0, m)
    const total = res.policy.reduce((a, b) => a + b.prob, 0)
    expect(total).toBeCloseTo(1, 9)
    for (const w of res.policy) expect(w.prob).toBeGreaterThanOrEqual(0)
  })

  it('exploit=false computes beliefs but never applies them', () => {
    const s = deal(new Rng(11))
    const p = emptyProfile()
    p.counters.foldToCbetFlop = { n: 5000, x: 4800 }
    const m = modelFrom(p)
    const d = decide(s, 0, { rng: new Rng(12), runouts: 8, model: m, exploit: false })
    expect(d.exploitShift).toBe(0)
    expect(d.policy).toEqual(d.baseline)
  })
})

describe('the sentences the interface shows (ADR-005 consequences)', () => {
  it('always carries the observation count', () => {
    const p = emptyProfile()
    p.counters.foldToCbetFlop = { n: 14, x: 11 }
    const m = modelFrom(p)
    const b = beliefsFor(m, deal(new Rng(1)), 0).find((x) => x.key === 'foldToCbetFlop')!
    expect(b.sentence).toMatch(/14 spots/)
    expect(b.observations).toBe(14)
  })

  it('says it has no read when it has no read, rather than inventing one', () => {
    const m = modelFrom(emptyProfile())
    const b = beliefsFor(m, deal(new Rng(1)), 0)[0]!
    expect(b.sentence).toMatch(/No read|population average/i)
  })

  it('hedges hard at low confidence and commits at high confidence', () => {
    const low = modelFrom(profileWith('foldToCbetFlop', 3, 3))
    const high = modelFrom(profileWith('foldToCbetFlop', 2000, 1800))
    const s = deal(new Rng(1))
    const lowB = beliefsFor(low, s, 0).find((x) => x.key === 'foldToCbetFlop')!
    const highB = beliefsFor(high, s, 0).find((x) => x.key === 'foldToCbetFlop')!
    expect(lowB.sentence).toMatch(/barely leaning|might be/i)
    expect(highB.confidence).toBeGreaterThan(lowB.confidence)
    expect(highB.sentence).toMatch(/confident/i)
  })
})

describe('observation counts only real opportunities', () => {
  it('does not count a fold-to-bet where no bet was made', () => {
    const s = deal(new Rng(20))
    act(s, { type: 'fold' }) // button folds preflop, no postflop at all
    const p = observeHand(emptyProfile(), s, 0)
    expect(p.counters.foldToCbetFlop!.n).toBe(0)
    expect(p.counters.vpip!.n).toBe(1)
    expect(p.counters.vpip!.x).toBe(0) // folding is not voluntary money in
  })

  it('records preflop aggression and showdowns', () => {
    const s = deal(new Rng(21))
    act(s, { type: 'raise', to: 250 })
    act(s, { type: 'call' })
    const p = observeHand(emptyProfile(), s, 0)
    expect(p.counters.pfr!.x).toBe(1)
    expect(p.counters.vpip!.x).toBe(1)
    expect(p.handsObserved).toBe(1)
  })
})

describe('persistence (ADR-005 part 4)', () => {
  it('round-trips a profile', () => {
    const p = emptyProfile('me')
    p.counters.vpip = { n: 120, x: 70 }
    p.handsObserved = 120
    const back = deserialiseProfile(serialiseProfile(p))
    expect(back.counters.vpip).toEqual({ n: 120, x: 70 })
    expect(back.handsObserved).toBe(120)
  })

  it('survives corrupt storage without throwing', () => {
    expect(deserialiseProfile('not json').handsObserved).toBe(0)
    expect(deserialiseProfile('{"version":99}').handsObserved).toBe(0)
    expect(deserialiseProfile('{"version":1,"counters":{"vpip":{"n":"x"}}}').counters.vpip)
      .toEqual({ n: 0, x: 0 })
  })
})

describe('reads change what we believe they hold, separately from what we do', () => {
  it('widens their betting range when they are measured as aggressive', () => {
    const aggro = emptyProfile()
    aggro.counters.aggression = { n: 2000, x: 1200 } // 60% vs a 33% prior
    const passive = emptyProfile()
    passive.counters.aggression = { n: 2000, x: 200 } // 10%
    expect(narrowOptionsFor(modelFrom(aggro)).bluffTendency!).toBeGreaterThan(
      narrowOptionsFor(modelFrom(passive)).bluffTendency!,
    )
  })
})

describe('total variation helper', () => {
  it('is zero for identical distributions and one for disjoint ones', () => {
    expect(totalVariation([0.5, 0.5], [0.5, 0.5])).toBe(0)
    expect(totalVariation([1, 0], [0, 1])).toBe(1)
  })
})
