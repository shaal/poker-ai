# ADR-017: The solved preflop dataset is not adopted, because it solves a different game

**Status:** Accepted, 2026-08-01. Amends the "clean adopt" claim in
[ADR-014](014-solver-licence.md) and removes the top item from the roadmap.

## Context

Three documents in this repository said the same thing, and it was the highest
item on the roadmap: adopt [b-inary/poker-cfr](https://github.com/b-inary/poker-cfr),
BSD-2, and replace the hand-authored charts in `src/strategy/charts.ts` with
solved ones. [ADR-014](014-solver-licence.md) called it "a clean adopt"
unaffected by the licence question.
[`docs/plan/04-beating-professionals.md`](../plan/04-beating-professionals.md)
priced it at "the cost of a download and a parser". The appeal is obvious: the
current charts are decimals someone wrote by eye, and the dataset is a solved
equilibrium.

It was probed before it was adopted — `npm run probe:preflop`, in the same
spirit as `probe:vector` and for the same reason. The dataset decodes exactly:
768 infosets, every byte of the file consumed, exploitability **3.318e−7 bb**.
It is a genuine, essentially exact equilibrium.

**Of a game we do not play.**

`src/main_preflop.rs` upstream describes it plainly — "pre-flop only heads-up
hold'em, i.e., every player checks after flop opens". `PreflopNode::evaluate`
scores every non-fold terminal as `cur_bet * (eq - (1 - eq))`: at any call, both
players are effectively all-in and the board runs out with no further betting.
There is no postflop, so there is no implied odds, no positional advantage, and
no reason to hold a hand that plays well after the flop.

## What that does to the strategy

All of these come out of `npm run probe:preflop` against
`output/preflop-100-670000.bin`, which is the 100bb file — our exact stack depth.

**The button's opening strategy, combo-weighted over all 1326 combos:**

| | fold | limp | raise |
|---|---|---|---|
| Solved | 24.6% | **34.3%** | 41.1% |
| Ours | 21.6% | n/a | 78.4% |

**The hand ordering is raw showdown equity, not playability:**

| Hand | Solved | Ours |
|---|---|---|
| **AA** | **limps 100%, never raises** | raises 100% |
| 22 | raises 100% | raises 100% |
| AJo | limps 100%, never raises | raises 100% |
| 76s | limps 100%, never raises | raises 100% |
| 54s | **folds 56%** | raises 100% |
| T2s | limps 100% | raises 100% |
| 32s | folds 100% | raises 100% |

`32s` folds every time while `T2s` never does, because ten-high beats three-high
at showdown and neither one will ever flop anything worth betting. Suited
connectors — the hands whose entire value is postflop — sit at the bottom.

**The node that gives it away most cleanly** is the big blind facing a limp:
`AA`, `22` and `76s` all raise 4x at **100%**. Every hand in the deck raises
except `72o`. That is not a poker strategy; it is what happens when there is no
postflop street in which a wide raising range can be punished.

**And the button's equilibrium EV is −0.0582 bb/hand** — essentially no edge.
In real heads-up the button's edge is large, and it comes from acting last on
three streets that this model deletes.

## Decision

**Do not adopt the dataset as preflop charts.** The hand-authored charts stay.

There are two independent reasons, and the second one alone is sufficient.

**1. It is the wrong game.** Installing an exact equilibrium of preflop-only
poker into an agent that then plays three streets of real postflop is not
"replacing guessed charts with solved ones". It is replacing charts guessed for
the right game with charts solved for the wrong one, which is worse than it
sounds, because the second kind carries the authority of a solver.

**2. It is not representable in our action space.** Our button node has one
raise size and no limp — `SB_OPEN` ships with an empty passive chart, so the
button raises to 2.5bb or folds. The solved strategy limps **34.3%** of all
combos and splits its raises across 3x/3.5x/4x, using our 2.5x **0.0%** of the
time. Collapsing five sizes into one and forcing limps into raise-or-fold
destroys precisely the equilibrium property that was the reason to adopt it.

That second point is also why this ADR ships no benchmark number, which
[ADR-009](009-held-out-benchmark-discipline.md) would otherwise require. A bench
run would have measured *a mapping we invented* from a 7-action tree onto a
2-action one — and a result either way would have been about the mapping, not
about the dataset. There is no faithful version of this change to measure.

## What poker-cfr is still worth

Withdrawing the adopt is not withdrawing the project. Two uses survive, and the
first is the one that matters.

**Its solver is right and only its leaf evaluation is wrong.** `game_preflop.rs`
is about 130 lines of BSD-2 Rust, and the entire mismatch above lives in one
function. When [ADR-012](012-rust-solver-service.md)'s postflop solver exists,
re-solving the preflop tree with postflop-aware leaf values is the honest
version of this adopt, and it is what [ADR-013](013-training-data-is-generated-not-collected.md)
already commits to — learn from solvers, and generate the targets rather than
collect them. **The dataset was never the valuable part. The tree is.**

**It is a third correctness check for our own CFR+.** Our solver is verified on
Kuhn (−1/18 to 6e−9) and Leduc (288 infosets, 1.7e−3). This is a 768-infoset
game that deals real cards from a real deck, with two published numbers to hit:
exploitability 3.3e−7 and EV(button) −0.0582 bb. That is a stronger instrument
than either toy game and it costs a game definition, not a research project.

## Consequences

**Preflop stays guessed, and that is a real weakness now written down rather
than assumed away.** The charts in `src/strategy/charts.ts` are decimals chosen
by eye. Nothing here says they are good — only that this particular replacement
cannot be shown to be an improvement, and cannot even be installed faithfully.

**The roadmap loses its cheapest item.** It was first on the list precisely
because it looked like a large gain for a day's work. What it actually was is a
day's work to find out it was not, which is the cheaper of the two ways to learn
that.

**`npm run probe:preflop` is kept** so the conclusion is reproducible rather
than asserted. Every number above comes out of it. It downloads the dataset into
gitignored `scratch/` and redistributes nothing; the upstream copyright notice
is in the script header.

**Revisit if:** a preflop solution with postflop-aware leaf values becomes
available — most likely our own, via ADR-012 — or if a permissively licensed
solution to *real* heads-up preflop appears. The thing to check first is always
the same one: what did it score the leaves with?
