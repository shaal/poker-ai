/**
 * Shared bench vocabulary. Kept separate from `run.ts` so the opponent files
 * can name these types without importing the runner they are fed to.
 */

import type { Rng } from '../engine/cards'
import type { Policy } from '../engine/holdem'

/**
 * Opponents are built from an `Rng` rather than owning one, so a run is
 * reproducible from a single seed — ADR-009 results have to be re-derivable or
 * they are anecdotes.
 */
export type PolicyFactory = (rng: Rng) => Policy

export interface Opponent {
  name: string
  make: PolicyFactory
}
