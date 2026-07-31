<script setup lang="ts">
import { computed } from 'vue'
import type { ActionRecord, Street } from '~core/engine/types'
import { formatBB } from '~core/strategy/decision'

/**
 * The log. Deliberately the plainest thing on the page — it is reference, not
 * argument, so it gets mono, tight rows and no colour beyond the seat tag.
 */
const props = withDefaults(
  defineProps<{
    records: ActionRecord[]
    /** Display names indexed by seat. Seat 0 is the button. */
    names?: [string, string]
    /** Which seat is the human, for the "you" tag. */
    heroSeat?: 0 | 1
  }>(),
  { names: () => ['Button', 'Big blind'], heroSeat: 0 },
)

interface Group {
  street: Street
  rows: ActionRecord[]
}

const groups = computed<Group[]>(() => {
  const out: Group[] = []
  for (const r of props.records) {
    const last = out[out.length - 1]
    if (last && last.street === r.street) last.rows.push(r)
    else out.push({ street: r.street, rows: [r] })
  }
  return out
})

function verb(r: ActionRecord): string {
  if (r.type === 'bet' || r.type === 'raise') return `${r.type} to ${formatBB(r.to ?? 0)}`
  if (r.type === 'call') return `call ${formatBB(r.paid)}`
  return r.type
}
</script>

<template>
  <section class="hh panel" aria-label="Hand history">
    <div class="panel__head">
      <span class="u-eyebrow">action log</span>
      <span class="u-eyebrow hh__count u-num">{{ records.length }}</span>
    </div>

    <div class="hh__scroll">
      <p v-if="!records.length" class="hh__empty u-sentence">
        Nothing yet. Actions appear here as the hand plays out.
      </p>

      <template v-else>
        <div v-for="g in groups" :key="g.street" class="hh__group">
          <p class="hh__street u-eyebrow">{{ g.street }}</p>
          <ol class="hh__rows">
            <li v-for="(r, i) in g.rows" :key="`${g.street}-${i}`" class="hh__row">
              <span class="hh__seat u-eyebrow" :class="{ 'is-hero': r.seat === heroSeat }">
                {{ r.seat === heroSeat ? 'you' : 'ai' }}
              </span>
              <span class="hh__verb u-mono">{{ verb(r) }}</span>
              <span class="hh__pot u-num">{{ formatBB(r.potBefore) }}</span>
            </li>
          </ol>
        </div>
      </template>
    </div>

    <p class="hh__key u-eyebrow">right column: pot before the action, in bb</p>
  </section>
</template>

<style scoped>
.hh {
  display: flex;
  flex-direction: column;
}

.hh__count {
  color: var(--fg-2);
}

.hh__scroll {
  /* Capped and scrollable so a long hand cannot stretch the column and push
     the panels beside it out of alignment. */
  max-height: 16rem;
  min-height: 8rem;
  overflow-y: auto;
  padding: var(--sp-2) var(--sp-3);
}

.hh__empty {
  font-size: var(--fs-sm);
  color: var(--fg-3);
  padding: var(--sp-2) 0;
}

.hh__group + .hh__group {
  margin-top: var(--sp-2);
}

.hh__street {
  color: var(--fg-3);
  padding-bottom: 0.15rem;
  border-bottom: 1px solid var(--line);
  margin-bottom: 0.2rem;
}

.hh__rows {
  display: flex;
  flex-direction: column;
}

.hh__row {
  display: grid;
  grid-template-columns: 2.1rem minmax(0, 1fr) 3rem;
  gap: var(--sp-2);
  align-items: baseline;
  min-height: 1.45rem;
  font-size: var(--fs-xs);
}

.hh__seat {
  color: var(--fg-3);
}

.hh__seat.is-hero {
  color: var(--ex);
}

.hh__verb {
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hh__pot {
  text-align: right;
  color: var(--fg-3);
  font-size: var(--fs-micro);
}

.hh__key {
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  border-top: 1px solid var(--line);
  color: var(--fg-3);
}
</style>
