# poker-ai

Heads-up No-Limit Texas Hold'em against an opponent that shows its working.

**Status: planning. No code yet.** This repository currently contains the
research and the decisions taken before writing any, which is deliberate — the
expensive mistakes in a project like this are architectural, and they are
cheapest to make on paper.

## What this is meant to be

A browser-based poker opponent that plays a strong baseline strategy, measurably
improves against a specific player as it gathers evidence about them, and makes
both of those things visible on screen. Static site, no server.

The interesting screen is not the table. It is the one where the AI says what it
thinks it knows about you, how confident it is, and how much that changed the
decision it just made.

## What it is not

It will not always win, and nothing in this repository claims otherwise.

The original brief asked for an AI that "learns all the players' patterns and
always wins." The second half is arithmetically impossible. The standard
deviation of results in No-Limit Hold'em is about **90 bb/100 hands** — a player
with a genuinely strong 5 bb/100 win rate needs roughly **124,000 hands** before
a 95% confidence interval even excludes zero. Any poker AI, however good, loses
pots, stacks and sessions constantly.

The first half is harder than it sounds too. The strongest published poker bot,
Pluribus, **deliberately does not adapt to opponents** — its authors found that
exploitation "requires too many samples to be competitive with human ability
outside of small games." Fold-to-c-bet needs about **3,840 hands** to stabilise
to ±5%, and a model built on less than that has been measured performing *worse
than not modelling at all*.

So the goal is reframed, keeping the ambition and changing the metric: maximum
expected value, measured in bb/100 with a confidence interval, against a fixed
benchmark. Full reasoning in
[ADR-002](docs/adrs/002-success-is-bb-per-100-not-always-winning.md).

## Documentation

**[The plan](docs/plan/)**

- [Goal decomposition](docs/plan/00-goal.md) — goal state, gap analysis, ordered
  actions with preconditions, risks and fallback
- [Research](docs/plan/01-research.md) — how strong bots work, what runs in a
  browser, sample-size and variance limits, with sources
- [Roadmap](docs/plan/02-roadmap.md) — phases with measurable exit criteria
- [Interface direction](docs/plan/03-interface.md) — why this should not look
  like a casino

**[Decisions](docs/adrs/)** — ten ADRs. The three that carry the project:

- [003 — postflop strategy representation](docs/adrs/003-postflop-strategy-representation.md).
  The highest-risk decision here. Monte Carlo equity compared against pot odds is
  *not a strategy*, and an opponent model can only deviate from a baseline — if
  the baseline is a pot-odds calculator, there is nothing worth deviating from.
- [005 — opponent modelling](docs/adrs/005-opponent-modelling.md). Population
  priors with Bayesian blending and regularised deviations, because the naive
  version is negative EV rather than merely weak.
- [009 — held-out benchmark discipline](docs/adrs/009-held-out-benchmark-discipline.md).
  Inherited from a documented failure in a sibling project, where a change
  measured +0.7pp against a benchmark it had co-designed and −0.5pp against one
  it had not.

## Questions already settled

**Will it use a vector database?** No — see
[ADR-006](docs/adrs/006-no-vector-database.md). The binding constraint on
opponent modelling is sample size, not retrieval speed, and the features
involved are counters rather than embeddings. A faster way to query a sample too
small to act on is not progress.

**Will it use [poker-darwin](https://github.com/ruvnet/metaharness/tree/main/crates/poker-darwin)?**
Not in the critical path — see [ADR-007](docs/adrs/007-poker-darwin.md). Its
NLHE abstraction is 1,116 infosets across two streets, it contains no opponent
modelling, and its README states no licence. It remains useful as a correctness
reference, since Kuhn poker has a known closed-form value.

**Will it solve in the browser?** No — see
[ADR-004](docs/adrs/004-no-in-browser-cfr.md). It is genuinely possible
([wasm-postflop](https://github.com/b-inary/wasm-postflop) proves it) at a cost
of 660 MB–1.25 GB of memory and 33–72 seconds per solve, under AGPL, from a
project suspended since 2023.

## Sibling project

[shaal/rps-ai](https://github.com/shaal/rps-ai) — adaptive rock-paper-scissors
with a k-NN opponent and a commit-reveal protocol. Same house style: static
export, pure prediction core behind a storage seam, a benchmark that gates
changes on measured skill, and an interface whose whole purpose is that the AI
explains itself.

The asymmetry between the two projects is the single most important thing to
carry over. In rock-paper-scissors, opponent modelling converges in *dozens* of
rounds. In poker it needs *thousands* of hands per statistic. An architecture
copied across without confronting that would be telling users a story it cannot
back.
