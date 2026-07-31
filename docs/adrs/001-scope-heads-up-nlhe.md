# ADR-001: Heads-up No-Limit Hold'em, 100bb cash, for v1

**Status:** Accepted

## Context

"A poker game" is not a specification. Heads-up cash, 6-max cash and
sit-and-go tournaments are different games with different infoset counts,
different opponent-model features, different variance profiles and different
correct strategies. Almost every other decision in this repository depends on
which one is chosen, so it has to be chosen first.

The pull toward 6-max is real — it is what most people picture, and it makes for
a busier, better-looking table. But multiway play breaks the theory badly. In
games with more than two players a Nash equilibrium carries **no guarantee at
all**; the Pluribus authors say directly that "it is not clear that playing such
an equilibrium strategy would be wise," because with several players there is no
principled way to pick which equilibrium everyone is playing. Computing one is
PPAD-complete. Multiway pots also multiply the postflop tree and thin out every
opponent statistic across more seats, which makes the sample-size problem in
[ADR-005](005-opponent-modelling.md) considerably worse.

## Decision

**v1 is heads-up No-Limit Hold'em, cash game, fixed 100 big blind starting
stacks, one human against the AI.**

Consequences of the specific parameters:

- **Heads-up** — two-player zero-sum, so an equilibrium is well defined and
  "how exploitable is this strategy" is a question with an answer. It is also
  the format with the most available precomputed data and the smallest tree.
- **Cash, not tournament** — no ICM, no changing stack depths, no bubble
  dynamics. One fewer entire discipline to model.
- **100bb fixed** — stack-to-pot ratio drives postflop strategy heavily, so
  fixing it collapses a dimension out of the policy tables in
  [ADR-003](003-postflop-strategy-representation.md). Deep-stack play is a
  different game and can be a later decision.
- **One human** — the story is "it learns *you*." That story is incoherent when
  the reads are spread across five opponents.

## Consequences

**Good.** The tree is small enough that offline solving is tractable at hobby
scale. Every opponent statistic accumulates against a single player, at the
fastest possible rate — heads-up means the player is involved in every hand,
which is the best case for the sample-size limits. Exploitability is measurable,
so "is the baseline any good" is answerable rather than a matter of opinion.

**Bad.** Heads-up is the format casual players are least familiar with, and it
looks less like televised poker. A two-seat table is a harder visual brief than
a six-seat one — the design has to carry more with less.

**Accepted risk.** If the project later wants 6-max, the strategy layer is not
portable and would need rebuilding, not extending. That is a real cost and it is
being accepted deliberately rather than discovered later.
