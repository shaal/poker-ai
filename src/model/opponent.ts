/**
 * The opponent model. ADR-005.
 *
 * Every number in here is a COUNT of something that happened, divided by a
 * count of the chances it had to happen. That is deliberate and it is ADR-006's
 * conclusion: the features an opponent model needs are conditional frequencies
 * keyed by a handful of discrete facts, which is a dictionary, not an embedding
 * space. It also means every number is inspectable, which the interface needs —
 * "from 14 spots" is part of the sentence.
 *
 * The blend is `posterior = (prior*k + observed*n) / (k + n)`. There is no
 * threshold anywhere in this file. ADR-005 rejects hard confidence gates
 * because an AI that does nothing for 400 hands and then lurches reads as
 * broken, even though gating is the statistically tidier thing to do.
 */

import type { ActionRecord, HandState, Seat, Street } from '../engine/types'

export interface StatDef {
  key: string
  /** Noun-ish heading for the readout: "folds to flop bets". */
  label: string
  /**
   * Second-person form used inside sentences addressed to the player. The
   * panel says "you fold to flop bets", not "you folds to flop bets", and
   * reusing `label` for both produced exactly that.
   */
  youDo: string
  /** Population default. Where the AI starts, so it is never blind. */
  prior: number
  /**
   * Prior strength in OPPORTUNITIES, not hands. This is the k in the blend: at
   * n = k the posterior is half prior and half player. Values are scaled to the
   * sample sizes in the research notes — fold-to-c-bet needs ~3,840 hands to
   * pin down to +/-5%, so its prior is held much more firmly than VPIP's.
   */
  k: number
  /** Which direction is exploitable, for phrasing the sentence. */
  higherMeans: string
  lowerMeans: string
}

export const STATS: readonly StatDef[] = [
  { key: 'vpip', label: 'plays hands', youDo: 'play hands', prior: 0.52, k: 25, higherMeans: 'play too many hands', lowerMeans: 'play very few hands' },
  { key: 'pfr', label: 'raises preflop', youDo: 'raise preflop', prior: 0.42, k: 25, higherMeans: 'raise a lot preflop', lowerMeans: 'rarely raise preflop' },
  { key: 'threeBet', label: '3-bets', youDo: '3-bet', prior: 0.11, k: 30, higherMeans: '3-bet often', lowerMeans: 'almost never 3-bet' },
  { key: 'foldToThreeBet', label: 'folds to 3-bets', youDo: 'fold to 3-bets', prior: 0.5, k: 30, higherMeans: 'fold to 3-bets too often', lowerMeans: 'defend 3-bets stubbornly' },
  { key: 'foldToCbetFlop', label: 'folds to flop bets', youDo: 'fold to flop bets', prior: 0.45, k: 45, higherMeans: 'fold to flop bets too often', lowerMeans: 'call flop bets too light' },
  { key: 'foldToBetTurn', label: 'folds to turn bets', youDo: 'fold to turn bets', prior: 0.48, k: 40, higherMeans: 'give up on the turn', lowerMeans: 'peel turns very wide' },
  { key: 'foldToBetRiver', label: 'folds to river bets', youDo: 'fold to river bets', prior: 0.5, k: 40, higherMeans: 'fold rivers too often', lowerMeans: 'are hard to bluff on the river' },
  { key: 'aggression', label: 'bets and raises', youDo: 'bet and raise', prior: 0.33, k: 40, higherMeans: 'are very aggressive postflop', lowerMeans: 'are passive postflop' },
  { key: 'wtsd', label: 'goes to showdown', youDo: 'go to showdown', prior: 0.48, k: 50, higherMeans: 'go to showdown a lot', lowerMeans: 'give up before showdown' },
]

export const STAT_BY_KEY: Readonly<Record<string, StatDef>> = Object.fromEntries(
  STATS.map((s) => [s.key, s]),
)

export interface Counter {
  n: number
  x: number
}

export interface OpponentProfile {
  id: string
  handsObserved: number
  counters: Record<string, Counter>
  /** Unix ms of the last update, so a profile can be aged out if desired. */
  updated: number
  version: 1
}

export function emptyProfile(id = 'player'): OpponentProfile {
  const counters: Record<string, Counter> = {}
  for (const s of STATS) counters[s.key] = { n: 0, x: 0 }
  return { id, handsObserved: 0, counters, updated: 0, version: 1 }
}

export interface OpponentModel {
  profile: OpponentProfile
  /** Blended estimate for a stat. */
  posterior(key: string): number
  /** Raw observed frequency, or null with no observations. */
  observed(key: string): number | null
  /** Opportunities seen. */
  count(key: string): number
  /** n / (n + k). How much of the posterior is this player rather than the population. */
  confidence(key: string): number
}

export function modelFrom(profile: OpponentProfile): OpponentModel {
  return {
    profile,
    posterior(key) {
      const def = STAT_BY_KEY[key]
      if (!def) return 0.5
      const c = profile.counters[key] ?? { n: 0, x: 0 }
      return (def.prior * def.k + c.x) / (def.k + c.n)
    },
    observed(key) {
      const c = profile.counters[key]
      if (!c || c.n === 0) return null
      return c.x / c.n
    },
    count(key) {
      return profile.counters[key]?.n ?? 0
    },
    confidence(key) {
      const def = STAT_BY_KEY[key]
      if (!def) return 0
      const n = profile.counters[key]?.n ?? 0
      return n / (n + def.k)
    },
  }
}

function bump(p: OpponentProfile, key: string, happened: boolean) {
  const c = (p.counters[key] ??= { n: 0, x: 0 })
  c.n++
  if (happened) c.x++
}

/**
 * Fold a completed hand into the profile.
 *
 * `villain` is the seat being observed. Opportunities are counted only where
 * the player genuinely had the chance — counting a fold-to-c-bet on a hand
 * where no c-bet was made is the classic way to make a statistic look stable
 * while measuring nothing.
 */
export function observeHand(profile: OpponentProfile, s: HandState, villain: Seat): OpponentProfile {
  const h = s.history
  const pre = h.filter((a) => a.street === 'preflop')
  const mine = pre.filter((a) => a.seat === villain)

  profile.handsObserved++
  profile.updated = Date.now()

  // VPIP / PFR: did they voluntarily put money in, and did they raise.
  if (mine.length > 0) {
    const voluntary = mine.some((a) => a.type === 'call' || a.type === 'raise' || a.type === 'bet')
    bump(profile, 'vpip', voluntary)
    bump(profile, 'pfr', mine.some((a) => a.type === 'raise' || a.type === 'bet'))
  }

  // 3-bet: they faced exactly one raise and had the option to re-raise.
  const firstRaiseIdx = pre.findIndex((a) => a.type === 'raise' || a.type === 'bet')
  if (firstRaiseIdx >= 0 && pre[firstRaiseIdx]!.seat !== villain) {
    const after = pre.slice(firstRaiseIdx + 1).filter((a) => a.seat === villain)
    if (after.length > 0) bump(profile, 'threeBet', after[0]!.type === 'raise')
  }

  // Fold to 3-bet: they raised, got re-raised, and had to respond.
  if (firstRaiseIdx >= 0 && pre[firstRaiseIdx]!.seat === villain) {
    const reraiseIdx = pre.findIndex((a, i) => i > firstRaiseIdx && a.type === 'raise')
    if (reraiseIdx >= 0) {
      const resp = pre.slice(reraiseIdx + 1).find((a) => a.seat === villain)
      if (resp) bump(profile, 'foldToThreeBet', resp.type === 'fold')
    }
  }

  // Postflop: fold-to-bet by street, and aggression frequency.
  const streets: Street[] = ['flop', 'turn', 'river']
  const foldKey: Record<string, string> = {
    flop: 'foldToCbetFlop',
    turn: 'foldToBetTurn',
    river: 'foldToBetRiver',
  }
  let aggro = 0
  let acts = 0
  for (const street of streets) {
    const on = h.filter((a) => a.street === street)
    for (let i = 0; i < on.length; i++) {
      const a = on[i]!
      if (a.seat !== villain) continue
      acts++
      if (a.type === 'bet' || a.type === 'raise') aggro++
      // Facing a bet is the opportunity; what they did with it is the outcome.
      const prev = on[i - 1]
      if (prev && prev.seat !== villain && (prev.type === 'bet' || prev.type === 'raise')) {
        bump(profile, foldKey[street]!, a.type === 'fold')
      }
    }
  }
  if (acts > 0) {
    const c = (profile.counters.aggression ??= { n: 0, x: 0 })
    c.n += acts
    c.x += aggro
  }

  // Went to showdown, given they saw a flop.
  if (s.board.length >= 3) {
    bump(profile, 'wtsd', s.result?.showdown === true)
  }

  return profile
}

/** Serialise for localStorage. Profiles surviving sessions is ADR-005 part 4. */
export function serialiseProfile(p: OpponentProfile): string {
  return JSON.stringify(p)
}

export function deserialiseProfile(json: string): OpponentProfile {
  try {
    const p = JSON.parse(json) as OpponentProfile
    if (p.version !== 1 || typeof p.counters !== 'object') return emptyProfile()
    const base = emptyProfile(p.id ?? 'player')
    for (const s of STATS) {
      const c = p.counters[s.key]
      if (c && Number.isFinite(c.n) && Number.isFinite(c.x)) base.counters[s.key] = { n: c.n, x: c.x }
    }
    base.handsObserved = Number.isFinite(p.handsObserved) ? p.handsObserved : 0
    base.updated = Number.isFinite(p.updated) ? p.updated : 0
    return base
  } catch {
    return emptyProfile()
  }
}
