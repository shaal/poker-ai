<script setup lang="ts">
import { computed } from 'vue'
import { formatBB } from '~core/strategy/decision'
import type { SeatView } from '~/types/ui'

/**
 * One player as a channel strip. The "to act" state is an edge marker rather
 * than a glow or a pulse, so it reads identically with motion disabled and in
 * both themes.
 */
const props = withDefaults(
  defineProps<{
    seat: SeatView
    /** The human. Hole cards face up, and the strip sits the other way up. */
    hero?: boolean
    toAct?: boolean
    /** Effective stack, for the committed bar's scale. */
    scale?: number
  }>(),
  { hero: false, toAct: false, scale: 10000 },
)

const status = computed(() => {
  if (props.seat.folded) return 'folded'
  if (props.seat.allIn) return 'all in'
  if (props.toAct) return 'to act'
  return props.seat.lastAction || 'waiting'
})

const committedPct = computed(() =>
  Math.max(0, Math.min(100, (props.seat.committed / Math.max(1, props.scale)) * 100)),
)
</script>

<template>
  <section
    class="seat"
    :class="{ 'is-hero': hero, 'is-act': toAct, 'is-out': seat.folded }"
    :aria-label="`${seat.name}, ${formatBB(seat.stack)} big blinds, ${status}`"
  >
    <span class="seat__edge" aria-hidden="true" />

    <div class="seat__id">
      <span class="seat__name">{{ seat.name }}</span>
      <span class="seat__pos u-eyebrow">{{ seat.position }}</span>
    </div>

    <div class="seat__cards">
      <PlayingCard
        v-for="(c, i) in seat.cards"
        :key="i"
        :card="c"
        :size="hero ? 'md' : 'sm'"
        :dimmed="seat.folded"
      />
    </div>

    <div class="seat__figures">
      <span class="seat__stack u-num">{{ formatBB(seat.stack) }}<span class="seat__unit">bb</span></span>
      <span class="seat__status u-eyebrow">{{ status }}</span>
    </div>

    <div class="seat__committed">
      <span class="u-eyebrow seat__cl">in</span>
      <span class="track seat__track" aria-hidden="true">
        <span class="seat__fill anim-fill" :style="{ width: `${committedPct}%` }" />
      </span>
      <span class="u-num seat__cv">{{ formatBB(seat.committed) }}</span>
    </div>
  </section>
</template>

<style scoped>
.seat {
  position: relative;
  display: grid;
  /* Two columns at any width: identity + cards, then figures. Nothing wraps
     below 320px because the card row is fixed-width and the figures column is
     min-content. */
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'id figures'
    'cards figures'
    'committed committed';
  align-items: center;
  gap: 0.35rem var(--sp-3);
  padding: var(--sp-3);
  padding-left: calc(var(--sp-3) + 3px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  min-width: 0;
}

.seat__edge {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: var(--r-3) 0 0 var(--r-3);
  background: var(--line-2);
}

.is-act .seat__edge {
  background: var(--ob);
}

.is-hero .seat__edge {
  background: var(--ex-2);
}

.is-hero.is-act .seat__edge {
  background: var(--ob);
}

.is-out {
  opacity: 0.6;
}

.seat__id {
  grid-area: id;
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  min-width: 0;
}

.seat__name {
  font-size: var(--fs-md);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat__pos {
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  padding: 0.05rem 0.3rem;
  color: var(--fg-2);
  flex: none;
}

.seat__cards {
  grid-area: cards;
  display: flex;
  gap: 0.3rem;
}

.seat__figures {
  grid-area: figures;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  text-align: right;
}

.seat__stack {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.seat__unit {
  font-size: 0.55em;
  color: var(--fg-3);
  margin-left: 0.15em;
}

.seat__status {
  color: var(--fg-2);
  white-space: nowrap;
}

.is-act .seat__status {
  color: var(--ob);
}

.seat__committed {
  grid-area: committed;
  display: grid;
  grid-template-columns: 1.2rem minmax(0, 1fr) 3rem;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 0.15rem;
}

.seat__track {
  --track-h: 0.3rem;
}

.seat__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--ob-2);
}

.seat__cl {
  color: var(--fg-3);
}

.seat__cv {
  font-size: var(--fs-xs);
  text-align: right;
  color: var(--fg-2);
}
</style>
