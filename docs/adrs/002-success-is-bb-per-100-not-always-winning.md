# ADR-002: Success is bb/100 with a confidence interval, not "always wins"

**Status:** Accepted

## Context

The project brief asked for an AI that "always wins." It is worth recording why
that was not implemented as stated, because the reason is not a lack of ambition
and someone will reasonably ask again later.

Poker results are dominated by variance. The standard deviation of results in
No-Limit Hold'em is roughly **90 bb/100 hands**. That produces the following,
where *w* is the true win rate and the question is how many hands before a 95%
confidence interval excludes zero:

| True win rate | Hands required |
|---|---|
| 2 bb/100 | 778,000 |
| 3 bb/100 | 346,000 |
| 5 bb/100 | 124,000 |
| 10 bb/100 | 31,000 |

Even at 100,000 hands the interval is still ±5.6 bb/100. A world-class player
sits down knowing they will lose roughly four sessions in ten. There is no
strategy — computable or otherwise — that wins every hand, every stack or every
session, because the cards do not care how good the strategy is.

The second half of the brief, "learns all the players' patterns," runs into a
related wall documented in [ADR-005](005-opponent-modelling.md): the strongest
published bot deliberately does *not* adapt to opponents, because doing it well
needs more hands than a match provides.

## Decision

**The project targets maximum expected value, and measures it as bb/100 with a
stated confidence interval against a fixed benchmark suite.** "Always wins" is
not a goal, is not claimed in the interface, and is not claimed in the README.

Three specific claims replace it, each of which is falsifiable:

1. **The baseline is strong.** Positive bb/100 with a 95% CI excluding zero
   against every scripted opponent in the bench.
2. **It genuinely learns you.** The adaptive configuration beats *its own
   non-adaptive baseline*, measured. This is the interesting claim and it is the
   one most likely to come back negative.
3. **It is honest on screen.** Every action is explainable, and results are
   presented so that variance reads as variance rather than as failure — see
   [ADR-010](010-communicating-variance.md).

## Consequences

**Good.** The project has a definition of done that a benchmark can settle. It
avoids the trap of shipping something that feels strong to its author because
they happened to run good against it. It also sets up the honest version of the
marketing claim, which is more interesting than the dishonest one: *this
opponent will show you exactly what it thinks it knows about you, and you can
check whether it is right.*

**Bad.** "Maximises EV against you over time, measured in big blinds per hundred
hands" is a worse tagline than "unbeatable AI." That cost is accepted.

**Follow-on requirement.** Because the benchmark is now load-bearing, it has to
be built before the strategy it judges, and it has to be protected from being
tuned against — see [ADR-009](009-held-out-benchmark-discipline.md).
