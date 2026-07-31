# ADR-007: poker-darwin is not in the critical path

**Status:** Accepted

## Context

[poker-darwin](https://github.com/ruvnet/metaharness/tree/main/crates/poker-darwin)
was proposed as a possible foundation. It is a Rust crate implementing
CFR/CFR+/Linear/Discounted CFR, plus a "Darwin mode" that mutates *solver
hyperparameters* — regret variant, discount exponents — and selects on measured
exploitability. It is wasm-safe by default and has optional `ruvector`, `neural`
(candle) and `rs_poker` feature flags.

It is a legitimate and rather elegant piece of work. Its README is notably
honest about its own limits, which counts for a lot. But three facts decide it.

**Its NLHE is very small.** The three games are Kuhn poker (12 infosets), Leduc
(288), and an abstracted heads-up NLHE of **1,116 infosets** — preflop and flop
only, six hand-strength buckets, bet space {fold, call, pot, all-in}. Real
heads-up NLHE is on the order of 10^160 before abstraction; Libratus reduced to
about 10^12 and used *no* card abstraction preflop or flop. The reported
exploitability figures (0.0155 → 0.0022 over 1k→25k iterations) are exact
**within that abstraction**, which the README says plainly. Two streets and six
buckets is not a strategy for a game with four streets.

**It contains no opponent modelling.** It computes equilibria. Equilibrium play
is precisely the thing that does *not* exploit — it "guarantees the player will
not win in expectation." The brief's central ask is the one thing this crate
does not attempt.

**No licence is stated in the README.** Unlicensed code is not shippable in a
public project, and that alone is disqualifying until clarified.

The evolutionary wrapper deserves a separate note, because it is the most
interesting part and the easiest to over-value. Mutating CFR hyperparameters and
selecting on exploitability is a sound idea, but it optimises the *solver*, not
the strategy's real-world strength. Given that the dominant error term here is
abstraction coarseness — see the Local Best Response result in
[the research notes](../plan/01-research.md) — better-tuned discount exponents
are polishing the wrong surface.

## Decision

**poker-darwin is not used in the critical path.** The offline solving work in
[ADR-003](003-postflop-strategy-representation.md) proceeds independently.

It stays a live option for one narrow purpose: as a *reference implementation*
to check correctness against. Kuhn poker has a known closed-form game value
(−1/18), and a solver that reproduces it is a useful sanity check on any CFR
code written here. That is a genuine use and costs nothing.

## Consequences

**Good.** No unlicensed dependency, no dependency on a 1,116-infoset abstraction
that would need to be replaced before the project was any good, and no
transitive pull toward the `ruvector` feature flag that
[ADR-006](006-no-vector-database.md) declines separately.

**Bad.** Writing CFR from scratch, if it comes to that, is more work than
adopting something. The mitigation is that offline solving is not on the v1
critical path at all — [ADR-003](003-postflop-strategy-representation.md) can be
satisfied by precomputed tables from any source, including published charts.

**Revisit if:** the licence is clarified *and* the abstraction grows to four
streets with a meaningfully larger bucket count. At that point it becomes a
credible offline table generator and this decision should be reopened rather
than inherited.
