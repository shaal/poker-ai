/**
 * The smallest extensive-form game surface CFR needs, generic over the state
 * type so a game can stay a plain object and the solver never has to know what
 * a card is.
 *
 * ADR-004 is the reason this exists at all: nothing here runs in the browser.
 * These games are solved offline and the result ships as a static table.
 *
 * The solver leans on four properties that a game MUST honour, and none of
 * which are checkable from inside this file:
 *
 *  1. Two players, zero sum. `utility` is always from player 0's seat; player
 *     1's utility is its negation.
 *  2. Perfect recall, and every history in an information set sits at the same
 *     depth. The best-response pass in `exploitability.ts` resolves information
 *     sets deepest-first and would be wrong without this.
 *  3. `infoSetKey` never collides across the two players.
 *  4. `actions(s)` returns the same actions in the same order for every state
 *     in an information set. Strategy vectors are indexed positionally, so a
 *     reordering silently permutes the strategy.
 */
export interface Game<S> {
  root(): S
  isTerminal(s: S): boolean
  /** Utility for player 0. Zero-sum, so player 1 gets the negation. */
  utility(s: S): number
  isChance(s: S): boolean
  chanceOutcomes(s: S): { next: S; prob: number }[]
  currentPlayer(s: S): 0 | 1
  infoSetKey(s: S): string
  actions(s: S): string[]
  next(s: S, action: string): S
}

/**
 * The behavioural strategy of both players: information set key -> probability
 * per action, positionally aligned with `actions()`. A missing key means the
 * information set was never reached and is treated as uniform.
 */
export type Strategy = Map<string, number[]>

/** Probabilities at `s`, falling back to uniform for an unvisited information set. */
export function probsAt<S>(game: Game<S>, s: S, strategy: Strategy): number[] {
  const acts = game.actions(s)
  const p = strategy.get(game.infoSetKey(s))
  if (p !== undefined && p.length === acts.length) return p
  return new Array<number>(acts.length).fill(1 / acts.length)
}

/** Utility at a terminal from `player`'s seat. */
export function payoff<S>(game: Game<S>, s: S, player: 0 | 1): number {
  const u = game.utility(s)
  return player === 0 ? u : -u
}
