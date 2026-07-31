<script setup lang="ts">
import { computed } from 'vue'
import type { Action } from '~core/engine/types'
import type { WeightedAction } from '~core/strategy/decision'

/**
 * A mixed strategy as a single stacked bar.
 *
 * `compare` draws the OTHER distribution's segment boundaries over the top as
 * hairline carets. That is how the exploitative shift becomes visible rather
 * than merely reported: the boundaries have physically moved, and the distance
 * they moved is the size of the read. When they have not moved, the bar says
 * that too, which per ADR-005 is the honest and common early case.
 */
const props = withDefaults(
  defineProps<{
    label: string
    dist: WeightedAction[]
    variant?: 'expected' | 'applied'
    compare?: WeightedAction[] | null
    /** Always render this many legend rows, so the panel height is constant. */
    rows?: number
  }>(),
  { variant: 'expected', compare: null, rows: 3 },
)

function keyOf(a: Action): string {
  return a.to != null ? `${a.type}:${a.to}` : a.type
}

const compareMap = computed(() => {
  const m = new Map<string, number>()
  for (const w of props.compare ?? []) m.set(keyOf(w.action), w.prob)
  return m
})

interface Row {
  key: string
  label: string
  prob: number
  delta: number | null
  shade: number
}

const segments = computed<Row[]>(() =>
  props.dist.map((w, i) => {
    const k = keyOf(w.action)
    const other = compareMap.value.get(k)
    return {
      key: k,
      label: w.label,
      prob: w.prob,
      delta: props.compare ? w.prob - (other ?? 0) : null,
      shade: (i % 3) + 1,
    }
  }),
)

/** Cumulative boundaries of the comparison distribution, as percentages. */
const ghosts = computed<number[]>(() => {
  if (!props.compare) return []
  const out: number[] = []
  let acc = 0
  for (let i = 0; i < props.compare.length - 1; i++) {
    acc += props.compare[i]!.prob
    out.push(acc * 100)
  }
  return out
})

const padded = computed<(Row | null)[]>(() => {
  const list: (Row | null)[] = segments.value.slice(0, props.rows)
  while (list.length < props.rows) list.push(null)
  return list
})

const pct = (n: number) => Math.round(n * 100)
const signed = (n: number) => (n > 0 ? `+${Math.round(n * 100)}` : `${Math.round(n * 100)}`)

const summary = computed(
  () => `${props.label}: ${segments.value.map((s) => `${s.label} ${pct(s.prob)}%`).join(', ')}`,
)
</script>

<template>
  <div class="pb" :class="`pb--${variant}`">
    <div class="pb__head">
      <span class="u-eyebrow">{{ label }}</span>
    </div>

    <div class="pb__bar" role="img" :aria-label="summary">
      <span
        v-for="s in segments"
        :key="s.key"
        class="pb__seg anim-fill"
        :class="`pb__seg--${s.shade}`"
        :style="{ width: `max(0.125rem, ${s.prob * 100}%)` }"
      />
      <span
        v-for="(g, i) in ghosts"
        :key="`g${i}`"
        class="pb__ghost"
        :style="{ left: `${g}%` }"
        aria-hidden="true"
      />
    </div>

    <!-- Always rendered, blank when there is nothing to compare against, so
         two bars side by side keep their legends on the same line. -->
    <p class="pb__key u-eyebrow">{{ compare ? 'dashed hairlines mark the baseline' : '' }}</p>

    <ul class="pb__legend">
      <li v-for="(row, i) in padded" :key="row ? row.key : `empty${i}`" class="pb__row">
        <template v-if="row">
          <span class="pb__swatch" :class="`pb__seg--${row.shade}`" aria-hidden="true" />
          <span class="pb__label">{{ row.label }}</span>
          <span class="pb__prob u-num">{{ pct(row.prob) }}%</span>
          <span
            class="pb__delta u-num"
            :class="{
              'is-up': row.delta != null && row.delta > 0.004,
              'is-down': row.delta != null && row.delta < -0.004,
            }"
          >{{ row.delta != null && Math.abs(row.delta) > 0.004 ? signed(row.delta) : '' }}</span>
        </template>
        <span v-else class="pb__blank" aria-hidden="true" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pb {
  --s1: var(--ex-1);
  --s2: var(--ex-2);
  --s3: var(--ex-3);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
}

.pb--applied {
  --s1: var(--ob-1);
  --s2: var(--ob-2);
  --s3: var(--ob-3);
}

.pb__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}

.pb__key {
  color: var(--fg-3);
  font-size: 0.625rem;
  /* In rem, not em: the row has to hold its height when the text is empty. */
  min-height: 0.9rem;
  margin: 0;
}

.pb__bar {
  position: relative;
  display: flex;
  height: 1.5rem;
  background: var(--surface-3);
  border: 1px solid var(--line);
  border-radius: var(--r-1);
  overflow: hidden;
}

.pb__seg {
  height: 100%;
  border-right: 1px solid var(--surface);
  min-width: 2px;
}

.pb__seg:last-of-type {
  border-right: 0;
}

.pb__seg--1 {
  background: var(--s1);
}
.pb__seg--2 {
  background: var(--s2);
}
.pb__seg--3 {
  background: var(--s3);
}

/* The baseline's boundary, drawn over the applied bar. The gap between this
   hairline and the segment edge under it IS the exploitative shift. */
.pb__ghost {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 0;
  margin-left: -1px;
  border-left: 2px dashed var(--fg);
  opacity: 0.85;
}

.pb__legend {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.pb__row {
  display: grid;
  grid-template-columns: 0.6rem minmax(0, 1fr) 2.6rem 2.4rem;
  align-items: center;
  gap: 0.4rem;
  /* Fixed row height with blank filler rows: the legend is the same height
     whether the strategy has one branch or three. */
  min-height: 1.15rem;
  font-size: var(--fs-xs);
}

.pb__swatch {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 1px;
}

.pb__label {
  color: var(--fg-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pb__prob {
  text-align: right;
  color: var(--fg);
  font-weight: 600;
}

.pb__delta {
  text-align: right;
  color: var(--fg-3);
  font-size: var(--fs-micro);
}

.pb__delta.is-up {
  color: var(--ob);
}

.pb__delta.is-down {
  color: var(--ex);
}

.pb__blank {
  display: block;
  height: 1.15rem;
}
</style>
