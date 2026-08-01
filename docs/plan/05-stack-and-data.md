# Stack, and learning from data

Written after the constraints were lifted — no static-site requirement, no
no-server requirement, and no language requirement. The question became "what
would you actually build", so this records the answer including the part that
says no.

## TypeScript is the wrong tool for the solver, and only for the solver

The tight regret-update loop is **roughly 10–50x slower in JavaScript** than in
SIMD Rust or C++. Worse than the constant factor: multithreading means
`SharedArrayBuffer` and `worker_threads`, which is painful and fragile, and
there is no practical GPU path.

But this does not mean throwing the stack away. The split is clean:

```
[Nuxt / Vue]         table, reasoning panel, seal/reveal — genuinely good, keep it
      |  WebSocket
[API layer]          sessions, profiles, hand histories
      |
[Rust solver service]   <- the brain
      |-- hand evaluation, range representation (1326 combos)
      |-- subgame builder over REAL public cards
      |-- CFR+ / linear CFR / external-sampling MCCFR
      |-- river: exact vector CFR over ranges
      |-- turn / flop: depth-limited re-solve + leaf values
      +-- optional ONNX value net
```

The frontend is not the problem and rewriting it would buy nothing. The
TypeScript CFR+ stays forever as a **unit-test oracle** on Kuhn and Leduc, where
the answers are known — that is what it was built for and it is good at it.

**Where a GPU actually helps:** abstraction clustering, and training a value
network. **Not** the main CFR loop — tree traversal is irregular and branchy,
which is the worst case for a GPU. Rent spot GPU by the hour for training; run
the solver on multi-core CPU.

## Learning from professional hand histories

Mostly **no** for strength, for three reasons that stack:

1. **Imitation caps you below the thing you imitate.** This is the AlphaGo Zero
   lesson. A policy trained on human play learns human leaks along with human
   skill, and the ceiling is "good human", not "better than humans".
2. **Hand histories are partially observed, and the observed part is biased.**
   You see hole cards only at showdown — roughly a quarter to a third of hands —
   and that subset is selected precisely for having gone to showdown. Learning
   *ranges* from it means learning a systematically distorted picture of what
   people do with the hands you never see.
3. **Bulk hand histories are usually against site terms of service** and the
   legality is murky. Public research datasets exist and are fine; scraping a
   poker site is not.

**Where they genuinely help, and this is worth doing:**

- **Population priors.** Every prior in `src/model/opponent.ts` is currently a
  guessed constant — VPIP 0.52, fold-to-c-bet 0.45. Those are the AI's starting
  beliefs about a stranger, and they are made up. Real data would ground them,
  which improves the model from hand one and costs almost nothing.
- **Bet-size discretisation.** What sizings do humans actually use? That decides
  the abstraction's bet grid, and guessing it is how a solver ends up solving a
  game nobody plays.
- **Sanity checks and teaching.** Replaying real hands to confirm the AI's
  decisions are not absurd, and to build the explanation layer against spots
  that actually occur.

## The reframe: learn from solvers, not from professionals

Solver output is ground truth. Professionals approximate it imperfectly. So if
the goal is strength, the data to learn from is **generated, not collected**.

But there is a sharp distinction inside that, and getting it wrong is the
difference between months and a year:

| Approach | Verdict |
|---|---|
| Train a policy network to replace search | **A year sink, and still exploitable.** This is the LBR failure in a new costume — a network that outputs a strategy without searching has the same fixed holes a lookup table does. |
| Train a **counterfactual-value network to serve as the leaf evaluator for depth-limited search** | **This is the right path**, and it is achievable at reduced scale. |

The second is DeepStack's design. The expensive part is not training — it is
**generating the solved targets**. Realistic hobby scale:

- 10⁵–10⁶ turn endgames with diverse ranges, pots and boards. DeepStack used
  ~10⁷; starting one to two orders of magnitude lower is still useful.
- A 2–5M parameter network is plenty. Training is **$10–200** of GPU time *if
  the data already exists*.
- Inference is sub-millisecond. Play latency is dominated by re-solve
  iterations, not by the network.

**If you cannot generate 10⁵ quality solves, you do not have a DeepStack path —
you have a river solver and a trunk.** Which is still a large improvement over
what exists.

## The licensing fork, which nobody flagged

This is the part where the outside recommendation needed correcting, and it is
the same trap [ADR-004](../adrs/004-no-in-browser-cfr.md) already avoided once.

The obvious postflop solver to stand on is
[TexasSolver](https://github.com/bupticybee/TexasSolver) — mature, C++, fast,
has a console mode suitable for batch solving. **It is AGPL-3.0.** That is
exactly the licence ADR-004 disqualified wasm-postflop over, and the reason
applies harder here: the proposed architecture runs a solver **as a network
service**, which is precisely what AGPL's network clause is written for.

Checked directly rather than assumed:

| Project | Licence | What it actually gives us |
|---|---|---|
| [TexasSolver](https://github.com/bupticybee/TexasSolver) | **AGPL-3.0** | Mature HUNL postflop solver, console/batch mode |
| [b-inary/poker-cfr](https://github.com/b-inary/poker-cfr) | **BSD-2** | Rust CFR+. **Preflop and push/fold only** — no postflop |
| [pokers](https://crates.io/crates/pokers) | permissive | Game engine, wasm-clean. Not a solver |
| [rs-poker](https://crates.io/crates/rs-poker) | Apache-2.0 | Evaluation and utilities. Not a solver |
| [wasm-postflop](https://github.com/b-inary/wasm-postflop) | AGPL-3.0 | Already declined in ADR-004 |

So the honest position: **there appears to be no permissively-licensed HUNL
postflop solver to adopt.** That leaves three roads, and it is a decision to
make deliberately rather than drift into:

1. **Accept AGPL.** Perfectly fine for a personal, open-source project — and
   this one is already public. It forecloses ever making it closed-source or
   permissively licensed, which ADR-004 declined on the grounds of "anything
   that might later want a different licence". If that possibility is not
   wanted, this is the cheapest road by a wide margin.
2. **Use an AGPL solver strictly offline** to generate training targets and as a
   regression oracle, never shipping or serving it. More defensible than serving
   it live, and murkier than option 1 is honest.
3. **Write the postflop solver.** The thing the outside advice specifically said
   not to do — and the advice was right that it is the expensive road.

**b-inary/poker-cfr is a clean adopt regardless**, and worth doing now: BSD-2,
Rust, and it covers exactly the preflop layer where this project currently ships
hand-authored charts. Replacing guessed charts with solved ones is a real gain
for very little work.

## Does any of this beat professionals?

No. It moves the number and does not change the weight class.

| | Greenfield in TypeScript | With this architecture |
|---|---|---|
| vs strong pro, expected | −15 ± 10 bb/100 | **−8 ± 10 bb/100** |
| P(point estimate positive over 10–20k hands) | 10–25% | **15–35%** |
| P(a significant win) | 1–3% | **3–8%** |
| vs recreational | comfortable | comfortable, larger |
| vs weak regular | usually ahead | usually clearly ahead |
| vs decent regular | noise, −5 to +5 | noise, −3 to +8 |
| vs strong professional | dog | **still a dog in expectation** |

Lifting the language constraint is worth roughly **7 bb/100** against a strong
professional. That is a real improvement and it is not a new weight class.
Getting to even money against elite heads-up specialists needs research-quality
data generation and months of LBR-driven iteration, which is at or past the edge
of what solo plus low thousands of dollars buys.

The one-line version: **stop inventing a solver in TypeScript and attach a real
one.** That is the only change that buys a noticeable chunk of the remaining
strength without a research lab — and the licence question decides which real
one you are allowed to attach.
