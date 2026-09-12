# Dofus Efficiency — Manifesto

## What is this?

**Dofus Efficiency** is a small web app for tracking and comparing ways to make
**kamas** in Dofus. It's a shared notebook with a brain: we drop in money-making
ideas — crafting flips, resource farming, market plays — and the app helps us
figure out which ones are actually worth our time.

It's built for **two people**: me and my little brother. Not a polished public
product, not a startup. A practical tool we'll actually use while playing.

## The problem

In Dofus there are a hundred ways to make kamas, but it's hard to know which one
is best *right now*:

- Prices at the HDV (marketplace) move constantly, so yesterday's good flip is
  today's loss.
- Crafting *looks* profitable until you add up ingredient costs, runes, and the
  time to gather everything.
- Good ideas get lost — we hear a tip, try it once, forget it, and rediscover
  it three weeks later.

We keep this knowledge in our heads and in scattered messages. That doesn't
scale, and it doesn't let us compare options side by side. And keeping prices
up to date by hand is tedious — so we don't, and the numbers go stale.

## The big idea

Get the data **straight from the game** instead of typing it. We already take
screenshots while playing (via Medal), so:

1. Point the app at the folder where Medal saves screenshots.
2. The app reads those images and uses **OCR** to pull out the data that matters
   — mainly **HDV prices**.
3. That feeds the calculations automatically. **More screenshots = more data.**

No manual price entry once it's rolling. The screenshots we already take become
the fuel.

## What we want it to do

The app should let us:

1. **Capture ideas** — write down a money-making method with notes, so nothing
   gets lost.
2. **Estimate the payoff** — for each idea, roughly how many kamas it makes, how
   much effort/time it takes, and what it costs to start.
3. **Compare crafting profit** — enter a recipe (ingredients + their prices +
   the sell price) and see the margin per craft.
4. **Rank ideas** — sort by "kamas per hour" or profit so we can pick the best
   thing to do in a session.
5. **Keep it current** — easily update prices when the market shifts, so the
   numbers stay honest.

## Principles

- **Useful over impressive.** If a feature doesn't help us make more kamas with
  less hassle, it doesn't belong here.
- **Honest numbers.** Better a rough estimate we trust than a fake-precise one we
  don't. Always show the assumptions behind a profit figure.
- **Fast to update.** The market changes; updating a price should take seconds.
- **Two-player friendly.** Both of us should be able to add ideas and see the
  same data. Shared, not siloed.
- **Small and simple.** Start with the smallest thing that's genuinely helpful,
  then grow only where we feel the pain.

## Out of scope (for now)

- A backend, user accounts, or live data sync between us. Each of us runs the
  app locally on our own data; no server to maintain.
- Live price scraping from the game's servers. Our data comes from the
  screenshots we take, nothing else.
- Monetization, public launch, or fancy branding.
- Bots, automation, or anything that plays the game for us.

## The shape of it

A **100% client-side React web app** — free, local, no backend, no API keys:

- Point it at the **Medal screenshot folder**; it reads the images itself.
- **OCR** the images (mainly for HDV prices).
- Combine those prices with known **recipes / item data** to compute
  **profit per craft** and other money-making math.
- **Rank and compare** ideas by estimated profit or kamas-per-hour.
- Store everything in the browser; more screenshots just means more data.

The concrete tech decisions and the reasoning behind them live in
[`TECH_NOTES.md`](./TECH_NOTES.md). This manifesto stays focused on *what and
why*.

## Success looks like

Before a play session, one of us opens the app, glances at the top-ranked idea,
and knows exactly what to farm or craft to make the most kamas — without
guessing or arguing about it.
