# Measured results

Every number here came out of `npm run bench` or `npx tsx scripts/adaptive.ts`.
Nothing in this file is an estimate, and the failures are here too, because a
results page that only records the wins is the thing
[ADR-009](adrs/009-held-out-benchmark-discipline.md) exists to prevent.

Reproduce with:

```
npx tsx scripts/bench.ts --strategy=ai --hands=40000 --seed=20260731
npx tsx scripts/adaptive.ts --hands=60000 --seed=1

# Phase 5 — the sizing pair and its control. --suite=familiar keeps the
# held-out table off the screen during development, which ADR-009 rule 1
# is much easier to follow when it is not being printed twenty times a day.
npx tsx scripts/bench.ts --strategy=ai --hands=200000 --seed=20260801 \
  --suite=familiar --only=sizedValue,flatValue
```

## Headline

**The baseline clears the familiar suite and fails the held-out suite.** It
loses to one held-out opponent at a margin whose interval excludes zero, so by
the rule in ADR-009 it does not ship as finished. See
[the failure](#the-failure-sizingtell) below.

**The diagnosis recorded for that failure has since been tested and rejected.**
A fix for it was built under the full ADR-009 procedure, measured +11.43 ± 6.32
bb/100 against the familiar opponent written to exercise it, and +2.13 ± 6.02 —
covering zero — against the held-out opponent it was meant to beat. It was
reverted. [Phase 5](#phase-5--the-sizing-tell-isolated) is the most useful
section on this page, because it is the one where the discipline cost something.

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

> **That hypothesis was tested and is not supported.** The prescribed procedure
> below was followed to the letter — a separately-authored familiar opponent, a
> fix developed against it, constants frozen, one look — and removing the size
> dependence moved this row by **+2.13 ± 6.02 bb/100**, which covers zero. It
> was reverted. See [Phase 5](#phase-5--the-sizing-tell-isolated), which is now
> the more useful section of this file. What remains true is that the mechanism
> is real and mis-signed; what is false is that it is principally what
> `sizingTell` punishes.

**This was deliberately not fixed at the time.** ADR-009 rule 1: do not tune
constants against the held-out suite — adjusting a threshold because a held-out
row looks bad converts that opponent into a familiar one and spends it. Rule 2:
do not add an opponent in the same change that needs it. The correct next step
was a separately-authored familiar opponent that exercises
sizing-as-information, a fix developed against that, and then a fresh look at
this row with the constants frozen.

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

60,000 duplicate-paired hands per opponent, seed 1. The interval is on the
**paired difference** between the two configurations on identical deals from
identical seats, which is a far sharper test than comparing two independent
means.

### FAMILIAR

| Opponent | adaptive | baseline | delta | 95% CI | |
|---|---|---|---|---|---|
| callingStation | +330.50 | +452.61 | **−122.10** | ± 14.74 | adaptive worse |
| nit | +29.78 | +29.74 | +0.04 | ± 3.71 | no difference |
| maniac | +579.23 | +516.42 | +62.81 | ± 25.94 | adaptive better |
| alwaysMinRaise | +211.76 | +193.12 | +18.64 | ± 17.73 | adaptive better |
| alwaysFold | +56.56 | +58.49 | −1.93 | ± 0.13 | adaptive worse |
| alwaysCall | +257.48 | +322.68 | **−65.21** | ± 15.89 | adaptive worse |
| loosePassiveMixer | +228.47 | +242.94 | −14.47 | ± 16.84 | no difference |
| tightAggressive | −0.55 | −0.77 | +0.22 | ± 6.10 | no difference |

### HELD OUT

| Opponent | adaptive | baseline | delta | 95% CI | |
|---|---|---|---|---|---|
| boardTextureReactive | +163.41 | +171.47 | −8.05 | ± 11.77 | no difference |
| stackDepthShover | +51.71 | +51.73 | −0.02 | ± 0.72 | no difference |
| tiltAfterLoss | +25.99 | +19.42 | +6.57 | ± 7.20 | no difference |
| positionBlind | +46.47 | +61.69 | −15.22 | ± 8.08 | adaptive worse |
| sizingTell | −24.48 | −22.17 | −2.32 | ± 6.33 | no difference |

**Claim 2 does not hold.** Not a single held-out opponent shows the adaptive
configuration ahead with the interval excluding zero, and one shows it
significantly *behind*.

### The interesting part: adaptation is not neutral, it is negative

The familiar suite is where this gets sharp. Against a calling station the
opponent model costs **−122.10 ± 14.74 bb/100**, and against `alwaysCall`
**−65.21 ± 15.89**. Those are not noise and they are not small.

This reproduces, in a hobby project, the specific result
[ADR-005](adrs/005-opponent-modelling.md) was written around: a restricted Nash
response built on a thin sample measured at **−120 mb/g, worse than simply
playing the equilibrium**. Best-responding to an incomplete read is not weak
exploitation; it is negative EV. The number here is startlingly close to the
published one.

The mechanism is visible in the two opponents it hurts most. Both call far too
much. The model reads them as passive and as folding rarely, which shifts weight
toward value-betting and away from bluffing — a correct direction — but the
regularised deviation cannot capture the far larger edge that was already
available against them, and the shift it does make gives up part of it. Against
`maniac` and `alwaysMinRaise`, where the leak is aggression rather than
calling, adaptation helps.

So the honest summary is not "opponent modelling does nothing". It is: **it
helps against aggressive leaks, hurts badly against passive ones, and on
opponents it has never seen it does nothing measurable.** That is a more useful
finding than a flat null, and it is a concrete lead — the advantage terms in
`src/model/exploit.ts` for the passive direction are the thing to look at, and
they should be developed against a familiar opponent and only then re-measured
here.

Per ADR-005, opponent modelling therefore ships **off by default**. The reads
are still computed, still shown with their observation counts, and still persist
across visits; what is switched off is letting them move the strategy.

## Phase 5 — the sizing tell, isolated

`sizingTell` beat the strategy by 15.61 bb/100, and the recorded hypothesis was
that `narrowOnAction` infers the villain's bluff region from bet size through
`bluffFraction(s) = s/(1+s)`: a bigger bet credits them with more bluffs, so we
call wider — backwards against anyone whose big bets mean strength.

ADR-009 forbids developing that against `sizingTell`, so the work was done
against a new familiar pair. The second half of the pair is why any of it is
interpretable.

### The pair, and why there are two of them

`sizedValue` ladders its bet size 0.35 / 0.7 / 1.15 / 1.7 with hand strength and
bluffs 28% of its air, only ever at its smallest size. `flatValue` is the same
function with one lambda changed: identical hand classes, identical folds,
identical preflop play, every postflop bet 0.7 pot. The only difference between
them is whether bet size carries information.

A single sizing opponent cannot test the hypothesis. We already over-call
value-heavy ranges in general, so any change that tightened us up would score
well against a sizing opponent whether or not it had anything to do with size.

### Calibration: the pair is fair

| hero | vs `sizedValue` | vs `flatValue` | gap |
|---|---|---|---|
| `tightAggressive` — size-blind, no opponent model at all | +2.10 ± 3.54 | +5.13 ± 3.24 | 3.03 ± 4.80, noise |
| the AI, before the change | **−17.99 ± 4.51** | **+9.43 ± 3.76** | **27.42 ± 5.87** |

A thirty-line script is indifferent between the two, so `sizedValue` is not
intrinsically the harder opponent and the AI's 27 bb/100 swing was its own
reading. The same script was **beating the AI by 20 bb/100** against
`sizedValue`, and the only thing that opponent does differently is let its size
mean something.

### The ablation

Each arm is one change from baseline. `d` is arm minus baseline; the
difference-of-differences is `d(sized) − d(flat)`. Intervals are added in
quadrature across independent runs, which is the pessimistic bound — deal-level
common random numbers were not implemented. 200,000 duplicate-paired hands per
row, seed 20260801.

| arm | d(`sizedValue`) | d(`flatValue`) | diff-of-diffs | leaves `sizedValue` at |
|---|---|---|---|---|
| **A — `bluffBottom` stops depending on bet size** | **+11.43 ± 6.32** | +1.96 ± 5.29 | **+9.47 ± 8.24, excludes zero** | −6.56 ± 4.43 |
| B — population `middleWeight` 0.5 → 0.2 | +7.67 ± 6.30 | +1.97 ± 5.23 | +5.70 ± 8.19, includes zero | −10.32 ± 4.40 |
| D — default `polarisation` 0.3 → 0.05 | +3.25 ± 6.37 | −1.63 ± 5.36 | +4.88 ± 8.33, includes zero | −14.74 ± 4.50 |
| C — D plus the population bluff term inverted | +6.84 ± 6.31 | −0.92 ± 5.32 | +7.76 ± 8.25, includes zero | −11.15 ± 4.41 |

The criterion — an arm is about size inference only if it helps `sizedValue`
materially more than `flatValue` with the interval excluding zero — was
registered in a commit before any arm was run. **Exactly one arm meets it, and
it is the blunt one.** Deleting the size dependence beat inverting it, beat
fixing the level, and beat correcting the polarisation prior.

### The arm that was measured and not shipped

A+B — the deletion plus `middleWeight` 0.5 → 0.2 — took `sizedValue` to
**+3.70 ± 4.07**, turning the loss into noise, and `flatValue` to +15.51 ± 3.54.
On chips it is the better strategy against both.

It was rejected, against a rule written down before the deciding suite was run.
Across the full familiar suite at 40,000 hands it significantly regresses three
rows relative to A:

| | A+B − A |
|---|---|
| `maniac` | −91.69 ± 46.86 |
| `alwaysMinRaise` | −55.32 ± 32.43 |
| `loosePassiveMixer` | −38.34 ± 22.32 |

All three are wide, merged bettors, which is the exact case `middleWeight = 0.5`
exists to model — and both halves of the new pair bet a value-heavy, *non*-merged
range. So B was fitting a property of the two opponents written the previous day
rather than anything about the population. `callingStation`, the row that
prompted the suspicion, did not itself regress significantly (−10.69 ± 28.35);
the class prediction held where the specific one did not.

### What the change would have cost

Against `maniac`, who genuinely does bluff constantly with big bets, A loses
**51.66 ± 48.16 bb/100** — marginally significant — because the wrong-signed
model was accidentally right about him. Nothing else in the familiar suite moves
outside its interval. That is the price of refusing to read a signal whose
direction cannot be determined in advance, and once the held-out row came back
flat it was the only demonstrated effect the change had on any opponent that was
not written for this experiment.

### What is honest about all of this

**A was never a whole fix even on its own terms.** It left `sizedValue` at
−6.56 ± 4.43, still a significant loss, and still worse than the size-blind
script's +2.10. It removed a channel that was demonstrably signed wrong. It did
not make the strategy good at reading bet size.

**The sign is more trustworthy than the magnitude.** Four arms were run and only
A's interval excludes zero, so the family-wise error rate is above 5% even though
A was the pre-registered primary. And part of the diff-of-diffs is leverage
rather than reading: `sizedValue` puts more money into exactly the pots where the
misreading bites. The defensible claim is "a wrong-signed channel was removed",
not "9.5 bb/100 of sizing skill was gained".

**Two hypotheses died here and one of them was the clever one.** An outside
review argued that `middleWeight = 0.5` — half the villain's middling hands
surviving any bet — was at least as likely to be the primary cause as the
theorem was; it measured smaller than A with an interval covering zero. And the
design that looked best on paper, keeping `s/(1+s)` but reading it as
value-concentration rather than bluff share, measured *worse than deleting the
term*. That same review caught, before it was run, that it would not have
inverted anything at the default polarisation: at `t = 0.3` the balanced term
still drags the bluff region from 0.086 to 0.161 across the sizes in play. It
only inverts below `t ≈ 0.1`.

### The held-out look, and what it said

Constants frozen, one look, at the seed and hand count that produced the
recorded −15.61 so the comparison would be direct. The first look was taken at
40,000 hands and was **underpowered**: it put the difference at −2.60 ± 13.72
when the effect being tested for was about +11. That is a design error in the
look rather than a result, and it was repaired by re-running the *same frozen
constants* at 200,000 hands. Nothing was adjusted between the two looks.

| `sizingTell`, 200,000 hands, seed 20260731 | bb/100 |
|---|---|
| baseline | −20.21 ± 4.29 |
| with the change | −18.08 ± 4.23 |
| **difference** | **+2.13 ± 6.02 — covers zero** |

**So the change was reverted.** Against `sizedValue`, the familiar opponent
written to exercise this exact mechanism, it measured +11.43 ± 6.32 and the
interval excluded zero. Against `sizingTell`, the held-out opponent that
motivated the entire exercise, it measured +2.13 ± 6.02 with a point estimate
five times smaller. No other held-out row moved outside its interval either.

That is the sibling project's documented failure reproduced almost exactly — a
change measuring well against a benchmark it was co-designed with and flat
against one it was not — and ADR-009 rule 4 caught it. The revert was
pre-committed before the number was seen, which is the only reason it is
trustworthy: a rule adopted after the result is not a rule.

Outside the two opponents written for this experiment, the only measurable
effect the change had anywhere was the 51.66 bb/100 regression against `maniac`.

### What was actually bought

Not a fix. Three things worth more than the change would have been:

1. **`sizingTell`'s cause is now known not to be principally this.** The
   hypothesis in the previous section of this file was plausible, specific, and
   wrong, and it can be struck off rather than left as a standing guess.
2. **The mechanism is real but small.** The size-to-bluff inference genuinely is
   signed backwards for the population, and removing it is worth double-digit
   bb/100 against an opponent that leans on it. It is simply not what
   `sizingTell` is punishing.
3. **The sign cannot be fixed by assuming it.** Not in either direction —
   inverting scored worse than deleting. It has to be estimated per opponent,
   which is opponent modelling, which ships off.

The next lead is that `tightAggressive`, with no opponent model at all, beats
this strategy by 20 bb/100 against `sizedValue` and is level with it everywhere
else.

**That is a system comparison and it must not be read as a tracker result**,
which is a mistake this file made in its first draft. `tightAggressive` differs
from the strategy in its preflop charts, its postflop policy, its sizing and its
mixing, not only in having no range model. Attributing the 20 bb/100 to
`narrowOnAction` converts a whole-system loss into a module indictment on no
evidence — the same move that produced the diagnosis this section just spent a
day rejecting.

What it licenses is a *test*, not a conclusion: run the strategy with postflop
narrowing disabled and the villain range left at its chart prior, across a fixed
row list registered in advance. That is hours of work and it settles whether the
tracked range is worth anything. Until it is run, "the tracker is a liability"
is a hypothesis with exactly the pedigree of the last one.

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
