# ADR-014: Which postflop solver we are allowed to stand on

**Status:** **Proposed — needs a human decision before ADR-012 work starts**

## Context

[ADR-012](012-rust-solver-service.md) commits to a real solver. The strongest
outside advice received was: do not write one, adopt one. That advice is
correct — CFR+ is the easy part, this repository already has a verified
implementation of it, and the expensive months go into everything around it.

Then the licences were checked, directly rather than assumed, and the picture is
narrower than the advice implied.

| Project | Licence | What it gives |
|---|---|---|
| [TexasSolver](https://github.com/bupticybee/TexasSolver) | **AGPL-3.0** | Mature C++ HUNL postflop solver, console/batch mode. The obvious thing to adopt |
| [wasm-postflop](https://github.com/b-inary/wasm-postflop) | **AGPL-3.0** | Already declined in [ADR-004](004-no-in-browser-cfr.md) |
| [b-inary/poker-cfr](https://github.com/b-inary/poker-cfr) | **BSD-2** | Rust CFR+. **Preflop and push/fold only** — no postflop |
| [pokers](https://crates.io/crates/pokers) | permissive | Game engine, wasm-clean. Not a solver |
| [rs-poker](https://crates.io/crates/rs-poker) | Apache-2.0 | Evaluation and utilities. Not a solver |
| [poker-darwin](https://github.com/ruvnet/metaharness) | MIT | 1,116 infosets, 2 streets, 20bb. See [ADR-007](007-poker-darwin.md) |

**There appears to be no permissively-licensed heads-up NLHE postflop solver
available to adopt.**

The AGPL question bites harder here than it did in ADR-004, and it is worth
being precise about why. ADR-004 declined AGPL for a browser bundle. ADR-012
proposes running a solver **as a network service**, which is exactly the case
AGPL's section 13 is written for: users interacting with it over a network must
be offered the source. Whether that reaches the Nuxt frontend depends on how the
two are coupled, and "it depends on the coupling" is not a position to discover
after building it.

## The decision required

This is a product decision with legal consequences and it belongs to a human,
not to an agent. Three roads:

**1. Accept AGPL-3.0 for the whole project.** Adopt TexasSolver, publish
everything under AGPL. Cheapest by a wide margin and entirely reasonable for a
personal open-source project — which this already is. It permanently forecloses
making the project closed-source or permissively licensed.
[ADR-004](004-no-in-browser-cfr.md) declined AGPL on the grounds of "anything
that might later want a different licence"; if that possibility is not wanted,
that objection does not apply.

**2. Use an AGPL solver strictly offline.** Generate training targets and use it
as a regression oracle, never shipping or serving it, keeping the shipped
service independently written. More defensible than serving it live and
genuinely murkier than option 1 — the question of whether a model trained on its
output is a derivative work does not have a settled answer, and this ADR should
not pretend otherwise.

**3. Write the postflop solver.** The expensive road, and the one the outside
advice specifically said to avoid. Buys full licence freedom and costs the
months that were supposed to go into the product.

## What is already decided regardless

**b-inary/poker-cfr is a clean adopt and should be taken now.** BSD-2, Rust, and
it covers exactly the preflop layer where this project currently ships
hand-authored charts in `src/strategy/charts.ts`. Replacing guessed charts with
solved ones is a real gain for very little work, and it is unaffected by
whichever road above is chosen.

**Commercial solvers may be used as an offline test oracle** — comparing our
output against theirs on fixed spots — which is a different act from shipping
their strategy or claiming GTO in the product. Any such comparison stays in
tests and is never a shipped asset.

## Consequences

**Whatever is chosen, record it here and change this ADR's status.** A project
that has been this careful about a vector library reporting success while
returning nothing should not acquire a copyleft obligation by accident.

**Do not start ADR-012 implementation before this is settled.** The licence
determines whether the solver is adopted or written, and that is the difference
between weeks and months on the critical path. Discovering it afterwards is the
expensive order.
