/**
 * Does the solved preflop dataset solve the game we are actually playing?
 *
 * The roadmap said adopting b-inary/poker-cfr was "a download and a parser" —
 * replacing the hand-authored charts in src/strategy/charts.ts with solved
 * ones. Before spending that, this asks the question that decides it, in the
 * same spirit as probe-vector.ts: do not trust the label "solved", look at what
 * was solved.
 *
 * It downloads the 100bb dataset, decodes it, and prints the button's opening
 * strategy next to ours. ADR-017 records what that showed and why the charts
 * were not adopted. Re-run it if the conclusion is ever doubted; every number
 * in ADR-017 comes out of this file.
 *
 * The dataset and the solver that produced it are BSD-2:
 *
 *   Copyright (c) 2020, Wataru Inariba <oinari17@gmail.com>
 *   https://github.com/b-inary/poker-cfr — BSD 2-Clause, see LICENSE.md there.
 *
 * Nothing from it is redistributed here. The file is fetched at probe time into
 * scratch/, which is gitignored.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { SB_OPEN } from '../src/strategy/charts'

const STACK = 100
const ITERS = 670000
const URL = `https://raw.githubusercontent.com/b-inary/poker-cfr/main/output/preflop-${STACK}-${ITERS}.bin`
const CACHE = `scratch/preflop-${STACK}-${ITERS}.bin`

/** Strategy at one public infoset: [action][rank i][rank j] -> frequency. */
type Grid = number[][][]

// bincode 1.x `serialize()`: little-endian, fixed-width u64 lengths, no varint.
// The payload is (HashMap<PublicInfoSet, Vec<Vec<Vec<f64>>>>, f64 ev, f64 expl).
function decode(buf: Buffer) {
  let off = 0
  const u64 = () => { const v = buf.readBigUInt64LE(off); off += 8; return Number(v) }
  const f64 = () => { const v = buf.readDoubleLE(off); off += 8; return v }
  const u8 = () => buf.readUInt8(off++)

  const strategy = new Map<string, Grid>()
  const entries = u64()
  for (let e = 0; e < entries; e++) {
    const keyLen = u64()
    const key: number[] = []
    for (let i = 0; i < keyLen; i++) key.push(u8())
    const actions: Grid = []
    const nActions = u64()
    for (let a = 0; a < nActions; a++) {
      const grid: number[][] = []
      const nRows = u64()
      for (let i = 0; i < nRows; i++) {
        const row: number[] = []
        const nCols = u64()
        for (let j = 0; j < nCols; j++) row.push(f64())
        grid.push(row)
      }
      actions.push(grid)
    }
    strategy.set(key.join(','), actions)
  }
  const ev = f64()
  const exploitability = f64()

  // Consuming every byte is the check that the format was read correctly. A
  // wrong stride would still produce plausible-looking numbers.
  if (off !== buf.length) {
    throw new Error(`decode consumed ${off} of ${buf.length} bytes — format mismatch`)
  }
  return { strategy, ev, exploitability }
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

// Actions in the upstream tree, by index. Sizes multiply the current bet.
const ACTIONS = ['fold', 'limp', '2.5x', '3x', '3.5x', '4x', 'allin']

// Every index below is either a loop bound over the fixed 13x13 grid or a
// lookup already range-checked by cellOf, so these assert rather than branch.
const freq = (g: Grid, action: number, i: number, j: number): number => g[action]![i]![j]!
const rank = (i: number): string => RANKS[i]!
const actionName = (k: number): string => ACTIONS[k]!
/** Total frequency across every raise action — the tree's actions 2 and up. */
const raiseFreq = (g: Grid, i: number, j: number): number =>
  g.slice(2).reduce((s, _, k) => s + freq(g, k + 2, i, j), 0)

// grid[i][j]: i<j suited, i>j offsuit, i==j pair, rank index 0 = deuce. The
// index order is not documented upstream and is asserted in main() rather than
// assumed, because reading it backwards would invert every conclusion here.
const label = (i: number, j: number) =>
  i === j ? rank(i) + rank(i)
    : i < j ? rank(j) + rank(i) + 's'
      : rank(i) + rank(j) + 'o'
const combos = (i: number, j: number) => (i === j ? 6 : i < j ? 4 : 12)
const ourFreq = (hand: string): number => (SB_OPEN as Record<string, number>)[hand] ?? 0

function cellOf(hand: string): [number, number] {
  const a = RANKS.indexOf(hand.charAt(0))
  const b = RANKS.indexOf(hand.charAt(1))
  if (a < 0 || b < 0) throw new Error(`not a hand class: ${hand}`)
  if (hand.length === 2) return [a, a]
  return hand.charAt(2) === 's'
    ? [Math.min(a, b), Math.max(a, b)]
    : [Math.max(a, b), Math.min(a, b)]
}

async function main() {
  mkdirSync('scratch', { recursive: true })
  if (!existsSync(CACHE)) {
    console.log(`fetching ${URL}`)
    const res = await fetch(URL)
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
    writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()))
  }
  const { strategy, ev, exploitability } = decode(readFileSync(CACHE))
  const root = strategy.get('')
  const vsLimp = strategy.get('1')
  if (!root || !vsLimp) throw new Error('dataset is missing the root or the vs-limp node')

  console.log(`dataset:         preflop-${STACK}-${ITERS}.bin`)
  console.log(`infosets:        ${strategy.size}`)
  console.log(`exploitability:  ${exploitability.toExponential(3)} bb`)
  console.log(`EV of button:    ${ev.toFixed(4)} bb/hand at equilibrium`)

  // Assert the rank order before reading anything off the grid. Under the
  // reversed order this row would be AA and AKs..A8s folding 100%, which is
  // absurd; under the right one it is 32s..92s, which is not.
  const lowSuitedFold = [1, 2, 3, 4, 5, 6, 7].every((j) => freq(root, 0, 0, j) > 0.99)
  const highSuitedPlay = [8, 9, 10, 11, 12].every((j) => freq(root, 0, 0, j) < 0.01)
  if (!lowSuitedFold || !highSuitedPlay) {
    throw new Error('rank-index assumption failed — the grid is not indexed 0=deuce')
  }
  console.log(`rank order:      verified 0 = deuce (32s..92s fold, T2s..A2s do not)`)

  let fold = 0, limp = 0, raise = 0, ours = 0
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const c = combos(i, j)
      fold += c * freq(root, 0, i, j)
      limp += c * freq(root, 1, i, j)
      raise += c * raiseFreq(root, i, j)
      ours += c * ourFreq(label(i, j))
    }
  }
  const pct = (n: number) => (100 * n / 1326).toFixed(1)
  console.log(`\nButton's first action, combo-weighted over all 1326 combos:`)
  console.log(`  solved:  fold ${pct(fold)}%   limp ${pct(limp)}%   raise ${pct(raise)}%`)
  console.log(`  ours:    fold ${(100 - Number(pct(ours))).toFixed(1)}%   limp  n/a    raise ${pct(ours)}%`)
  console.log(`  Our button node has no limp action at all (charts.ts SB_OPEN has an`)
  console.log(`  empty passive chart), so ${pct(limp)}% of the solved strategy has nowhere to go.`)

  console.log(`\nThe hands whose treatment says which game was solved:`)
  for (const h of ['AA', 'KK', '22', 'AKs', 'AJo', '76s', '54s', 'T2s', 'J2o', '32s']) {
    const [i, j] = cellOf(h)
    console.log(`  ${h.padEnd(4)} solved: fold ${freq(root, 0, i, j).toFixed(2)}  limp ${freq(root, 1, i, j).toFixed(2)}  raise ${raiseFreq(root, i, j).toFixed(2)}    ours: raise ${ourFreq(h).toFixed(2)}`)
  }

  console.log(`\nBig blind facing a limp — the node that gives the game away:`)
  for (const h of ['AA', '22', '76s', '72o']) {
    const [i, j] = cellOf(h)
    const dist = vsLimp.map((_, k) => `${actionName(k)}=${freq(vsLimp, k, i, j).toFixed(2)}`)
    console.log(`  ${h.padEnd(4)} ${dist.join(' ')}`)
  }

  console.log(`\nRaise sizes the solved root actually uses, as a share of all raises:`)
  const mix = root.slice(2).map((_, k) => {
    let m = 0
    for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) m += combos(i, j) * freq(root, k + 2, i, j)
    return { size: actionName(k + 2), mass: m }
  })
  const total = mix.reduce((s, x) => s + x.mass, 0)
  for (const s of mix) console.log(`  ${s.size.padEnd(6)} ${(100 * s.mass / total).toFixed(1)}%`)
  const ourSize = mix.find((s) => s.size === '2.5x')
  console.log(`  Our open is 2.5x, which the solved strategy uses ${(100 * (ourSize?.mass ?? 0) / total).toFixed(1)}% of the time.`)

  console.log(`\nSee docs/adrs/017-solved-preflop-charts-not-adopted.md.`)
}

await main()
