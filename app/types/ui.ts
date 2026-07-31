import type { Card } from '~core/engine/cards'

/**
 * View model for one seat. Deliberately flat and presentational — the live
 * game loop can build this from `HandState` without the components needing to
 * know anything about engine internals.
 *
 * All money is in the engine's unit: integer hundredths of a big blind.
 */
export interface SeatView {
  name: string
  /** "BTN" / "BB". Heads-up, so the button is also the small blind. */
  position: string
  stack: number
  /** Committed on the current street. */
  committed: number
  /** null entries render face down. */
  cards: (Card | null)[]
  folded: boolean
  allIn: boolean
  /** Rendered verbatim under the seat: "raised to 7.5bb". Empty is fine. */
  lastAction: string
}
