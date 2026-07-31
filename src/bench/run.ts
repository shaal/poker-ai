/**
 * The runner. Deterministic given a seed, which is not a nicety: an
 * irreproducible benchmark number cannot be argued with, and ADR-009 exists
 * because unarguable numbers are how the sibling project shipped a regression.
 */

import { Rng } from '../engine/cards'
import { runDuplicate, runUnpaired } from './duplicate'
import { bb100, significant, type Stats } from './stats'
import type { Opponent, PolicyFactory } from './types'

export interface MatchOptions {
  /** Total hands. With pairing this is rounded down to an even number. */
  hands?: number
  seed?: number
  /**
   * Off only to demonstrate what pairing buys. Real results are always paired —
   * ADR-009 makes variance reduction mandatory, not optional.
   */
  paired?: boolean
}

const DEFAULT_HANDS = 20_000

/** FNV-1a. Per-opponent seeds are derived from the NAME, not the index, so that
 * adding a row to a suite does not silently change every other row's numbers. */
function hashName(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function runMatch(
  hero: PolicyFactory,
  villain: PolicyFactory,
  opts: MatchOptions = {},
): Stats {
  const hands = Math.max(2, Math.floor(opts.hands ?? DEFAULT_HANDS))
  const seed = (opts.seed ?? 1) >>> 0
  const paired = opts.paired !== false

  // Three independent streams, so that changing how much randomness a policy
  // consumes does not shift the deck sequence out from under the other one.
  // Three independent streams: each policy's own mixing must not be correlated
  // with the deal, or a strategy can appear to beat a copy of itself.
  // correlated streams there fabricate edges of up to 10 bb/100 between two
  // copies of the same mixed strategy.
  const heroPolicy = hero(new Rng((seed ^ 0x1111_1111) >>> 0))
  const villainPolicy = villain(new Rng((seed ^ 0x2222_2222) >>> 0))
  const dealRng = new Rng((seed ^ 0x3333_3333) >>> 0)

  if (paired) {
    const deals = Math.max(1, Math.floor(hands / 2))
    return bb100(runDuplicate(heroPolicy, villainPolicy, deals, dealRng), 2)
  }
  return bb100(runUnpaired(heroPolicy, villainPolicy, hands, dealRng), 1)
}

export interface SuiteRow {
  name: string
  stats: Stats
}

export function runSuite(
  hero: PolicyFactory,
  suite: readonly Opponent[],
  opts: MatchOptions = {},
): SuiteRow[] {
  const base = (opts.seed ?? 1) >>> 0
  return suite.map((o) => ({
    name: o.name,
    stats: runMatch(hero, o.make, { ...opts, seed: (base ^ hashName(o.name)) >>> 0 }),
  }))
}

function padR(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

function padL(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s
}

function signed(v: number): string {
  return (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2)
}

/**
 * Aligned text table. The verdict column is the one that matters: a row without
 * SIGNIFICANT is a row that says nothing, however good the number looks.
 */
export function formatTable(rows: readonly SuiteRow[], title?: string): string {
  const nameW = Math.max(8, ...rows.map((r) => r.name.length))
  const out: string[] = []
  if (title) out.push(title)

  const head =
    padR('opponent', nameW) +
    padL('hands', 9) +
    padL('bb/100', 10) +
    padL('95% CI', 11) +
    '  verdict'
  out.push(head)
  out.push('-'.repeat(head.length))

  for (const r of rows) {
    const s = r.stats
    out.push(
      padR(r.name, nameW) +
        padL(String(s.hands), 9) +
        padL(signed(s.mean), 10) +
        padL('± ' + s.ci95.toFixed(2), 11) +
        '  ' +
        (significant(s) ? (s.mean >= 0 ? 'SIGNIFICANT' : 'SIGNIFICANT (losing)') : 'noise'),
    )
  }

  if (rows.length > 0) {
    const means = rows.map((r) => r.stats.mean)
    const avg = means.reduce((a, b) => a + b, 0) / means.length
    const worst = Math.min(...means)
    const worstRow = rows.find((r) => r.stats.mean === worst)!
    out.push('-'.repeat(head.length))
    out.push(
      padR('mean', nameW) +
        padL('', 9) +
        padL(signed(avg), 10) +
        padL('', 11) +
        `   worst: ${worstRow.name} ${signed(worst)}`,
    )
  }
  return out.join('\n')
}

export type { Opponent, PolicyFactory } from './types'
export type { Stats } from './stats'
