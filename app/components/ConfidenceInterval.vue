<script setup lang="ts">
import { computed } from 'vue'

/**
 * A point estimate on a scale, with the interval it actually lives in.
 *
 * ADR-010: a win rate shown without its interval is a lie at these sample
 * sizes. So the interval is the primary mark here — hatched, wide, unmissable —
 * and the point estimate is a hairline inside it rather than the headline.
 * When the interval crosses zero the axis says so, because that is the single
 * most important fact about a win rate from a short session.
 */
const props = withDefaults(
  defineProps<{
    label: string
    value: number
    lo: number
    hi: number
    /** Axis bounds. Defaults span the interval with headroom. */
    min?: number
    max?: number
    unit?: string
    decimals?: number
    tone?: 'expected' | 'observed'
  }>(),
  { unit: '', decimals: 1, tone: 'expected', min: Number.NaN, max: Number.NaN },
)

const axisMin = computed(() =>
  Number.isNaN(props.min) ? Math.min(props.lo, 0) - Math.abs(props.hi - props.lo) * 0.15 : props.min,
)
const axisMax = computed(() =>
  Number.isNaN(props.max) ? Math.max(props.hi, 0) + Math.abs(props.hi - props.lo) * 0.15 : props.max,
)

const span = computed(() => Math.max(1e-9, axisMax.value - axisMin.value))
const at = (v: number) => ((v - axisMin.value) / span.value) * 100
const clamp = (n: number) => Math.max(0, Math.min(100, n))

const bandLeft = computed(() => clamp(at(props.lo)))
const bandWidth = computed(() => clamp(at(props.hi)) - bandLeft.value)
const pointLeft = computed(() => clamp(at(props.value)))
const zeroLeft = computed(() => at(0))
const zeroInside = computed(() => zeroLeft.value >= 0 && zeroLeft.value <= 100)
const spansZero = computed(() => props.lo < 0 && props.hi > 0)

const fmt = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(props.decimals)
</script>

<template>
  <div class="ci" :class="`ci--${tone}`">
    <div class="ci__head">
      <span class="u-eyebrow">{{ label }}</span>
      <span class="ci__value u-num">
        {{ fmt(value) }}<span v-if="unit" class="ci__unit">{{ unit }}</span>
      </span>
    </div>

    <div
      class="ci__axis"
      role="img"
      :aria-label="`${label}: ${fmt(value)}${unit}, 95 percent interval ${fmt(lo)} to ${fmt(hi)}`"
    >
      <span class="ci__rule u-ticks" style="--tick-gap: 0.75rem" aria-hidden="true" />
      <span
        v-if="zeroInside"
        class="ci__zero"
        :style="{ left: `${zeroLeft}%` }"
        aria-hidden="true"
      />
      <span
        class="ci__band u-hatch anim-fill"
        :style="{ left: `${bandLeft}%`, width: `${bandWidth}%` }"
      />
      <span class="ci__point anim-move" :style="{ left: `${pointLeft}%` }" />
    </div>

    <div class="ci__bounds u-num">
      <span>{{ fmt(lo) }}</span>
      <span class="ci__bounds-mid u-eyebrow">95% interval</span>
      <span>{{ fmt(hi) }}</span>
    </div>

    <p v-if="spansZero" class="ci__note">
      This interval still contains zero, so it does not yet establish a direction.
    </p>
  </div>
</template>

<style scoped>
.ci {
  --tint: var(--ex);
  --tint-dim: var(--ex-3);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.ci--observed {
  --tint: var(--ob);
  --tint-dim: var(--ob-3);
}

.ci__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.ci__value {
  font-size: var(--fs-xl);
  font-weight: 600;
  color: var(--tint);
  white-space: nowrap;
}

.ci__unit {
  font-size: 0.55em;
  font-weight: 400;
  color: var(--fg-3);
  margin-left: 0.2em;
}

.ci__axis {
  position: relative;
  height: 1.75rem;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: var(--r-1);
  overflow: hidden;
}

.ci__rule {
  position: absolute;
  inset: auto 0 0 0;
  height: 5px;
  opacity: 0.7;
}

.ci__zero {
  position: absolute;
  inset: 0;
  width: 1px;
  background: var(--fg-3);
}

.ci__band {
  position: absolute;
  top: 0.35rem;
  bottom: 0.55rem;
  --hatch-ink: var(--tint);
  --hatch-gap: 5px;
  --hatch-line: 1.5px;
  background-color: var(--tint-dim);
  border-left: 1px solid var(--tint);
  border-right: 1px solid var(--tint);
}

.ci__point {
  position: absolute;
  top: 0.1rem;
  bottom: 0.3rem;
  width: 2px;
  margin-left: -1px;
  background: var(--fg);
}

.ci__bounds {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
  font-size: var(--fs-micro);
  color: var(--fg-3);
}

.ci__bounds-mid {
  color: var(--fg-3);
}

.ci__note {
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--fg-2);
  margin: 0;
}
</style>
