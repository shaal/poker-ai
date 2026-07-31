/**
 * The AI. Turns a hand state into an action AND the explanation of that action,
 * because per the interface plan the explanation is the product.
 *
 * Structure mirrors ADR-003's split: preflop is a chart lookup and says so;
 * postflop is the range-aware policy and says so. Nothing here pretends to
 * search — ADR-004 rules that out and the honest label matters more than the
 * impressive one.
 */

import { type Card, hand169ToString, Rng } from '../engine/cards'
import { legalActions, other, potOdds, spr as sprOf, toCall as toCallOf, totalPot } from '../engine/holdem'
import { BB, type Action, type HandState, type LegalAction, type Seat } from '../engine/types'
import {
  actionFreqs,
  BB_VS_4BET_5BET,
  BB_VS_4BET_CALL,
  BB_VS_OPEN_3BET,
  BB_VS_OPEN_CALL,
  SB_OPEN,
  SB_VS_3BET_4BET,
  SB_VS_3BET_CALL,
  type Chart,
} from './charts'
import { type Belief, type Decision, formatBB, type HandReading, type Reason, type WeightedAction } from './decision'
import { describeHand } from './handclass'
import { postflopPolicy, type PolicyContext, type PolicyOption } from './policy'
import { classOf, heroRangeFor, villainRangeFor } from './tracker'
import { sprBucket, SPR_LABELS } from './texture'
import type { OpponentModel } from '../model/opponent'
import { applyExploit, beliefsFor, narrowOptionsFor } from '../model/exploit'

/** Preflop raise sizes, in chips. Heads-up standards at 100bb. */
export const OPEN_TO = Math.round(2.5 * BB)
export const THREE_BET_TO = Math.round(9 * BB)
export const FOUR_BET_TO = Math.round(21 * BB)

export interface AgentOptions {
  rng: Rng
  /** Runout samples for equity. Low in the bench, high in the interface. */
  runouts?: number
  model?: OpponentModel
  /** When false the opponent model is computed and shown but never applied. */
  exploit?: boolean
}

export function decide(s: HandState, seat: Seat, opts: AgentOptions): Decision {
  const t0 = now()
  const rng = opts.rng
  // `legalActions` reads `s.toAct`, so deciding for a seat that is not to act
  // would silently return the OTHER player's legal actions attached to our
  // cards. Loud is better: this can only be a caller bug.
  if (s.toAct !== seat) {
    throw new Error(`decide() called for seat ${seat} but seat ${s.toAct} is to act`)
  }
  const legal = legalActions(s)
  const pot = totalPot(s)
  const toCall = toCallOf(s, seat)
  const hole = s.players[seat].hole as readonly [Card, Card]

  const base =
    s.street === 'preflop'
      ? preflopDecision(s, seat, legal, opts)
      : postflopDecision(s, seat, legal, opts)

  // The opponent model can only ever shift a distribution that already exists.
  // ADR-005: a bounded departure from the baseline, never a raw best response.
  const beliefs = opts.model ? beliefsFor(opts.model, s, seat) : []
  const shifted =
    opts.model && opts.exploit !== false
      ? applyExploit(base.policy, beliefs, s, seat, opts.model)
      : { policy: base.policy, shift: 0, used: [] as Belief[] }

  const chosen = sample(shifted.policy, rng)

  // Explain the action actually TAKEN, not the most likely one. With a mixed
  // strategy those differ regularly, and a panel that justifies a different
  // action from the one on screen destroys the only thing it is there for.
  const reasons = [...base.reasons]
  const chosenEntry = shifted.policy.find(
    (w) => w.action.type === chosen.type && w.action.to === chosen.to,
  )
  if (chosenEntry?.rationale) {
    reasons.unshift({ key: 'line', text: chosenEntry.rationale })
  }

  return {
    action: chosen,
    policy: shifted.policy,
    baseline: base.policy,
    exploitShift: shifted.shift,
    reading: base.reading,
    reasons,
    beliefsUsed: shifted.used,
    source: base.source,
    street: s.street,
    seat,
    potBB: pot / BB,
    toCallBB: toCall / BB,
    spr: sprOf(s),
    computeMs: now() - t0,
  }
}

/** A `Policy` for the engine and the bench: decides and returns just the action. */
export function makePolicy(opts: AgentOptions): (s: HandState, seat: Seat) => Action {
  return (s, seat) => decide(s, seat, opts).action
}

interface Base {
  policy: WeightedAction[]
  reading: HandReading
  reasons: Reason[]
  source: Decision['source']
}

// ---------------------------------------------------------------- preflop

function preflopNode(s: HandState, seat: Seat): { aggro: Chart; passive: Chart; raiseTo: number; name: string } {
  const pre = s.history.filter((a) => a.street === 'preflop')
  const raises = pre.filter((a) => a.type === 'raise' || a.type === 'bet')

  if (seat === 0) {
    if (raises.length === 0) return { aggro: SB_OPEN, passive: {}, raiseTo: OPEN_TO, name: 'button open' }
    return { aggro: SB_VS_3BET_4BET, passive: SB_VS_3BET_CALL, raiseTo: FOUR_BET_TO, name: 'button vs 3-bet' }
  }
  if (raises.length <= 1) {
    return { aggro: BB_VS_OPEN_3BET, passive: BB_VS_OPEN_CALL, raiseTo: THREE_BET_TO, name: 'big blind vs open' }
  }
  return { aggro: BB_VS_4BET_5BET, passive: BB_VS_4BET_CALL, raiseTo: s.players[seat].stack + s.players[seat].committed, name: 'big blind vs 4-bet' }
}

function preflopDecision(s: HandState, seat: Seat, legal: LegalAction[], opts: AgentOptions): Base {
  const hole = s.players[seat].hole as readonly [Card, Card]
  const cls = classOf(hole)
  const node = preflopNode(s, seat)
  const f = actionFreqs(node.aggro, node.passive, cls)

  const pot = totalPot(s)
  const toCall = toCallOf(s, seat)
  const canRaise = legal.find((l) => l.type === 'bet' || l.type === 'raise')
  const canCheck = legal.some((l) => l.type === 'check')

  const policy: WeightedAction[] = []

  if (canRaise && f.aggro > 0) {
    const to = clampTo(node.raiseTo, canRaise)
    policy.push({
      action: { type: canRaise.type, to },
      prob: f.aggro,
      label: `${canRaise.type} to ${formatBB(to)}bb`,
    })
  }

  // Whatever is not raised is called or checked; the residual folds. When
  // checking is free, the "fold" mass becomes a check — folding a free option
  // is the kind of bug a chart-driven strategy makes silently.
  const passiveProb = canCheck ? 1 - (canRaise && f.aggro > 0 ? f.aggro : 0) : f.passive
  if (canCheck) {
    if (passiveProb > 0) policy.push({ action: { type: 'check' }, prob: passiveProb, label: 'check' })
  } else {
    if (f.passive > 0) {
      policy.push({ action: { type: 'call' }, prob: f.passive, label: `call ${formatBB(toCall)}bb` })
    }
    if (f.fold > 0) policy.push({ action: { type: 'fold' }, prob: f.fold, label: 'fold' })
  }
  if (policy.length === 0) {
    policy.push(canCheck ? { action: { type: 'check' }, prob: 1, label: 'check' } : { action: { type: 'fold' }, prob: 1, label: 'fold' })
  }
  renormalise(policy)

  const name = hand169ToString(cls)
  const reasons: Reason[] = [
    { key: 'chart', text: `${name} at "${node.name}" is a ${(f.aggro * 100).toFixed(0)}/${(f.passive * 100).toFixed(0)}/${(f.fold * 100).toFixed(0)} raise/call/fold` },
  ]
  if (toCall > 0) {
    reasons.push({ key: 'price', text: `we are getting ${(1 / potOdds(s, seat)).toFixed(1)}:1 on a call` })
  }

  const reading: HandReading = {
    label: describeHand(hole, []).label,
    equityVsRange: 0,
    equityCi95: 0,
    percentileInOwnRange: 0,
    aheadOfRange: 0,
    rangeAdvantage: 0.5,
    villainCombos: 0,
  }

  return { policy, reading, reasons, source: 'preflop-chart' }
}

// --------------------------------------------------------------- postflop

function postflopDecision(s: HandState, seat: Seat, legal: LegalAction[], opts: AgentOptions): Base {
  const villainSeat = other(seat)
  const hole = s.players[seat].hole as readonly [Card, Card]
  const dead: Card[] = [...hole, ...s.board]
  const pot = totalPot(s)
  const toCall = toCallOf(s, seat)

  const narrow = opts.model && opts.exploit !== false ? narrowOptionsFor(opts.model) : {}
  const villainRange = villainRangeFor(villainSeat, s.history, s.board, dead, narrow)
  const heroRange = heroRangeFor(seat, s.history, s.board, [...s.board])

  // Position: postflop the big blind acts first, so seat 0 is in position.
  const inPosition = seat === 0
  const wasAggressor = lastAggressorBefore(s, seat)

  const lastBet = [...s.history].reverse().find((a) => a.street === s.street && a.seat === villainSeat)
  const facingSize = toCall > 0 && lastBet && lastBet.potBefore > 0 ? lastBet.paid / lastBet.potBefore : 0

  const ctx: PolicyContext = {
    street: s.street,
    board: s.board,
    hole,
    heroRange,
    villainRange,
    pot,
    toCall,
    heroStack: s.players[seat].stack,
    villainStack: s.players[villainSeat].stack,
    inPosition,
    wasAggressor,
    anyAggression: s.history.some((a) => a.type === 'bet' || a.type === 'raise'),
    facingSize,
    runouts: opts.runouts ?? 24,
    rng: opts.rng,
  }

  const out = postflopPolicy(ctx)
  const policy = toWeightedActions(out.options, legal, s, seat)
  renormalise(policy)

  const hand = describeHand(hole, s.board)
  const reading: HandReading = {
    label: hand.label,
    equityVsRange: out.equity,
    equityCi95: out.equityCi95,
    percentileInOwnRange: out.percentileInOwnRange,
    aheadOfRange: out.aheadOfRange,
    rangeAdvantage: out.rangeAdvantage,
    villainCombos: out.villainCombos,
  }

  const reasons: Reason[] = []
  reasons.push({
    key: 'hand',
    text: `we have ${hand.label}, which is stronger than ${(out.percentileInOwnRange * 100).toFixed(0)}% of the hands we would play this way`,
  })
  reasons.push({
    key: 'range',
    text: `we are ahead of ${(out.aheadOfRange * 100).toFixed(0)}% of the range they can have after this line`,
  })
  if (out.rangeAdvantage > 0.53) {
    reasons.push({ key: 'range-advantage', text: 'this board favours our range overall, so we can bet more often' })
  } else if (out.rangeAdvantage < 0.47) {
    reasons.push({ key: 'range-advantage', text: 'this board favours their range, so we check more and bluff less' })
  }
  reasons.push({ key: 'texture', text: `board reads ${out.texture.klass.replace(/-/g, ', ')}` })
  reasons.push({ key: 'spr', text: SPR_LABELS[sprBucket(sprOf(s))] })
  for (const n of out.notes) reasons.push({ key: 'note', text: n })
  return { policy, reading, reasons, source: 'postflop-policy' }
}

function lastAggressorBefore(s: HandState, seat: Seat): boolean {
  for (let i = s.history.length - 1; i >= 0; i--) {
    const a = s.history[i]!
    if (a.type === 'bet' || a.type === 'raise') return a.seat === seat
  }
  return false
}

/**
 * Map policy options onto actions the engine will actually accept. Every `to`
 * is clamped to the legal window — an unclamped size throws mid-hand, and a
 * strategy that throws once every few thousand hands is a strategy that cannot
 * be benchmarked.
 */
function toWeightedActions(
  options: PolicyOption[],
  legal: LegalAction[],
  s: HandState,
  seat: Seat,
): WeightedAction[] {
  const out: WeightedAction[] = []
  const pot = totalPot(s)
  const toCall = toCallOf(s, seat)
  const canBet = legal.find((l) => l.type === 'bet' || l.type === 'raise')
  const canCheck = legal.some((l) => l.type === 'check')
  const canCall = legal.some((l) => l.type === 'call')
  const canFold = legal.some((l) => l.type === 'fold')

  for (const o of options) {
    if (o.prob <= 0.0005) continue
    switch (o.kind) {
      case 'check':
        if (canCheck) out.push({ action: { type: 'check' }, prob: o.prob, label: 'check', rationale: o.rationale })
        else if (canFold) out.push({ action: { type: 'fold' }, prob: o.prob, label: 'fold', rationale: o.rationale })
        break
      case 'fold':
        if (canFold) out.push({ action: { type: 'fold' }, prob: o.prob, label: 'fold', rationale: o.rationale })
        else if (canCheck) out.push({ action: { type: 'check' }, prob: o.prob, label: 'check', rationale: o.rationale })
        break
      case 'call':
        if (canCall) out.push({ action: { type: 'call' }, prob: o.prob, label: `call ${formatBB(toCall)}bb`, rationale: o.rationale })
        else if (canCheck) out.push({ action: { type: 'check' }, prob: o.prob, label: 'check', rationale: o.rationale })
        break
      case 'bet':
      case 'raise': {
        if (!canBet) {
          // No chips or opponent is all-in: fall back to the passive option.
          if (canCheck) out.push({ action: { type: 'check' }, prob: o.prob, label: 'check', rationale: o.rationale })
          else if (canCall) out.push({ action: { type: 'call' }, prob: o.prob, label: `call ${formatBB(toCall)}bb`, rationale: o.rationale })
          break
        }
        const to = clampTo(o.to ?? canBet.min ?? 0, canBet)
        const pct = pot > 0 ? Math.round(((to - s.players[seat].committed) / pot) * 100) : 0
        out.push({
          action: { type: canBet.type, to },
          prob: o.prob,
          label: to >= (canBet.max ?? 0) ? `all-in ${formatBB(to)}bb` : `${canBet.type} ${formatBB(to)}bb (${pct}% pot)`,
          rationale: o.rationale,
        })
        break
      }
    }
  }

  if (out.length === 0) {
    if (canCheck) out.push({ action: { type: 'check' }, prob: 1, label: 'check' })
    else if (canFold) out.push({ action: { type: 'fold' }, prob: 1, label: 'fold' })
    else out.push({ action: { type: 'call' }, prob: 1, label: 'call' })
  }
  return mergeDuplicates(out)
}

/** Two options that map to the same action must combine, not compete. */
function mergeDuplicates(list: WeightedAction[]): WeightedAction[] {
  const byKey = new Map<string, WeightedAction>()
  for (const w of list) {
    const key = `${w.action.type}:${w.action.to ?? ''}`
    const prev = byKey.get(key)
    if (prev) {
      prev.prob += w.prob
      prev.rationale ??= w.rationale
    } else byKey.set(key, { ...w })
  }
  return [...byKey.values()]
}

function clampTo(to: number, legal: LegalAction): number {
  const min = legal.min ?? 0
  const max = legal.max ?? 0
  return Math.max(min, Math.min(max, Math.round(to)))
}

export function renormalise(policy: WeightedAction[]) {
  let t = 0
  for (const w of policy) t += w.prob
  if (t <= 0) {
    for (const w of policy) w.prob = 1 / policy.length
    return
  }
  for (const w of policy) w.prob /= t
}

export function sample(policy: WeightedAction[], rng: Rng): Action {
  const r = rng.float()
  let acc = 0
  for (const w of policy) {
    acc += w.prob
    if (r <= acc) return w.action
  }
  return policy[policy.length - 1]!.action
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
