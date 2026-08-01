# ADR-011: ruvector for offline board clustering, not for opponent modelling

**Status:** Accepted — amends [ADR-006](006-no-vector-database.md)

## Context

[ADR-006](006-no-vector-database.md) rejected vector databases, including
ruvector, and it named two conditions under which the decision should be
reopened:

> **Revisit if:** the project gains a server and a shared cross-player corpus.

and, in its consequences:

> **Bad.** If the design later genuinely needs situation-similarity search — for
> instance clustering board textures, or finding the nearest historical spot
> across a large multi-player corpus — this will need revisiting.

Both have now moved. The project has hosting available (Cloudflare Pages or
Fly.io) rather than being strictly a static drop, and — more importantly — the
postflop work in [ADR-003](003-postflop-strategy-representation.md) needs
exactly the thing ADR-006 named: **board texture clustering**, and bucketing by
**Earth Mover's Distance over hand-strength distributions**.

So the question was reopened rather than inherited. It was reopened with the
verification ADR-006 demands, because that ADR ends with a standing rule:

> **Standing rule, regardless of engine.** If anything in this project ever
> loads a vector engine, prove it works with an insert-then-query harness before
> trusting it. Do not trust a backend label. The failure mode above reports
> success.

### What the harness found

`ruvector@0.2.40` was installed and probed directly rather than read about.

**It works, natively, in Node.** 200 vectors of dimension 16 inserted; querying
with an exact copy of vector #37 returned id 37 at distance 1.14e-8; querying
with #37 plus noise still returned 37. `getBackendInfo()` reported
`{type: "native", features: ["SIMD", "Multi-threading", "Rust-native"]}`, backed
by a real `.node` binary. Licence is MIT.

**The silent-stub failure mode ADR-006 describes is real and was reproduced.**
`dist/index.js` lines 80-94 install a stub whose `search()` returns `[]` and
whose `insert()` returns `'stub-id-' + Date.now()`, while setting
`implementationType = 'wasm'`. Forcing both backend requires to throw reproduced
it live: it warns on stderr and otherwise reports success while returning
nothing. It triggers on any platform outside the prebuilt set — Alpine/musl maps
to the gnu binary and fails to load — or whenever optional dependencies are
skipped. ADR-006's warning was accurate and is not a historical note.

**It cannot go in the browser bundle.** `ruvector`'s package.json has no
`browser`, `module` or `exports` field — only a CommonJS `main` with
`engines.node >= 20`. Its main import path pulls `fs`, `path`, `worker_threads`
and `child_process`, and `VectorIndex` itself calls `require('os').tmpdir()`.
A browser build exists as a separate package, `@ruvector/rvf-wasm`, which does
genuinely work — it returned the same neighbour set as the native backend — but
its API is raw C-ABI pointers (`rvf_alloc` / `rvf_store_ingest` /
`rvf_store_query`) with no JavaScript ergonomics.

## Decision

**ruvector is used offline, at build time, in Node, for clustering board
textures and hand-strength distributions. It is not shipped to the browser, and
it is not used for opponent modelling.**

Three parts, and the split is the whole point:

1. **Offline, where it earns its place.** Board texture is genuinely a
   continuous embedding problem — a flop is a point in a space of wetness,
   connectedness and high-card content, and "which flops play alike" is a real
   nearest-neighbour question. Likewise ADR-003 requires k-means under Earth
   Mover's Distance over hand-strength *distributions*, and EMD between
   one-dimensional histograms is exactly L1 distance between their cumulative
   distributions — so embedding each hand as its CDF turns the metric ADR-003
   demands into an ordinary vector-space distance. That is a legitimate index
   problem, not a dictionary wearing a costume.

2. **Opponent modelling stays counters.** ADR-006's central argument is
   untouched by any of the above and remains correct: the binding constraint is
   sample size, not retrieval. Fold-to-c-bet needs ~3,840 hands to stabilise,
   and no index turns 40 observations into 400. The features are conditional
   frequencies keyed by a handful of discrete facts, which is a dictionary. It
   also has to stay a dictionary for a product reason — every number in
   `src/model/opponent.ts` is shown to the player with its observation count,
   and "from 14 spots" is only sayable because the model literally counts spots.

3. **The output is a static asset, so the client stays pure.** Clustering runs
   in `scripts/`, writes JSON, and the browser reads the JSON. This keeps
   [ADR-004](004-no-in-browser-cfr.md)'s guarantee intact: the site is still
   static, still hosts anywhere, and gains no wasm payload, no pointer API and
   no stub-detection code at runtime.

**The standing rule is implemented, not just restated.** `scripts/probe-vector.ts`
is an insert-then-query harness that must pass before any generation script
will use the engine, and it fails loudly rather than falling through to a
degraded path. A backend label is never trusted. If the probe fails, generation
falls back to the deterministic classifier in `src/strategy/texture.ts` and says
so in the output.

## Consequences

**Good.** The clustering that ADR-003 asks for gets a real implementation
instead of a hand-written bucket table. The browser bundle is unchanged — no
dependency, no wasm, no `tmpdir` shim, no silent-stub failure mode in the hot
path, because none of it ships. The fallback classifier means a missing or bad
asset degrades to something tested rather than to a crash.

**Bad.** There are now two ways board texture can be computed — the clustering
asset and the fallback classifier — and they can disagree. That is a real
maintenance cost and it is mitigated by a test asserting the asset covers every
class the fallback can emit, so a drift shows up as a failure rather than as a
strategy that quietly plays two different games.

**Also bad, and worth stating plainly.** This is a build-time dependency on a
package whose shipped code contains a documented path that reports success while
returning nothing. That is tolerable offline, where a human reads the output and
the probe gates it, and it would not be tolerable at runtime. The distinction is
the reason for the split, not a rationalisation of it.

**Leverage, stated honestly.** This decision is correct but small. The
clustering it enables runs over a few thousand flops against a few dozen
centroids, where a brute-force scan is already fast enough — the code says so
in `src/cluster/engine.ts` rather than implying the index is load-bearing. An
external review of the pro-level roadmap put it more bluntly: building a
card abstraction is *offline batch clustering*, a job for GPU k-means, and a
vector database is built for online approximate retrieval, persistence and
concurrent queries, none of which that job needs. Scaling the abstraction up
does not change that; it makes it more true.

So this ADR should not be read as "the project uses a vector database". It
uses one in the one place it fits, and that place is not on the critical path
to strength. See [the professional-level plan](../plan/04-beating-professionals.md).

**Revisit if:** the browser genuinely needs similarity search at play time — for
instance "show me past hands where I faced a spot like this against you", which
is a feature the reasoning panel could plausibly want. That would mean either
`@ruvector/rvf-wasm` plus a hand-written wrapper over its pointer API, or a
brute-force scan, which at the scale of one player's history is likely to be
faster than loading an index. Measure before assuming.
