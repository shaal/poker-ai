# ADR-012: The solver is a Rust service; TypeScript stays for everything else

**Status:** Accepted — amends [ADR-004](004-no-in-browser-cfr.md)

## Context

[ADR-004](004-no-in-browser-cfr.md) ruled out solving in the browser and named
its own revisit condition:

> **Revisit if:** the project acquires a server. Then a solve service becomes
> possible and the ceiling moves.

That condition is now met — hosting is available. And the reason it matters is
not convenience, it is that the v1 strategy has been measured and found weak:
it cannot be shown to beat a 30-line script (+1.24 ± 9.03 bb/100 against
`tightAggressive`). See [docs/results.md](../results.md).

The gap is not fixable by improving the heuristic.
[Local Best Response](https://arxiv.org/abs/1612.07547) demolished the entire
class of bot that has real solved tables and no play-time search — every entrant
lost more than 3,000 mbb/g, **worse than folding every hand**. The current
system sits below that class. It is *search at play time*, not a bigger
abstraction, that produces strength.

Two facts then decide the language.

**JavaScript is the wrong tool for a regret loop.** The tight update over
millions of infosets runs roughly **10–50x slower** than SIMD Rust or C++.
Multithreading means `SharedArrayBuffer` and `worker_threads`, which is fragile,
and there is no practical GPU path.

**The frontend is not the problem.** The Nuxt/Vue interface, the seal/reveal
mechanic and the reasoning panel are the part of this project that is actually
distinctive. Rewriting them would buy nothing.

## Decision

**The solver becomes a Rust service. The interface stays Nuxt/Vue. The
TypeScript CFR+ is retained permanently as a test oracle, not as a player.**

```
[Nuxt / Vue]  table, reasoning panel, seal/reveal
     |  WebSocket
[API layer]   sessions, profiles, hand histories
     |
[Rust solver service]
     |-- hand evaluation, range representation (1326 combos)
     |-- subgame builder over REAL public cards
     |-- CFR+ / linear CFR / external-sampling MCCFR
     |-- river: exact vector CFR over ranges
     |-- turn / flop: depth-limited re-solve + leaf values
     +-- optional ONNX value net
```

Three specifics that are easy to get wrong:

1. **Build the river first.** One street, no future to model, small enough to
   solve exactly. It proves the whole architecture — range plumbing, the round
   trip, the latency budget — on the street where errors cost most. Then turn,
   then flop, each depth-limited.

2. **It doubles as a diagnostic, and the reading is sharp.** If a working river
   re-solver still cannot beat `tightAggressive` with a tight interval, **the
   problem is the ranges being fed in, not a lack of search.** That is a far
   more useful failure than a vague sense that more solving is needed.

3. **GPU is for clustering and network training, not for CFR.** Tree traversal
   is irregular and branchy, which is the worst case for a GPU. Run the solver
   on multi-core CPU; rent spot GPU by the hour for training only.

The TypeScript solver in `src/solver/` is not deleted. It reproduces Kuhn's
closed-form −1/18 to 6e−9 and Leduc to 1.7e−3 at 288 infosets, and a fast
oracle on games with known answers is worth keeping forever. It is a correctness
instrument. It was never the player.

## Consequences

**Good.** Search becomes possible at all, which is the only route past the LBR
result. The interface is untouched. The existing pure-TS core stays useful for
tests, the bench and the explanation layer.

**Bad.** The project stops being a static site, which was a real virtue — it
hosted anywhere, cost nothing and had no operational surface. It now has a
server to run, pay for and keep alive, and a network round trip inside every
decision. The latency budget becomes a design constraint that did not previously
exist.

**Also bad.** Two languages, two build systems, and a serialisation boundary
between them that is a new place for bugs to live. The range representation in
particular has to mean the same thing on both sides, and a mismatch there would
be exactly the "the solved game is not the played game" failure this project has
already been warned about once.

**Accepted risk.** The heuristic postflop policy should be **frozen as a
fallback**, not improved further. Effort spent making it a better heuristic is
effort spent on the road LBR closed. It stays as the offline/degraded path and
as the thing the interface falls back to when the service is unreachable.

**Revisit if:** the latency budget turns out unworkable, or if the river
re-solver is built and the diagnostic in point 2 says ranges are the problem —
in which case the next money goes into the blueprint, not into deeper search.
