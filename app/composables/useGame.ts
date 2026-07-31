/**
 * The live game loop: engine + AI + persistence, exposed as refs the page binds
 * to. This is the only file in `app/` that knows poker exists; every component
 * stays presentational.
 *
 * Deliberately mirrors the fixture shape in `app/fixtures/sample.ts` so the
 * page swaps one for the other and nothing else changes.
 */

import { computed, ref, shallowRef } from 'vue'
import { type Card, Rng } from '~core/engine/cards'
import {
  act as engineAct,
  deal,
  legalActions,
  totalPot,
  toCall as toCallOf,
} from '~core/engine/holdem'
import { equity } from '~core/engine/evaluator'
import {
  BB,
  START_STACK,
  type Action,
  type ActionRecord,
  type HandState,
  type Seat,
} from '~core/engine/types'
import { decide } from '~core/strategy/agent'
import type { Belief, Decision } from '~core/strategy/decision'
import { beliefsFor } from '~core/model/exploit'
import {
  deserialiseProfile,
  emptyProfile,
  modelFrom,
  observeHand,
  serialiseProfile,
  type OpponentProfile,
} from '~core/model/opponent'
import type { SeatView } from '~/types/ui'

const STORAGE_KEY = 'poker-ai:profile:v1'
const RESULTS_KEY = 'poker-ai:results:v1'

/**
 * Reason keys that describe OUR hand rather than the situation. These name the
 * holding or its rank inside our own range, so they are withheld until the hand
 * is over. Everything else — board texture, price, stack depth, the read — is
 * about the spot and is safe to show live.
 */
const LEAKY_REASONS = new Set(['hand', 'range', 'chart', 'line', 'note'])

/** The human is always seat 0 on the first hand; seats alternate after that. */
export interface UseGameOptions {
  /** Deliberate pause before the AI acts. Theatre, and labelled as such. */
  thinkMs?: number
  exploit?: boolean
}

export function useGame(opts: UseGameOptions = {}) {
  const thinkMs = opts.thinkMs ?? 550
  const rng = new Rng((Date.now() ^ 0x5f3759df) >>> 0)

  const profile = ref<OpponentProfile>(loadProfile())
  /**
   * OFF by default, and that is ADR-005's own rule rather than caution: "if the
   * bench says it does not [beat its own non-adaptive baseline], opponent
   * modelling ships off by default and stays an honest, visible experiment."
   *
   * As measured, it does not. On the held-out suite the adaptive configuration
   * and its own baseline are indistinguishable — every interval covers zero.
   * The research predicts exactly that at these sample sizes: fold-to-c-bet
   * alone needs ~3,840 hands to stabilise to +/-5%, and a session is a hundred.
   *
   * The reads are still computed, still shown, and still accumulate across
   * visits. What is off is letting them move the strategy. Flip the switch and
   * they do — see docs/results.md before believing it helps.
   */
  const exploitEnabled = ref(opts.exploit ?? false)

  const state = shallowRef<HandState>(deal(rng))
  const version = ref(0) // bumped to force recompute after in-place mutation
  const heroSeat = ref<Seat>(0)
  const rawDecision = shallowRef<Decision | null>(null)
  const thinking = ref(false)
  const handOver = ref(false)
  const revealAi = ref(false)
  const message = ref('')

  const results = ref<number[]>(loadResults())
  const allIn = ref<{ street: string; equity: number; evBB: number; actualBB: number } | null>(null)

  const stacks = ref<[number, number]>([START_STACK, START_STACK])

  const beliefs = computed<Belief[]>(() => {
    void version.value
    return beliefsFor(modelFrom(profile.value), state.value, aiSeat.value)
  })

  const aiSeat = computed<Seat>(() => (heroSeat.value === 0 ? 1 : 0))

  /**
   * The reasoning panel, sealed while the hand is live.
   *
   * The AI explains itself, but it cannot explain itself in terms that name the
   * cards it is holding — "87s at button open is a 100/0/0 raise" tells the
   * player exactly what it has, and an opponent that shows you its hand is not
   * an opponent. ADR-010 anticipates this and says the way to keep the
   * explanation credible rather than post-hoc is to show it SEALED before the
   * cards run out, then open it.
   *
   * What stays visible mid-hand is everything about the STRATEGY: the action,
   * the mixed distribution it came from, the exploitative shift, the beliefs
   * used, the pot and the SPR. What gets sealed is everything that identifies
   * the specific holding. After the hand it all opens, including on a fold,
   * where the player would otherwise never learn what happened.
   */
  const decision = computed<Decision | null>(() => {
    void version.value
    const d = rawDecision.value
    if (!d) return null
    if (handOver.value) return d
    return {
      ...d,
      // The hand-conditional mix is itself a strength label: "bet 52%" against
      // "bet 6%" identifies the holding within two or three observations
      // without ever naming a card. So mid-hand the panel shows what our whole
      // RANGE does here, which is a property of the spot, and the
      // hand-conditional distribution opens when the hand does.
      policy: d.rangePolicy ?? [],
      baseline: d.rangePolicy ?? [],
      exploitShift: 0,
      reading: {
        label: 'sealed until the hand ends',
        equityVsRange: NaN,
        equityCi95: NaN,
        percentileInOwnRange: NaN,
        aheadOfRange: NaN,
        rangeAdvantage: d.reading.rangeAdvantage,
        villainCombos: d.reading.villainCombos,
      },
      // Reasons that quote a hand class or a percentile of our own range are
      // dropped; reasons about the board, the price and the read are kept.
      reasons: d.reasons.filter((r) => !LEAKY_REASONS.has(r.key)),
    }
  })

  const board = computed<Card[]>(() => {
    void version.value
    return state.value.board.slice()
  })

  const pot = computed(() => {
    void version.value
    return totalPot(state.value)
  })

  const street = computed(() => {
    void version.value
    return state.value.street
  })

  const toAct = computed<0 | 1 | null>(() => {
    void version.value
    if (handOver.value || state.value.finished) return null
    // The page thinks in "hero = 0", so translate seats into that frame.
    return state.value.toAct === heroSeat.value ? 0 : 1
  })

  const log = computed<ActionRecord[]>(() => {
    void version.value
    return state.value.history.slice()
  })

  function seatView(seat: Seat, isHero: boolean): SeatView {
    void version.value
    const p = state.value.players[seat]
    const last = [...state.value.history].reverse().find((a) => a.seat === seat)
    const show = isHero || revealAi.value || state.value.result?.showdown === true
    return {
      name: isHero ? 'You' : 'Opponent',
      position: seat === 0 ? 'BTN' : 'BB',
      stack: p.stack,
      committed: p.committed,
      cards: show ? [p.hole[0], p.hole[1]] : [null, null],
      folded: p.folded,
      allIn: p.allIn,
      lastAction: last ? describeAction(last) : '',
    }
  }

  const hero = computed(() => seatView(heroSeat.value, true))
  const villain = computed(() => seatView(aiSeat.value, false))

  const betting = computed(() => {
    void version.value
    const s = state.value
    const seat = heroSeat.value
    const legal = s.toAct === seat && !s.finished ? legalActions(s) : []
    const raise = legal.find((l) => l.type === 'bet' || l.type === 'raise')
    return {
      potChips: totalPot(s),
      toCallChips: s.toAct === seat ? toCallOf(s, seat) : 0,
      stackChips: s.players[seat].stack,
      committedChips: s.players[seat].committed,
      minRaiseToChips: raise?.min ?? 0,
      maxToChips: raise?.max ?? 0,
      canCheck: legal.some((l) => l.type === 'check'),
      canCall: legal.some((l) => l.type === 'call'),
      canFold: legal.some((l) => l.type === 'fold'),
      canRaise: !!raise,
      raiseLabel: raise?.type === 'bet' ? 'Bet' : 'Raise',
    }
  })

  const variance = computed(() => {
    const n = results.value.length
    const sum = results.value.reduce((a, b) => a + b, 0)
    const mean = n > 0 ? (sum / n) * (100 / BB) : 0
    let sd = 0
    if (n > 1) {
      const m = sum / n
      let v = 0
      for (const r of results.value) v += (r - m) ** 2
      sd = Math.sqrt(v / (n - 1))
    }
    // 95% CI on bb/100. At the sample sizes a human plays, this is enormous,
    // and showing it is the entire point of ADR-010.
    const ci95 = n > 1 ? (1.96 * (sd / Math.sqrt(n)) * 100) / BB : Infinity
    return { hands: n, bb100: mean, ci95, allIn: allIn.value }
  })

  function describeAction(a: ActionRecord): string {
    switch (a.type) {
      case 'fold':
        return 'folded'
      case 'check':
        return 'checked'
      case 'call':
        return `called ${(a.paid / BB).toFixed(1)}bb`
      default:
        return `${a.type === 'bet' ? 'bet' : 'raised to'} ${((a.to ?? 0) / BB).toFixed(1)}bb`
    }
  }

  function bump() {
    version.value++
  }

  /** Human action. Applies it, then hands over to the AI. */
  async function playerAction(a: Action) {
    const s = state.value
    if (s.finished || s.toAct !== heroSeat.value) return
    engineAct(s, a)
    bump()
    await advance()
  }

  /** Drive the hand forward until it is the human's turn again, or it ends. */
  async function advance() {
    const s = state.value
    while (!s.finished && s.toAct === aiSeat.value) {
      thinking.value = true
      // The lookup is instant. The pause is theatre in service of legibility,
      // and the interface plan says to be honest about that internally.
      if (thinkMs > 0) await sleep(thinkMs)
      const d = decide(s, aiSeat.value, {
        rng,
        runouts: 120,
        explain: true,
        model: modelFrom(profile.value),
        exploit: exploitEnabled.value,
      })
      rawDecision.value = d
      engineAct(s, d.action)
      thinking.value = false
      bump()
    }
    if (s.finished) finishHand()
  }

  function finishHand() {
    const s = state.value
    handOver.value = true
    // Reveal at the end of every hand, including folds. The hand can no longer
    // be affected, and the entire proposition is that you can check whether the
    // AI's reasoning was honest — which you cannot do if it keeps its cards.
    revealAi.value = true

    // ADR-010: when the money went in with cards to come, show what the
    // decision was worth as well as what the cards did with it.
    const wentAllIn = s.players[0].allIn && s.players[1].allIn
    if (wentAllIn && s.result) {
      const e = equity(s.players[heroSeat.value].hole, s.players[aiSeat.value].hole, [], 20_000, rng)
      const pot = s.players[0].invested + s.players[1].invested
      allIn.value = {
        street: s.street,
        equity: e.equity,
        evBB: (e.equity * pot - s.players[heroSeat.value].invested) / BB,
        actualBB: s.result.delta[heroSeat.value] / BB,
      }
    } else {
      allIn.value = null
    }

    if (s.result) {
      results.value = [...results.value, s.result.delta[heroSeat.value]]
      saveResults(results.value)
      message.value = resultMessage(s.result.delta[heroSeat.value], s.result.showdown)
    }

    // Learn from the hand. The AI observes the HUMAN, so the seat is hero's.
    profile.value = observeHand({ ...profile.value }, s, heroSeat.value)
    saveProfile(profile.value)

    // Carry stacks forward, topping back up to 100bb — ADR-001 fixes the depth.
    stacks.value = [START_STACK, START_STACK]
  }

  function resultMessage(delta: number, showdown: boolean): string {
    const bb = Math.abs(delta) / BB
    if (delta > 0) return showdown ? `You win ${bb.toFixed(1)}bb at showdown.` : `You win ${bb.toFixed(1)}bb.`
    if (delta < 0) return showdown ? `You lose ${bb.toFixed(1)}bb at showdown.` : `You lose ${bb.toFixed(1)}bb.`
    return 'Split pot.'
  }

  /** Next hand. Seats alternate so neither player keeps the button. */
  async function nextHand() {
    heroSeat.value = heroSeat.value === 0 ? 1 : 0
    state.value = deal(rng, { stacks: stacks.value })
    rawDecision.value = null
    handOver.value = false
    revealAi.value = false
    message.value = ''
    allIn.value = null
    bump()
    await advance()
  }

  function resetProfile() {
    profile.value = emptyProfile()
    saveProfile(profile.value)
    results.value = []
    saveResults([])
  }

  // Kick off: if the AI has the button it acts first.
  void advance()

  return {
    board,
    pot,
    street,
    hero,
    villain,
    decision,
    beliefs,
    variance,
    log,
    betting,
    thinking,
    toAct,
    handOver,
    message,
    profile,
    exploitEnabled,
    playerAction,
    nextHand,
    resetProfile,
    handsObserved: computed(() => profile.value.handsObserved),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function loadProfile(): OpponentProfile {
  if (typeof localStorage === 'undefined') return emptyProfile()
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? deserialiseProfile(raw) : emptyProfile()
}

function saveProfile(p: OpponentProfile) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, serialiseProfile(p))
  } catch {
    // Storage full or blocked. The model still works for this session; losing
    // persistence is a degraded feature, not an error worth interrupting play.
  }
}

function loadResults(): number[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(RESULTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is number => Number.isFinite(x)) : []
  } catch {
    return []
  }
}

function saveResults(r: number[]) {
  if (typeof localStorage === 'undefined') return
  try {
    // Cap the stored history; the confidence interval only needs the moments,
    // but keeping the raw results makes the panel honest if we change the maths.
    localStorage.setItem(RESULTS_KEY, JSON.stringify(r.slice(-5000)))
  } catch {
    /* see saveProfile */
  }
}
