/**
 * PHASE 1 EXIT CRITERION (ADR-009): a trivially bad strategy is measured as bad,
 * with the interval excluding zero, in a run that takes seconds.
 *
 * If these tests pass, the bench can settle an argument. If they do not, no
 * number this repository produces about strategy means anything, so this file
 * is load-bearing for everything downstream of it.
 */

import { describe, expect, it } from 'vitest'
import { Rng } from '~core/engine/cards'
import { playPair, runDuplicate, runUnpaired } from '~core/bench/duplicate'
import {
  alwaysCall,
  alwaysFold,
  alwaysMinRaise,
  callingStation,
  FAMILIAR,
  loosePassiveMixer,
  maniac,
  nit,
  tightAggressive,
} from '~core/bench/opponents/familiar'
import { HELD_OUT, tiltAfterLoss, type TiltMemory } from '~core/bench/opponents/heldout'
import { formatTable, runMatch, runSuite } from '~core/bench/run'
import { bb100, significant } from '~core/bench/stats'
import { freshDeck, shuffle } from '~core/engine/cards'

const HANDS = 6_000
const SEED = 7

describe('the bench can see a bad strategy', () => {
  it('measures alwaysFold as a large, significant loser', () => {
    const s = runMatch(alwaysFold, tightAggressive, { hands: HANDS, seed: SEED })
    expect(s.hands).toBe(HANDS)
    expect(s.mean).toBeLessThan(-20)
    expect(significant(s)).toBe(true)
    // The interval itself, not just the sign of the point estimate.
    expect(s.mean + s.ci95).toBeLessThan(0)
  })

  it('measures alwaysCall as a significant loser too', () => {
    const s = runMatch(alwaysCall, tightAggressive, { hands: HANDS, seed: SEED })
    expect(s.mean).toBeLessThan(-20)
    expect(significant(s)).toBe(true)
    expect(s.mean + s.ci95).toBeLessThan(0)
  })

  it('does not call a strategy against itself a winner', () => {
    // Same policy both seats: the true edge is exactly zero, and with duplicate
    // pairing every deal cancels, so the bench must report a flat zero rather
    // than a small number it could be talked into believing.
    const s = runMatch(nit, nit, { hands: 2_000, seed: 3 })
    expect(s.mean).toBe(0)
    expect(s.stddev).toBe(0)
  })
})

describe('duplicate pairing', () => {
  it('plays the same deal from both sides', () => {
    const rng = new Rng(99)
    const deck = shuffle(freshDeck(), rng)
    const hero = nit(new Rng(1))
    const villain = callingStation(new Rng(2))
    const a = playPair(hero, villain, deck, rng)
    expect(a.paired).toBe(a.legs[0] + a.legs[1])
    // Same deck, same deterministic policies: the pair replays exactly.
    const b = playPair(nit(new Rng(1)), callingStation(new Rng(2)), deck, rng)
    expect(b.legs).toEqual(a.legs)
  })

  it('measurably reduces variance against the unpaired control', () => {
    const opts = { hands: 10_000, seed: 11 }
    const paired = runMatch(tightAggressive, callingStation, opts)
    const unpaired = runMatch(tightAggressive, callingStation, { ...opts, paired: false })

    // Same hands, same matchup, same seed — only the estimator differs.
    expect(paired.hands).toBe(unpaired.hands)
    expect(paired.stddev).toBeLessThan(unpaired.stddev * 0.75)

    // The fair comparison, which strips out the √2 that comes for free from a
    // pair covering two hands: the interval at equal hand count.
    expect(paired.ci95).toBeLessThan(unpaired.ci95 * 0.9)

    // Both estimators are unbiased, so they must agree on the edge itself.
    expect(Math.abs(paired.mean - unpaired.mean)).toBeLessThan(unpaired.ci95 * 2)
  })

  it('cancels exactly for deterministic strategies', () => {
    const det = runDuplicate(
      callingStation(new Rng(5)),
      callingStation(new Rng(6)),
      300,
      new Rng(7),
    )
    expect(det.every((p) => p === 0)).toBe(true)
  })

  it('does not manufacture an edge between two copies of one MIXED strategy', () => {
    // The true edge here is exactly zero by symmetry, but a mixing policy's own
    // coin flips are not shared between the legs, so nothing cancels
    // arithmetically and the answer has to come out right statistically.
    //
    // This is the test that caught the engine's Rng when it was xorshift128+
    // with 64-bit shift constants on 32-bit words: with correlated streams this
    // matchup reported edges from -8.7 to +10.6 bb/100 over 400,000 deals,
    // every one of them "SIGNIFICANT". A benchmark that can do that cannot
    // settle anything, so this test guards the generator, not the bench.
    const mixed = runMatch(loosePassiveMixer, loosePassiveMixer, { hands: 60_000, seed: 8 })
    expect(mixed.stddev).toBeGreaterThan(0)
    expect(Math.abs(mixed.mean)).toBeLessThan(5)
    expect(significant(mixed)).toBe(false)
  })
})

describe('statistics', () => {
  it('scales chips to bb per 100 hands', () => {
    // 100 chips = 1bb won per paired deal = 2 hands, so 50 bb/100.
    expect(bb100([100, 100, 100], 2).mean).toBeCloseTo(50, 9)
    expect(bb100([100, 100, 100], 1).mean).toBeCloseTo(100, 9)
  })

  it('reports an infinite interval rather than a fake one for a single sample', () => {
    expect(bb100([500], 2).ci95).toBe(Infinity)
    expect(significant(bb100([500], 2))).toBe(false)
  })

  it('calls a wide interval around a big number noise', () => {
    const noisy = bb100([10_000, -10_000, 9_000, -9_500], 2)
    expect(significant(noisy)).toBe(false)
  })
})

describe('determinism', () => {
  it('gives identical numbers for the same seed', () => {
    const a = runMatch(tightAggressive, loosePassiveMixer, { hands: 4_000, seed: 42 })
    const b = runMatch(tightAggressive, loosePassiveMixer, { hands: 4_000, seed: 42 })
    expect(b).toEqual(a)
  })

  it('gives different numbers for a different seed', () => {
    const a = runMatch(tightAggressive, loosePassiveMixer, { hands: 4_000, seed: 42 })
    const b = runMatch(tightAggressive, loosePassiveMixer, { hands: 4_000, seed: 43 })
    expect(b.mean).not.toBe(a.mean)
  })

  it('reproduces a whole suite, and seeds rows by name so adding one is free', () => {
    const a = runSuite(tightAggressive, HELD_OUT, { hands: 2_000, seed: 5 })
    const subset = HELD_OUT.filter((o) => o.name !== HELD_OUT[0]!.name)
    const b = runSuite(tightAggressive, subset, { hands: 2_000, seed: 5 })
    for (const row of b) {
      expect(row.stats).toEqual(a.find((r) => r.name === row.name)!.stats)
    }
  })
})

describe('opponents stay inside the rules', () => {
  // `act` throws on an illegal action, so a completed run IS the assertion.
  // This is the check that stops a 100k-hand run dying on hand 80,000.
  const everyone = [...FAMILIAR, ...HELD_OUT]

  it('survives every pairing of every opponent', () => {
    expect(() => {
      for (const h of everyone) {
        for (const v of everyone) {
          runMatch(h.make, v.make, { hands: 120, seed: 17 })
        }
      }
    }).not.toThrow()
  })

  it('survives the escalating cases that break naive raise sizing', () => {
    expect(() => {
      runMatch(alwaysMinRaise, alwaysMinRaise, { hands: 400, seed: 19 })
      runMatch(maniac, maniac, { hands: 400, seed: 19 })
      runMatch(alwaysMinRaise, maniac, { hands: 400, seed: 19 })
    }).not.toThrow()
  })

  it('is symmetric: swapping hero and villain negates the result exactly', () => {
    // Both policies deterministic, so this holds to the chip. A bench that is
    // even slightly asymmetric is measuring the seat as well as the strategy.
    const a = runDuplicate(nit(new Rng(1)), callingStation(new Rng(2)), 400, new Rng(3))
    const b = runDuplicate(callingStation(new Rng(2)), nit(new Rng(1)), 400, new Rng(3))
    expect(a).toHaveLength(b.length)
    expect(a.every((x, i) => x + b[i]! === 0)).toBe(true)
  })

  it('returns whole chips, never fractions of one', () => {
    const deltas = runUnpaired(maniac(new Rng(1)), nit(new Rng(2)), 500, new Rng(3))
    expect(deltas.every((d) => Number.isInteger(d))).toBe(true)
  })
})

describe('held-out suite', () => {
  it('carries state across hands in tiltAfterLoss', () => {
    const memory: TiltMemory = { tilt: 0, handsSeen: 0 }
    const s = runMatch(tightAggressive, (rng) => tiltAfterLoss(rng, memory), {
      hands: 1_000,
      seed: 23,
    })
    expect(s.hands).toBe(1_000)
    // It must actually have observed hands going by, or its defining mechanism
    // is silently dead and the row is measuring a different opponent.
    expect(memory.handsSeen).toBeGreaterThan(100)
  })

  it('runs both suites and renders them fast', () => {
    const t0 = Date.now()
    const familiar = runSuite(tightAggressive, FAMILIAR, { hands: 4_000, seed: 3 })
    const held = runSuite(tightAggressive, HELD_OUT, { hands: 4_000, seed: 3 })
    const elapsed = Date.now() - t0

    expect(familiar).toHaveLength(FAMILIAR.length)
    expect(held).toHaveLength(HELD_OUT.length)
    for (const row of [...familiar, ...held]) {
      expect(row.stats.hands).toBe(4_000)
      expect(Number.isFinite(row.stats.mean)).toBe(true)
    }
    // ADR-009's variance-reduction requirement is only worth anything if a full
    // suite is cheap enough to run on every change.
    expect(elapsed).toBeLessThan(20_000)

    const table = formatTable(held, 'HELD OUT')
    expect(table).toContain('bb/100')
    expect(table).toContain('boardTextureReactive')
    expect(table.split('\n').every((l) => !l.includes('NaN'))).toBe(true)
  })

  it('scales: 20,000 duplicate deals in seconds, not hours', () => {
    const t0 = Date.now()
    const s = runMatch(tightAggressive, loosePassiveMixer, { hands: 40_000, seed: 31 })
    expect(s.hands).toBe(40_000)
    expect(Date.now() - t0).toBeLessThan(20_000)
  })
})
