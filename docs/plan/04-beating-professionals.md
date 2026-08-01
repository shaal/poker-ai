# What it would take to beat professionals

Written after measuring the current system honestly and finding it weak, and
after an external review. It is a plan, not a promise — and the first section is
the part that matters, because most of the obvious answers are wrong.

## Where it actually is

| Measurement | Result |
|---|---|
| vs `tightAggressive`, a 30-line script | **+1.24 ± 9.03 bb/100 — noise** |
| vs `sizingTell`, held out | **−15.61 ± 9.67 — a significant loss** |
| Opponent modelling vs a calling station | **−122.10 ± 14.74 — actively harmful** |

It cannot be shown to beat a crude script that never bluffs after the flop.
Everything below starts from that, not from the +400 bb/100 it posts against
calling stations, which measures nothing.

## The one thing that is non-negotiable

**Search at play time.** Not a bigger abstraction — search.

[Local Best Response](https://arxiv.org/abs/1612.07547) tested the entire class
of bot that this project currently sits below and found every entrant losing
**more than 3,000 mbb/g, worse than folding every hand**, despite having real
CFR-solved tables. A lookup strategy has fixed holes, and a fixed hole against a
thinking opponent is a permanent one.

So no amount of improving the heuristic, adding buckets, or tuning frequencies
gets there. That road is closed and the literature says so.

**Correction to an earlier instinct.** "Buy search first, blueprint later" is
slightly wrong. Search needs *ranges* to search with, and ranges come from a
blueprint. The correct unit of purchase is **search + a thin trunk + sane ranges
as one system**. A re-solver fed garbage ranges re-solves garbage precisely.

## The unlock: hosting exists now

[ADR-004](../adrs/004-no-in-browser-cfr.md) ruled out solving in the browser and
named its own revisit condition:

> **Revisit if:** the project acquires a server. Then a solve service becomes
> possible and the ceiling moves.

That condition is now met. This is the single biggest change in the project's
circumstances since it started, and it is what makes any of this worth writing
down.

Worth keeping in proportion: **Pluribus cost about 12,400 core-hours, roughly
$144 of compute.** The barrier has never been money. It is knowing what to
compute.

## The honest ceiling, in numbers

Assume all of the below is built competently: server-side subgame re-solving,
a reasonable blueprint feeding it ranges, the sizing bug fixed, LBR in the ship
gate, exploitation off. Solo, months not years, low hundreds of dollars of
compute. **Not** a research effort.

Against a **strong professional heads-up specialist** over 10,000–20,000 hands:

| | |
|---|---|
| Probability the point estimate is positive | **10–25%** |
| Probability a 95% interval excludes zero in our favour | **under 5%** |
| Expected win rate, planning number | **−15 bb/100, ± 10** |
| Pessimistic (shallow search, range bugs) | −25 to −50 bb/100 |
| Research-tier (not this budget) | −2 to +5 bb/100 |

For scale, σ in heads-up is around 80–100 bb/100, so over 20,000 hands the
standard error of the mean is only about 6–7 bb/100. A 10–25% chance of a
positive point estimate is mostly noise and a cold deck, not skill.

Where the line actually falls:

| Opponent | Expected | Verdict |
|---|---|---|
| Recreational, stations, maniacs | +10 to +40 bb/100 | comfortable |
| Weak regular, one-dimensional | +3 to +15 | usually ahead |
| Decent online regular | −5 to +5 | unresolved without a huge sample |
| Strong regular / small-stakes grinder | −5 to −20 | we are the underdog |
| Strong professional | −10 to −30 | **loses** |

**So: after everything, it should comfortably beat recreational players, usually
beat weak regulars, be indistinguishable from a decent regular without an
enormous sample, and still lose to professionals.** Treat a winning session
against a pro as lottery noise, not as a milestone.

The current +1.24 ± 9.03 against a 30-line script is not yet at the *floor* of
that table. The gap to "crushes recreational players" is real work.

## The thing this plan kept getting wrong

Every version of this roadmap described architecture **to implement**. Adoption
was never treated as a first-class option, and that is the single highest-cost
mistake in it.

CFR+ is not the bottleneck — this repository already has a correct one. The
bottleneck is getting a correct, fast enough heads-up subgame solver into
production part-time without re-deriving 2017–2019 from scratch. Standing on an
existing engine is the highest return per hour available, and it never appeared
as a requirement.

Concretely, and already identified in [ADR-004](../adrs/004-no-in-browser-cfr.md)
before any code existed:

- **[b-inary/poker-cfr](https://github.com/b-inary/poker-cfr)** — BSD-2, ships a
  heads-up preflop Nash dataset at ~12.6 MB. That replaces the hand-authored
  charts in `src/strategy/charts.ts` with solved ones, immediately, for the cost
  of a download and a parser.
- **[pokers](https://crates.io/crates/pokers)** — wasm-clean, verified: no
  `build.rs`, no filesystem access in `src/`, tables checked in.
- **[rs-poker](https://crates.io/crates/rs-poker)** — Apache-2.0, actively
  maintained.
- **wasm-postflop** is AGPL. Written when that was disqualifying; since
  [ADR-014](../adrs/014-solver-licence.md) the project is itself AGPL-3.0, so
  the licence is no longer the obstacle — [ADR-004](../adrs/004-no-in-browser-cfr.md)'s
  memory and latency figures still are. It remains the best available reference
  for how a browser-scale postflop solver is structured.

Commercial solvers are also usable as an **offline oracle for tests** — checking
our output against theirs on fixed spots — which is a different thing from
shipping their strategy or claiming GTO.

## Ordered by return per unit of effort

**1. Kill the `s/(1+s)` bluff-composition model in the villain's range.**
Nearly free, and it is a structural error rather than a mis-set constant. The
tracker infers *more* bluffs from a *bigger* bet, because that is what a
balanced opponent would do. Almost nobody is balanced, and an opponent who bets
big only when strong inverts it completely — which is exactly the `sizingTell`
loss. **Process constraint:** [ADR-009](../adrs/009-held-out-benchmark-discipline.md)
forbids developing this against the held-out opponent that exposed it. It needs
a separately-authored familiar opponent that exercises sizing-as-information,
the fix built against that, constants frozen, and *then* one look at held-out.

**2. A river-only subgame re-solver, wired to the real table.** Start here, not
with the full tree. The river is a one-street game with no future streets to
model, so it is small enough to solve exactly and it proves the entire
architecture — range plumbing, server round trip, latency budget — against the
part of the game where mistakes cost the most.

This doubles as a diagnostic with a sharp reading. **If a working river
re-solver still cannot beat `tightAggressive` with a tight interval, the problem
is the ranges being fed into it, not a lack of search.** That is a far more
useful failure than a vague sense that more solving is needed.

Then turn, then flop, each with depth limits. Do not begin with a four-street
offline blueprint.

**3. A thin trunk / blueprint — only when leaf and range quality is the
bottleneck.** Not to play from; to supply the ranges and continuation values the
re-solver needs. It can be much coarser than instinct suggests, because it is
scaffolding rather than the strategy. Adopt rather than derive it (see above).

**4. Add a best-response probe to the ship gate.** Right now the gate is scripted
archetypes, and those are structurally blind to the failure that matters: an
LBR-style probe attacks the strategy on real cards and would have flagged the
sizing inversion without spending a held-out opponent to find it. This belongs
next to the held-out suite, not instead of it.

**5. Continual re-solving with a learned value function.** DeepStack's approach,
and the ceiling. Also a research project, not a feature — its turn network cost
~175 core-years. Last, if ever.

## The three specific questions

### poker-darwin — engine yes-ish, evolution no

Its licence objection is withdrawn ([ADR-007](../adrs/007-poker-darwin.md) has
been amended: `metaharness` is MIT). But adopting it is low leverage, for a
blunt reason: **CFR+ is the easy part, and this repository already has a correct
one** — `src/solver/` reaches Kuhn's −1/18 to 6e−9 and Leduc to 1.7e−3 at 288
infosets, independently matching poker-darwin's own infoset count.

Replacing the abstraction is 90% of the work either way, and its abstraction has
to go regardless: 1,116 infosets, two streets, six buckets, at **20bb** where
this project is fixed at 100bb.

**Darwin mode specifically is the wrong surface.** Mutating regret variants and
discount exponents optimises the *solver* while the dominant error term is
abstraction coarseness and model error. Exploitability inside a toy abstraction
can go to zero while real play stays bad — which is precisely the trap LBR
documented. The same compute buys more re-solving iterations, and that is worth
more.

**Verdict:** steal its tests and ideas, do not marry the crate.

### ruvector — not on this path

[ADR-011](../adrs/011-ruvector-for-offline-clustering.md) put it at build time
for clustering, and that stands, but its leverage should be stated honestly:
**it is not doing much.** ADR-011 already admits brute force is fine at the
scale involved.

For a Libratus-scale abstraction it earns even less. That job is *offline batch
clustering* — generate hand-strength histograms, take CDFs so that EMD becomes
an ordinary metric, run k-means on a GPU, write centroids to a static file. A
vector database is built for **online approximate retrieval, persistence and
concurrent queries**, none of which is what building an abstraction needs.

**Where it would genuinely earn its place** is as a *product* feature, not a
strategy one: "here are the past hands where I faced a spot like this against
you," which is real similarity search over a real corpus. That needs the server
and the cross-player corpus — which is also ADR-006's own stated revisit
condition. It is a good feature. It is not a path to beating professionals.

### Learning as it goes — the wrong objective against strong players

This project has already measured it: **−122.10 ± 14.74 bb/100** against a
calling station, reproducing the published −120 mb/g restricted-Nash-response
result almost exactly.

Against a professional it is worse than useless, for a reason that is not about
implementation quality. Pros have small leaks and need enormous samples to
measure; meanwhile any real-time best response *raises your own exploitability*,
and low exploitability is the only thing keeping you alive against a strong
opponent. Pluribus playing a fixed strategy is not timidity, it is the
EV-optimal choice when the opponent is strong and the sample is short.

Forms that can pay, all narrow: population priors over *classes* of strong
player rather than a Bayesian update on 200 hands; deviation only on
catastrophic leaks with thousands of observations behind them; and always with
the hard KL/total-variation cap already implemented. Keep the modelling for the
interface and for weak-opponent modes. It is not the road to pro level.

## The strategic answer: a floor, not a ceiling

Chasing professional-level strength is the wrong primary investment for this
project, and the reason is not modesty about the budget.

This project's differentiator was written down before any code existed and it is
not strength — it is that the opponent explains itself: what it believes about
you, how sure it is, and how much that changed the decision. Nothing else in the
category does that. Meanwhile "beats professionals" means competing with
research labs on their own metric, and the table above says the honest outcome
is −15 bb/100 anyway.

But there is a trap on the other side, and it is the sharpest point in this
document:

> **Explaining a weak policy is negative pedagogy.** A reasoning panel attached
> to a bot that cannot beat a 30-line script is the best possible interface for
> teaching bad lines. Checkability of a fish is a novelty, not a product.

So the strength work is not optional and it is not vanity. It exists to earn the
right to the teaching claim. The correct target is a **floor, not a ceiling**:

1. Strong enough to beat recreational players convincingly and hold its own
   against weak regulars — the top two rows of the table above.
2. **LBR-gated**, so that claim is falsifiable rather than asserted.
3. Every remaining hour spent on explanation and teaching.
4. No claim of pro-competitive, GTO, or solved. Not now, not after.

That is focus, not retreat — but only if the strength floor is actually reached.
Before it is, the same plan *is* a retreat.

## What to build for the product, once the floor is met

The explanation layer is where this project can be genuinely first, and it is
barely started. What exists is the panel. What it could be:

- **Counterfactuals.** "What would change this line?" — the hand, board card or
  bet size that flips the decision. This is the single most instructive thing a
  poker interface can show and essentially nobody does it.
- **The post-hand range story.** Replay the hand showing the opponent's range
  narrowing action by action, so the player *sees* what their own line
  advertised.
- **A leak report about the player, not the AI.** The model already counts
  everything needed, with sample sizes. Inverting it — "here is what you do too
  often, and here is how sure I am" — turns the opponent model from a mildly
  negative-EV strategy component into the most valuable feature in the product.
  It is also the honest use of a statistic too thin to bet on but plenty good
  enough to *mention*.
- **Sealed predictions, extended.** The seal/reveal mechanic already exists.
  Committing a read before the river and opening it afterwards is what makes the
  explanation credible rather than post-hoc.

## What this means for the project as it stands

The current heuristic postflop should be **frozen as a fallback**, not improved
further. Effort spent making it a better heuristic is effort spent on the road
LBR closed.

And none of this changes what the project already claims. The README does not
promise to beat professionals, [ADR-002](../adrs/002-success-is-bb-per-100-not-always-winning.md)
explicitly declines to, and [ADR-004](../adrs/004-no-in-browser-cfr.md) names
the ceiling as "the main reason ADR-002 does not promise domination over strong
humans." That was written before any code existed and it has held up.
