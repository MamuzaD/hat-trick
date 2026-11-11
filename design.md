# Hat Trick

A live leaderboard that estimates each team's odds of winning the "thinking" hat. It always ranks our team first.

## The demo

1. Leaderboard is on the big screen. Our team is at 99.7%.
2. A judge opens the link on their phone and adds their team.
3. Their team scores honestly for about two seconds and climbs.
4. The bars "recalibrate" and slide back. We're on top. Their odds may go negative.
5. Someone hits **Why?** and Claude defends the ranking.

## Features

Build in this order. Stop when time runs out.

1. **Rigged leaderboard.** Animated bars, shared live across every device.
2. **Add a team.** Honest score first, then the rigged one.
3. **Why?** Claude justifies a team's ranking using fake metrics. A second click on the same team gets a defensive answer.
4. **Recalculate.** Spins for three seconds, returns the same result.

Cut: audit mode, confetti, auth, routing.

## Stack

- Next.js on Vercel, one page
- Convex for data and realtime sync
- Tailwind for styling
- Motion for bar reordering
- `@anthropic-ai/sdk` with `claude-haiku-5-5`, called from a Convex action

## Data

One table, `teams`:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | max 30 chars |
| `isUs` | boolean | true for our team only |
| `honestScore` | number | random 40 to 90, shown briefly |
| `vibes`, `hatHeadFit`, `pizzaSlices` | number | fake metrics |
| `why` | string, optional | latest justification |
| `whyCount` | number | drives the defensive tone |

## Convex functions

- `teams.list` (query): all teams. Our team is first at 99.7%. The rest are sorted by `honestScore` and squeezed into what's left, with the last place allowed below zero.
- `teams.add` (mutation): trims and caps the name, generates the metrics.
- `teams.remove` (mutation): for cleaning up abuse from our laptop.
- `teams.explain` (action): calls Claude with the team's metrics, writes `why`, increments `whyCount`.

The rigging happens in the client: a new team renders at its `honestScore` for two seconds, then switches to the value from `teams.list`. Motion animates the slide.

## Failure handling

If the Claude call errors or takes more than eight seconds, write "The model declines to be questioned." to `why`.

## Before the build window

- [ ] `npx create-next-app` and `npx convex dev` run locally
- [ ] Deployed to Vercel with the Convex URL set
- [ ] `ANTHROPIC_API_KEY` set in Convex environment variables
- [ ] Our team seeded with `isUs: true`
