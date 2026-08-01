# Architecture decision records

Decisions taken before code, so the expensive ones are made against evidence.
Each records what was decided, what it costs, and what would justify reopening
it. The evidence behind them is in [`../plan/01-research.md`](../plan/01-research.md),
and what the benchmark actually measured is in [`../results.md`](../results.md).

**001–010 were written before any code existed. 011–016 came out of building it
and measuring it**, which is why several of them amend an earlier one rather than
standing alone. An ADR that survived contact is worth more than one that was
never tested; an ADR that did not survive says so.

| # | Decision | Why it matters |
|---|---|---|
| [001](001-scope-heads-up-nlhe.md) | Heads-up NLHE, 100bb cash | Everything downstream depends on format. Multiway breaks the theory |
| [002](002-success-is-bb-per-100-not-always-winning.md) | Success is bb/100 with a CI, not "always wins" | The brief asked for something variance forbids |
| [003](003-postflop-strategy-representation.md) | Precomputed policy tables, not live equity | **Highest risk.** Equity + pot odds is not a strategy |
| [004](004-no-in-browser-cfr.md) | No in-browser CFR | Proven possible, but 660MB+ and 33–72s per solve. **Amended by 012** |
| [005](005-opponent-modelling.md) | Bayesian blending from a population prior | Naive exploitation measures *worse than none* — and did, at −122 bb/100 |
| [006](006-no-vector-database.md) | No vector database | The constraint is sample size, not retrieval speed. **Amended by 011** |
| [007](007-poker-darwin.md) | poker-darwin not in the critical path | Re-checked: licence objection withdrawn, abstraction objection worse |
| [008](008-hand-evaluation.md) | `phe` + own Monte Carlo | 6.4M evals/s, 62 KB gz; equity is a non-issue |
| [009](009-held-out-benchmark-discipline.md) | Benchmark first, split familiar/held-out | Inherited from a real, documented failure. **Extended by 015** |
| [010](010-communicating-variance.md) | Variance is an interface concern | A working AI loses constantly at human timescales |
| [011](011-ruvector-for-offline-clustering.md) | ruvector offline only, never for opponent modelling | Its blind-stub failure mode was reproduced live. Leverage is small and says so |
| [012](012-rust-solver-service.md) | The solver becomes a Rust service | JS is 10–50x too slow for a regret loop. Search is the only route past LBR |
| [013](013-training-data-is-generated-not-collected.md) | Learn from solvers, not from professionals | Imitation caps below what it imitates; hand histories are biased by showdown |
| [014](014-solver-licence.md) | **The project is AGPL-3.0** | No permissive HUNL postflop solver exists. Decided 2026-08-01; relicensing is now foreclosed |
| [015](015-best-response-probe-in-the-ship-gate.md) | An LBR probe joins the ship gate | Scripted archetypes cannot find exploitable holes. One cost us a held-out opponent |
| [016](016-strength-floor-not-ceiling.md) | A strength floor, not a ceiling | Even fully built it is −8 bb/100 to a pro. Explaining a weak policy is negative pedagogy |

## The short version

Three decisions carried the project into existence.

**[003](003-postflop-strategy-representation.md) is the one that decides whether
this is a poker AI or a calculator with a felt background.** Monte Carlo equity
compared against pot odds is not a strategy, and an opponent model can only
deviate from a baseline — if the baseline is a pot-odds calculator, there is
nothing worth deviating from.

**[005](005-opponent-modelling.md) is the one the brief cares most about**, and
the literature is discouraging in a specific, designable-around way. It then
measured at **−122 bb/100 against a calling station**, reproducing the published
−120 mb/g result almost exactly, and ships off by default.

**[009](009-held-out-benchmark-discipline.md) is the one that keeps the other
two honest**, and it earned its keep: it caught a significant loss to a held-out
opponent and refused to call three unresolved rows evidence.

Three more decide where it goes next.

**[012](012-rust-solver-service.md) is the only change that buys real strength.**
Search at play time, in a language that can do it.
**[014](014-solver-licence.md) used to block it and no longer does** — the
project is AGPL-3.0, so an AGPL solver may be adopted and served, and the price
paid for that is that this can never be relicensed. And
**[016](016-strength-floor-not-ceiling.md) says how far to take it**, which is
less far than instinct wants.

## Adding one

Number sequentially, follow the existing shape — Status, Context, Decision,
Consequences — and state the cost of the decision as plainly as the benefit. An
ADR with no downside listed has not been thought about hard enough. Say what
would make you reopen it.

If you are amending an existing ADR rather than replacing it, say so in the
Status line and add a pointer in the older one. Do not silently leave a stale
fact in an accepted decision — that is how a decision stops being a decision and
becomes an inheritance. [ADR-007](007-poker-darwin.md) is the worked example:
one of its three objections turned out to be wrong on re-checking, and it now
says so at the top rather than in a footnote.
