<script setup lang="ts">
import type { Belief } from '~core/strategy/decision'

/**
 * What it thinks it knows about you.
 *
 * `belief.sentence` is the product, so it is set in the humanist face at
 * reading size and everything else on the row is subordinate instrumentation.
 *
 * Low confidence has to LOOK provisional, not merely be labelled provisional.
 * Three things carry that here, none of them colour alone:
 *   - the row's rule goes from solid to dashed
 *   - the sentence steps back to the secondary foreground
 *   - the settledness bar and the posterior band hatch open up
 * At n=0 the posterior is the population prior and the row says exactly that,
 * which is the honest framing ADR-005 asks for.
 */
defineProps<{ beliefs: Belief[] }>()

function tier(c: number): 'thin' | 'partial' | 'settled' {
  if (c < 0.35) return 'thin'
  if (c < 0.7) return 'partial'
  return 'settled'
}

/** Hatch opens up as evidence thins: 3px when settled, 10px at n=0. */
function hatchGap(c: number): string {
  return `${(3 + (1 - Math.max(0, Math.min(1, c))) * 7).toFixed(1)}px`
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const pos = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`

function bandLeft(b: Belief) {
  return pos(Math.min(b.prior, b.posterior))
}
function bandWidth(b: Belief) {
  return `${Math.abs(b.posterior - b.prior) * 100}%`
}
</script>

<template>
  <section class="bp panel" aria-label="What it believes about you">
    <div class="panel__head">
      <span class="u-eyebrow">reads on you</span>
      <span class="u-eyebrow bp__count u-num">{{ beliefs.length }}</span>
    </div>

    <div v-if="!beliefs.length" class="bp__empty">
      <p class="u-sentence">
        No reads yet. Nothing has happened often enough for it to be worth saying out loud, so it
        is playing the population default and watching.
      </p>
    </div>

    <ul v-else class="bp__list">
      <li v-for="b in beliefs" :key="b.key" class="bp__item" :class="`is-${tier(b.confidence)}`">
        <p class="bp__sentence u-sentence">{{ b.sentence }}</p>

        <div class="bp__meta u-eyebrow">
          <span class="bp__stat">{{ b.label }}</span>
          <span class="bp__dir" :class="`dir-${b.direction}`">{{ b.direction }} population</span>
        </div>

        <!-- The gauge. Prior is a hairline, posterior is a blade, the band
             between them is the distance the evidence actually bought. -->
        <div
          class="bp__gauge"
          role="img"
          :aria-label="`${b.label}: prior ${pct(b.prior)}, posterior ${pct(b.posterior)}, from ${b.observations} observations`"
        >
          <span class="bp__scale u-ticks" style="--tick-gap: 10%" aria-hidden="true" />
          <span
            class="bp__band u-hatch anim-fill"
            :style="{
              left: bandLeft(b),
              width: bandWidth(b),
              '--hatch-gap': hatchGap(b.confidence),
            }"
          />
          <span class="bp__prior anim-move" :style="{ left: pos(b.prior) }" aria-hidden="true" />
          <span
            v-if="b.observed != null"
            class="bp__observed anim-move"
            :style="{ left: pos(b.observed) }"
            aria-hidden="true"
          />
          <span
            class="bp__post anim-move"
            :style="{ left: pos(b.posterior) }"
            aria-hidden="true"
          />
        </div>

        <div class="bp__legend u-num">
          <span class="bp__leg"><i class="key key--prior" aria-hidden="true" />prior {{ pct(b.prior) }}</span>
          <span class="bp__leg"><i class="key key--obs" aria-hidden="true" />observed {{ b.observed == null ? '—' : pct(b.observed) }}</span>
          <span class="bp__leg bp__leg--post"><i class="key key--post" aria-hidden="true" />posterior {{ b.confidence < 0.35 ? '~' : '' }}{{ pct(b.posterior) }}</span>
        </div>

        <!-- Settledness, not "confidence": the number is n/(n+k), how much of
             the posterior is you rather than the population. -->
        <div class="bp__settle">
          <span class="u-eyebrow bp__settle-l">settled</span>
          <span class="track bp__settle-track">
            <span
              class="bp__settle-fill u-hatch anim-fill"
              :style="{ width: pct(b.confidence), '--hatch-gap': hatchGap(b.confidence) }"
            />
          </span>
          <span class="u-num bp__settle-v">{{ pct(b.confidence) }}</span>
          <span class="u-num bp__settle-n">n={{ b.observations }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bp__count {
  color: var(--fg-2);
}

.bp__empty {
  padding: var(--sp-3);
  min-height: 8rem;
}

.bp__empty p {
  font-size: var(--fs-sm);
  color: var(--fg-2);
  max-width: 46ch;
  line-height: 1.5;
}

.bp__list {
  display: flex;
  flex-direction: column;
}

.bp__item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: var(--sp-3);
  padding-left: var(--sp-4);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--line-2);
  min-width: 0;
}

.bp__item:last-child {
  border-bottom: 0;
}

/* Provisional beliefs get a dashed rule and a stepped-back sentence. Read on
   a greyscale screen, these still look less certain than their neighbours. */
.is-thin {
  border-left-style: dashed;
  border-left-color: var(--line-2);
}

.is-partial {
  border-left-color: var(--ob-3);
}

.is-settled {
  border-left-color: var(--ob);
}

.bp__sentence {
  font-size: var(--fs-lg);
  line-height: 1.4;
  color: var(--fg);
  letter-spacing: -0.005em;
  max-width: 48ch;
}

.is-thin .bp__sentence {
  color: var(--fg-2);
  font-style: italic;
}

.bp__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.2rem var(--sp-3);
  color: var(--fg-3);
}

.dir-above {
  color: var(--ob-2);
}
.dir-below {
  color: var(--ex-2);
}
.dir-typical {
  color: var(--fg-3);
}

.bp__gauge {
  position: relative;
  height: 1.5rem;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-1);
  overflow: hidden;
}

.bp__scale {
  position: absolute;
  inset: auto 0 0 0;
  height: 4px;
  opacity: 0.6;
}

.bp__band {
  position: absolute;
  top: 0.2rem;
  bottom: 0.4rem;
  --hatch-ink: var(--ob);
  --hatch-line: 1.5px;
  background-color: var(--ob-wash);
  min-width: 1px;
}

.bp__prior {
  position: absolute;
  top: 0.1rem;
  bottom: 0.1rem;
  width: 1px;
  background: var(--ex-1);
  margin-left: -0.5px;
}

.bp__observed {
  position: absolute;
  top: 0.55rem;
  bottom: 0.55rem;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--fg-3);
}

.bp__post {
  position: absolute;
  top: 0;
  bottom: 0.25rem;
  width: 3px;
  margin-left: -1.5px;
  background: var(--ob);
}

.bp__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem var(--sp-3);
  font-size: var(--fs-micro);
  color: var(--fg-3);
}

.bp__leg {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}

.bp__leg--post {
  color: var(--fg-2);
}

.key {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
}

.key--prior {
  width: 1px;
  height: 0.7rem;
  background: var(--ex-1);
}

.key--obs {
  width: 4px;
  height: 4px;
  border-radius: 2px;
  background: var(--fg-3);
}

.key--post {
  width: 3px;
  height: 0.7rem;
  background: var(--ob);
}

.bp__settle {
  display: grid;
  /* First track holds the letterspaced "settled" caption without clipping it. */
  grid-template-columns: 4.1rem minmax(0, 1fr) 2.4rem 3rem;
  align-items: center;
  gap: var(--sp-2);
}

.bp__settle-l {
  color: var(--fg-3);
}

.bp__settle-track {
  --track-h: 0.45rem;
  display: block;
}

.bp__settle-fill {
  position: absolute;
  inset: 0 auto 0 0;
  --hatch-ink: var(--fg);
  --hatch-line: 1.5px;
  background-color: var(--ob-3);
  min-width: 2px;
}

.bp__settle-v {
  font-size: var(--fs-xs);
  text-align: right;
  color: var(--fg-2);
}

.bp__settle-n {
  font-size: var(--fs-micro);
  text-align: right;
  color: var(--fg-3);
}
</style>
