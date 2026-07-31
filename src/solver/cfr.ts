/**
 * Vanilla CFR and CFR+, both by full tree traversal. Offline only — see
 * ADR-004; none of this is allowed anywhere near the browser.
 *
 * The details that are easy to get wrong, all of them here:
 *
 *  - Regret is accumulated per INFORMATION SET, not per history. An information
 *    set is visited once per history in it (in Kuhn, once per deal that gives
 *    the player that card), and those visits are one update between them. The
 *    regret deltas are therefore buffered during a traversal and applied at the
 *    end of it. Applying them in place would (a) floor a partial sum, which is
 *    not regret matching+ at all and quietly biases every regret upward, and
 *    (b) let the strategy shift underneath the traversal that is measuring it.
 *  - CFR+ floors cumulative regret at zero after every update, rather than only
 *    reading it as `max(r, 0)`. That is what lets an action which has been bad
 *    for a thousand iterations come straight back the moment it stops being bad.
 *  - The average strategy is weighted by the iteration number t. Late iterates
 *    sit closer to equilibrium, so they should count for more.
 *  - Players are updated alternately, one traversal each per iteration.
 *  - Regret is weighted by the OPPONENT's reach (times chance), the average
 *    strategy by the player's OWN reach. Swapping those two is the classic
 *    silent bug: it still converges to something, just not to equilibrium.
 */

import { Rng } from '../engine/cards'
import type { Game, Strategy } from './game'
import { exploitability } from './exploitability'

interface Node {
  player: 0 | 1
  actions: string[]
  /** Cumulative counterfactual regret. */
  regret: Float64Array
  /** This traversal's regret, held back until the traversal ends. */
  delta: Float64Array
  /** Regret-matched strategy, recomputed once per traversal. */
  strategy: Float64Array
  /** Traversal number `strategy` was computed for. */
  stamp: number
  strategySum: Float64Array
}

export interface SolveOptions {
  /** CFR+ when true (the default), vanilla CFR when false. */
  plus?: boolean
  /** Seeds the symmetry-breaking jitter. Same seed and iterations => same output. */
  seed?: number
  /**
   * Size of the tiny positive regret each information set starts with.
   *
   * With all-zero regrets the first strategy is uniform and every tie is broken
   * by traversal order, which quietly picks one equilibrium out of a family and
   * makes it look like a property of the game. A jitter this small is washed
   * out within a handful of iterations but makes the choice explicit and
   * reproducible. Set to 0 for the plain textbook start.
   */
  jitter?: number
}

export interface Solution {
  /** Average strategy: information set -> probability per action. */
  strategy: Strategy
  /** Action labels, positionally aligned with `strategy`. */
  actions: Map<string, string[]>
  /** Sum of both best-response values against `strategy`. Zero at equilibrium. */
  exploitability: number
  iterations: number
}

export function solve<S>(game: Game<S>, iterations: number, opts: SolveOptions = {}): Solution {
  const plus = opts.plus ?? true
  const jitter = opts.jitter ?? 1e-6
  const rng = new Rng(opts.seed ?? 1)
  const nodes = new Map<string, Node>()

  /** Bumped once per traversal; `Node.stamp` compares against it. */
  let pass = 0

  const nodeFor = (key: string, player: 0 | 1, actions: string[]): Node => {
    let n = nodes.get(key)
    if (n === undefined) {
      const regret = new Float64Array(actions.length)
      for (let i = 0; i < actions.length; i++) regret[i] = rng.float() * jitter
      n = {
        player,
        actions,
        regret,
        delta: new Float64Array(actions.length),
        strategy: new Float64Array(actions.length),
        stamp: -1,
        strategySum: new Float64Array(actions.length),
      }
      nodes.set(key, n)
    }
    return n
  }

  /** Regret matching: probabilities proportional to positive regret, else uniform. */
  const strategyOf = (n: Node): Float64Array => {
    if (n.stamp === pass) return n.strategy
    n.stamp = pass
    const k = n.regret.length
    let total = 0
    for (let i = 0; i < k; i++) {
      const r = n.regret[i]!
      const v = r > 0 ? r : 0
      n.strategy[i] = v
      total += v
    }
    if (total > 0) {
      for (let i = 0; i < k; i++) n.strategy[i] = n.strategy[i]! / total
    } else {
      n.strategy.fill(1 / k)
    }
    return n.strategy
  }

  /**
   * Returns the expected utility of `s` from `player`'s seat.
   * `reachP` is `player`'s own reach, `reachO` the opponent's reach times chance.
   */
  const walk = (s: S, player: 0 | 1, reachP: number, reachO: number, weight: number): number => {
    if (game.isTerminal(s)) {
      const u = game.utility(s)
      return player === 0 ? u : -u
    }
    if (game.isChance(s)) {
      let v = 0
      for (const o of game.chanceOutcomes(s)) {
        // Chance folds into the counterfactual reach, which is why it belongs
        // on the opponent's side of the pair rather than the player's.
        v += o.prob * walk(o.next, player, reachP, reachO * o.prob, weight)
      }
      return v
    }

    const seat = game.currentPlayer(s)
    const node = nodeFor(game.infoSetKey(s), seat, game.actions(s))
    const strat = strategyOf(node)
    const k = node.actions.length

    if (seat !== player) {
      let v = 0
      // Zero-probability branches are still walked: the player has information
      // sets down there whose average strategy a best response can reach, and
      // skipping them leaves those sets stuck at uniform.
      for (let i = 0; i < k; i++) {
        const p = strat[i]!
        v += p * walk(game.next(s, node.actions[i]!), player, reachP, reachO * p, weight)
      }
      return v
    }

    const util = new Array<number>(k)
    let nodeUtil = 0
    for (let i = 0; i < k; i++) {
      const u = walk(game.next(s, node.actions[i]!), player, reachP * strat[i]!, reachO, weight)
      util[i] = u
      nodeUtil += strat[i]! * u
    }
    for (let i = 0; i < k; i++) {
      node.delta[i] = node.delta[i]! + reachO * (util[i]! - nodeUtil)
      node.strategySum[i] = node.strategySum[i]! + weight * reachP * strat[i]!
    }
    return nodeUtil
  }

  /** One iteration's worth of regret, applied to `player`'s sets in one step. */
  const commit = (player: 0 | 1): void => {
    for (const n of nodes.values()) {
      if (n.player !== player) continue
      for (let i = 0; i < n.regret.length; i++) {
        const r = n.regret[i]! + n.delta[i]!
        n.regret[i] = plus && r < 0 ? 0 : r
        n.delta[i] = 0
      }
    }
  }

  for (let t = 1; t <= iterations; t++) {
    // Linear averaging for CFR+, flat averaging for vanilla CFR.
    const weight = plus ? t : 1
    pass++
    walk(game.root(), 0, 1, 1, weight)
    commit(0)
    pass++
    walk(game.root(), 1, 1, 1, weight)
    commit(1)
  }

  const strategy: Strategy = new Map()
  const actions = new Map<string, string[]>()
  for (const [key, n] of nodes) {
    const k = n.actions.length
    let total = 0
    for (let i = 0; i < k; i++) total += n.strategySum[i]!
    const avg = new Array<number>(k)
    if (total > 0) {
      for (let i = 0; i < k; i++) avg[i] = n.strategySum[i]! / total
    } else {
      avg.fill(1 / k)
    }
    strategy.set(key, avg)
    actions.set(key, n.actions)
  }

  return { strategy, actions, exploitability: exploitability(game, strategy), iterations }
}
