<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '~core/engine/cards'
import type { Street } from '~core/engine/types'
import { formatBB } from '~core/strategy/decision'
import type { SeatView } from '~/types/ui'

/**
 * The table. Named for the thing it replaces rather than the thing it is.
 *
 * There is no felt, no oval and no green. The board is a five-slot rail with a
 * ruler above it — the streets are a measured sequence, so they get a scale —
 * and the pot is the single largest figure on the panel because it is the
 * number the decision is denominated in. Undealt slots are dotted outlines,
 * NOT hatched: hatch is reserved for things that exist and are unknown, and a
 * turn card that has not been dealt does not exist yet.
 */
const props = withDefaults(
  defineProps<{
    board: Card[]
    /** Chips: hundredths of a big blind. */
    pot: number
    street: Street
    hero: SeatView
    villain: SeatView
    /** 0 = button. Which seat the edge marker lights on. */
    toAct?: 0 | 1 | null
    /** Seat index of the hero, so `toAct` maps to the right strip. */
    heroSeat?: 0 | 1
  }>(),
  { toAct: null, heroSeat: 0 },
)

const STREET_ORDER: readonly Street[] = ['preflop', 'flop', 'turn', 'river', 'showdown']

/** Always five slots. The rail never changes width as cards land. */
const slots = computed<(Card | null)[]>(() => {
  const out: (Card | null)[] = []
  for (let i = 0; i < 5; i++) out.push(props.board[i] ?? null)
  return out
})

const effective = computed(() => Math.min(props.hero.stack, props.villain.stack))
const spr = computed(() => (props.pot > 0 ? effective.value / props.pot : 0))
</script>

<template>
  <section class="tbl panel" aria-label="Table">
    <SeatPanel :seat="villain" :to-act="toAct != null && toAct !== heroSeat" :scale="effective + 1" />

    <div class="tbl__mid">
      <ol class="tbl__streets u-eyebrow" aria-label="Street">
        <li
          v-for="s in STREET_ORDER"
          :key="s"
          :class="{ 'is-now': s === street, 'is-past': STREET_ORDER.indexOf(s) < STREET_ORDER.indexOf(street) }"
        >
          {{ s }}
        </li>
      </ol>

      <div class="tbl__board">
        <span class="tbl__rail u-ticks" style="--tick-gap: 0.5rem" aria-hidden="true" />
        <div class="tbl__cards" aria-label="Board">
          <PlayingCard v-for="(c, i) in slots" :key="i" :card="c" :empty="c == null" size="md" />
        </div>
      </div>

      <div class="tbl__pot">
        <StatReadout label="pot" :value="formatBB(pot)" unit="bb" size="lg" />
        <div class="tbl__potmeta">
          <StatReadout label="effective" :value="formatBB(effective)" unit="bb" size="sm" tone="quiet" />
          <StatReadout
            label="spr"
            :value="spr > 0 ? spr.toFixed(1) : '—'"
            size="sm"
            tone="quiet"
            hint="stack to pot"
          />
        </div>
      </div>
    </div>

    <SeatPanel :seat="hero" hero :to-act="toAct === heroSeat" :scale="effective + 1" />
  </section>
</template>

<style scoped>
.tbl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3);
}

.tbl__mid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.tbl__streets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  color: var(--fg-3);
}

.tbl__streets li::after {
  content: '/';
  margin-left: 0.5rem;
  color: var(--line-2);
}

.tbl__streets li:last-child::after {
  content: '';
}

.tbl__streets .is-past {
  color: var(--fg-3);
  text-decoration: line-through;
  text-decoration-color: var(--line-2);
}

.tbl__streets .is-now {
  color: var(--ob);
}

/* Sized to the five slots so the tick rail stops where the rail of cards
   stops, instead of running on across empty panel. */
.tbl__board {
  position: relative;
  padding-top: 0.65rem;
  width: max-content;
  max-width: 100%;
}

.tbl__rail {
  position: absolute;
  inset: 0 0 auto 0;
  height: 5px;
  opacity: 0.8;
}

.tbl__cards {
  display: flex;
  gap: 0.3rem;
  /* Five 2.3rem cards + gaps = 12.7rem, comfortably inside 320px minus the
     shell and panel padding. No wrap, no horizontal scroll. */
  justify-content: flex-start;
}

.tbl__pot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.tbl__potmeta {
  display: flex;
  gap: var(--sp-4);
}
</style>
