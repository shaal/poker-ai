<script setup lang="ts">
import { computed } from 'vue'
import type { Action } from '~core/engine/types'
import type { Decision } from '~core/strategy/decision'

/**
 * The most important panel in the product: what it did, what it would have
 * done without a read on you, and why.
 *
 * Everything here is height-stable. The reasons list always renders
 * MAX_REASONS rows, the policy legends always render three, and every figure
 * is tabular — because this panel redraws on every single action and a panel
 * that jumps two lines each time is unreadable no matter how good the content
 * is.
 */
const props = withDefaults(
  defineProps<{
    decision: Decision | null
    /** Deliberate pause while the AI "thinks". The lookup is instant; the
        pause is for legibility, and it is labelled honestly. */
    thinking?: boolean
  }>(),
  { thinking: false },
)

const MAX_REASONS = 4

const SOURCE_LABEL: Record<Decision['source'], string> = {
  'preflop-chart': 'preflop chart',
  'postflop-policy': 'postflop policy',
  fallback: 'fallback heuristic',
}

const SOURCE_NOTE: Record<Decision['source'], string> = {
  'preflop-chart': 'solved lookup',
  'postflop-policy': 'solved lookup',
  fallback: 'no solved entry for this spot',
}

function keyOf(a: Action): string {
  return a.to != null ? `${a.type}:${a.to}` : a.type
}

/**
 * A reading is sealed when its hand-identifying figures are not real numbers.
 * The game loop blanks them to NaN mid-hand rather than sending zeros, because
 * a zero renders as a confident "0%" and is a lie; NaN cannot be mistaken for
 * a measurement.
 */
const sealed = computed(() => !Number.isFinite(props.decision?.reading.equityVsRange ?? NaN))

/** `policy[].label` is contracted as ready to render, so use it verbatim. */
const chosenLabel = computed(() => {
  const d = props.decision
  if (!d) return ''
  const k = keyOf(d.action)
  return d.policy.find((w) => keyOf(w.action) === k)?.label ?? d.action.type
})

const chosenProb = computed(() => {
  const d = props.decision
  if (!d) return 0
  const k = keyOf(d.action)
  return d.policy.find((w) => keyOf(w.action) === k)?.prob ?? 0
})

const shiftText = computed(() => {
  const s = props.decision?.exploitShift ?? 0
  if (s < 0.005) return 'The read changed nothing here. This is the baseline line, unmodified.'
  if (s < 0.05) return 'The read nudged this slightly off the baseline.'
  if (s < 0.15) return 'The read moved this away from the baseline.'
  return 'The read moved this a long way from the baseline.'
})

const paddedReasons = computed(() => {
  const list: (Decision['reasons'][number] | null)[] = (props.decision?.reasons ?? []).slice(
    0,
    MAX_REASONS,
  )
  while (list.length < MAX_REASONS) list.push(null)
  return list
})

/** Widest weight in the set, so the mini-bars share a scale. */
const weightScale = computed(() => {
  const ws = (props.decision?.reasons ?? []).map((r) => Math.abs(r.weightBB ?? 0))
  return Math.max(0.01, ...ws)
})

const signedBB = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2)
</script>

<template>
  <section class="rp panel" aria-label="Why it did that">
    <header class="rp__head">
      <div class="rp__title">
        <span class="u-eyebrow rp__kicker">reasoning</span>
        <span class="rp__what">{{ thinking ? 'deciding' : chosenLabel || 'idle' }}</span>
      </div>
      <div class="rp__prov">
        <span
          class="rp__src u-eyebrow"
          :class="{ 'is-fallback': decision?.source === 'fallback' }"
        >{{ decision ? SOURCE_LABEL[decision.source] : '—' }}</span>
        <span class="rp__ms u-num">{{ decision ? `${decision.computeMs.toFixed(1)}ms` : '—' }}</span>
      </div>
      <span
        v-if="thinking"
        class="rp__sweep"
        aria-hidden="true"
      />
    </header>

    <div v-if="!decision" class="rp__empty">
      <p class="u-sentence">
        Nothing to explain yet. This panel fills in the moment it acts, and it stays readable
        afterwards whether the hand went well or not.
      </p>
    </div>

    <div v-else class="rp__body">
      <!-- Sampled-from line: the action is a draw from a distribution, and
           saying so up front is what stops the panel reading as post-hoc. -->
      <p class="rp__sampled u-sentence">
        Sampled <strong>{{ chosenLabel }}</strong> from a mixed strategy that plays it
        <span class="u-num">{{ Math.round(chosenProb * 100) }}%</span> of the time here.
      </p>

      <div class="rp__figures">
        <StatReadout label="street" :value="decision.street" size="sm" tone="quiet" />
        <StatReadout label="pot" :value="decision.potBB.toFixed(1)" unit="bb" size="sm" />
        <StatReadout label="to call" :value="decision.toCallBB.toFixed(1)" unit="bb" size="sm" />
        <StatReadout label="spr" :value="decision.spr.toFixed(1)" size="sm" tone="quiet" />
      </div>

      <hr class="rule">

      <!-- The comparison the whole product turns on. Side by side, same scale,
           baseline boundaries drawn over the applied bar. -->
      <div class="rp__compare">
        <PolicyBar label="baseline · no read" :dist="decision.baseline" variant="expected" />
        <PolicyBar
          label="applied · with read"
          :dist="decision.policy"
          variant="applied"
          :compare="decision.baseline"
        />
      </div>

      <div class="rp__shift">
        <StatReadout
          label="exploit shift"
          :value="decision.exploitShift.toFixed(3)"
          size="sm"
          :tone="decision.exploitShift < 0.005 ? 'quiet' : 'observed'"
        />
        <div class="rp__shiftbar">
          <span class="track rp__shifttrack">
            <span
              class="rp__shiftfill anim-fill"
              :style="{ width: `${Math.min(100, decision.exploitShift * 200)}%` }"
            />
          </span>
          <p class="rp__shifttext u-sentence">{{ shiftText }}</p>
        </div>
      </div>

      <p class="rp__reads u-eyebrow">
        reads applied:
        <span class="u-num">{{ decision.beliefsUsed.length }}</span>
        <span v-if="decision.beliefsUsed.length" class="rp__readkeys">
          — {{ decision.beliefsUsed.map((b) => b.label).join('; ') }}
        </span>
      </p>

      <hr class="rule">

      <div class="rp__reading">
        <!-- Sealed mid-hand: these figures identify the AI's actual holding,
             so they are withheld until the hand is over and then shown in
             full. The slot keeps its height either way. -->
        <p v-if="sealed" class="rp__sealed">
          Sealed until the hand ends — these figures would name the cards it is
          holding. The line above, and the read behind it, are shown now so they
          cannot be rewritten afterwards.
        </p>
        <EquityBar
          v-else
          label="equity vs estimated range"
          :value="decision.reading.equityVsRange"
          :ci="decision.reading.equityCi95"
          tone="expected"
          :counter="decision.reading.label"
        />
        <div v-if="!sealed" class="rp__figures">
          <StatReadout
            label="own pctile"
            :value="Math.round(decision.reading.percentileInOwnRange * 100)"
            unit="%"
            size="sm"
            hint="where this hand sits in our range"
          />
          <StatReadout
            label="ahead of"
            :value="Math.round(decision.reading.aheadOfRange * 100)"
            unit="%"
            size="sm"
            hint="of their range"
          />
          <StatReadout
            label="range adv"
            :value="(decision.reading.rangeAdvantage * 100).toFixed(1)"
            unit="pts"
            size="sm"
            :tone="decision.reading.rangeAdvantage >= 0 ? 'expected' : 'alert'"
            hint="ours minus theirs"
          />
          <StatReadout
            label="combos left"
            :value="decision.reading.villainCombos"
            size="sm"
            tone="quiet"
            hint="in their range"
          />
        </div>
      </div>

      <hr class="rule">

      <ol class="rp__reasons" aria-label="Reasons, most important first">
        <li
        v-for="(r, i) in paddedReasons"
        :key="r ? r.key : `blank${i}`"
        class="rp__reason"
        :class="{ 'is-blank': !r }"
      >
          <template v-if="r">
            <span class="rp__rkey u-eyebrow">{{ r.key }}</span>
            <span class="rp__rtext u-sentence">{{ r.text }}</span>
            <span class="rp__rweight">
              <span
                v-if="r.weightBB != null"
                class="rp__rbar"
                :class="r.weightBB >= 0 ? 'is-plus' : 'is-minus'"
                :style="{ width: `${(Math.abs(r.weightBB) / weightScale) * 100}%` }"
                aria-hidden="true"
              />
              <span class="rp__rnum u-num">{{ r.weightBB != null ? signedBB(r.weightBB) : '' }}</span>
            </span>
          </template>
          <span v-else class="rp__rblank" aria-hidden="true" />
        </li>
      </ol>

      <p class="rp__prov-note u-eyebrow">
        {{ SOURCE_NOTE[decision.source] }} &middot; weights in bb of EV where they can be attributed
      </p>
    </div>
  </section>
</template>

<style scoped>
.rp__sealed {
  margin: 0;
  min-height: 4.5rem;
  color: var(--fg-3);
  font-style: italic;
}

.rp {
  /* The panel that redraws most often gets the strongest housing. */
  border-color: var(--line-2);
  display: flex;
  flex-direction: column;
}

.rp__head {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: var(--r-3) var(--r-3) 0 0;
  overflow: hidden;
  min-height: 4rem;
}

.rp__title {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.rp__kicker {
  color: var(--fg-3);
}

.rp__what {
  font-family: var(--mono);
  font-size: var(--fs-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ob);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.rp__prov {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
  flex: none;
}

.rp__src {
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  padding: 0.1rem 0.35rem;
  color: var(--fg-2);
  white-space: nowrap;
}

.rp__src.is-fallback {
  border-color: var(--alert);
  color: var(--alert);
  background: var(--alert-wash);
}

.rp__ms {
  font-size: var(--fs-micro);
  color: var(--fg-3);
}

/* Theatre, labelled as such: the lookup is instant, the pause is for reading.
   It is a plain moving rule and it disappears entirely with motion off, where
   the "deciding" word in the header carries the state on its own. */
.rp__sweep {
  position: absolute;
  inset: auto 0 0 0;
  height: 2px;
  background: var(--ob);
  transform-origin: left;
}

@media (prefers-reduced-motion: no-preference) {
  .rp__sweep {
    animation: sweep 1.4s var(--ease) infinite;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rp__sweep {
    display: none;
  }
}

@keyframes sweep {
  0% {
    transform: scaleX(0);
    opacity: 0.9;
  }
  70% {
    transform: scaleX(1);
    opacity: 0.9;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}

.rp__empty,
.rp__body {
  padding: var(--sp-3);
  /* Reserved so the panel does not resize between an empty and a filled
     state on first action. */
  min-height: 20rem;
}

.rp__empty p {
  color: var(--fg-2);
  font-size: var(--fs-sm);
  max-width: 44ch;
}

.rp__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.rp__sampled {
  font-size: var(--fs-sm);
  color: var(--fg-2);
  line-height: 1.45;
  min-height: 2.6rem;
}

.rp__sampled strong {
  color: var(--fg);
  font-weight: 600;
}

.rp__figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2) var(--sp-3);
}

@media (min-width: 24rem) {
  .rp__figures {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.rp__compare {
  display: grid;
  gap: var(--sp-3);
}

/* Side by side only when both bars stay wide enough to read. Below that they
   stack, which keeps the comparison honest instead of squeezing it. */
@media (min-width: 30rem) {
  .rp__compare {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.rp__shift {
  display: grid;
  /* Wide enough for the letterspaced "exploit shift" caption unclipped. */
  grid-template-columns: 6.8rem minmax(0, 1fr);
  gap: var(--sp-3);
  align-items: start;
}

.rp__shiftbar {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.rp__shifttrack {
  --track-h: 0.4rem;
  display: block;
}

.rp__shiftfill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ob);
  min-width: 2px;
}

.rp__shifttext {
  font-size: var(--fs-xs);
  color: var(--fg-2);
  line-height: 1.4;
  /* Two lines reserved: the sentence changes length every action. */
  min-height: 2.4em;
}

.rp__reads {
  color: var(--fg-3);
  line-height: 1.5;
  min-height: 1.5em;
}

.rp__readkeys {
  text-transform: none;
  letter-spacing: 0;
  font-family: var(--sans);
  font-size: var(--fs-xs);
  color: var(--fg-2);
}

.rp__reading {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.rp__reasons {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  counter-reset: reason;
}

.rp__reason {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem;
  grid-template-areas:
    'key weight'
    'text weight';
  gap: 0 var(--sp-2);
  align-items: center;
  /* Constant row height whether or not the slot holds a reason. */
  min-height: 2.9rem;
  padding-left: var(--sp-3);
  border-left: 2px solid var(--line-2);
}

.rp__rkey {
  grid-area: key;
  color: var(--fg-3);
}

.rp__rtext {
  grid-area: text;
  font-size: var(--fs-sm);
  color: var(--fg);
  line-height: 1.35;
}

.rp__rweight {
  grid-area: weight;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.rp__rbar {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 1.6rem;
  border-radius: var(--r-1);
  opacity: 0.28;
}

.rp__rbar.is-plus {
  background: var(--ob);
}

.rp__rbar.is-minus {
  background: var(--ex);
}

.rp__rnum {
  position: relative;
  font-size: var(--fs-xs);
  color: var(--fg-2);
}

/* An unused slot holds its height but draws nothing: the rule would read as
   a reason that failed to load rather than as reserved space. */
.rp__reason.is-blank {
  border-left-color: transparent;
}

.rp__rblank {
  display: block;
  height: 2.9rem;
}

.rp__prov-note {
  color: var(--fg-3);
  line-height: 1.5;
}
</style>
