# Working in this repository

Heads-up No-Limit Hold'em against an opponent that shows its working. Nuxt 4 +
Vue 3 static export, with a pure TypeScript core behind the `~core` alias.

**Read [`docs/adrs/README.md`](docs/adrs/README.md) before changing anything
architectural, and [`docs/results.md`](docs/results.md) before believing
anything about how strong it is.** The ADRs are not background reading; several
of them exist specifically to stop a plausible-sounding change from being made.

## The disciplines that are not negotiable

These are the ones an agent will break by default, because breaking them always
looks like helping.

### 1. The benchmark decides, and you may not tune against the held-out suite

[ADR-009](docs/adrs/009-held-out-benchmark-discipline.md). Four rules, in order
of how easy they are to rationalise away:

1. **Do not tune constants against HELD OUT.** Adjusting a threshold because a
   held-out row looks bad converts that opponent into a familiar one and spends
   it. Freeze, then measure.
2. **Do not add a benchmark opponent in the same change that needs it.** If the
   existing suite cannot show an idea's value, that is a finding about the idea.
3. **An opponent must not restate a mechanism in the AI.** If the model tracks
   fold-to-c-bet, an opponent defined by a fixed fold-to-c-bet frequency is a
   mirror, not a test.
4. **A change ships only if it clears HELD OUT**, however good the argument.

This is inherited from a real documented failure in the sibling project, where a
change measured +0.7pp against a benchmark it had co-designed and −0.5pp against
one it had not. There is a known open example in this repo: the strategy loses
to `sizingTell` and the cause is diagnosed in `docs/results.md`. **Do not fix it
against `sizingTell`.** Write a new familiar opponent that exercises
sizing-as-information, fix against that, freeze, then look once.

### 2. Report what you measured, including when it is bad

Every number in `docs/results.md` came out of a run. If a change measures
negative, that goes in. The benchmark prints `UNRESOLVED` rather than a verdict
when an interval covers zero, and that is a feature — do not "fix" it by
loosening the test. Two results currently in the repo that a cheerful writeup
would have buried: the held-out loss, and opponent modelling measuring at
**−122 bb/100** against a calling station.

### 3. Do not improve the heuristic postflop policy

It is **frozen as a fallback** per [ADR-012](docs/adrs/012-rust-solver-service.md).
Local Best Response demolished the entire class of bot that has solved tables
and no play-time search — worse than folding every hand. Effort spent making the
heuristic better is effort spent on a road that is closed. The next strength
comes from search, in Rust, or it does not come.

### 4. The AI must never reveal its own cards mid-hand

The reasoning panel is the product, and it leaked twice. First by naming the
hand class outright. Then, more subtly, through the **mixed action
distribution** — "bet 52%" against "bet 6%" identifies the holding within a few
observations without naming a card. Mid-hand the panel shows what the whole
*range* does at that node (`Decision.rangePolicy`); the hand-conditional
distribution opens when the hand does. `villainCombos` is computed ignoring our
own blockers for the same reason.

If you add a field to `Decision`, ask whether it varies with our hole cards. If
it does, it is sealed until the hand ends.

## Traps that have already cost time

- **`phe.cardCode('Ac')` returns `0` for every card.** It takes two arguments.
  Only `cardCodes([...])` is correct, and the singular form fails silently. We
  compute codes ourselves in `src/engine/cards.ts` so the encoding is visible.
- **phe ranks are lower-is-better.** 1 is a royal flush, 7462 is the worst hand.
  Every comparison reads backwards from intuition.
- **`Rng` must stay statistically sound.** It was xorshift128+ with 64-bit shift
  constants applied to 32-bit words, and because it drives the deck, the equity
  sampling *and* the strategy's own mixing, a strategy could beat a copy of
  itself by 10 bb/100 with a significant interval. It is sfc32 now and
  `tests/engine.test.ts` asserts autocorrelation and cross-stream independence.
  Do not swap it without keeping those tests.
- **Money is integer hundredths of a big blind.** `BB = 100`. Floats produce
  pots that do not balance, and an unbalanced pot is indistinguishable from a
  strategy bug three layers up.
- **`decide()` throws if called for a seat that is not `s.toAct`.** That guard is
  deliberate; `legalActions` reads `s.toAct`, so a mismatch would silently return
  the other player's legal actions attached to our cards.
- **`Decision.rangePolicy` is `null` unless `explain: true`.** Computing it costs
  an extra policy evaluation per sampled holding — fine for one interface
  decision, ruinous in a benchmark. Never turn it on in the bench.
- **Never trust a vector engine's backend label.** `ruvector@0.2.40` installs a
  stub that returns `[]` from `search()` while reporting
  `implementationType = 'wasm'`. `npm run probe:vector` proves it by using it.
  See [ADR-006](docs/adrs/006-no-vector-database.md) and
  [ADR-011](docs/adrs/011-ruvector-for-offline-clustering.md).

## Commands

```
npm run dev              # play it
npm test                 # 95 tests: engine, solver, strategy, model, bench
npm run generate         # static export to .output/public
npm run bench            # scripts/bench.ts — bb/100 with 95% CIs
npm run probe:vector     # insert-then-query harness for ruvector

npx tsx scripts/bench.ts --strategy=ai --hands=40000 --seed=20260731
npx tsx scripts/adaptive.ts --hands=60000 --seed=1    # ADR-002 claim 2
```

A 40,000-hand bench run takes ~18 minutes. Run it in the background and keep
working; do not block on it.

## Layout

```
src/engine/     rules, cards, phe evaluator, Monte Carlo equity — pure, no Vue
src/strategy/   preflop charts, range tracking, postflop policy, the agent
src/model/      opponent counters, Bayesian blending, regularised deviation
src/solver/     CFR+ — a CORRECTNESS INSTRUMENT, not the player. Kuhn to -1/18
src/bench/      familiar + held-out opponents, duplicate pairing, bb/100 + CIs
src/cluster/    offline only, guarded vector engine access
app/            Nuxt: components are presentational, useGame.ts owns the loop
scripts/        offline generation, benchmarks, probes
```

The core is pure TypeScript with no DOM and no Vue, so it runs identically in
the browser, in a worker, in vitest and in the bench. Keep it that way.

## Consulting Grok

There is a `grok` skill. **Use it for architectural decisions, for anything where
you are about to commit months of work, and whenever you want a hostile read on
your own reasoning.** It has repeatedly been right in this project:

- It killed a planned CFR abstraction as a "costume" before it was built —
  independent per-player bucket Markov chains that would have looked rigorous
  and measured like a heuristic.
- It replaced a logit-clipping exploit design with KL-regularised exponential
  weights, which is what `src/model/exploit.ts` implements.
- It found the mixed-distribution card leak in the reasoning panel that the
  first fix had missed.
- It identified that every version of the roadmap described architecture to
  *implement* and never treated *adoption* as an option.

How to use it well:

```bash
grok -p "self-contained question with the relevant code pasted inline"
grok -c -p "follow-up in the same session, from the same cwd"
```

- It starts cold. Paste the code and the numbers; it cannot read the repo.
- **State your own conclusion and ask it to find holes.** The valuable answers
  in this project came from "here is what I built, attack it", not "thoughts?".
- Give it the measurements. It reasons much better against real numbers.
- **Verify its specifics before acting.** It recommended standing on TexasSolver
  without noting that it is AGPL-3.0 — checked directly, and it changed the
  recommendation. It is one strong opinion, not an oracle.

## House style

- Comments explain **why**, not what. If a constant is a judgement call, say so;
  if it comes from a theorem, say which.
- No emoji anywhere. No "Generated with" markers, no `Co-Authored-By` lines in
  commits.
- Commit messages are prose that explains the reasoning and states what was
  measured. Look at `git log` for the shape.
- British spelling in prose, since the existing docs use it.
- Prefer a test that would have caught the bug over a comment describing it.

## Where the project actually is

**Built and playable. Measured and honest about being weak.**

- Beats every FAMILIAR opponent significantly; **loses to one HELD OUT**
  (`sizingTell`, −15.61 ± 9.67), so by ADR-009 it does not ship as finished.
- **Cannot be shown to beat a 30-line script** (`tightAggressive`,
  +1.24 ± 9.03 — noise). This is the number that matters.
- Opponent modelling is **off by default** because it measured negative.
- The CFR+ solver is verified on Kuhn (−1/18 to 6e−9) and Leduc (288 infosets,
  1.7e−3), and is not the player.

## What to build next

Read [`docs/plan/04-beating-professionals.md`](docs/plan/04-beating-professionals.md)
and [`docs/plan/05-stack-and-data.md`](docs/plan/05-stack-and-data.md) in full
before starting. Ordered:

1. **[ADR-014](docs/adrs/014-solver-licence.md) needs a human decision first.**
   There is no permissively-licensed HUNL postflop solver; the licence chosen
   decides whether the solver is adopted or written, which is the difference
   between weeks and months. Do not start ADR-012 work before this is settled.
2. **Adopt [b-inary/poker-cfr](https://github.com/b-inary/poker-cfr)** (BSD-2)
   for the preflop layer, replacing the hand-authored charts in
   `src/strategy/charts.ts`. Clean win, unaffected by the licence decision.
3. **Kill the `s/(1+s)` villain bluff-composition model** — via a new familiar
   opponent, per the discipline above.
4. **A river-only re-solver in Rust**, wired to the real table. Not the full
   tree. It proves the architecture and doubles as a diagnostic: if it still
   cannot beat the script with a tight interval, the problem is the ranges being
   fed in, not the search.
5. **The LBR probe** in the ship gate ([ADR-015](docs/adrs/015-best-response-probe-in-the-ship-gate.md)).
6. Then turn, then flop, then the value network for leaves
   ([ADR-013](docs/adrs/013-training-data-is-generated-not-collected.md)).

**And keep [ADR-016](docs/adrs/016-strength-floor-not-ceiling.md) in view.** The
target is a floor — beat recreational players convincingly, prove it with LBR —
and then everything else goes into the explanation layer. Fully built, this
still measures around −8 bb/100 against a strong professional. The project does
not claim otherwise and neither should you.
