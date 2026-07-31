<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Action } from '~core/engine/types'
import { formatBB } from '~core/strategy/decision'

/**
 * All amounts are in the engine's unit — integer hundredths of a big blind —
 * and `to` on an emitted bet/raise is the TOTAL this street, matching
 * `Action.to`. Converting at the component boundary is how off-by-one-blind
 * bugs get in.
 *
 * Thumb ergonomics drive the layout: presets and commit buttons are 44px
 * minimum, the commit row is the closest thing to the bottom of the screen,
 * and the slider has a 44px hit area over a 6px track.
 */
const props = withDefaults(
  defineProps<{
    /** Everything in the middle right now, including live bets on this street. */
    potChips: number
    toCallChips: number
    /** Hero's remaining stack. */
    stackChips: number
    /** Already committed by hero on this street. */
    committedChips: number
    /** Smallest legal total for a bet/raise. */
    minRaiseToChips: number
    /** Largest legal total, normally committed + stack. */
    maxToChips: number
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ action: [action: Action] }>()

const canCheck = computed(() => props.toCallChips <= 0)
const canRaise = computed(() => props.maxToChips > props.minRaiseToChips)
const isRaise = computed(() => props.toCallChips > 0)

/** Quarter-blind granularity: finer than that is noise at these stakes. */
const STEP = 25

const amount = ref(props.minRaiseToChips)

function clampTo(v: number): number {
  const snapped = Math.round(v / STEP) * STEP
  return Math.max(props.minRaiseToChips, Math.min(props.maxToChips, snapped))
}

// Re-anchor whenever the legal window moves, so the slider is never parked on
// an illegal amount after the street changes.
watch(
  () => [props.minRaiseToChips, props.maxToChips],
  () => {
    amount.value = clampTo(amount.value)
  },
  { immediate: true },
)

const PRESETS = [
  { label: '33%', frac: 1 / 3 },
  { label: '66%', frac: 2 / 3 },
  { label: 'pot', frac: 1 },
] as const

/** What a "pot-sized" bet is measured against. `potChips` already includes
    everything in the middle, live bets included, so the call is added once. */
const potAfterCall = computed(() => props.potChips + props.toCallChips)

function presetTo(frac: number): number {
  return clampTo(props.committedChips + props.toCallChips + frac * potAfterCall.value)
}

function setPreset(frac: number) {
  amount.value = presetTo(frac)
}

function setAllIn() {
  amount.value = props.maxToChips
}

const isAllIn = computed(() => amount.value >= props.maxToChips)

const fractionOfPot = computed(() => {
  const put = amount.value - props.committedChips - props.toCallChips
  if (potAfterCall.value <= 0) return 0
  return put / potAfterCall.value
})

const activePreset = computed(() => {
  if (isAllIn.value) return 'all-in'
  for (const p of PRESETS) if (presetTo(p.frac) === amount.value) return p.label
  return ''
})

function commit(a: Action) {
  if (props.disabled) return
  emit('action', a)
}
</script>

<template>
  <section class="bc panel" aria-label="Your action">
    <div class="bc__sizer">
      <div class="bc__amount">
        <StatReadout
          :label="isRaise ? 'raise to' : 'bet'"
          :value="formatBB(amount)"
          unit="bb"
          size="md"
          tone="observed"
        />
        <span class="bc__frac u-eyebrow">
          {{ isAllIn ? 'all in' : `${Math.round(fractionOfPot * 100)}% pot` }}
        </span>
      </div>

      <label class="bc__slider">
        <span class="u-sr">Bet size in hundredths of a big blind</span>
        <input
          v-model.number="amount"
          type="range"
          :min="minRaiseToChips"
          :max="maxToChips"
          :step="STEP"
          :disabled="disabled || !canRaise"
          :aria-valuetext="`${formatBB(amount)} big blinds`"
        >
      </label>

      <div class="bc__presets">
        <button
          v-for="p in PRESETS"
          :key="p.label"
          type="button"
          class="bc__preset u-eyebrow"
          :class="{ 'is-on': activePreset === p.label }"
          :disabled="disabled || !canRaise"
          @click="setPreset(p.frac)"
        >
          {{ p.label }}
        </button>
        <button
          type="button"
          class="bc__preset u-eyebrow"
          :class="{ 'is-on': activePreset === 'all-in' }"
          :disabled="disabled || !canRaise"
          @click="setAllIn"
        >
          all in
        </button>
      </div>
    </div>

    <div class="bc__commit">
      <button
        type="button"
        class="bc__act bc__act--fold"
        :disabled="disabled"
        @click="commit({ type: 'fold' })"
      >
        <span class="bc__verb">fold</span>
        <span class="bc__sub u-num">&nbsp;</span>
      </button>

      <button
        v-if="canCheck"
        type="button"
        class="bc__act"
        :disabled="disabled"
        @click="commit({ type: 'check' })"
      >
        <span class="bc__verb">check</span>
        <span class="bc__sub u-num">&nbsp;</span>
      </button>
      <button
        v-else
        type="button"
        class="bc__act"
        :disabled="disabled"
        @click="commit({ type: 'call' })"
      >
        <span class="bc__verb">call</span>
        <span class="bc__sub u-num">{{ formatBB(toCallChips) }}</span>
      </button>

      <button
        type="button"
        class="bc__act bc__act--aggro"
        :disabled="disabled || !canRaise"
        @click="commit({ type: isRaise ? 'raise' : 'bet', to: amount })"
      >
        <span class="bc__verb">{{ isRaise ? 'raise' : 'bet' }}</span>
        <span class="bc__sub u-num">{{ formatBB(amount) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.bc {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
}

.bc__sizer {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.bc__amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  /* Reserved height: the fraction label changes on every drag. */
  min-height: 2.3rem;
}

.bc__frac {
  color: var(--fg-2);
  white-space: nowrap;
}

.bc__slider {
  display: block;
}

.bc__slider input {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  /* 44px of thumb target over a 6px visual track. */
  height: var(--touch);
  background: transparent;
  cursor: pointer;
  margin: 0;
}

.bc__slider input::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--surface-3);
  border: 1px solid var(--line);
  border-radius: var(--r-1);
}

.bc__slider input::-moz-range-track {
  height: 6px;
  background: var(--surface-3);
  border: 1px solid var(--line);
  border-radius: var(--r-1);
}

/* A blade, not a knob — it reads as a cursor on a scale. */
.bc__slider input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 26px;
  margin-top: -11px;
  background: var(--ob);
  border: 1px solid var(--ob-2);
  border-radius: var(--r-1);
}

.bc__slider input::-moz-range-thumb {
  width: 12px;
  height: 26px;
  background: var(--ob);
  border: 1px solid var(--ob-2);
  border-radius: var(--r-1);
}

.bc__slider input:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.bc__presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.3rem;
}

.bc__preset {
  min-height: var(--touch);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  color: var(--fg-2);
  cursor: pointer;
  padding: 0 0.15rem;
}

.bc__preset:hover:not(:disabled) {
  border-color: var(--line-2);
  color: var(--fg);
}

.bc__preset.is-on {
  background: var(--ob-wash);
  border-color: var(--ob-2);
  color: var(--fg);
  /* Fill plus rule: selection is never colour-only. */
  box-shadow: inset 0 -2px 0 var(--ob);
}

.bc__preset:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bc__commit {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.3rem;
}

.bc__act {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
  min-height: 3.25rem;
  padding: 0.35rem 0.25rem;
  background: var(--surface-2);
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  cursor: pointer;
  color: var(--fg);
}

.bc__act:hover:not(:disabled) {
  background: var(--surface-3);
}

.bc__act:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.bc__verb {
  font-family: var(--mono);
  font-size: var(--fs-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.1;
}

.bc__sub {
  font-size: var(--fs-micro);
  color: var(--fg-3);
  line-height: 1.1;
}

.bc__act--fold {
  border-color: var(--line);
  color: var(--fg-2);
}

.bc__act--fold:hover:not(:disabled) {
  border-color: var(--alert);
  color: var(--alert);
}

.bc__act--aggro {
  border-color: var(--ob-2);
  background: var(--ob-wash);
}

.bc__act--aggro .bc__sub {
  color: var(--ob);
}
</style>
