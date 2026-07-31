# ADR-003: Postflop strategy is a precomputed policy table, not live equity

**Status:** Accepted — and the highest-risk decision in the repository

## Context

This is the decision that decides whether the project is a poker AI or a
calculator with a felt background.

The obvious v1 is seductive and wrong: run a Monte Carlo equity simulation,
compare the result to the pot odds, act accordingly. It is easy, it is fast
(10,000 trials in 2 ms — see [ADR-008](008-hand-evaluation.md)), and it produces
something that looks like it is thinking. It is not a strategy. Specifically it:

- **over-calls**, because equity realised is not the same as equity share — a
  hand with 35% equity out of position against a polarised range does not
  realise 35%;
- **never bluffs at a coherent frequency**, because nothing in the calculation
  says how often to represent a hand you do not have;
- **cannot value-bet thin**, and cannot fold strong-but-dominated hands, because
  it reasons about its own cards rather than about the opposing range;
- **responds only to fold frequency**, not to the line the opponent took.

More fundamentally: an opponent model can only ever *deviate from a baseline*.
If the baseline is a pot-odds calculator, there is nothing worth deviating from,
and the entire opponent-modelling layer in [ADR-005](005-opponent-modelling.md)
has no foundation to stand on.

The counter-temptation is equally wrong: build one enormous offline abstraction
and look everything up. [Local Best Response](https://arxiv.org/abs/1612.07547)
tested exactly this class of bot and found them "remarkably poor Nash
equilibrium approximations" — every entrant lost more than 3,000 mbb/g, **worse
than folding every hand**. It is search at play time, not abstraction size, that
makes bots strong. And real search is unavailable to us:
[ADR-004](004-no-in-browser-cfr.md) rules out in-browser CFR.

So the project sits between two known failure modes, with the strongest
technique unavailable.

## Decision

**Postflop strategy is a precomputed policy table, generated offline, shipped as
a static asset, and looked up at play time. Monte Carlo equity is used for the
interface and for explanation, never as the sole action chooser.**

The representation, in the order it will be built:

1. **Preflop:** 169 lossless starting-hand buckets against position and action.
   These are small — full charts gzip to under 100 KB — and this part is close
   to a solved problem.
2. **Postflop:** hand-strength-percentile buckets per street against a
   discretised bet space of roughly {33%, 66%, 100% pot, all-in}, keyed by
   board texture class and stack-to-pot ratio. Fixing 100bb starting stacks
   ([ADR-001](001-scope-heads-up-nlhe.md)) collapses one dimension out of this.
3. **Bucketing metric:** Earth Mover's Distance over hand-strength
   distributions, not L₂ over mean equity. This is not a detail —
   `KcQc` and `6c6d` have nearly identical average hand strength and completely
   different distributions, and L₂ cannot tell them apart. See the
   [potential-aware imperfect-recall](https://www.cs.cmu.edu/~sandholm/potential-aware_imperfect-recall.aaai14.pdf)
   work.

**A hard budget applies:** if the tables do not compress to something sane to
ship to a phone, the representation is wrong and gets revisited — not shipped
with a loading spinner.

## Consequences

**Good.** There is a real baseline for the opponent model to deviate from. Play
is instant at the table, because a lookup is a lookup. The expensive work
happens once, offline, where it can take hours.

**Bad, and this is the part to be honest about.** A lookup table cannot search.
It will be measurably weaker than any bot that re-solves subgames at play time,
and against a strong human it will have exploitable holes that a fixed table
cannot patch. The LBR result above is a warning that this weakness can be much
larger than intuition suggests.

**Accepted risk.** This is the action most likely to fail its bench and force a
replan. The documented fallback in [the plan](../plan/00-goal.md) is an explicit,
tested heuristic policy, clearly labelled as heuristic — with the benchmark, not
optimism, deciding whether it is good enough to ship.

**Non-negotiable.** Whatever is built here is measured against the held-out
bench in [ADR-009](009-held-out-benchmark-discipline.md) before it is called
finished. A postflop policy that has only been evaluated against opponents
designed alongside it has not been evaluated.
