# ADR-009: The benchmark is built first, and split into familiar and held-out

**Status:** Accepted

## Context

This decision is inherited from a specific, documented failure in the sibling
project `shaal/rps-ai`, and it is written down here so the same mistake is not
repeated in a domain where it would be far harder to detect.

What happened there: a change was proposed on a sound premise — the existing
predictor had a single inductive bias, and some opponents need a different one.
Measured against the existing benchmark, it was **a net loss**. That result
should have ended it. Instead it was rescued twice: once by adding a benchmark
opponent built in the same change specifically to exercise the new code, and
once by fitting four hyperparameters to the resulting seven-row table. It then
measured **+0.7pp** and shipped with a convincing writeup.

Scored against opponents written afterwards, with those constants frozen, it
came out at **−0.5pp mean and −2.7pp worst case**, and was reverted.

The diagnosis generalises: *a panel of N predictors evaluated against opponents
that restate those same N predictors is a matched filter. It cannot do anything
except confirm.*

Poker makes every part of this worse. Variance is enormous
([ADR-002](002-success-is-bb-per-100-not-always-winning.md)), so results are
noisy enough to read as whatever you hope for. The strategy has many more tunable
parameters. And there is no equivalent of "obviously the AI predicted the move
correctly" — you cannot eyeball whether a poker decision was right.

## Decision

**The benchmark is built before the strategy it judges** (action A3 precedes A4
in [the plan](../plan/00-goal.md)), and it is split into two suites that are not
interchangeable.

- **FAMILIAR** — opponents used during development. Useful for iterating.
  Worthless as evidence, because anything tuned against it will look good on it.
- **HELD OUT** — opponents written to be unlike any mechanism in the AI, with
  all constants frozen beforehand. **This suite alone decides whether a change
  ships.**

Four rules, in order of how easy they are to rationalise away:

1. **Do not tune constants against the held-out suite.** Freeze, then measure.
   Adjusting a threshold because a held-out row looks bad converts it into a
   familiar one and it is spent.
2. **Do not add an opponent in the same change that needs it.** If the existing
   suite cannot demonstrate an idea's value, that is a finding about the idea.
3. **An opponent must not be a restatement of a mechanism in the AI.** If the
   model tracks fold-to-c-bet, an opponent whose defining trait is a fixed
   fold-to-c-bet frequency is not a test, it is a mirror.
4. **A change ships only if it clears the held-out suite.** However good the
   argument for it is.

**Measurement requirements specific to poker:**

- Results reported as **bb/100 with a 95% confidence interval**, never as hands
  won or sessions won.
- **Variance reduction is mandatory**, not optional. Duplicate hands (both
  strategies play the same deals from both seats) and/or an
  [AIVAT](https://arxiv.org/abs/1612.06915)-style estimator, which cuts σ by
  roughly 85% — worth about 44x fewer hands. Without it, honest evaluation needs
  100,000+ hands per comparison and nothing will ever be measured properly.
- Opponents must include the standard leak archetypes: calling station, nit,
  maniac, always-min-raise, never-folds-to-c-bet, and at least one that *mixes*
  rather than playing deterministically.

## Consequences

**Good.** Claims in this repository will be checkable. The most likely failure
mode of an ambitious AI project — believing your own writeup — has a structural
defence rather than relying on the author's self-discipline, which the sibling
project demonstrated is not sufficient.

**Bad.** It is slower. Building a benchmark before the thing it measures feels
backwards and is unsatisfying. Held-out opponents are pure cost at the moment
they are written.

**The tell to watch for.** If a change needs a new benchmark case in order to
look good, that is evidence about the change. Say so at the time rather than
after someone asks.
