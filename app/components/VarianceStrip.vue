<script setup lang="ts">
import { computed } from 'vue'
import type { Street } from '~core/engine/types'

/**
 * ADR-010: whether the decision was right, separately from whether it worked.
 *
 * Tone rules, and they are the hard part. This panel never tells the player
 * they got lucky and never defends the AI. It states two numbers and labels
 * which one repeats. The sample-size line is the same either way — it does not
 * appear only after a loss, because a caveat that shows up only when you are
 * winning against the house is an excuse.
 *
 * Money is not coloured by sign anywhere here. Colour marks expectation
 * against realisation, which is the comparison that actually means something.
 */
const props = withDefaults(
  defineProps<{
    /** Hands in the sample behind the win rate. */
    hands: number
    /** Observed win rate, big blinds per 100 hands. */
    bb100: number
    /** Half-width of the 95% interval on that win rate. */
    ci95: number
    /** Present only when money went in with cards to come. */
    allIn?: { street: Street; equity: number; evBB: number; actualBB: number } | null
    /** Per-100 standard deviation. ADR-002 uses ~90 for heads-up NLHE. */
    sigma?: number
  }>(),
  { allIn: null, sigma: 90 },
)

/** Hands required for a 95% interval of the given half-width, at this sigma. */
const handsForFive = computed(() => {
  const blocks = Math.pow((1.96 * props.sigma) / 5, 2)
  return Math.round((blocks * 100) / 1000) * 1000
})

/** Explicit locale so the prerendered HTML matches what the client renders. */
const group = (n: number) => n.toLocaleString('en-US')

const handsLabel = computed(() => group(props.hands))

const sampleNote = computed(() => {
  const n = props.hands
  const h = group(n)
  if (n < 100)
    return `${h} hands is not yet a measurement. The interval below is wider than any win rate a real player could sustain.`
  if (n < 500)
    return `${h} hands is still mostly noise. The interval comfortably contains both a strong player and a weak one.`
  if (n < 2000)
    return `${h} hands shows the shape of a result but not its sign. The interval is doing most of the talking.`
  if (n < 10000)
    return `${h} hands is a trend. The interval has narrowed, and it has not narrowed enough to settle much.`
  return `${h} hands. The number is beginning to carry information rather than noise.`
})

const fmt = (n: number, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d)
</script>

<template>
  <section class="vs panel" aria-label="Result and variance">
    <div class="panel__head">
      <span class="u-eyebrow">result vs expectation</span>
      <span class="u-eyebrow vs__n u-num">{{ handsLabel }} hands</span>
    </div>

    <div class="panel__body vs__body">
      <div class="vs__allin">
        <template v-if="allIn">
          <p class="vs__line u-sentence">
            All in on the {{ allIn.street }}. You were
            <span class="u-num">{{ Math.round(allIn.equity * 100) }}%</span> to win the pot when the
            money went in.
          </p>
          <div class="vs__pair">
            <StatReadout
              label="expected"
              :value="fmt(allIn.evBB)"
              unit="bb"
              size="md"
              tone="expected"
              hint="what this spot returns on average"
            />
            <StatReadout
              label="realised"
              :value="fmt(allIn.actualBB)"
              unit="bb"
              size="md"
              tone="observed"
              hint="what this one did"
            />
          </div>
          <p class="vs__foot u-eyebrow">expectation is the number that repeats</p>
        </template>
        <template v-else>
          <p class="vs__line vs__line--quiet u-sentence">
            No all-in this hand, so there is no expected-versus-actual to separate.
          </p>
          <div class="vs__pair">
            <StatReadout label="expected" value="—" size="md" tone="quiet" reserve-hint />
            <StatReadout label="realised" value="—" size="md" tone="quiet" reserve-hint />
          </div>
          <p class="vs__foot u-eyebrow">&nbsp;</p>
        </template>
      </div>

      <hr class="rule">

      <ConfidenceInterval
        label="win rate"
        :value="bb100"
        :lo="bb100 - ci95"
        :hi="bb100 + ci95"
        unit="bb/100"
        tone="observed"
      />

      <p class="vs__sample u-sentence">{{ sampleNote }}</p>

      <p class="vs__scale u-eyebrow">
        at &sigma; = {{ sigma }} bb/100, a &plusmn;5 bb/100 interval needs about
        <span class="u-num">{{ group(handsForFive) }}</span> hands
      </p>
    </div>
  </section>
</template>

<style scoped>
.vs__n {
  color: var(--fg-2);
}

.vs__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.vs__allin {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  /* Reserved: the all-in block appears and disappears between hands and must
     not resize the panel when it does. */
  min-height: 6.75rem;
}

.vs__line {
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--fg);
  min-height: 2.6em;
  max-width: 46ch;
}

.vs__line--quiet {
  color: var(--fg-3);
}

.vs__pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
  position: relative;
}

/* A hairline between the two figures: they are one comparison, not two facts. */
.vs__pair::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 0.1rem;
  bottom: 0.1rem;
  width: 1px;
  background: var(--line);
}

.vs__foot {
  color: var(--fg-3);
}

.vs__sample {
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--fg-2);
  max-width: 48ch;
  /* Three lines held open: the sentence changes as the sample grows. */
  min-height: 4.5em;
}

.vs__scale {
  color: var(--fg-3);
  line-height: 1.5;
  text-transform: none;
  letter-spacing: 0.02em;
}
</style>
