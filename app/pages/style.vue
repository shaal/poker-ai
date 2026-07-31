<script setup lang="ts">
import { ref } from 'vue'
import type { Action } from '~core/engine/types'
import { cardsFromString } from '~core/engine/cards'
import * as fx from '~/fixtures/sample'

/**
 * Component gallery. Every component in every state that matters, so the
 * design can be reviewed without playing a hand — including the states that
 * are easy to forget: empty, provisional, zero-shift, fallback, and the win
 * that came from behind.
 */

const aces = cardsFromString('As Ah Ad Ac')
const spread = cardsFromString('2s Tc Jd Qh Kd')

const SETTLE_STEPS = [0, 0.25, 0.5, 0.75, 1]
const hatchGap = (c: number) => `${(3 + (1 - c) * 7).toFixed(1)}px`

const preflopBetting = {
  potChips: 150,
  toCallChips: 100,
  stackChips: 9950,
  committedChips: 50,
  minRaiseToChips: 300,
  maxToChips: 10000,
}

const checkSpot = {
  potChips: 500,
  toCallChips: 0,
  stackChips: 9750,
  committedChips: 0,
  minRaiseToChips: 100,
  maxToChips: 9750,
}

const lastEmitted = ref('nothing yet')
function record(a: Action) {
  lastEmitted.value = JSON.stringify(a)
}

const seatAllIn = { ...fx.heroSeat, allIn: true, committed: 9575, stack: 0, lastAction: 'all in' }
</script>

<template>
  <div class="gal">
    <header class="gal__intro">
      <h1 class="gal__h1">Components</h1>
      <p class="gal__lede u-sentence">
        Every state the interface can be in. The organising rule is that hatched means unresolved:
        a face-down card, a belief built on three observations and a confidence interval are the
        same kind of object, so they share one visual grammar and tighten to solid as evidence
        arrives.
      </p>
    </header>

    <!-- ----------------------------------------------------------- palette -->
    <section class="gal__sec">
      <h2 class="gal__h2">Palette</h2>
      <p class="gal__note u-sentence">One accent per meaning. There are two meanings.</p>
      <ul class="sw">
        <li class="sw__i"><span class="sw__c" style="background: var(--ex)" /><b>expected</b><span>baseline strategy, population prior, EV</span></li>
        <li class="sw__i"><span class="sw__c" style="background: var(--ob)" /><b>observed</b><span>applied policy, posterior, what happened</span></li>
        <li class="sw__i"><span class="sw__c" style="background: var(--alert)" /><b>alert</b><span>fold, and "no solved entry for this spot"</span></li>
        <li class="sw__i"><span class="sw__c" style="background: var(--fg)" /><b>foreground</b><span>money, which is never coloured by sign</span></li>
      </ul>
    </section>

    <!-- ------------------------------------------------------------ hatch -->
    <section class="gal__sec">
      <h2 class="gal__h2">Settledness</h2>
      <p class="gal__note u-sentence">
        The same bar at five levels of evidence. Nothing here depends on colour, motion or a
        label — the density alone reads as more or less resolved.
      </p>
      <ul class="hd">
        <li v-for="s in SETTLE_STEPS" :key="s" class="hd__i">
          <span class="track hd__t">
            <span
              class="hd__f u-hatch"
              :style="{ width: `${s * 100}%`, '--hatch-gap': hatchGap(s), '--hatch-ink': 'var(--fg)' }"
            />
          </span>
          <span class="u-eyebrow">{{ Math.round(s * 100) }}% settled</span>
        </li>
      </ul>
    </section>

    <!-- ------------------------------------------------------------- cards -->
    <section class="gal__sec">
      <h2 class="gal__h2">PlayingCard</h2>
      <p class="gal__note u-sentence">
        Suit rides on four redundant channels — glyph, letter code, edge-rail dash pattern and a
        muted tint — so it survives greyscale and any colour vision deficiency.
      </p>
      <div class="gal__row">
        <PlayingCard v-for="c in aces" :key="c" :card="c" size="lg" />
        <PlayingCard :card="null" size="lg" />
        <PlayingCard :card="null" empty size="lg" />
        <PlayingCard :card="aces[1] ?? 0" size="lg" dimmed />
      </div>
      <p class="gal__cap u-eyebrow">four suits &middot; face down &middot; not yet dealt &middot; mucked</p>

      <div class="gal__row">
        <PlayingCard v-for="c in spread" :key="`s${c}`" :card="c" size="sm" />
        <PlayingCard v-for="c in spread" :key="`m${c}`" :card="c" size="md" />
      </div>
      <p class="gal__cap u-eyebrow">small &middot; medium</p>
    </section>

    <!-- ---------------------------------------------------------- readouts -->
    <section class="gal__sec">
      <h2 class="gal__h2">StatReadout</h2>
      <div class="gal__grid4">
        <StatReadout label="pot" value="8.5" unit="bb" size="lg" />
        <StatReadout label="expected" value="+41.2" unit="bb" tone="expected" hint="on average" />
        <StatReadout label="realised" value="−46.0" unit="bb" tone="observed" hint="this one" />
        <StatReadout label="source" value="fallback" size="sm" tone="alert" hint="no solved entry" />
      </div>
    </section>

    <section class="gal__sec">
      <h2 class="gal__h2">EquityBar</h2>
      <div class="gal__grid2">
        <EquityBar label="equity vs range" :value="0.683" :ci="0.021" counter="top pair, gutshot" />
        <EquityBar label="equity vs range" :value="0.38" :ci="0.14" tone="observed" counter="thin sample, wide band" />
      </div>
    </section>

    <section class="gal__sec">
      <h2 class="gal__h2">ConfidenceInterval</h2>
      <div class="gal__grid2">
        <ConfidenceInterval label="win rate · 80 hands" :value="-12.4" :lo="-209.7" :hi="184.9" unit="bb/100" tone="observed" />
        <ConfidenceInterval label="win rate · 24,800 hands" :value="6.8" :lo="-4.4" :hi="18" unit="bb/100" tone="observed" />
      </div>
    </section>

    <!-- -------------------------------------------------------- policy bar -->
    <section class="gal__sec">
      <h2 class="gal__h2">PolicyBar</h2>
      <div class="gal__grid2">
        <PolicyBar label="baseline · no read" :dist="fx.decision.baseline" variant="expected" />
        <PolicyBar label="applied · with read" :dist="fx.decision.policy" variant="applied" :compare="fx.decision.baseline" />
      </div>
      <p class="gal__cap u-eyebrow">
        the gap between a hairline and the segment edge under it is the size of the read
      </p>
    </section>

    <!-- ------------------------------------------------------------- seats -->
    <section class="gal__sec">
      <h2 class="gal__h2">SeatPanel</h2>
      <div class="gal__grid2">
        <SeatPanel :seat="fx.heroSeat" hero to-act />
        <SeatPanel :seat="fx.aiSeat" />
        <SeatPanel :seat="fx.aiSeatRevealed" />
        <SeatPanel :seat="fx.aiSeatFolded" />
        <SeatPanel :seat="seatAllIn" hero />
      </div>
      <p class="gal__cap u-eyebrow">to act &middot; waiting &middot; revealed &middot; folded &middot; all in</p>
    </section>

    <!-- ------------------------------------------------------------- table -->
    <section class="gal__sec">
      <h2 class="gal__h2">TableFelt</h2>
      <div class="gal__grid2">
        <TableFelt
          :board="fx.board"
          :pot="fx.potDisplay"
          street="turn"
          :hero="fx.heroSeat"
          :villain="fx.aiSeat"
          :to-act="0"
        />
        <TableFelt
          :board="[]"
          :pot="150"
          street="preflop"
          :hero="fx.heroSeat"
          :villain="fx.aiSeat"
          :to-act="1"
        />
      </div>
      <p class="gal__cap u-eyebrow">turn &middot; preflop, board empty</p>
    </section>

    <!-- ---------------------------------------------------------- controls -->
    <section class="gal__sec">
      <h2 class="gal__h2">BettingControls</h2>
      <div class="gal__grid2">
        <BettingControls v-bind="fx.betting" @action="record" />
        <BettingControls v-bind="preflopBetting" @action="record" />
        <BettingControls v-bind="checkSpot" @action="record" />
        <BettingControls v-bind="checkSpot" disabled @action="record" />
      </div>
      <p class="gal__cap u-eyebrow">
        facing a bet &middot; preflop &middot; check or bet &middot; disabled &nbsp;&middot;&nbsp; last emitted:
        <span class="u-num">{{ lastEmitted }}</span>
      </p>
    </section>

    <!-- --------------------------------------------------------- reasoning -->
    <section class="gal__sec">
      <h2 class="gal__h2">ReasoningPanel</h2>
      <div class="gal__grid2">
        <ReasoningPanel :decision="fx.decision" />
        <ReasoningPanel :decision="fx.decisionNoShift" />
        <ReasoningPanel :decision="fx.decisionFallback" />
        <ReasoningPanel :decision="null" thinking />
      </div>
      <p class="gal__cap u-eyebrow">
        large shift &middot; zero shift &middot; fallback source &middot; empty, deciding
      </p>
    </section>

    <!-- ----------------------------------------------------------- beliefs -->
    <section class="gal__sec">
      <h2 class="gal__h2">BeliefPanel</h2>
      <div class="gal__grid2">
        <BeliefPanel :beliefs="fx.beliefsSettled" />
        <BeliefPanel :beliefs="fx.beliefsProvisional" />
        <BeliefPanel :beliefs="fx.beliefsEmpty" />
      </div>
      <p class="gal__cap u-eyebrow">settled &middot; provisional, including n=0 &middot; nothing yet</p>
    </section>

    <!-- ---------------------------------------------------------- variance -->
    <section class="gal__sec">
      <h2 class="gal__h2">VarianceStrip</h2>
      <div class="gal__grid2">
        <VarianceStrip v-bind="fx.variance" />
        <VarianceStrip v-bind="fx.varianceLongRun" />
        <VarianceStrip v-bind="fx.varianceNoAllIn" />
      </div>
      <p class="gal__cap u-eyebrow">
        80 hands, lost as an 82% favourite &middot; 24,800 hands, won from 18% &middot; no all-in
      </p>
    </section>

    <!-- ----------------------------------------------------------- history -->
    <section class="gal__sec">
      <h2 class="gal__h2">HandHistory</h2>
      <div class="gal__grid2">
        <HandHistory :records="fx.history" />
        <HandHistory :records="[]" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.gal {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.gal__intro {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: 60ch;
}

.gal__h1 {
  font-family: var(--mono);
  font-size: var(--fs-2xl);
  font-weight: 700;
  letter-spacing: -0.03em;
}

.gal__lede {
  font-size: var(--fs-md);
  color: var(--fg-2);
  line-height: 1.55;
}

.gal__sec {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--line);
}

.gal__h2 {
  font-family: var(--mono);
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ob);
}

.gal__note {
  font-size: var(--fs-sm);
  color: var(--fg-2);
  max-width: 62ch;
  line-height: 1.5;
  margin-top: calc(var(--sp-2) * -1);
}

.gal__cap {
  color: var(--fg-3);
  line-height: 1.5;
  text-transform: none;
  letter-spacing: 0.04em;
}

.gal__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  align-items: flex-end;
}

.gal__grid2,
.gal__grid4 {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 30rem) {
  .gal__grid4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 52rem) {
  .gal__grid2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* palette swatches */
.sw {
  display: grid;
  gap: var(--sp-2);
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 40rem) {
  .sw {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.sw__i {
  display: grid;
  grid-template-columns: 1.5rem 6rem minmax(0, 1fr);
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--fg-3);
}

.sw__c {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--r-1);
  border: 1px solid var(--line);
}

.sw__i b {
  font-family: var(--mono);
  font-size: var(--fs-micro);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg);
  font-weight: 600;
}

/* settledness demo */
.hd {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-width: 30rem;
}

.hd__i {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 7rem;
  align-items: center;
  gap: var(--sp-3);
}

.hd__t {
  --track-h: 0.7rem;
  display: block;
}

.hd__f {
  position: absolute;
  inset: 0 auto 0 0;
  --hatch-line: 1.5px;
  background-color: var(--surface-3);
}
</style>
