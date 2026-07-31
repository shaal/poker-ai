# Measured results

Every number here came out of `npm run bench` or `npx tsx scripts/adaptive.ts`.
Nothing in this file is an estimate, and the failures are here too, because a
results page that only records the wins is the thing
[ADR-009](adrs/009-held-out-benchmark-discipline.md) exists to prevent.

Reproduce with:

```
npx tsx scripts/bench.ts --strategy=ai --hands=40000 --seed=20260731
npx tsx scripts/adaptive.ts --hands=60000 --seed=1
```

## Headline

**The baseline clears the familiar suite and fails the held-out suite.** It
loses to one held-out opponent at a margin whose interval excludes zero, so by
the rule in ADR-009 it does not ship as finished. See
[the failure](#the-failure-sizingtell) below, which is the most useful thing on
this page.

## Phase 0 — engine

| Check | Result |
|---|---|
| AA vs KK, 200k trials | 82.4% (published: 82.4%) |
| Monte Carlo vs exact enumeration on a flop | within 1% |
| 5,000 random hands | chips conserve, no illegal state, no duplicate cards |
| 7-card evaluation | royal flush ranks 1, category ordering verified |

## Phase 1 — the benchmark, before the strategy it judges

A trivially bad strategy has to measure as bad, or nothing downstream means
anything.

| Strategy | bb/100 | 95% CI |
|---|---|---|
| `alwaysFold` vs reference | −44.13 | ± 1.41 |
| `alwaysCall` vs reference | −228.58 | ± 17.61 |

Duplicate pairing narrows the interval by about **1.22x** at equal hand count.
That is far less than the ~85% variance reduction ADR-009 quotes — but that
figure belongs to AIVAT, which is a different and stronger technique that is not
implemented here. Recording the gap rather than letting the ADR's number stand
unchallenged.

Identical deterministic strategies pair to *exactly* zero variance, which is the
sharpest available check that the pairing is wired up correctly.

## Phase 2 — the baseline strategy

40,000 duplicate-paired hands per opponent, seed 20260731.

### FAMILIAR — development only, therefore not evidence

| Opponent | bb/100 | 95% CI | |
|---|---|---|---|
| callingStation | +446.66 | ± 19.96 | significant |
| nit | +29.00 | ± 6.26 | significant |
| maniac | +528.18 | ± 34.43 | significant |
| alwaysMinRaise | +154.03 | ± 24.08 | significant |
| alwaysFold | +58.56 | ± 0.43 | significant |
| alwaysCall | +323.49 | ± 21.92 | significant |
| loosePassiveMixer | +259.37 | ± 16.41 | significant |
| tightAggressive | +1.24 | ± 9.03 | noise |

`tightAggressive` is the AI's own reference opponent, so measuring as noise
against it is the expected and correct result — a strategy that beat a
reasonable opponent by a wide margin at this sample size would be evidence of a
bug in the bench, not of strength.

### HELD OUT — frozen constants, decides whether a change ships

| Opponent | bb/100 | 95% CI | |
|---|---|---|---|
| boardTextureReactive | +164.38 | ± 17.90 | significant |
| stackDepthShover | +52.06 | ± 1.07 | significant |
| tiltAfterLoss | +19.45 | ± 8.30 | significant |
| positionBlind | +64.83 | ± 12.61 | significant |
| **sizingTell** | **−15.61** | **± 9.67** | **significant loss** |

**Verdict: does not ship.** Four of five held out are beaten with the interval
excluding zero. The fifth is a loss with the interval excluding zero, and
ADR-009 rule 4 is that a change ships only if it clears the held-out suite,
however good the argument for it is.

### The failure: sizingTell

`sizingTell` is an opponent whose bet size correlates with its hand strength. It
should be *easy*, and losing to it points at something structural rather than at
a knob being slightly off.

The likely mechanism, stated as a hypothesis rather than a finding: the range
tracker derives the opponent's bluff frequency from their bet size using the
balanced identity `bluffs/(value+bluffs) = s/(1+s)`. Under that identity a
BIGGER bet implies MORE bluffs. `sizingTell` bets big when it is strong, so the
model is inverted for exactly this opponent, and the AI calls too light against
large bets.

**This has deliberately not been fixed.** ADR-009 rule 1: do not tune constants
against the held-out suite — adjusting a threshold because a held-out row looks
bad converts that opponent into a familiar one and spends it. Rule 2: do not add
an opponent in the same change that needs it. The correct next step is a
separately-authored familiar opponent that exercises sizing-as-information, a
fix developed against that, and then a fresh look at this row with the constants
frozen.

Recording the diagnosis without acting on it is the whole discipline. The
sibling project's regression happened because a bad result was rescued twice
instead of believed once.

## Solver correctness

Not the shipped strategy — a correctness instrument, per
[ADR-007](adrs/007-poker-darwin.md). The point of it is that its answers are
independently known.

| Check | Measured | Known value |
|---|---|---|
| Kuhn poker game value | −0.055555550 | −1/18 = −0.055555556 |
| Kuhn exploitability at 10k iterations | 6.02e−5 | → 0 |
| Kuhn exploitability at 10 / 100 iterations | 2.31e−2 / 2.29e−3 | monotone decrease |
| Leduc infosets | 288 | 288 |
| Leduc exploitability | 1.74e−3 | → 0 |
| CFR+ vs vanilla CFR at 10k | 6.02e−5 vs 1.87e−4 | CFR+ 3.1x better |

A uniform (unsolved) strategy scores 0.92 on Kuhn and 4.75 on Leduc, so a stub
returning zeros cannot pass these.

## Phase 4 — does it actually learn you?

This is ADR-002 claim 2, and ADR-005 predicts it is the one most likely to come
back negative.

**A measurement bug had to be fixed before this could be answered at all.** The
ordinary bench constructs a fresh policy per match and never lets a profile
accumulate, so `--strategy=ai` and `--strategy=ai-noexploit` were producing
byte-identical output: the comparison looked as though it had been run and had
not. `scripts/adaptive.ts` exists because of that — it carries the profile
forward across hands and compares the two configurations on the same deals from
the same seats, so the interval is on the paired *difference* rather than on two
independent means.

At 1,200 hands per opponent the answer on the held-out suite is "no difference
measured" everywhere, with intervals of ±44 to ±81 bb/100. That is not a
disappointing result so much as an illustration of the sample-size arithmetic in
[the research](plan/01-research.md): fold-to-c-bet alone needs roughly 3,840
hands to stabilise to ±5%.

Larger runs are in progress; whatever they say goes here, including if the
answer is no. Per ADR-005, opponent modelling ships **off by default** unless it
can be shown to beat its own baseline.

## Interface

| Requirement | Result |
|---|---|
| 320px, no horizontal scroll | `scrollWidth === innerWidth === 320`, zero overflowing elements |
| 375px / 768px | same, verified |
| `prefers-reduced-motion` | zero unguarded transitions or animations in the shipped CSS |
| Light and dark | both, dark is the composed default |
| Static export | 6 routes prerendered, no server, no network calls at runtime |

## Two defects found by testing rather than by reading

**The random number generator.** `Rng` was described as xorshift128+ and applied
that algorithm's 64-bit shift constants to 32-bit words. Measured over 400,000
draws it showed lag-1/2/3 autocorrelation at |z| = 5.4, 3.2 and 5.9, where
anything sound sits under 3. Because the same generator shuffles the deck,
drives Monte Carlo equity and samples the strategy's own mixed actions, one
strategy could measure as beating a copy of *itself* by up to 10 bb/100 with an
interval that excluded zero and did not shrink with more hands. Replaced with
sfc32; the statistical properties are now assertions in `tests/engine.test.ts`,
and a self-play symmetry test guards the consequence.

**The reasoning panel showed the AI's cards.** Browser testing found it
rendering `87s at "button open" is a 100/0/0 raise/call/fold` while the AI held
87s and the hand was still live. Hand-identifying figures are now sealed until
the hand ends. An external review then pointed out that the *mixed action
distribution* leaks the same information more slowly — "bet 52%" against
"bet 6%" is a strength label that needs no card names — so mid-hand the panel
now shows what the whole range does at that node, and the hand-conditional
distribution opens with the hand. The combo count was also recomputed to ignore
our own blockers, since a count that moves with what we hold is a card leak
wearing the costume of a fact about their range.
