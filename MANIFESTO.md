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
scale, and it doesn't let us compare options side by side.

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

- Automated scraping of live HDV prices (we enter prices by hand at first).
- Accounts for the general public, monetization, or fancy branding.
- Bots, automation, or anything that plays the game for us.

## Rough starting point

A web app where we can:

- Add / edit / list **money-making ideas**.
- For crafting ideas, compute **profit per craft** from ingredient and sell
  prices.
- See ideas **ranked** by estimated profit or kamas-per-hour.

Tech choices are deliberately left open here — this manifesto is about *what and
why*, not *how*. We'll pick the stack when we start building.

## Success looks like

Before a play session, one of us opens the app, glances at the top-ranked idea,
and knows exactly what to farm or craft to make the most kamas — without
guessing or arguing about it.
