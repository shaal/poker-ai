# ADR-014: Which postflop solver we are allowed to stand on

**Status:** **Accepted, 2026-08-01 — the project is AGPL-3.0.** Decided by the
project owner. Unblocks [ADR-012](012-rust-solver-service.md).

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

## Decision

**Option 1. The whole project is licensed AGPL-3.0.** An AGPL postflop solver
may be adopted, linked against, and served over a network.

Concretely, and already done in the commit that accepted this:

- `LICENSE` at the repository root is the verbatim GNU AGPL-3.0 text, fetched
  from `gnu.org`.
- `package.json` declares `AGPL-3.0-or-later`. Our own code is "or later"
  because that is the FSF's recommendation and costs nothing; a combined work
  with an AGPL-3.0-only dependency such as TexasSolver is still distributed as
  AGPL-3.0, since "or later" is a superset the combination narrows back down.
- The Nuxt frontend and the pure TypeScript core are under the same licence as
  the solver service will be. **This is the point of deciding now:** the
  coupling question — does section 13 reach the frontend — stops existing when
  both sides carry the same licence. It was never going to be answered
  comfortably after the fact.

BSD-2 code such as [b-inary/poker-cfr](https://github.com/b-inary/poker-cfr) is
compatible inside an AGPL work; its copyright notice must be preserved verbatim
wherever its output or code is used.

**The "clean adopt" claim below about poker-cfr did not survive contact —
see [ADR-017](017-solved-preflop-charts-not-adopted.md).** Its dataset solves
preflop-only poker, in which the button limps AA and the big blind raises every
hand facing a limp. Its licence was never the problem. Its leaf evaluation is.

### Why not the other two

**Option 2, AGPL strictly offline,** was rejected as murkier rather than
cheaper. It buys back a relicensing option this project does not want, at the
price of an unsettled question — whether a model trained on an AGPL solver's
output is a derivative work — sitting permanently underneath the training
pipeline in [ADR-013](013-training-data-is-generated-not-collected.md). Trading
a clear obligation for an unclear one is a bad trade.

**Option 3, write the postflop solver,** was rejected on cost. It buys full
licence freedom for the months that [ADR-016](016-strength-floor-not-ceiling.md)
says should go into the explanation layer instead, and the outside advice
specifically said not to.

## Consequences

**Relicensing is permanently foreclosed.** Not by a rule that could be waived,
but mechanically: once AGPL-derived code and AGPL-derived training targets are
in, unwinding them means replacing them. Accepting this now is the whole point
of the decision — it is not a cost discovered later.

**Reuse narrows.** Plenty of companies will not touch AGPL code at all. Anyone
who wanted to lift a component out of this project and put it in a closed
product now cannot. For a personal open-source project whose stated goal is an
opponent that explains itself, that is an acceptable loss.

**A public deployment owes a source offer.** If the solver service is ever
hosted where other people can play against it, section 13 requires that those
users be offered the corresponding source of the version they are interacting
with. In practice that is a visible link to the repository at the point of
network interaction — a footer link in the UI, pinned to the deployed commit.
**This is outstanding work, and it becomes due the first time this is deployed
anywhere public, not when the solver lands.** It is cheap to do and easy to
forget.

**[ADR-004](004-no-in-browser-cfr.md)'s licence objection is now spent.** It
declined AGPL on the grounds of "anything that might later want a different
licence". A different licence is no longer wanted, so that objection no longer
applies — ADR-004 says so at its top now. Its *other* grounds, 660 MB–1.25 GB of
memory and 33–72 seconds per solve in a browser tab, are untouched and are still
why solving does not happen in the browser.

**Commercial solvers may still be used as an offline test oracle** — comparing
our output against theirs on fixed spots — which is a different act from
shipping their strategy or claiming GTO in the product. Any such comparison
stays in tests and is never a shipped asset.

**Revisit if:** the project ever needs to be relicensed — at which point this
ADR is not what has to change, the code is. Every AGPL-derived component would
have to be identified and replaced, which is exactly the bill this decision
signs for.
