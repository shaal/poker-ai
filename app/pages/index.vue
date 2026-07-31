<script setup lang="ts">
import type { Action } from '~core/engine/types'
import { useGame } from '~/composables/useGame'

/**
 * The table. All poker lives in `useGame`; this page only binds it.
 *
 * The whole game runs client-side — ADR-004 keeps every expensive thing
 * offline, so there is no server to wait on and nothing to hydrate from.
 */
const {
  board,
  pot,
  street,
  hero,
  villain,
  decision,
  beliefs,
  variance,
  log,
  betting,
  thinking,
  toAct,
  handOver,
  message,
  exploitEnabled,
  handsObserved,
  playerAction,
  nextHand,
  resetProfile,
} = useGame()

function onAction(a: Action) {
  void playerAction(a)
}
</script>

<template>
  <div class="page">
    <!-- The three wrappers are `display: contents` until the widest
         breakpoint, so narrow layouts place each panel individually by area
         and only the three-column layout treats them as columns. -->
    <div class="col col--play">
      <TableFelt
        class="area-table"
        :board="board"
        :pot="pot"
        :street="street"
        :hero="hero"
        :villain="villain"
        :to-act="toAct"
        :hero-seat="0"
      />

      <div class="area-controls controls">
        <!-- The hand-over bar replaces the betting controls in place rather
             than appearing above them, so the panel never changes height and
             the page never shifts under a click. -->
        <div v-if="handOver" class="handover">
          <p class="handover__msg">{{ message }}</p>
          <button type="button" class="handover__next" @click="nextHand()">Next hand</button>
        </div>
        <BettingControls
          v-else
          :pot-chips="betting.potChips"
          :to-call-chips="betting.toCallChips"
          :stack-chips="betting.stackChips"
          :committed-chips="betting.committedChips"
          :min-raise-to-chips="betting.minRaiseToChips"
          :max-to-chips="betting.maxToChips"
          :disabled="toAct !== 0"
          @action="onAction"
        />
      </div>

      <!-- Sits with the hand and the log, not with the reads: this panel is
           about what happened, and the reads column is about what it thinks. -->
      <VarianceStrip
        class="area-variance"
        :hands="variance.hands"
        :bb100="variance.bb100"
        :ci95="variance.ci95"
        :all-in="variance.allIn"
      />

      <HandHistory class="area-history" :records="log" :hero-seat="0" />
    </div>

    <div class="col col--mind">
      <ReasoningPanel class="area-reasoning" :decision="decision" :thinking="thinking" />
    </div>

    <div class="col col--reads">
      <BeliefPanel class="area-beliefs" :beliefs="beliefs" />

      <!-- ADR-005 says that if the adaptive configuration cannot be shown to
           beat its own baseline, it ships off by default and stays a visible
           experiment. Either way it is the player's switch, and labelled. -->
      <div class="area-model model">
        <label class="model__row">
          <input v-model="exploitEnabled" type="checkbox" />
          <span>Let the reads change how it plays</span>
        </label>
        <p class="model__note">
          Off by default. It reads you either way and shows you what it thinks —
          but on the benchmark, letting those reads move the strategy could not
          be shown to help, so it stays an experiment rather than a claim.
        </p>
        <p class="model__note">
          {{ handsObserved }} hands observed. Reads persist between visits;
          nothing leaves this browser.
        </p>
        <button type="button" class="model__reset" @click="resetProfile()">
          Forget everything about me
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * One column below 46rem. The two-seat table is what makes that survivable:
 * five board cards and two hole cards fit inside 320px with room to spare, so
 * nothing has to scroll sideways or shrink below a legible size.
 */
.page {
  display: grid;
  gap: var(--sp-3);
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'table'
    'controls'
    'reasoning'
    'beliefs'
    'variance'
    'history'
    'model';
}

.col {
  display: contents;
}

.area-table {
  grid-area: table;
}
.area-controls {
  grid-area: controls;
}
.area-reasoning {
  grid-area: reasoning;
}
.area-beliefs {
  grid-area: beliefs;
}
.area-variance {
  grid-area: variance;
}
.area-history {
  grid-area: history;
}
.area-model {
  grid-area: model;
}

/*
 * The hand-over bar occupies the betting controls' slot. Both are given the
 * same min-height so swapping one for the other cannot move anything below.
 */
.controls,
.handover {
  min-height: 8.5rem;
}

.handover {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: flex-start;
  justify-content: center;
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  background: var(--panel);
}

.handover__msg {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.handover__next,
.model__reset {
  min-height: 44px;
  padding: 0 var(--sp-3);
  border: 1px solid var(--rule-strong, var(--rule));
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.handover__next:hover,
.model__reset:hover {
  border-color: var(--accent-observed, currentColor);
}

.model {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--rule);
  background: var(--panel);
}

.model__row {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  min-height: 44px;
  cursor: pointer;
}

.model__note {
  margin: 0;
  font-size: var(--fs-sm, 0.85rem);
  opacity: 0.75;
}

/* Two columns: play on the left, the mind on the right. */
@media (min-width: 46rem) {
  .page {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'table reasoning'
      'controls reasoning'
      'beliefs reasoning'
      'beliefs variance'
      'history variance'
      'model variance';
    align-items: start;
  }
}

/*
 * Three columns, each an independent stack. Column stacks rather than grid
 * areas here because a tall panel spanning grid rows pushes gaps between the
 * panels beside it, and this page has one very tall panel by design.
 */
@media (min-width: 74rem) {
  .page {
    grid-template-columns: minmax(0, 19rem) minmax(0, 1.4fr) minmax(0, 1fr);
    grid-template-areas: 'play mind reads';
    align-items: start;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }

  .col--play {
    grid-area: play;
  }
  .col--mind {
    grid-area: mind;
  }
  .col--reads {
    grid-area: reads;
  }
}
</style>
