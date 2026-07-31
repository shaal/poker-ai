# ADR-004: No in-browser CFR; all solving happens offline

**Status:** Accepted

## Context

Counterfactual regret minimisation is what makes strong poker bots strong. The
question was whether any of it could run client-side, since the project is a
static site with no server.

It is not a hypothetical. [wasm-postflop](https://github.com/b-inary/wasm-postflop)
(584★) is a genuine, working, in-browser GTO solver. So the answer is not "it is
impossible" — it is a set of concrete costs:

- **AGPL-3.0.** Network copyleft. Disqualifying for anything that might later
  want a different licence.
- **Development suspended since October 2023**, per the author's own notice.
- **660 MB (16-bit) to 1.25 GB (32-bit) of memory** for a single flop solve.
  wasm32 hard-caps at 4 GB regardless.
- **33–72 seconds per solve.** Per flop. Not per hand.
- Multithreading requires `SharedArrayBuffer`, which requires COOP/COEP headers.
  Fine on Cloudflare Pages, impossible on GitHub Pages.

Also relevant: **no JS or TypeScript CFR library exists at all.** Building one
is a research project, not a feature.

A 60-second pause and a gigabyte of RAM per decision is not a poker game.

## Decision

**No CFR runs in the browser. Strategy is solved offline at build time and
shipped as static tables** — see [ADR-003](003-postflop-strategy-representation.md).

The client does three things, all of them cheap: look up a policy, evaluate
hands, and run Monte Carlo equity for display. All are microseconds to
milliseconds.

If offline solving is ever added to this repository, Rust is the route and the
crate choice is constrained: [pokers](https://crates.io/crates/pokers) is
wasm-clean (verified — no `build.rs`, no filesystem access in `src/`, tables
checked in, explicit `web` feature) and [rs-poker](https://crates.io/crates/rs-poker)
is Apache-2.0 and actively maintained. [rust_poker](https://crates.io/crates/rust_poker)
breaks on wasm32 via a runtime `File::open` and should not be reached for.

## Consequences

**Good.** The site stays static, loads fast, and hosts anywhere. No headers to
configure, no licence entanglement, no multi-second thinking pauses, and mobile
works.

**Bad.** The AI cannot re-solve a subgame it has never seen. That is precisely
the capability that separates Libratus and Pluribus from the abstraction-only
bots that lost to Local Best Response by more than 3,000 mbb/g. This ceiling is
real, it is acknowledged here rather than discovered later, and it is the main
reason [ADR-002](002-success-is-bb-per-100-not-always-winning.md) does not
promise domination over strong humans.

**Revisit if:** the project acquires a server. Then a solve service becomes
possible and the ceiling moves. That is a different product with different
hosting economics, and it should be an explicit decision rather than a drift.
