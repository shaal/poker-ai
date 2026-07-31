# Architecture decision records

Decisions taken before code, so the expensive ones are made against evidence.
Each records what was decided, what it costs, and what would justify reopening
it. The evidence behind them is in [`../plan/01-research.md`](../plan/01-research.md).

| # | Decision | Why it matters |
|---|---|---|
| [001](001-scope-heads-up-nlhe.md) | Heads-up NLHE, 100bb cash | Everything downstream depends on format. Multiway breaks the theory |
| [002](002-success-is-bb-per-100-not-always-winning.md) | Success is bb/100 with a CI, not "always wins" | The brief asked for something variance forbids |
| [003](003-postflop-strategy-representation.md) | Precomputed policy tables, not live equity | **Highest risk.** Equity + pot odds is not a strategy |
| [004](004-no-in-browser-cfr.md) | No in-browser CFR | Proven possible, but 660MB+ and 33–72s per solve |
| [005](005-opponent-modelling.md) | Bayesian blending from a population prior | Naive exploitation measures *worse than none* |
| [006](006-no-vector-database.md) | No vector database | The constraint is sample size, not retrieval speed |
| [007](007-poker-darwin.md) | poker-darwin not in the critical path | 1,116 infosets, two streets, no licence stated |
| [008](008-hand-evaluation.md) | `phe` + own Monte Carlo | 6.4M evals/s, 62 KB gz; equity is a non-issue |
| [009](009-held-out-benchmark-discipline.md) | Benchmark first, split familiar/held-out | Inherited from a real, documented failure |
| [010](010-communicating-variance.md) | Variance is an interface concern | A working AI loses constantly at human timescales |

## The short version

Three decisions carry the project.

**[003](003-postflop-strategy-representation.md) is the one that decides whether
this is a poker AI or a calculator with a felt background.** Monte Carlo equity
compared against pot odds is not a strategy, and an opponent model can only
deviate from a baseline — if the baseline is a pot-odds calculator, there is
nothing worth deviating from.

**[005](005-opponent-modelling.md) is the one the brief cares most about**, and
the literature is discouraging in a specific, designable-around way: the
strongest published bot deliberately does not adapt, because exploitation is
sample-starved. Fold-to-c-bet needs ~3,840 hands to stabilise; a naive model
built on less measured at −120 mb/g, *worse than not modelling at all*.

**[009](009-held-out-benchmark-discipline.md) is the one that keeps the other
two honest**, and it exists because the sibling project shipped a change that
looked like +0.7pp on a benchmark it had co-designed and measured −0.5pp on one
it had not.

## Adding one

Number sequentially, follow the existing shape — Status, Context, Decision,
Consequences — and state the cost of the decision as plainly as the benefit. An
ADR with no downside listed has not been thought about hard enough. Say what
would make you reopen it.
