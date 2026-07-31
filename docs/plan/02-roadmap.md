# Roadmap

Phases, in dependency order from [`00-goal.md`](00-goal.md). Each phase has an
exit criterion that is a measurement, not a feeling.

## Phase 0 — Foundations

**Actions A1, A2.** Format is fixed by [ADR-001](../adrs/001-scope-heads-up-nlhe.md).
Stand up the game rules — betting rounds, blinds, side pots, showdown — as pure
functions with no interface attached, plus `phe` and a Monte Carlo equity
worker per [ADR-008](../adrs/008-hand-evaluation.md).

**Exit:** a full hand can be played out headlessly and scored correctly; equity
for AA vs KK returns 82.4% ±1%.

Nothing here is interesting, and all of it is load-bearing. Rules bugs found
later are indistinguishable from strategy bugs, which is a miserable place to be.

## Phase 1 — The benchmark, before the thing it measures

**Action A3.** Scripted opponents with named leaks — calling station, nit,
maniac, always-min-raise, never-folds-to-c-bet, and at least one that mixes
rather than playing deterministically. Results in bb/100 with 95% confidence
intervals. Duplicate-hand evaluation from the start, since without variance
reduction nothing is measurable at hobby sample sizes.

**Exit:** a trivially bad strategy (always-fold, always-call) is measured as bad,
with the interval excluding zero, in a run that takes minutes rather than hours.

This ordering is deliberate and it is the whole point of
[ADR-009](../adrs/009-held-out-benchmark-discipline.md). Building the judge after
the defendant is how the sibling project shipped a regression.

## Phase 2 — The baseline strategy

**Actions A4, A5, and the risk concentrates here.** Preflop charts first, since
they are small and close to solved. Then the postflop policy representation from
[ADR-003](../adrs/003-postflop-strategy-representation.md) — bucketing, bet-size
discretisation, table generation, and a hard size budget for what ships.

**Exit:** positive bb/100 against every FAMILIAR opponent with the interval
excluding zero, *and* the same against HELD OUT. Tables fit the size budget.

**If it fails:** fall back to an explicit heuristic policy, labelled as such,
and let the bench decide whether it is good enough. Do not ship an unmeasured
table because it took a long time to generate.

## Phase 3 — Playable

**Action A7.** The table, the betting interface, animation, sound. The first
point at which anyone can actually play it. The AI is the Phase 2 baseline with
no adaptation yet.

**Exit:** a stranger can sit down and play twenty hands without being confused.

## Phase 4 — It learns you

**Action A6.** Opponent modelling per
[ADR-005](../adrs/005-opponent-modelling.md): population priors, Bayesian
blending, regularised deviation, profiles persisted across sessions.

**Exit — and this is the claim most likely to come back negative:** the adaptive
configuration beats its own non-adaptive baseline on the HELD OUT suite, measured,
with the interval excluding zero.

**If it fails:** it ships **off by default** and stays a visible experiment. The
sample-size numbers in [the research](01-research.md) make this a realistic
outcome and it is not a failure of the project — publishing a negative result
here is more valuable than most of what could be built instead.

## Phase 5 — The part people remember

**Actions A8, A9.** The reasoning panel — what the AI believed, why it took the
line, how much was baseline and how much was a read on you — plus the variance
treatment from [ADR-010](../adrs/010-communicating-variance.md).

**Exit:** after losing a big pot, a player can see why the AI's decision was
correct, and it does not read as an excuse.

This is last in dependency order and first in what the project is actually *for*.
Everything before it is scaffolding for this screen.

## Deliberately not scheduled

Multiway and 6-max ([ADR-001](../adrs/001-scope-heads-up-nlhe.md)), in-browser
solving ([ADR-004](../adrs/004-no-in-browser-cfr.md)), accounts, multiplayer, and
anything involving real money. Each is excluded for a reason recorded in an ADR
rather than forgotten.

## How this is likely to go wrong

Phase 2 is the one to worry about. It is where the difficulty is concentrated,
it is the least visually rewarding, and there is a standing temptation to skip
ahead to Phase 3 because a poker table is fun to build and a bucketing scheme is
not. A project that reaches Phase 3 with a pot-odds calculator behind it will
look finished and be finished, in the wrong sense — and the Phase 4 work will
have nothing to stand on.
