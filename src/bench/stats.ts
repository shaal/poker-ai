/**
 * Result statistics. ADR-002: a poker result without a confidence interval is
 * not a result, it is a mood.
 */

import { BB } from '../engine/types'

export interface Stats {
  /** Big blinds won per 100 hands. */
  mean: number
  /** Half-width of the 95% confidence interval on `mean`, same units. */
  ci95: number
  /**
   * Standard deviation of ONE sample, normalised to bb/100. For unpaired hands
   * this is the familiar "σ ≈ 90 bb/100" figure from ADR-002.
   *
   * Careful when comparing a paired run against an unpaired one: a pair covers
   * two hands, so a factor of √2 of any drop is just averaging and not
   * cancellation. `ci95` at equal `hands` is the fair comparison, and the honest
   * number to quote for what duplicate hands actually bought.
   */
  stddev: number
  /** Independent samples: paired deals, or hands when unpaired. */
  n: number
  /** Hands actually played. */
  hands: number
}

export const EMPTY_STATS: Stats = { mean: 0, ci95: Infinity, stddev: 0, n: 0, hands: 0 }

/**
 * `deltas` are chip results, one per INDEPENDENT sample, and
 * `handsPerSample` says how many hands each one covers — 2 for a duplicate
 * pair, 1 for a single hand.
 *
 * The standard error is computed from those samples, NOT from the individual
 * hands inside them, and that is the entire point of pairing. The two legs of a
 * duplicate deal are strongly negatively correlated by construction (the cards
 * that were good for hero in one leg are good for villain in the other), so
 * treating them as two independent observations would use a variance that the
 * design has already removed, throw away the whole benefit, and report an
 * interval several times wider than the estimator actually has. One pair, one
 * sample.
 *
 * Scaling to bb/100 divides by hands, so the mean is unaffected by the choice;
 * only the interval is. Reporting the wrong interval is the failure mode
 * ADR-009 exists to prevent, so it is worth being explicit about.
 */
export function bb100(deltas: readonly number[], handsPerSample = 2): Stats {
  const n = deltas.length
  if (n === 0) return { ...EMPTY_STATS }

  // chips -> bb/100 for a sample covering `handsPerSample` hands
  const scale = 100 / (BB * handsPerSample)

  let sum = 0
  for (const d of deltas) sum += d
  const mean = (sum / n) * scale

  if (n < 2) return { mean, ci95: Infinity, stddev: 0, n, hands: n * handsPerSample }

  // Two-pass: the naive sum-of-squares form loses too many digits at 100k
  // samples of ~10^4 chips to be trusted for a CI.
  const rawMean = sum / n
  let ss = 0
  for (const d of deltas) {
    const dev = d - rawMean
    ss += dev * dev
  }
  const stddev = Math.sqrt(ss / (n - 1)) * scale
  return { mean, ci95: 1.96 * (stddev / Math.sqrt(n)), stddev, n, hands: n * handsPerSample }
}

/** Does the 95% interval exclude zero? The only "did it work" this repo accepts. */
export function significant(s: Stats): boolean {
  return s.n > 1 && Number.isFinite(s.ci95) && Math.abs(s.mean) > s.ci95
}

/** "+12.40 ± 3.11 bb/100" */
export function formatStats(s: Stats): string {
  const sign = s.mean >= 0 ? '+' : '-'
  return `${sign}${Math.abs(s.mean).toFixed(2)} ± ${s.ci95.toFixed(2)} bb/100`
}
