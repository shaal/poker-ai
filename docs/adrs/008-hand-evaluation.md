# ADR-008: `phe` for hand evaluation, own Monte Carlo for equity

**Status:** Accepted

## Context

Everything needs a fast 7-card hand evaluator: the AI, the equity display, and
the offline table generation. Four candidates were benchmarked directly rather
than compared on reputation — 200k random 7-card hands, Node 24, single-threaded.

| Package | Speed | Size | Licence | Verdict |
|---|---|---|---|---|
| [phe](https://www.npmjs.com/package/phe) `evaluateCardCodes` | **6.4M evals/s** | **62 KB gz** | MIT | Chosen |
| phe `evaluateCards` (strings) | 0.98M/s | 103 KB gz | MIT | String parsing dominates |
| [poker-evaluator](https://www.npmjs.com/package/poker-evaluator) | 0.60M/s | **124 MiB** table | ISC | Disqualified |
| [pokersolver](https://www.npmjs.com/package/pokersolver) | 0.045M/s | 8 KB gz | MIT | ~140x slower |

`poker-evaluator` is disqualified for a harder reason than size: it calls
`fs.readFileSync` at module load, which is Node-only and breaks bundlers
outright. Its TwoPlusTwo lookup table is also, counter-intuitively, *slower* in
JavaScript than phe's perfect hash — cache misses swamp the O(1) win. Native C
implementations of the same table reach ~100M/s; this port manages 0.6M/s.

phe is a port of
[HenryRLee/PokerHandEvaluator](https://github.com/HenryRLee/PokerHandEvaluator),
not TwoPlusTwo. Correctness was cross-checked against a TwoPlusTwo table on
20,000 random 7-card matchups: **20,000/20,000 identical winners.**

For equity, [poker-odds-calculator](https://www.npmjs.com/package/poker-odds-calculator)
was measured at **1,465 ms** for a single exhaustive preflop matchup, and rounds
its output to whole percentage points. A hand-rolled Monte Carlo on phe runs at
**4.9M trials/s**.

## Decision

**Use `phe`, importing only the integer-code path (`evaluateCardCodes`). Write
our own Monte Carlo equity on top of it. Run it in a Web Worker.**

Measured accuracy of the Monte Carlo, over 40 independent runs:

| Trials | Time | 95% CI |
|---|---|---|
| 1,000 | 0.2 ms | ±2.78% |
| **10,000** | **2 ms** | **±0.80%** |
| 100,000 | 23 ms | ±0.29% |
| 1,000,000 | 225 ms | ±0.09% |

**10,000 trials at 2 ms is the default.** Validated against published equities
(AA 85.0% measured vs 85.3% published; AKs 67.3% vs 67.0%).

> **API trap, recorded because it cost real time.** `phe.cardCode('Ac')` returns
> `0` for *every* card. Only the plural `cardCodes([...])` is correct. The
> singular form fails silently and produced a plausible-looking 50.00% equity
> result before it was caught. Any equity code must be checked against a known
> value — AA vs KK is 82.4% — before being trusted.

## Consequences

**Good.** Real-time equity in the browser is a non-issue: a full 9-handed
showdown evaluates in 2.1 µs, and a complete 169-hand preflop chart at 10k
trials each takes 354 ms. The worker keeps the main thread free, so the table
animates smoothly regardless. 62 KB gzipped is a rounding error in the bundle.

**Bad.** phe was last published in 2018. It is unmaintained, though it is also
small, pure, dependency-free and now independently verified against a second
implementation, so the risk of latent bugs is low. If it ever needs replacing,
the interface is one function and
[rs-poker](https://crates.io/crates/rs-poker) via WASM is the fallback.

**Important boundary.** Equity is for *display and explanation*. It is not the
action chooser — see [ADR-003](003-postflop-strategy-representation.md) for why
equity plus pot odds is not a strategy.
