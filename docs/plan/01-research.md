# Research

Everything the plan and the ADRs rest on. Numbers were checked against primary
sources; the browser benchmarks were measured directly rather than quoted.
Where something is inference rather than fact, it says so.

## How strong poker bots actually work

| Bot | Approach | Compute | Result |
|---|---|---|---|
| [DeepStack](https://www.science.org/doi/10.1126/science.aam6960) (2017) | Continual re-solving; stores no strategy. Counterfactual-value networks, tree sparsified 10^160 → ~10^7, <5s per action on one GPU | Turn net ~175 core-years | +486 ±40 mbb/g over 44,852 hands vs 33 pros |
| [Libratus](https://www.ijcai.org/proceedings/2017/0772.pdf) (2017) | MCCFR blueprint + nested safe subgame re-solving, no card abstraction in the re-solve | ~25M core-hours | +147 mbb/hand vs four top-10 pros, 99.98% significance |
| [Pluribus](https://noambrown.com/papers/19-Science-Superhuman.pdf) (2019, 6-max) | MCCFR + Linear CFR discounting; depth-limited search with 4 continuation strategies | **12,400 core-hours, ~$144**; plays on 2 CPUs at ~20s/hand | +48 mbb/g, p=0.028 vs 13 pros |

Since then: [ReBeL](https://arxiv.org/abs/2007.13544) (2020) beat Dong Kim
+165±69. [Student of Games](https://www.science.org/doi/10.1126/sciadv.adg3256)
(2023) generalised across games but beat Slumbot by only +7±3 — generality costs
strength. **No published result has superseded Pluribus in multiplayer.** LLMs
are nowhere close: [PokerBench](https://arxiv.org/abs/2501.08328) puts GPT-4 at
53.6% action accuracy.

The cost line is the interesting one. Pluribus is superhuman for about $144 of
compute — the barrier is not money, it is knowing what to compute.

## GTO is not the goal, and in 6-max it is not even defined

Verbatim from the Pluribus paper: a Nash equilibrium "guarantees the player will
**not win** in expectation." It profits only from opponent mistakes, never
maximally. And outside two-player zero-sum there is no guarantee at all — "even
if a Nash equilibrium could be computed efficiently in a game with more than two
players, it is not clear that playing such an equilibrium strategy would be
wise," because of the equilibrium-selection problem. Computing one is
[PPAD-complete](https://en.wikipedia.org/wiki/PPAD_(complexity)).

How much equilibrium play leaves on the table:
[Johanson & Bowling (NIPS'07)](https://webdocs.cs.ualberta.ca/~bowling/papers/07nips-rnash.pdf)
found an equilibrium bot beat an opponent exploitable for **>2000 mb/h** by only
**93 mb/h** — roughly **20x the available EV forfeited**. Exploitation is where
the money is.

## But exploitation is sample-starved, and that is the whole problem

Also verbatim from Pluribus: exploitation "requires too many samples to be
competitive with human ability outside of small games," so Pluribus "plays a
fixed strategy that does not adapt."

How many hands each HUD statistic needs before it is meaningful (95% CI, ±5%):

| Statistic | Opportunities needed | **Hands needed** |
|---|---|---|
| VPIP | 288 | ~290 |
| 3-bet % | 100 | ~400 |
| WTSD | 288 | ~960 |
| Fold to c-bet | 384 | **~3,840** |

Note the inversion: 3-bet needs fewer *opportunities* than WTSD but four times
the *hands*, because the opportunity arises less often. Common poker folklore
("1,000 hands is plenty") understates fold-to-c-bet by roughly 10x.

And building on a thin sample is worse than not building at all:
[data-biased response](https://poker.cs.ualberta.ca/publications/AISTATS09.pdf)
work shows a restricted Nash response with <100k observations going **negative
(−120 mb/g)** — worse than simply playing the equilibrium. The same literature
shows the upside is real once the data is there:
[implicit modelling](https://poker.cs.ualberta.ca/publications/AAMAS13-modelling.pdf)
doubled EV against weak opponents (732 vs 369 mbb/h).

**Design consequence:** opponent modelling must start from a population prior
and blend toward the player-specific estimate as evidence accrues, with the size
of any deviation regularised. Not a hard gate that does nothing for 500 hands
and then lurches. See [ADR-005](../adrs/005-opponent-modelling.md).

## Variance, and why it will fight the product

σ ≈ 75–120 bb/100 in 6-max; 90 is the usual default. Hands needed before a 95%
CI excludes zero, at n = 100·(1.96σ/w)²:

| True win rate | Hands |
|---|---|
| 2 bb/100 | 778,000 |
| 3 bb/100 | 346,000 |
| 5 bb/100 | 124,000 |
| 10 bb/100 | 31,000 |

At 100k hands the CI is still **±5.6 bb/100**. This is why
[AIVAT](https://arxiv.org/abs/1612.06915) exists — it cuts σ by around 85%,
worth ~44x fewer hands, and the bench should use it or an equivalent
variance-reduction scheme rather than brute-forcing sample size.

For the product, the same numbers mean a player will routinely watch a working
AI lose. That has to be addressed in the interface, not hand-waved.
See [ADR-010](../adrs/010-communicating-variance.md).

## What runs in a browser

Measured directly (Node 24, 200k random 7-card hands, single-threaded; browser
V8 is comparable, Safari/mobile estimated 1.5–2x slower):

| Package | Speed | Size | License | Verdict |
|---|---|---|---|---|
| [phe](https://www.npmjs.com/package/phe) `evaluateCardCodes` | **6.4M evals/s** | **62 KB gz** | MIT | **Use this** |
| phe `evaluateCards` (strings) | 0.98M/s | 103 KB gz | MIT | String parsing dominates; use the int API |
| [poker-evaluator](https://www.npmjs.com/package/poker-evaluator) | 0.60M/s | **124 MiB** table | ISC | Disqualified — `fs.readFileSync` at module load |
| [pokersolver](https://www.npmjs.com/package/pokersolver) | 0.045M/s | 8 KB gz | MIT | ~140x slower than phe |

phe is a port of
[HenryRLee/PokerHandEvaluator](https://github.com/HenryRLee/PokerHandEvaluator),
not TwoPlusTwo; cross-checked against a TPT table on 20,000 random 7-card
matchups with 20,000/20,000 identical winners.

> **API trap:** `phe.cardCode('Ac')` returns `0` for *every* card. Only the
> plural `cardCodes([...])` is correct. This silently produced a 50.00% equity
> result during benchmarking before it was caught.

Monte Carlo equity on phe: **4.9M trials/s**. 10,000 trials takes **2 ms** at
±0.80% (95% CI). A full 169-hand preflop chart at 10k trials each takes 354 ms,
validated against published values (AA 85.0% vs 85.3% published). **Real-time
equity in the browser is a non-issue.**

## In-browser CFR: proven, and still not viable here

[wasm-postflop](https://github.com/b-inary/wasm-postflop) (584★) is a genuine
working in-browser GTO solver. It is also:

- **AGPL-3.0** — network copyleft, disqualifying for many products
- **Development suspended since October 2023**, per the author's own notice
- **660 MB (16-bit) to 1.25 GB (32-bit)** for a single flop solve
- **33–72 seconds** per solve
- Multithreading needs SharedArrayBuffer → COOP/COEP headers → impossible on
  GitHub Pages, though fine on Cloudflare Pages / Netlify / Vercel

**No JS/TS CFR library exists at all.** Rust options if ever needed:
[pokers](https://crates.io/crates/pokers) is wasm-clean (verified: no
`build.rs`, no fs in `src/`, checked-in tables, explicit `web` feature);
[rs-poker](https://crates.io/crates/rs-poker) is Apache-2.0 and active;
[rust_poker](https://crates.io/crates/rust_poker) breaks on wasm32 via a runtime
`File::open`.

Cleanly-licensed precomputed data:
[b-inary/poker-cfr](https://github.com/b-inary/poker-cfr) (BSD-2) ships a
heads-up preflop Nash dataset at ~12.6 MB. Preflop charts themselves gzip to
**under 100 KB**.

## Abstraction

Libratus used **no card abstraction** preflop or flop; turn 55M→2.5M buckets,
river 2.4B→1.25M, taking 10^161 decision points to ~10^12. Pluribus used 1–14
bet sizes. Best practice is
[potential-aware imperfect-recall](https://www.cs.cmu.edu/~sandholm/potential-aware_imperfect-recall.aaai14.pdf)
k-means with Earth Mover's Distance rather than L₂ — KcQc and 6c6d have nearly
identical hand strength but very different distributions, and L₂ cannot tell
them apart.

The reality check that matters most:
[Local Best Response](https://arxiv.org/abs/1612.07547) showed abstraction-only
bots are "remarkably poor Nash equilibrium approximations" — every ACPC entrant
tested lost more than 3,000 mbb/g, **worse than folding every hand**. It is
*search at play time*, not a bigger abstraction, that makes bots strong. That is
a direct warning against the plausible-sounding plan of "build a big abstraction
offline and just look things up."

## poker-darwin

[Source](https://github.com/ruvnet/metaharness/tree/main/crates/poker-darwin).
Rust crate, CFR/CFR+/Linear/Discounted-CFR, plus a "Darwin mode" that mutates
*solver hyperparameters* (regret variant, discount exponents) and selects on
measured exploitability. Wasm-safe by default. Optional `ruvector`, `neural`
(candle) and `rs_poker` feature flags.

Its games: Kuhn (12 infosets), Leduc (288), and an abstracted heads-up NLHE of
**1,116 infosets** — preflop and flop only, 6 hand-strength buckets, bet space
{fold, call, pot, all-in}. Reported exploitability 0.0155 → 0.0022 over
1k→25k iterations, **exact within that abstraction**, which the README is
commendably transparent about.

**No license is stated in the README.** It contains no opponent modelling of any
kind. See [ADR-007](../adrs/007-poker-darwin.md).

## The asymmetry with the sibling RPS project

Worth stating plainly, because the instinct is to reuse that architecture. In
rock-paper-scissors, opponent modelling converges in **dozens** of rounds — the
whole game is the read. In No-Limit Hold'em the same idea needs **hundreds to
thousands of hands per statistic**, and the authors of the strongest bot in the
world abandoned it as sample-starved.

A "learns to read you" poker opponent is indistinguishable from noise for the
first several hundred hands. Any design that does not confront that is telling
the user a story it cannot back.
