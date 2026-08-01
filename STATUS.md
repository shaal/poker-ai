# Status

**Updated: 2026-08-01.** Current state and the next action. Standing guidance —
disciplines, traps, layout — lives in [CLAUDE.md](CLAUDE.md) and does not belong
here. This file is volatile; that one is not.

## Where it is

Built, playable, measured, and honest about being weak. All six original roadmap
phases are implemented. 95 tests green. Static bundle 177 KB gzipped.

The four numbers that matter, all from [docs/results.md](docs/results.md):

| | |
|---|---|
| vs `tightAggressive`, a 30-line script | **+1.24 ± 9.03 bb/100 — noise** |
| vs `sizingTell`, held out | **−15.61 ± 9.67 — a significant loss** |
| Opponent modelling vs a calling station | **−122.10 ± 14.74 — actively harmful, ships off** |
| CFR+ on Kuhn | −0.055555550 vs the closed form −1/18 — correct |

By [ADR-009](docs/adrs/009-held-out-benchmark-discipline.md) it **does not ship
as finished**: it loses to a held-out opponent. That is recorded, not worked
around.

## Nothing is blocked any more

**[ADR-014](docs/adrs/014-solver-licence.md) was accepted on 2026-08-01: the
project is AGPL-3.0-or-later.** `LICENSE` is at the root and `package.json`
declares it. An AGPL postflop solver — TexasSolver is the obvious one — may now
be adopted, linked against, and served over a network, which is what
[ADR-012](docs/adrs/012-rust-solver-service.md) was waiting on.

What was bought and what it cost, so nobody re-opens it by accident:

- **Bought:** the solver is adopted rather than written, saving the months
  [ADR-016](docs/adrs/016-strength-floor-not-ceiling.md) wants spent on the
  explanation layer. And because the frontend carries the same licence as the
  service, the "does section 13 reach the frontend" coupling question does not
  arise at all.
- **Cost:** relicensing is permanently foreclosed, and reuse narrows — nobody
  can lift a component of this into a closed product.
- **Outstanding, and easy to forget:** a public deployment owes its players a
  source offer. A footer link to the repository pinned to the deployed commit,
  due the first time this is hosted anywhere public — *not* when the solver
  lands.

## Closed since the last session

**Adopting b-inary/poker-cfr for preflop was the top roadmap item. It is now
closed, negative** — [ADR-017](docs/adrs/017-solved-preflop-charts-not-adopted.md),
2026-08-01. The dataset decodes exactly and is a genuine equilibrium (3.3e−7 bb)
of *preflop-only* hold'em, in which every call runs the board out with no
betting. So the button limps AA 100%, raises 22 100%, folds 32s but never folds
T2s, and the big blind raises every hand in the deck facing a limp. It also
cannot be installed: 34.3% of the solved strategy is limps, and our button node
has no limp action and one raise size the solution never uses.
`npm run probe:preflop` reproduces all of it. Preflop stays hand-authored, which
is a real weakness and is now written down rather than assumed away.

## Next actions, in order

**1. Kill the `s/(1+s)` villain bluff-composition model.**
The tracker infers *more* bluffs from a *bigger* bet, because that is what a
balanced opponent would do. Almost nobody is balanced, and an opponent who bets
big only when strong inverts it — which is the `sizingTell` loss.
**Process constraint, non-negotiable:** ADR-009 forbids developing this against
the held-out opponent that exposed it. Write a *new familiar* opponent that
exercises sizing-as-information, fix against that, freeze the constants, then
look at the held-out row **once**.
*Done when:* the new familiar opponent exists in a separate commit from the fix,
and the held-out suite has been measured once with constants frozen.

**2. A river-only re-solver in Rust.** Unblocked as of 2026-08-01.
One street, no future to model, small enough to solve exactly. Proves the whole
architecture — range plumbing, round trip, latency budget. It is also a
diagnostic with a sharp reading: **if a working river re-solver still cannot
beat `tightAggressive` with a tight interval, the problem is the ranges being
fed in, not the search.**

**3. The LBR probe in the ship gate** ([ADR-015](docs/adrs/015-best-response-probe-in-the-ship-gate.md)).
Calibrate it against a known-bad strategy: `alwaysFold` should lose horribly to
it. If it does not, the probe is too weak to mean anything.

Then turn, then flop, then the value network for leaves
([ADR-013](docs/adrs/013-training-data-is-generated-not-collected.md)).

## Standing constraints on all of the above

- **Do not improve the heuristic postflop policy.** It is frozen as a fallback.
  [ADR-012](docs/adrs/012-rust-solver-service.md) explains why that road is
  closed.
- **The target is a floor, not a ceiling**
  ([ADR-016](docs/adrs/016-strength-floor-not-ceiling.md)). Beat recreational
  players convincingly, prove it with LBR, then spend everything else on the
  explanation layer. Fully built this still measures around **−8 bb/100** against
  a strong professional, and the project does not claim otherwise.
- **Consult Grok on anything architectural** before committing weeks to it, and
  verify its specifics — it recommended TexasSolver without noting the AGPL.

## Environment notes

- `npm test` — 6s. `npm run bench` at 40k hands — ~18 min, run it in the
  background rather than blocking.
- Two long-running measurements produced the numbers above; the logs are gone
  but the results are in `docs/results.md` with the exact commands to reproduce.
- Opponent modelling defaults **off** in the UI. That is deliberate
  ([ADR-005](docs/adrs/005-opponent-modelling.md)) and follows from measurement,
  not caution.

## Keeping this file honest

Update it at the end of a session, not the start. Record what was measured, not
what was attempted — and if something came back negative, that is exactly the
thing worth writing down. Every claim here should be traceable to a run in
`docs/results.md` or to an ADR.
