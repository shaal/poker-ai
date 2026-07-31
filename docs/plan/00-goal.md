# Goal plan

A GOAP-style decomposition: goal state, current state, the gap, and the ordered
actions that close it. Written before any code, so the expensive decisions are
made against evidence rather than against whatever is easiest to build first.

## The goal, restated honestly

The original brief was: *"the AI should dominate because it learns all the
players' patterns and always wins."*

**"Always wins" is not achievable and no architecture delivers it.** This is not
pessimism about the approach, it is arithmetic about the game. Poker's outcome
per hand is dominated by variance: the standard deviation of results in 6-max
No-Limit Hold'em is roughly **90 bb/100 hands**. A player with a genuinely
strong 5 bb/100 win rate needs about **124,000 hands** before a 95% confidence
interval excludes zero. At 2 bb/100 it is **778,000 hands**. Over any session a
human will actually sit through, a superhuman bot will lose pots, lose stacks
and lose sessions — and will look, to the player, like it is not working.

Worse for the brief specifically: the strongest published multiplayer bot,
Pluribus, **deliberately does not adapt to opponents**. Its authors state that
exploitation "requires too many samples to be competitive with human ability
outside of small games," so it plays a fixed strategy. The thing the brief asks
for is the thing the state of the art gave up on, and said why.

So the goal is reframed, keeping the ambition and changing the metric:

> **Goal state:** a browser-based heads-up No-Limit Hold'em opponent that plays
> a strong baseline strategy, measurably improves against a given player as it
> gathers evidence about them, and makes both of those things visible on screen.
> Success is a positive win rate in bb/100 with a stated confidence interval
> against a suite of scripted opponents — not a win/loss record against a human
> over one sitting.

Concrete success criteria:

1. Beats every scripted leak-opponent in the bench suite at a **positive
   bb/100 whose 95% CI excludes zero**.
2. Beats its *own non-adaptive baseline* when opponent modelling is enabled —
   this is the specific claim "it learns you," and it must be measured, not
   asserted.
3. Loads and plays on a static host with **no server**, and the bundle stays
   small enough to open fast on a phone.
4. Every action the AI takes can be explained on screen: what it believed, why
   it chose the line, and how much of that was baseline versus a read on you.
5. Communicates variance honestly, so a losing session does not read as a
   broken AI.

## Current state

Nothing exists but this repository. What exists *outside* it, and is therefore
an asset:

- Verified research on poker AI, browser feasibility, and sample-size limits —
  see [`01-research.md`](01-research.md).
- A sibling project (`shaal/rps-ai`) that established the house style: static
  export, a pure-function prediction core behind a storage seam, a benchmark
  that gates changes on measured skill, and a UI whose whole point is that the
  AI shows its working.
- One hard-won process lesson from that project, recorded in
  [ADR-009](../adrs/009-held-out-benchmark-discipline.md): a benchmark you tune
  against cannot also be the benchmark that decides whether to ship.

## The gap

| # | Gap | Severity |
|---|---|---|
| G1 | No decision on format. HU cash / 6-max / SNG are different games with different infoset counts, different opponent-model features and different variance. Everything downstream depends on it. | Blocking |
| G2 | **No postflop strategy representation.** This is the one that quietly kills the project. | Blocking |
| G3 | No evaluation harness, so no way to tell whether any of it works | Blocking |
| G4 | No hand evaluation / equity primitives | Low — solved, off the shelf |
| G5 | No opponent model, and the naive version is worse than useless (see below) | High |
| G6 | No UI | High, but conventional |
| G7 | Variance will make a working AI look broken | High, product-critical |

**On G2, because it is the one that is easy to miss.** The tempting v1 is: Monte
Carlo equity, compare to pot odds, act. That is not a poker strategy. It
over-calls (equity realised is not equity share), never bluffs at a sensible
frequency, cannot value-bet thin, cannot fold strong-but-dominated hands, and
responds only to "how often do they fold" rather than to the line taken. An
opponent model can only ever *deviate from a baseline* — if the baseline is a
pot-odds calculator, there is nothing worth deviating from, and the finished
product is a HUD with a felt background.

**On G5.** A naive best-response to a thin sample is actively negative. In the
literature, a restricted Nash response built on fewer than 100k observations
scored **−120 mb/g — worse than just playing the equilibrium**. Exploitation is
where the money is (an equilibrium bot captured only 93 mb/h against an opponent
exploitable for over 2000 mb/h, leaving ~20x on the table), but only once the
evidence supports it.

## Actions

Preconditions, effects and rough cost. Cost is relative effort, not hours.

| # | Action | Precondition | Effect | Cost |
|---|---|---|---|---|
| A1 | Fix the format: heads-up, 100bb cash | — | G1 closed; infoset scope known | 1 |
| A2 | Stand up hand evaluation + equity in a worker | A1 | G4 closed; equity available for both AI and UI | 2 |
| A3 | Build the bench: scripted leak-opponents, bb/100 with CIs | A1 | G3 closed; **nothing after this ships unmeasured** | 3 |
| A4 | Decide + implement postflop policy representation | A1, A3 | G2 closed; a real baseline exists | 8 |
| A5 | Generate baseline tables offline, ship as static assets | A4 | Baseline playable client-side | 5 |
| A6 | Opponent model: population priors, soft blending, regularised deviations | A3, A5 | G5 closed; "it learns you" becomes true and measurable | 5 |
| A7 | Game loop + table UI | A2, A5 | Playable | 5 |
| A8 | The reasoning panel — what it believes, why it acted | A6, A7 | G6 closed; the product's actual differentiator | 4 |
| A9 | Variance communication: all-in EV, luck-adjusted results | A7 | G7 closed | 2 |

## Ordering

```
A1 ─┬─ A2 ──────────────┐
    ├─ A3 ─┬─ A4 ─ A5 ─┬┴─ A7 ─┬─ A8
    │      │           │       └─ A9
    │      └───────────┴─ A6 ──┘
```

**A3 before A4 is the load-bearing edge.** The bench must exist before the
strategy it judges, or the strategy defines the bench and the measurement is
worthless. This is the mistake the sibling project made and had to revert;
see [ADR-009](../adrs/009-held-out-benchmark-discipline.md).

A2 is deliberately early and cheap: it unblocks the UI's equity display long
before the AI is any good, so there is something to look at while A4 is being
solved.

## Risk factors that would force a replan

- **A4 comes back too big.** If the postflop policy tables do not compress to a
  size that is sane to ship, the fallback is an explicit, tested heuristic
  policy — labelled as such — plus a hard commitment that the bench, not
  vibes, says whether it is any good.
- **A6 measures as neutral or negative.** Entirely possible: this is what the
  sample-size numbers predict for short sessions. Then opponent modelling ships
  *off by default* and stays a visible, honest experiment rather than a claim.
- **A5's assets are too heavy for a phone.** Fall back to preflop-only tables
  shipped eagerly with postflop fetched on demand.

## Fallback

If A4 cannot be solved to a standard that beats the bench, the honest product is
a *transparent* poker opponent rather than a dominating one: strong preflop,
competent postflop heuristics, and a genuinely excellent explanation layer. That
is still worth building and still interesting — it is simply a different promise,
and the docs would say so rather than overselling.

## Explicitly out of scope for v1

Multiway pots and 6-max (the equilibrium-selection problem means "GTO" is not
even well-defined there), in-browser CFR solving, real-money anything, and
multiplayer. See the ADRs for why each was excluded rather than forgotten.
