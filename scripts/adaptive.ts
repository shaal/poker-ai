/**
 * Does it actually learn you?
 *
 * ADR-002 claim 2 — "the adaptive configuration beats its own non-adaptive
 * baseline" — is the interesting claim in this project and the one ADR-005 says
 * is most likely to come back negative. It needs its own harness, because the
 * ordinary bench in `scripts/bench.ts` builds a fresh policy per match and
 * never lets a profile accumulate. With no profile there is nothing to adapt
 * to, so `--strategy=ai` and `--strategy=ai-noexploit` there produce byte-
 * identical numbers: the comparison looks like it has been run and has not.
 *
 * Here the AI observes every completed hand and carries the profile forward,
 * exactly as it does against a human across sessions. Both configurations see
 * the same deals from the same seats, so the only difference between them is
 * whether the read is allowed to move the strategy.
 *
 *   npx tsx scripts/adaptive.ts --hands=40000 --seed=1
 */

import { Rng, freshDeck, shuffle } from '../src/engine/cards'
import { act, deal, type Policy } from '../src/engine/holdem'
import type { HandState, Seat } from '../src/engine/types'
import { makePolicy } from '../src/strategy/agent'
import { emptyProfile, modelFrom, observeHand, type OpponentProfile } from '../src/model/opponent'
import { bb100, significant } from '../src/bench/stats'
import { FAMILIAR } from '../src/bench/opponents/familiar'
import { HELD_OUT } from '../src/bench/opponents/heldout'
import type { PolicyFactory } from '../src/bench/types'

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? Number(a.split('=')[1]) : fallback
}

const HANDS = argNum('hands', 20_000)
const SEED = argNum('seed', 1)

/**
 * Play `deals` duplicate pairs against one scripted opponent, letting the AI
 * accumulate a profile of it. Returns the paired chip results.
 */
function runAdaptive(
  villainFactory: PolicyFactory,
  exploit: boolean,
  deals: number,
  seed: number,
): { deltas: number[]; profile: OpponentProfile } {
  const aiRng = new Rng((seed ^ 0x1111_1111) >>> 0)
  const villainRng = new Rng((seed ^ 0x2222_2222) >>> 0)
  const dealRng = new Rng((seed ^ 0x3333_3333) >>> 0)

  const profile = emptyProfile('scripted')
  const villain = villainFactory(villainRng)

  // The model object is rebuilt per decision so it always reflects the profile
  // as it stands right now, which is what a live session does.
  const ai: Policy = (s, seat) =>
    makePolicy({ rng: aiRng, runouts: 12, exploit, model: modelFrom(profile) })(s, seat)

  const out: number[] = []

  for (let d = 0; d < deals; d++) {
    const deck = shuffle(freshDeck(), dealRng)

    // Leg A: AI on the button. Leg B: the same cards, seats swapped. Pairing is
    // what makes a hobby-scale sample say anything at all.
    let total = 0
    for (const aiSeat of [0, 1] as Seat[]) {
      const policies: [Policy, Policy] =
        aiSeat === 0 ? [ai, villain] : [villain, ai]
      const s = play(deck, policies, dealRng)
      total += s.result!.delta[aiSeat]
      // Observe the SCRIPTED player, which is the seat the AI is not in.
      observeHand(profile, s, (1 - aiSeat) as Seat)
    }
    out.push(total)
  }
  return { deltas: out, profile }
}

function play(deck: number[], policies: [Policy, Policy], rng: Rng): HandState {
  const s = deal(rng, { deck })
  let guard = 0
  while (!s.finished) {
    if (++guard > 400) throw new Error('betting did not terminate')
    act(s, policies[s.toAct](s, s.toAct))
  }
  return s
}

const suites = [
  { name: 'FAMILIAR', list: FAMILIAR },
  { name: 'HELD OUT', list: HELD_OUT },
]

console.log(
  `adaptive vs non-adaptive    hands: ${HANDS} per opponent (duplicate-paired)    seed: ${SEED}`,
)
console.log('')
console.log('ADR-002 claim 2: the adaptive configuration beats its OWN non-adaptive baseline.')
console.log('A positive delta whose interval excludes zero is the claim holding. Anything else')
console.log('is not, and ADR-005 says opponent modelling then ships off by default.')
console.log('')

const deals = Math.max(1, Math.floor(HANDS / 2))
let heldOutWins = 0
let heldOutTotal = 0

for (const suite of suites) {
  console.log(`${suite.name}`)
  console.log(
    'opponent'.padEnd(22) +
      'adaptive'.padStart(11) +
      'baseline'.padStart(11) +
      'delta'.padStart(11) +
      '95% CI'.padStart(11) +
      '  verdict',
  )
  console.log('-'.repeat(78))

  for (const opp of suite.list) {
    const withRead = runAdaptive(opp.make, true, deals, SEED)
    const without = runAdaptive(opp.make, false, deals, SEED)

    const a = bb100(withRead.deltas, 2)
    const b = bb100(without.deltas, 2)

    // Paired difference: identical deals and identical seats, so the deals
    // cancel and the interval is on the DIFFERENCE, not on two separate means.
    // Comparing two independent intervals would be a much weaker test.
    const diff = withRead.deltas.map((x, i) => x - without.deltas[i]!)
    const d = bb100(diff, 2)
    const sig = significant(d)

    if (suite.name === 'HELD OUT') {
      heldOutTotal++
      if (sig && d.mean > 0) heldOutWins++
    }

    console.log(
      opp.name.padEnd(22) +
        a.mean.toFixed(2).padStart(11) +
        b.mean.toFixed(2).padStart(11) +
        d.mean.toFixed(2).padStart(11) +
        ('± ' + d.ci95.toFixed(2)).padStart(11) +
        '  ' +
        (sig ? (d.mean > 0 ? 'ADAPTIVE BETTER' : 'ADAPTIVE WORSE') : 'no difference measured'),
    )
  }
  console.log('')
}

console.log(
  heldOutWins > 0 && heldOutWins === heldOutTotal
    ? 'Claim 2 holds on every held-out opponent.'
    : heldOutWins > 0
      ? `Claim 2 holds on ${heldOutWins} of ${heldOutTotal} held-out opponents. Partial at best.`
      : 'Claim 2 DOES NOT HOLD. Per ADR-005, opponent modelling ships off by default and stays\n' +
        'a visible experiment. The sample-size numbers in the research predict exactly this,\n' +
        'and publishing it is worth more than quietly shipping it on.',
)
