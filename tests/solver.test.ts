import { describe, expect, it } from 'vitest'
import { solve } from '~core/solver/cfr'
import { bestResponseValue, expectedValue, exploitability } from '~core/solver/exploitability'
import type { Strategy } from '~core/solver/game'
import { kuhn } from '~core/solver/games/kuhn'
import { leduc } from '~core/solver/games/leduc'

/**
 * The correctness gate for the offline solver (ADR-004, ADR-007).
 *
 * The reviewer's objection was "the solved game is not the played game". The
 * answer is that this file checks the solver against games whose answers are
 * known in closed form before anything is allowed to trust it. Kuhn poker's
 * value to the first player is exactly -1/18; if that number does not come out,
 * the solver is wrong and the solver gets fixed, not the tolerance.
 */

const KUHN_VALUE = -1 / 18

// Solves are shared across assertions; each one walks the whole tree.
const kuhn10 = solve(kuhn, 10, { seed: 1 })
const kuhn100 = solve(kuhn, 100, { seed: 1 })
const kuhn10k = solve(kuhn, 10_000, { seed: 1 })
const kuhnVanilla10k = solve(kuhn, 10_000, { seed: 1, plus: false })

const prob = (s: Strategy, key: string, index: number): number => {
  const p = s.get(key)
  expect(p, `missing information set ${key}`).toBeDefined()
  return p![index]!
}

/**
 * The known Kuhn equilibrium family, parameterised by alpha in [0, 1/3].
 * Used to check the best-response machinery itself, which is otherwise the one
 * part of the solver with nothing to check it against.
 */
function analyticKuhn(alpha: number): Strategy {
  return new Map<string, number[]>([
    // player 0 at the root: [check, bet]
    ['J|', [1 - alpha, alpha]],
    ['Q|', [1, 0]],
    ['K|', [1 - 3 * alpha, 3 * alpha]],
    // player 0 facing a bet after checking: [fold, call]
    ['J|xb', [1, 0]],
    ['Q|xb', [2 / 3 - alpha, 1 / 3 + alpha]],
    ['K|xb', [0, 1]],
    // player 1 after a check: [check, bet]
    ['J|x', [2 / 3, 1 / 3]],
    ['Q|x', [1, 0]],
    ['K|x', [0, 1]],
    // player 1 facing a bet: [fold, call]
    ['J|b', [1, 0]],
    ['Q|b', [2 / 3, 1 / 3]],
    ['K|b', [0, 1]],
  ])
}

describe('exploitability', () => {
  it('is zero on the analytic Kuhn equilibrium, for every alpha in the family', () => {
    for (const alpha of [0, 1 / 12, 1 / 6, 1 / 4, 1 / 3]) {
      const eq = analyticKuhn(alpha)
      expect(exploitability(kuhn, eq)).toBeCloseTo(0, 12)
      // Zero sum: the two best responses to an equilibrium are worth +/- the
      // game value, which is why their sum is the right measure.
      expect(bestResponseValue(kuhn, 0, eq)).toBeCloseTo(KUHN_VALUE, 12)
      expect(bestResponseValue(kuhn, 1, eq)).toBeCloseTo(-KUHN_VALUE, 12)
    }
  })

  it('reproduces the closed-form game value on the analytic equilibrium', () => {
    expect(expectedValue(kuhn, analyticKuhn(1 / 6))).toBeCloseTo(KUHN_VALUE, 12)
  })

  it('is large for an unsolved strategy, so zero means something', () => {
    // An empty strategy map plays uniformly everywhere.
    expect(exploitability(kuhn, new Map())).toBeGreaterThan(0.5)
    expect(exploitability(leduc, new Map())).toBeGreaterThan(1)
  })
})

describe('CFR+ on Kuhn poker', () => {
  it('finds all 12 information sets', () => {
    expect(kuhn10k.strategy.size).toBe(12)
  })

  it('converges to the closed-form game value of -1/18', () => {
    const value = expectedValue(kuhn, kuhn10k.strategy)
    expect(Math.abs(value - KUHN_VALUE)).toBeLessThan(1e-3)
  })

  it('converges to zero exploitability', () => {
    expect(kuhn10k.exploitability).toBeLessThan(1e-3)
  })

  it('gets steadily less exploitable, so a constant cannot pass', () => {
    expect(kuhn10.exploitability).toBeGreaterThan(kuhn100.exploitability)
    expect(kuhn100.exploitability).toBeGreaterThan(kuhn10k.exploitability)
    // Materially worse, not merely worse: an order of magnitude over two.
    expect(kuhn100.exploitability).toBeGreaterThan(kuhn10k.exploitability * 10)
  })

  it('lands in the known analytic strategy family', () => {
    const s = kuhn10k.strategy
    expect(kuhn10k.actions.get('J|')).toEqual(['x', 'b'])

    // Player 0 bets the jack at the root with some frequency alpha in [0, 1/3],
    // never bets the queen, and bets the king at exactly three times alpha.
    // These are relationships, not constants: every alpha in the range is an
    // equilibrium and the solver is free to pick any of them.
    const alpha = prob(s, 'J|', 1)
    expect(alpha).toBeGreaterThanOrEqual(0)
    expect(alpha).toBeLessThanOrEqual(1 / 3 + 1e-3)
    expect(prob(s, 'Q|', 1)).toBeLessThan(1e-3)
    expect(prob(s, 'K|', 1)).toBeCloseTo(3 * alpha, 2)

    // The rest of the family, which is unique and independent of alpha.
    expect(prob(s, 'Q|xb', 1)).toBeCloseTo(1 / 3 + alpha, 2) // calls the bet
    expect(prob(s, 'J|x', 1)).toBeCloseTo(1 / 3, 2) // player 1 bluffs the jack
    expect(prob(s, 'Q|b', 1)).toBeCloseTo(1 / 3, 2) // player 1 bluff-catches
    expect(prob(s, 'K|x', 1)).toBeCloseTo(1, 2) // and never checks the king
    expect(prob(s, 'J|b', 0)).toBeCloseTo(1, 2) // nor calls with the jack
  })
})

describe('CFR+ versus vanilla CFR', () => {
  it('converges faster at equal iteration count', () => {
    expect(kuhn10k.exploitability).toBeLessThan(kuhnVanilla10k.exploitability)
    // Regret matching+ plus linear averaging is worth more than a rounding
    // error, so require a clear margin rather than a strict inequality.
    expect(kuhn10k.exploitability).toBeLessThan(kuhnVanilla10k.exploitability * 0.5)
  })

  it('still converges without the plus, just more slowly', () => {
    expect(kuhnVanilla10k.exploitability).toBeLessThan(1e-2)
    expect(Math.abs(expectedValue(kuhn, kuhnVanilla10k.strategy) - KUHN_VALUE)).toBeLessThan(1e-3)
  })
})

describe('CFR+ on Leduc hold’em', () => {
  const solution = solve(leduc, 600, { seed: 1 })

  it('finds all 288 information sets', () => {
    expect(solution.strategy.size).toBe(288)
  })

  it('converges to a near-equilibrium', () => {
    expect(solution.exploitability).toBeLessThan(0.01)
  })

  it('keeps every information set a probability distribution', () => {
    for (const [key, p] of solution.strategy) {
      const total = p.reduce((a, b) => a + b, 0)
      expect(total, key).toBeCloseTo(1, 9)
      for (const x of p) expect(x, key).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('determinism', () => {
  it('gives an identical strategy for the same seed and iteration count', () => {
    const a = solve(kuhn, 2000, { seed: 42 })
    const b = solve(kuhn, 2000, { seed: 42 })
    expect([...b.strategy.entries()]).toEqual([...a.strategy.entries()])
    expect([...b.actions.entries()]).toEqual([...a.actions.entries()])
    expect(b.exploitability).toBe(a.exploitability)
  })

  it('lets the seed pick a different member of the equilibrium family', () => {
    // If this ever stops holding, the seed has become decorative and the
    // determinism test above is no longer saying anything.
    const a = solve(kuhn, 10_000, { seed: 1 })
    const b = solve(kuhn, 10_000, { seed: 7 })
    expect(prob(a.strategy, 'J|', 1)).not.toBeCloseTo(prob(b.strategy, 'J|', 1), 3)
    expect(a.exploitability).toBeLessThan(1e-3)
    expect(b.exploitability).toBeLessThan(1e-3)
  })
})
