/**
 * `phe` ships no types. Declaring only what we use keeps the ADR-008 trap
 * visible in the type system rather than in a comment nobody reads: the
 * singular `cardCode` is deliberately typed as taking two arguments, because
 * `cardCode('Ac')` returns 0 for every card and produced a plausible-looking
 * 50.00% equity before it was caught.
 */
declare module 'phe' {
  /** Rank in [1, 7462]. LOWER IS BETTER: 1 is a royal flush. */
  export function evaluateCardCodes(codes: number[]): number
  export function evaluateCards(cards: string[]): number
  export function rankCardCodes(codes: number[]): number
  /** Correct entry point for string -> code conversion. */
  export function cardCodes(cards: string[]): number[]
  /** Takes (rank, suit) SEPARATELY. Passing one string returns 0. */
  export function cardCode(rank: string, suit: string): number
  export function stringifyCardCode(code: number): string
  export const rankDescription: string[]
  export function rankDescriptionOf(rank: number): string
}
