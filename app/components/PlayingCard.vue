<script setup lang="ts">
import { computed } from 'vue'
import { RANKS, SUITS, rankOf, suitOf } from '~core/engine/cards'

/**
 * A card as a channel label, not a casino artefact: rank set in heavy mono,
 * the suit carried on FOUR redundant channels — glyph, letter code, edge-rail
 * dash pattern and a muted tint — so nothing depends on red-versus-black.
 *
 * Face-down uses the same hatch as an unsettled belief. That is deliberate:
 * across this interface, hatch means "exists, not known yet".
 */
const props = withDefaults(
  defineProps<{
    /** 0..51 in the engine's rank*4+suit encoding, or null for face down. */
    card: number | null
    size?: 'sm' | 'md' | 'lg'
    /** Board slot that has not been dealt yet — an outline, not a card. */
    empty?: boolean
    /** Mucked or folded: still legible, visibly out of play. */
    dimmed?: boolean
  }>(),
  { size: 'md', empty: false, dimmed: false },
)

const SUIT_GLYPH = ['♠', '♥', '♦', '♣'] as const
const SUIT_WORD = ['spades', 'hearts', 'diamonds', 'clubs'] as const
const RANK_WORD: Record<string, string> = {
  T: 'ten',
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
}

const suit = computed(() => (props.card == null ? -1 : suitOf(props.card)))
const rankChar = computed(() => (props.card == null ? '' : (RANKS[rankOf(props.card)] ?? '')))
const suitChar = computed(() => (suit.value < 0 ? '' : (SUITS[suit.value] ?? '')))
const glyph = computed(() => (suit.value < 0 ? '' : SUIT_GLYPH[suit.value]))

const label = computed(() => {
  if (props.empty) return 'card not yet dealt'
  if (props.card == null) return 'face-down card'
  const r = RANK_WORD[rankChar.value] ?? rankChar.value
  return `${r} of ${SUIT_WORD[suit.value] ?? ''}`
})
</script>

<template>
  <div
    class="pc"
    :class="[`pc--${size}`, suit >= 0 ? `pc--${suitChar}` : '', { 'is-dim': dimmed, 'is-empty': empty, 'is-down': card == null && !empty }]"
    role="img"
    :aria-label="label"
  >
    <template v-if="card != null && !empty">
      <span class="pc__rail" aria-hidden="true" />
      <span class="pc__rank u-mono">{{ rankChar }}</span>
      <span class="pc__suit">
        <span class="pc__glyph" aria-hidden="true">{{ glyph }}</span>
        <span class="pc__code u-mono" aria-hidden="true">{{ suitChar }}</span>
      </span>
    </template>
    <span
      v-else-if="!empty"
      class="pc__back u-hatch"
      aria-hidden="true"
      style="--hatch-ink: var(--line-2); --hatch-gap: 6px; --hatch-line: 2px"
    />
  </div>
</template>

<style scoped>
.pc {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.1em;
  flex: none;
  background: var(--card-face);
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  color: var(--fg);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* Sizes are fixed in rem, not fractions of a flexible row: cards must not
   resize as siblings appear, or the board reflows mid-hand. */
.pc--sm {
  width: 1.7rem;
  height: 2.4rem;
  font-size: var(--fs-sm);
}
.pc--md {
  width: 2.3rem;
  height: 3.2rem;
  font-size: var(--fs-lg);
}
.pc--lg {
  width: 2.9rem;
  height: 4rem;
  font-size: var(--fs-xl);
}

.pc__rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--suit);
}

.pc__rank {
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--fg);
}

.pc__suit {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  color: var(--suit);
}

.pc__glyph {
  font-size: 0.72em;
}

.pc__code {
  font-size: 0.46em;
  color: var(--fg-3);
  letter-spacing: 0.02em;
}

.pc--sm .pc__code {
  display: none;
}

.pc__back {
  position: absolute;
  inset: 0;
  background-color: var(--surface-2);
}

.is-down {
  border-style: dashed;
  border-color: var(--line-2);
}

.is-empty {
  background: transparent;
  border: 1px dotted var(--line);
}

.is-dim {
  opacity: 0.42;
  filter: saturate(0.4);
}

/* Suit identity: tint plus a distinct rail dash pattern, so the four suits
   stay separable in greyscale and under any colour vision deficiency. */
.pc--s {
  --suit: var(--suit-s);
}
.pc--h {
  --suit: var(--suit-h);
}
.pc--d {
  --suit: var(--suit-d);
}
.pc--c {
  --suit: var(--suit-c);
}

.pc--h .pc__rail {
  background-image: repeating-linear-gradient(
    180deg,
    var(--suit) 0 6px,
    transparent 6px 10px
  );
  background-color: transparent;
}
.pc--d .pc__rail {
  background-image: repeating-linear-gradient(
    180deg,
    var(--suit) 0 2px,
    transparent 2px 6px
  );
  background-color: transparent;
}
.pc--c .pc__rail {
  background-image: repeating-linear-gradient(
    180deg,
    var(--suit) 0 8px,
    transparent 8px 11px,
    var(--suit) 11px 13px,
    transparent 13px 16px
  );
  background-color: transparent;
}
</style>
