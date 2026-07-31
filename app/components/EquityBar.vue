<script setup lang="ts">
import { computed } from 'vue'

/**
 * A proportion with its uncertainty attached. The part we are confident about
 * is solid; the margin the estimate could still move within is hatched, using
 * the same hatch as a face-down card and an unsettled belief. You can read the
 * bar honestly without reading the number.
 */
const props = withDefaults(
  defineProps<{
    label: string
    /** 0..1 */
    value: number
    /** Half-width of the 95% interval, 0..1. Zero renders a plain bar. */
    ci?: number
    tone?: 'expected' | 'observed' | 'neutral'
    /** Second figure on the right of the label row, e.g. the opposing share. */
    counter?: string
  }>(),
  { ci: 0, tone: 'expected', counter: '' },
)

const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100)).toFixed(1)}%`
const lo = computed(() => Math.max(0, props.value - props.ci))
const hi = computed(() => Math.min(1, props.value + props.ci))
const bandWidth = computed(() => hi.value - lo.value)
</script>

<template>
  <div class="eq" :class="`eq--${tone}`">
    <div class="eq__head">
      <span class="u-eyebrow">{{ label }}</span>
      <span class="eq__figure u-num">
        {{ (value * 100).toFixed(1) }}<span class="eq__unit">%</span>
        <span v-if="ci > 0" class="eq__ci u-num">&hairsp;&plusmn;{{ (ci * 100).toFixed(1) }}</span>
      </span>
    </div>
    <div
      class="track eq__track"
      role="img"
      :aria-label="`${label}: ${(value * 100).toFixed(1)} percent${ci > 0 ? `, plus or minus ${(ci * 100).toFixed(1)}` : ''}`"
    >
      <span class="eq__solid anim-fill" :style="{ width: pct(lo) }" />
      <span
        v-if="ci > 0"
        class="eq__band u-hatch anim-fill"
        :style="{ left: pct(lo), width: pct(bandWidth) }"
      />
      <span class="eq__point anim-move" :style="{ left: pct(value) }" />
    </div>
    <p v-if="counter" class="eq__counter u-eyebrow">{{ counter }}</p>
  </div>
</template>

<style scoped>
.eq {
  --tint: var(--ex);
  --tint-dim: var(--ex-3);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.eq--observed {
  --tint: var(--ob);
  --tint-dim: var(--ob-3);
}

.eq--neutral {
  --tint: var(--fg-2);
  --tint-dim: var(--line-2);
}

.eq__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.eq__figure {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--tint);
  white-space: nowrap;
}

.eq__unit {
  font-size: 0.7em;
  color: var(--fg-3);
}

.eq__ci {
  font-size: 0.75em;
  font-weight: 400;
  color: var(--fg-3);
}

.eq__track {
  --track-h: 0.6rem;
}

.eq__solid {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--tint);
}

.eq__band {
  position: absolute;
  top: 0;
  bottom: 0;
  --hatch-ink: var(--tint);
  --hatch-gap: 4px;
  --hatch-line: 1.5px;
  background-color: var(--tint-dim);
}

.eq__point {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  background: var(--fg);
}

.eq__counter {
  color: var(--fg-3);
}
</style>
