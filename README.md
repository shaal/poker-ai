# poker-ai

Heads-up No-Limit Texas Hold'em against an opponent that shows its working.

**Status: built and playable.** All six roadmap phases are implemented, in the
dependency order the plan specifies — which meant building the benchmark before
the strategy it judges, per
[ADR-009](docs/adrs/009-held-out-benchmark-discipline.md).

```
npm install
npm run dev          # play it
npm test             # 95 tests: rules, equity, solver, strategy, model, bench
npm run bench        # bb/100 with 95% intervals, FAMILIAR and HELD OUT
npm run generate     # static export, no server
```

Measured results are in [docs/results.md](docs/results.md), including the ones
that came back unresolved. The benchmark reports UNRESOLVED rather than a
verdict whenever an interval covers zero, which happens more than is comfortable
and is the honest output at these sample sizes.

**Two results worth knowing before you read anything else.** The baseline beats
seven of eight familiar opponents and four of five held out — and *loses* to the
fifth at −15.61 ± 9.61 bb/100, so by the rule in
[ADR-009](docs/adrs/009-held-out-benchmark-discipline.md) it does not ship as
finished. And opponent modelling is **off by default**, because it could not be
shown to beat its own non-adaptive baseline. Both are written up rather than
worked around. Deployment notes: [docs/deploying.md](docs/deploying.md).

## What this is meant to be

A browser-based poker opponent that plays a strong baseline strategy, measurably
improves against a specific player as it gathers evidence about them, and makes
both of those things visible on screen.

It is a static site with no server today, and
[ADR-012](docs/adrs/012-rust-solver-service.md) proposes changing that — because
search at play time is the only thing that buys real strength, and it cannot run
in a browser. The interface stays where it is; the solver moves to Rust.

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

**[Decisions](docs/adrs/)** — sixteen ADRs. 001-010 were written before any code
existed; 011-016 came out of building it and measuring it, and several amend an
earlier one rather than standing alone.

Working on this? Start with [CLAUDE.md](CLAUDE.md) — it carries the disciplines
that are not negotiable and the traps that have already cost time.

The three that carry the project:

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

**Where it goes next** — [beating professionals](docs/plan/04-beating-professionals.md)
and [stack and data](docs/plan/05-stack-and-data.md). Short version: search at
play time is the only thing that buys real strength, it needs a Rust service,
and even fully built it measures around −8 bb/100 against a strong professional.
So the target is a *floor* — beat recreational players convincingly, prove it
with a best-response probe — and everything else goes into the explanation
layer. One decision, [ADR-014](docs/adrs/014-solver-licence.md), is blocked
pending a human: there is no permissively-licensed heads-up postflop solver to
adopt.

## Questions already settled

**Will it use a vector database?** Not for opponent modelling, and only offline
elsewhere — see [ADR-006](docs/adrs/006-no-vector-database.md) and its amendment
[ADR-011](docs/adrs/011-ruvector-for-offline-clustering.md). The binding
constraint on opponent modelling is sample size, not retrieval speed, and the
features involved are counters rather than embeddings; a faster way to query a
sample too small to act on is not progress. ruvector is used at build time for
board clustering, is never in the browser bundle, and ADR-011 states plainly
that its leverage is small. Its documented failure mode — a stub that reports
success while returning nothing — was reproduced live, which is why
`npm run probe:vector` proves the engine by using it rather than by reading its
backend label.

**Will it use [poker-darwin](https://github.com/ruvnet/metaharness/tree/main/crates/poker-darwin)?**
Not in the critical path — see [ADR-007](docs/adrs/007-poker-darwin.md), which
was re-checked against primary sources during implementation. Its NLHE
abstraction is 1,116 infosets across two streets at **20bb**, where this project
is fixed at 100bb, and it contains no opponent modelling. The "no licence"
objection recorded originally has been **withdrawn** — `metaharness` ships an
MIT LICENSE file. The correctness use it was kept for was implemented directly
instead: our own CFR+ reaches Kuhn's closed-form −1/18 to 6e−9, and independently
reproduces poker-darwin's Leduc infoset count of 288.

**Will it solve in the browser?** No — see
[ADR-004](docs/adrs/004-no-in-browser-cfr.md). It is genuinely possible
([wasm-postflop](https://github.com/b-inary/wasm-postflop) proves it) at a cost
of 660 MB–1.25 GB of memory and 33–72 seconds per solve, under AGPL, from a
project suspended since 2023. ADR-004 named its own revisit condition — "the
project acquires a server" — and that condition is now met, which is what
[ADR-012](docs/adrs/012-rust-solver-service.md) acts on. Solving still does not
happen in the browser; it happens in a service.

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
