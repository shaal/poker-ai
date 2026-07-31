/**
 * Naming what we have, in the words a player uses.
 *
 * The reasoning panel is unreadable if it says "percentile 0.83". It has to say
 * "top pair, weak kicker". This is presentation, but it belongs next to the
 * strategy because the label must be derived from the same board reading the
 * decision used — a panel that describes a different hand from the one the AI
 * acted on is worse than no panel.
 */

import { type Card, RANKS, rankOf, suitOf } from '../engine/cards'
import { categoryName, evaluate } from '../engine/evaluator'

export interface HandClass {
  label: string
  /** Made-hand tier, 0 = air, 8 = straight flush. */
  tier: number
  pairKind?: 'top' | 'second' | 'third' | 'under' | 'over' | 'pocket'
}

export function describeHand(hole: readonly [Card, Card], board: readonly Card[]): HandClass {
  if (board.length === 0) return { label: preflopName(hole), tier: 0 }

  const rank = evaluate([hole[0], hole[1], ...board])
  const cat = categoryName(rank)

  // Anything two pair or better speaks for itself.
  if (cat !== 'One Pair' && cat !== 'High Card') {
    return { label: cat.toLowerCase(), tier: tierOf(cat) }
  }

  const boardRanks = board.map(rankOf).sort((a, b) => b - a)
  const h0 = rankOf(hole[0])
  const h1 = rankOf(hole[1])
  const hi = Math.max(h0, h1)
  const lo = Math.min(h0, h1)

  if (cat === 'One Pair') {
    if (h0 === h1) {
      // Pocket pair: over or under the board?
      const over = boardRanks.every((r) => r < h0)
      return {
        label: over ? `overpair, ${RANKS[h0]}s` : `pocket ${RANKS[h0]}s`,
        tier: 1,
        pairKind: over ? 'over' : 'pocket',
      }
    }
    // Paired with the board. Which board card?
    const paired = boardRanks.indexOf(hi) >= 0 ? hi : lo
    const kicker = paired === hi ? lo : hi
    const position = boardRanks.filter((r, i) => boardRanks.indexOf(r) === i).indexOf(paired)
    const kind =
      position === 0 ? 'top' : position === 1 ? 'second' : position === 2 ? 'third' : 'under'
    const kickerStrength = kicker >= 10 ? 'good' : kicker >= 7 ? 'medium' : 'weak'
    const name = kind === 'under' ? 'bottom pair' : `${kind} pair`
    return { label: `${name}, ${kickerStrength} kicker`, tier: 1, pairKind: kind as HandClass['pairKind'] }
  }

  // High card. Say something more useful than "nothing" — draws matter.
  const d = drawLabel(hole, board)
  if (d) return { label: d, tier: 0 }
  const over = boardRanks.length > 0 && hi > boardRanks[0]!
  if (over && hi >= 10) return { label: `two overcards`, tier: 0 }
  return { label: 'no pair', tier: 0 }
}

function drawLabel(hole: readonly [Card, Card], board: readonly Card[]): string | null {
  if (board.length >= 5) return null
  const all = [...hole, ...board]
  const suits = [0, 0, 0, 0]
  for (const c of all) suits[suitOf(c)]!++
  const holeSuits = [suitOf(hole[0]), suitOf(hole[1])]
  const flush = holeSuits.some((s) => suits[s]! === 4)

  const ranks = new Set(all.map(rankOf))
  if (ranks.has(12)) ranks.add(-1)
  let open = false
  let gut = false
  for (let low = -1; low <= 8; low++) {
    let have = 0
    let usesHole = false
    for (let k = 0; k < 5; k++) {
      if (ranks.has(low + k)) {
        have++
        if (rankOf(hole[0]) === low + k || rankOf(hole[1]) === low + k) usesHole = true
      }
    }
    if (have === 4 && usesHole) {
      // Distinguishing open-ended from gutshot properly needs the missing card;
      // a window missing an interior card is a gutshot.
      let missingInterior = false
      for (let k = 1; k < 4; k++) if (!ranks.has(low + k)) missingInterior = true
      if (missingInterior) gut = true
      else open = true
    }
  }

  if (flush && open) return 'flush draw and open-ended straight draw'
  if (flush) return 'flush draw'
  if (open) return 'open-ended straight draw'
  if (gut) return 'gutshot straight draw'
  return null
}

function tierOf(cat: string): number {
  switch (cat) {
    case 'Straight Flush':
      return 8
    case 'Four of a Kind':
      return 7
    case 'Full House':
      return 6
    case 'Flush':
      return 5
    case 'Straight':
      return 4
    case 'Three of a Kind':
      return 3
    case 'Two Pair':
      return 2
    case 'One Pair':
      return 1
    default:
      return 0
  }
}

function preflopName(hole: readonly [Card, Card]): string {
  const a = rankOf(hole[0])
  const b = rankOf(hole[1])
  const suited = suitOf(hole[0]) === suitOf(hole[1])
  const hi = RANKS[Math.max(a, b)]!
  const lo = RANKS[Math.min(a, b)]!
  if (a === b) return `pocket ${hi}s`
  return `${hi}${lo}${suited ? ' suited' : ' offsuit'}`
}
