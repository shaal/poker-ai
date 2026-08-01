# ADR-016: A strength floor, not a strength ceiling

**Status:** Accepted

## Context

The question was asked plainly: how do we beat professionals? It deserves the
measured answer rather than an encouraging one.

**After building everything currently planned** — a Rust solver service,
depth-limited re-solving, a value network for leaves, a real blueprint, the
sizing bug fixed, LBR gating — against a strong heads-up professional over
10,000–20,000 hands:

| | |
|---|---|
| Expected win rate | **−8 bb/100, ± 10** |
| Probability the point estimate is positive | 15–35% |
| Probability a 95% interval excludes zero in our favour | **3–8%** |

For context, σ in heads-up is around 80–100 bb/100, so at 20,000 hands the
standard error of the mean is 6–7 bb/100. A one-in-four chance of a positive
point estimate is mostly a cold deck, not skill.

Where the line falls:

| Opponent | Expected | |
|---|---|---|
| Recreational | +10 to +40 bb/100 | comfortable |
| Weak regular | +3 to +15 | usually clearly ahead |
| Decent online regular | −3 to +8 | noise at any sample we can gather |
| Strong regular | −5 to −20 | underdog |
| Strong professional | −8 to −30 | **loses** |

Lifting the language constraint is worth roughly 7 bb/100 against a pro
(−15 → −8). Real, and not a new weight class. Getting to even money against
elite specialists needs research-quality data generation and months of
LBR-driven iteration, which is at or past the edge of what a solo project with
low thousands of dollars buys.

Meanwhile this project's differentiator was written down in
[the interface plan](../plan/03-interface.md) before any code existed, and it is
not strength:

> The most interesting thing on screen is a mind reading you and being visibly
> uncertain about it.

Nothing else in the category does that. Chasing professional-level strength
means competing with research labs on their metric, arriving at −8 bb/100, and
having spent the months somewhere other than the only thing that is actually
differentiated.

## Decision

**Target a strength FLOOR, not a ceiling. The floor exists to earn the right to
the teaching claim.**

1. **Strong enough to beat recreational players convincingly and hold against
   weak regulars** — the top two rows of the table. That is the target. Not
   "competitive with professionals".
2. **LBR-gated**, per [ADR-015](015-best-response-probe-in-the-ship-gate.md), so
   the claim is falsifiable rather than asserted.
3. **Every remaining hour on explanation and teaching.**
4. **No claim of pro-competitive, GTO, or solved.** Not now, not after.

The trap on the other side is the sharpest point in this decision, and it is why
the strength work is not optional:

> **Explaining a weak policy is negative pedagogy.** A reasoning panel attached
> to a bot that cannot beat a 30-line script is the best possible interface for
> teaching bad lines. Checkability of a fish is a novelty, not a product.

So this is focus, not retreat — **but only once the floor is reached**. Before
that, the same plan *is* a retreat, and the honest way to tell the difference is
the benchmark.

### What the remaining effort buys

The explanation layer is where this project can be genuinely first, and it is
barely started. What exists is the panel. What it should become:

- **Counterfactuals.** "What would change this line?" — the hand, board card or
  bet size that flips the decision. The most instructive thing a poker interface
  can show, and essentially nobody does it.
- **The post-hand range story.** Replay the hand showing the opponent's range
  narrowing action by action, so the player sees what their own line advertised.
- **A leak report about the player, not the AI.** The opponent model already
  counts everything needed, with sample sizes attached. Inverting it — "here is
  what you do too often, and here is how sure I am" — turns a mildly
  negative-EV strategy component into the most valuable feature in the product.
  It is also the honest use of a statistic too thin to bet on and plenty good
  enough to mention.
- **Sealed predictions, extended.** The mechanic exists. Committing a read
  before the river and opening it afterwards is what makes the explanation
  credible rather than post-hoc.

## Consequences

**Good.** The project aims at something it can actually reach and can prove it
reached. It keeps the differentiator. And the honesty is itself the product —
[ADR-002](002-success-is-bb-per-100-not-always-winning.md) already established
that a checkable claim beats an impressive one.

**Bad.** "Beats recreational players and explains itself" is a worse headline
than "beats professionals". That cost was already accepted once in ADR-002 and
is accepted again here.

**Also bad.** A floor is easier to rationalise downward than a ceiling is to
rationalise upward. The defence is that the floor is a *measured* quantity with
a benchmark and a probe attached, not a feeling — if it is not clearing the top
two rows of the table, it has not reached the floor, whatever the interface
looks like.

**Revisit if:** the re-solver lands and measures far better than −8 bb/100
against strong opposition, which would mean the calibration was wrong and the
ceiling is higher than believed. Measure before believing that.
