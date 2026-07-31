# Interface direction

The brief asked for something visually stunning. That is a real requirement, so
it gets a real answer rather than "we'll make it look nice."

## The problem with making poker look good

Poker interfaces default to one of two failures. Either they imitate a casino —
green baize, gold serif type, felt textures, chips that clink — which reads as
dated and slightly seedy and has been done ten thousand times. Or they go fully
utilitarian, like a solver or a tracking HUD, which is honest but cold and gives
a first-time player nothing to feel.

Neither serves this project, because this project's actual subject is not the
cards. **It is what the AI is thinking.** The most interesting thing on screen
is a mind reading you and being visibly uncertain about it. A design that treats
that as a side panel next to the "real" game has misunderstood what it is
building.

## The direction

**Instrumentation, not casino.** The visual language should come from
oscilloscopes, telemetry and observatory readouts rather than from card rooms.
The sibling project `shaal/rps-ai` established this and it transfers well: dark
field, restrained palette, monospaced readouts for anything numeric, one accent
colour per meaning rather than per decoration.

Three things this buys:

1. **The AI's reasoning can be first-class** without looking bolted on, because
   the whole interface is already an instrument.
2. **Uncertainty is renderable.** A confidence interval, a belief that is 40%
   settled, a read that is strengthening — these look native in a telemetry
   idiom and look like an error state in a casino idiom.
3. **It does not promise Vegas** and then deliver arithmetic.

## What has to be on screen

Beyond the table itself:

- **What it believes about you.** Not raw HUD statistics, but the beliefs those
  imply, with their uncertainty visible. "You fold to c-bets more than most
  players — I'm about 60% sure, from 14 observations." The number of
  observations is part of the sentence, per
  [ADR-005](../adrs/005-opponent-modelling.md).
- **Why it did that.** Split into the baseline component and the exploitative
  deviation, so the player can see the read actually changing the decision. If
  a read never visibly moves a decision, the player has no reason to believe it
  exists.
- **Whether the decision was right, separately from whether it worked.**
  All-in EV, equity when the cards ran out, per
  [ADR-010](../adrs/010-communicating-variance.md).

## Motion

Poker is a game of pauses, and the pauses carry meaning — a long think is
information. Animation should serve the read rather than the spectacle: chips
that move with weight, cards that land, and deliberate stillness while the AI
"thinks," even though the lookup is instant. That last one is a design choice
worth being honest about internally: the pause is theatre, but it is theatre in
service of legibility rather than of pretending to compute.

Everything must survive being turned off. `prefers-reduced-motion` is not an
afterthought in an interface built on movement.

## Constraints

- Works on a phone. A two-seat table is easier here than six.
- Readable at 320px without horizontal scroll.
- Both light and dark, with dark as the default the design is composed for.
- No layout shift when the reasoning panel updates, which it does every action.

## The test

A screenshot of this project should be immediately identifiable as *not* another
poker app. If it could be mistaken for one, the design has failed regardless of
how polished it is.
