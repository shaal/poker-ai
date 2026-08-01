# ADR-015: A best-response probe joins the ship gate

**Status:** Accepted — extends [ADR-009](009-held-out-benchmark-discipline.md)

## Context

[ADR-009](009-held-out-benchmark-discipline.md) built a benchmark of scripted
archetypes split into familiar and held-out suites, and it worked — it caught a
real loss and refused to call unresolved results evidence. But implementation
exposed a blindness in it that the ADR could not have anticipated, and the
blindness is structural rather than a gap in coverage.

**Scripted archetypes cannot find exploitable holes.** They play fixed
strategies. They do not probe, do not adapt, and do not look for the specific
spot where a strategy is inconsistent. So a policy can beat every one of them
convincingly while having a hole a thinking opponent walks through.

The evidence is in this repository. The strategy loses to `sizingTell`
(−15.61 ± 9.67), and the cause turned out to be structural: the range tracker
infers bluff frequency from bet size via `s/(1+s)`, so a bigger bet implies
*more* bluffs, and an opponent who bets big only when strong inverts it. That is
a large, general, permanent leak against any thinking opponent — and it was
found only because one held-out opponent happened to have a mechanism that
tripped it. **Finding it cost a held-out opponent**, which ADR-009 is explicit
about being a limited and spendable resource.

A best-response probe would have found the same hole without spending anything,
because it attacks the strategy directly rather than waiting for an archetype to
stumble into it.

This is also the warning in
[the research](../plan/01-research.md): Local Best Response found every ACPC
entrant losing more than 3,000 mbb/g — bots that looked fine against the field.

## Decision

**An LBR-style best-response probe runs alongside the held-out suite, and both
gate a change.**

- The probe plays real cards against the **frozen** strategy and searches for
  the line that maximises its own value. It is not required to be a full best
  response; a cheap approximation that tries several aggressive lines per spot
  catches most of what matters.
- It reports its result in bb/100, like everything else.
- **A large negative here is a finding even when every archetype row is green.**
  That is the whole point: the archetypes say "better than these cartoons", and
  the probe says "here is what happens when something looks for your holes".

Three rules carried over from ADR-009, which apply unchanged:

1. Do not tune constants against it any more than against the held-out suite.
   It is a gate, not a training signal. A strategy fitted to its own best
   response is a strategy fitted to one particular attacker.
2. Report the probe's number even when it is bad. Especially then.
3. It does not replace the held-out suite. Archetypes measure whether the
   strategy exploits ordinary mistakes; the probe measures whether it survives
   being attacked. Those are different questions and both matter.

## Consequences

**Good.** The most dangerous class of failure — plausible against the field,
broken against a thinker — becomes visible before a human finds it. It is also
much cheaper than held-out opponents, which are written once and spent on first
contact.

**Bad.** It is more work, and a probe that is too weak gives false reassurance
while one that is too strong makes every strategy look terrible and stops
discriminating. Calibrating it against a known-bad strategy (`alwaysFold` should
lose horribly to it) is the way to tell which one has been built.

**Note on the sizing leak specifically.** It is now known and diagnosed, and it
must still not be fixed against `sizingTell` — ADR-009 rule 1 stands. It needs a
separately-authored familiar opponent that exercises sizing-as-information, the
fix developed against that, constants frozen, and then one look at the held-out
row. The probe joining the gate does not license retro-fitting to the opponent
that exposed the problem.
