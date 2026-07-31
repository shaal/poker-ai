# ADR-010: Variance is a first-class interface concern

**Status:** Accepted

## Context

This is a product decision that comes directly out of the arithmetic in
[ADR-002](002-success-is-bb-per-100-not-always-winning.md), and it is easy to
file as polish and then discover too late.

With σ ≈ 90 bb/100, a genuinely strong AI loses constantly at human timescales.
Over a 100-hand session — already a long sitting for a casual player — the
result is almost pure noise. A player who beats the AI for three sessions running
has learned nothing about the AI, but they will conclude something anyway, and
what they conclude is "this is not very good."

The sibling rock-paper-scissors project has no equivalent problem. There, the
prediction is right or wrong every single round and skill is visible almost
immediately. Poker hides skill behind a wall of noise, and a project whose entire
selling point is *the AI shows its working* cannot leave that wall unaddressed.
Losing a stack as an 85% favourite is the AI working correctly, and the interface
has to be able to say so without sounding defensive.

## Decision

**Results are presented luck-adjusted, alongside raw chips, at every level.**

1. **All-in EV.** When money goes in and cards run out, show both the actual
   result and the expected one. "You were 18% and got there" is information the
   player deserves, and it makes the AI's decision legible independently of the
   outcome.
2. **Confidence intervals on any win rate shown.** If the interface displays
   bb/100 at all, it displays the interval too. A number without one is a lie at
   these sample sizes.
3. **Explicit sample-size context.** When a player has played 80 hands, say what
   80 hands can and cannot tell them. Not buried in a help page.
4. **Separate "was the decision right" from "did it work."** The reasoning panel
   already explains why a line was taken; it must be readable *after a loss*
   without appearing to make excuses. Showing the reasoning before the river,
   sealed, is one way to make this credible rather than post-hoc.

## Consequences

**Good.** It makes the AI trustworthy in the only way that survives a losing
session, and it teaches — a player who internalises EV versus result has learned
the single most valuable thing poker has to teach. It also turns a liability
into the most distinctive screen in the product, which is the same move
[ADR-005](005-opponent-modelling.md) makes with sample size.

**Bad.** More interface surface, and a real risk of condescension. "Actually you
got lucky" is an obnoxious thing to say to someone who just won. Tone matters
here more than in any other part of the product, and it should probably be
understated by default with detail available on demand rather than pushed.

**Rejected alternative.** Quietly softening the AI's play after losing sessions —
dynamic difficulty — was considered and rejected. It would make results
*feel* better while making every claim in this repository false. The sibling
project has explicit score-steering modes, which are a fine feature precisely
because they are labelled; a hidden version is a different thing entirely.
