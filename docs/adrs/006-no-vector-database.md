# ADR-006: No vector database (including ruvector)

**Status:** Accepted

## Context

The question was raised directly: should this project use
[ruvector](https://github.com/ruvnet/ruvector), a vector database, for opponent
modelling? A sibling project (`shaal/rps-ai`) had evaluated and rejected it, and
poker is a much larger problem, so the answer was not assumed to carry over.

The case *for* is real and worth stating. Poker has an enormous state space —
hole cards, board, position, stack depths, betting history — and a session
generates many decision points per hand. "Find past situations similar to this
one" sounds exactly like a nearest-neighbour problem, and unlike
rock-paper-scissors the state space is big enough that similarity search is not
obviously overkill.

Two things defeat it.

**The binding constraint is sample size, not retrieval.** Per
[ADR-005](005-opponent-modelling.md), fold-to-c-bet needs ~3,840 hands to
stabilise. Vector search makes it faster to *find* similar past situations; it
does nothing whatsoever to make 40 observations into 400. The bottleneck is
evidence, and no index fixes that. A faster way to query a sample too small to
act on is not progress.

**The features are counters, not embeddings.** What an opponent model actually
needs is a set of conditional frequencies — VPIP, 3-bet%, fold-to-c-bet by
street and position, aggression factor. These are counts indexed by a handful of
discrete keys. That is a dictionary. Reaching for approximate nearest-neighbour
search over a learned embedding space, to look up what is naturally a keyed
counter, adds a dependency, a bundle, and a failure mode in exchange for nothing.

There is also a specific hazard worth recording, verified against shipped files
rather than documentation. In `ruvector@0.2.40`, when the native and rvf
backends both fail to load, `dist/index.js` installs a stub whose `search()`
always returns `[]` and whose `insert()` returns a fake id — while setting
`implementationType = 'wasm'`. It reports success while being blind. The sibling
project hit exactly this and had to add a startup guard. An independent
confirmation exists in the wild: `shaal/VrumVector` ships
`scripts/ruvector-patches/sona-find-patterns.patch`, written because an upstream
function "always returned empty — clearly stub scaffolding."

## Decision

**No vector database. Opponent statistics are plain counters in ordinary
storage.**

One claim is explicitly *not* being made here: that ruvector cannot run in a
browser. It can. The npm package cannot — it is CommonJS, requires Node, and
uses `fs`/`os`/`worker_threads` on its main import path — but ruvector's Rust
core compiled with `wasm-pack --target web` runs client-side perfectly well, and
`shaal/VrumVector` does exactly that on static Cloudflare Pages with verified
real ANN behaviour. The objection here is fitness for purpose, not capability.

## Consequences

**Good.** No dependency, no bundle cost, no silent-stub failure mode. The
opponent model stays inspectable — every number in it is a count of things that
happened, which is exactly what the interface needs to show the player.

**Bad.** If the design later genuinely needs situation-similarity search — for
instance clustering board textures, or finding the nearest historical spot
across a large multi-player corpus — this will need revisiting.

**Revisit if:** the project gains a server and a shared cross-player corpus.
At roughly a million stored situations, brute-force scanning stops being free
and approximate search starts earning its keep. That is a different product.

**Standing rule, regardless of engine.** If anything in this project ever loads
a vector engine, prove it works with an insert-then-query harness before
trusting it. Do not trust a backend label. The failure mode above reports
success.
