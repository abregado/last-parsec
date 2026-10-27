# Writing events

For people who make event packs in the Events tab (Edit mode). The tab's Reference view lists every step, change and test the app understands.

## The idea

- An event is rolled from one of five tables (Starship Travel, Character, Campaign, Exploration, Trade) by **weight**: an event with weight 2 comes up twice as often as one with weight 1.
- It then plays its **steps** in order. Nothing changes in the campaign until the player reads the result and presses **Apply**.
- The **rule text** is what the player reads. The **steps** are what the app does. Keep them saying the same thing.

## Building an event

1. Duplicate a base event (it is locked) or press New event. Copies and new events go in your own packs.
2. Fill in the title, table, weight and rule text.
3. Add steps. Each step is a card with a one-line summary; open it to edit it. Cards show what is wrong with them in red.
4. Press **Roll it** under the editor to try the event on a copy of your crew. Nothing is applied.

## Steps you will use most

| Step | Use it to |
|---|---|
| Change something | Credits, XP, Sick Bay, items, Rivals and Patrons, conditions. |
| Pick someone or something | Choose a crew member, item, Rival or Patron at random. |
| Roll dice | A roll with a target and what follows. "Call the result" gives the roll a name. |
| If… | Do something only when a condition holds. |
| Ask the player | A choice, a number, a pick from a list, random candidates, or a recruit. |
| Say something | A line of result text. |

## Variables

- **$actor** is who the event is about (Character events, and Trade and Explore).
- A pick with "Call it who" makes **$who**. A roll called "r" makes **$r**. `$who.savvy` reads a property.
- In text, write `{actor}` or `{who}` to put a name in.
- Picks are random. If you want the player to choose, use "Ask the player → Offer random candidates".

## Conditions

A **condition** is anything that lasts: a character away for two turns, a grounded ship, a single-use item. Start one with "Change something → condition.add". The Conditions view makes new ones: what they stop, what they add to rolls, what happens when they start, end or are used up. Hook steps may use $actor (who it is about) and $cond (the condition itself).

## Rules the base events follow

- Nothing starts a battle out of turn. Use a condition that acts in the turn's own battle step.
- A roll for the whole ship uses the best crew member who is not in Sick Bay.
- Choices of items are random, or an offer of two random ones.
- A row of the rulebook that starts with a plain dice roll is split into one event per result, with the weights shared. A result of "nothing happens" is a small event of its own.

## Packs

- A pack is a file of events, conditions and fragments. Export a whole pack, or tick events and export just those with the conditions and fragments they use.
- Importing adds a **new** pack. If its id is taken it is renamed, and nothing is overwritten. Its events can happen on every world ("All options") until you limit them in the Archetypes tab.
- Ids never change once made, so renaming an event or pack doesn't break archetypes. Deleting an event removes it from them.
- A fragment is a list of steps several events share, used with "Run a fragment".

## Checking a pack

The editor shows problems as you go, and events with problems are left out of rolls. An imported file with problems is refused with the first few listed.
