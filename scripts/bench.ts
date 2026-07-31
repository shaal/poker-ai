/**
 * Bench CLI.
 *
 *   npx tsx scripts/bench.ts --hands=20000 --seed=1 --strategy=tightAggressive
 *
 * Prints two tables. Only the second one counts — ADR-009 splits the suite so
 * that the numbers you iterated against and the numbers you ship on cannot be
 * confused with each other, and printing them under one heading would undo
 * that in a single afternoon.
 */

import type { Rng } from '../src/engine/cards'
import type { Policy } from '../src/engine/holdem'
import { FAMILIAR, tightAggressive } from '../src/bench/opponents/familiar'
import { HELD_OUT } from '../src/bench/opponents/heldout'
import { formatTable, runSuite, type PolicyFactory, type SuiteRow } from '../src/bench/run'
import { significant } from '../src/bench/stats'

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const v = Number(hit.slice(name.length + 3))
  return Number.isFinite(v) ? v : fallback
}

function argStr(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

/**
 * The strategy under test.
 *
 * ADR-009 requires this bench to exist before the thing it judges, so it has to
 * stand up with no AI present at all: the always-available entries are the
 * bench's own reference policies, which is enough to check that the bench can
 * separate a loser from noise. `src/strategy/agent.ts` is picked up when it is
 * there, as `--strategy=ai` and `--strategy=ai-noexploit`, and its absence or
 * breakage is not an error here — the bench does not depend on the strategy.
 */
async function strategies(): Promise<Record<string, PolicyFactory>> {
  const out: Record<string, PolicyFactory> = { tightAggressive }
  for (const o of FAMILIAR) out[o.name] = o.make
  const path = new URL('../src/strategy/agent.ts', import.meta.url).href
  try {
    const mod = (await import(path)) as {
      makePolicy?: (opts: { rng: Rng; runouts?: number; exploit?: boolean }) => Policy
    }
    if (typeof mod.makePolicy === 'function') {
      const make = mod.makePolicy
      // Few runouts: the bench plays hundreds of thousands of hands and the
      // equity estimate only has to be good enough to choose between actions.
      out.ai = (rng) => make({ rng, runouts: 12, exploit: true })
      out['ai-noexploit'] = (rng) => make({ rng, runouts: 12, exploit: false })
    }
  } catch {
    // Not built yet, or mid-rewrite. Neither is this script's problem.
  }
  return out
}

function verdict(rows: readonly SuiteRow[]): string {
  const losing = rows.filter((r) => r.stats.mean < 0 && significant(r.stats))
  const unresolved = rows.filter((r) => !significant(r.stats))
  if (losing.length > 0) {
    return `DOES NOT SHIP: significant losses to ${losing.map((r) => r.name).join(', ')}`
  }
  if (unresolved.length > 0) {
    return `UNRESOLVED: ${unresolved.map((r) => r.name).join(', ')} — more hands needed before this is evidence`
  }
  return 'clears the held-out suite'
}

async function main() {
  const hands = arg('hands', 20_000)
  const seed = arg('seed', 1)
  const name = argStr('strategy', 'tightAggressive')

  const all = await strategies()
  const hero = all[name]
  if (!hero) {
    console.error(`unknown strategy "${name}". available: ${Object.keys(all).sort().join(', ')}`)
    process.exit(1)
    return
  }

  const opts = { hands, seed }
  console.log(`strategy: ${name}    hands: ${hands} per opponent (duplicate-paired)    seed: ${seed}`)
  console.log('')

  const t0 = Date.now()
  const familiar = runSuite(hero, FAMILIAR, opts)
  console.log(
    formatTable(familiar, 'FAMILIAR — development only. Tuned against, therefore not evidence.'),
  )
  console.log('')

  const held = runSuite(hero, HELD_OUT, opts)
  console.log(
    formatTable(held, 'HELD OUT — frozen constants. THIS SUITE DECIDES WHETHER A CHANGE SHIPS.'),
  )
  console.log('')
  console.log(verdict(held))
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main()
