# ADR-005: Opponent modelling by Bayesian blending from a population prior

**Status:** Accepted

## Context

"It learns your patterns" is the heart of the brief. It is also the part where
the literature is most discouraging, and the discouragement is specific enough
to design around rather than ignore.

**The strongest published bot does not do this.** Pluribus "plays a fixed
strategy that does not adapt," because its authors found that exploitation
"requires too many samples to be competitive with human ability outside of small
games."

**The sample sizes are worse than poker folklore assumes.** For a 95% confidence
interval of ±5%:

| Statistic | Hands needed |
|---|---|
| VPIP | ~290 |
| 3-bet % | ~400 |
| WTSD | ~960 |
| Fold to c-bet | **~3,840** |

Common advice ("1,000 hands is plenty") understates fold-to-c-bet by roughly
tenfold. A casual session is 100 hands. The player will be gone long before
several of these stabilise.

**And a naive model is worse than none.** A restricted Nash response built on
fewer than 100,000 observations measured at **−120 mb/g — worse than simply
playing the equilibrium**. Best-responding to a thin sample is not a weak
version of exploitation, it is negative EV.

**But the upside is large enough to be worth the care.** An equilibrium bot
captured only 93 mb/h against an opponent exploitable for over 2,000 mb/h — 20x
the available EV left behind. And implicit modelling doubled EV against weak
opponents (732 vs 369 mbb/h) once the data supported it. Exploitation is where
the money is; it just has to be earned.

The tempting design — hard confidence gates, where a read does nothing until it
crosses a threshold — fails as a product even though it is statistically
defensible. It means the AI does nothing interesting for several hundred hands
and then lurches. Players would reasonably conclude it was broken.

## Decision

**Hierarchical Bayesian estimation: start from a population prior, blend toward
the player-specific estimate in proportion to accumulated evidence, and
regularise the size of any resulting deviation.**

Four parts:

1. **Population prior.** Every statistic starts at a sensible population default
   rather than at zero or at uniform. The AI is never blind, and never needs a
   warm-up period during which it is stupid.
2. **Continuous blending, not gating.** The player-specific estimate takes over
   smoothly as observations accrue — `posterior = (prior·k + observed·n)/(k+n)`.
   Early reads move the strategy slightly; strong reads move it a lot. Nothing
   lurches.
3. **Regularised deviation.** The exploit is a bounded departure from the
   baseline, never a raw best-response. This is the direct defence against the
   −120 mb/g result: even a confident read cannot pull play arbitrarily far from
   a strategy that is known to be sound.
4. **Persistence.** Profiles survive across sessions, so hands accumulate over
   weeks rather than resetting every visit. This is the single highest-leverage
   thing available against the sample-size problem, and it is nearly free.

**This must be measured, not assumed.** Claim 2 in
[ADR-002](002-success-is-bb-per-100-not-always-winning.md) is that the adaptive
configuration beats its own non-adaptive baseline. If the bench says it does not,
opponent modelling ships **off by default** and stays an honest, visible
experiment. Given the numbers above, that is a genuinely possible outcome and
the project should not be embarrassed by it.

## Consequences

**Good.** The AI is competent from hand one. Reads strengthen visibly and
gradually, which is both statistically correct and — per
[ADR-006](006-no-vector-database.md) and the interface plan — the most
interesting thing on the screen. Persistence means a returning player meets an
opponent that genuinely knows more about them than last time.

**Bad.** Blending is harder to explain than a threshold, and "62% confident you
fold to c-bets" is a subtler thing to render than a checkmark. The interface has
to carry that.

**The honest framing for users.** Not "I have learned you," but "here is what I
think I know about you, here is how sure I am, and here is how much it changed
what I just did." That is a better product than the overclaim, and it happens to
be true.
