# 9 to 9 — Deep Work prototype

A playable prototype of the single most important mechanic in *9 to 9*, the Indian IT employee
life-sim: the **Deep Work** session. It exists to answer one question before anything else gets
built:

> **Is triaging interruptions while protecting your focus actually fun — and does it stay fun?**

The design idea it tests: in real IT work, the coding isn't the hard part. The interruptions are.
So the game isn't about typing speed. It's about deciding, fast and under pressure, what deserves
to break your focus.

## Run it

```bash
npm start
```

Then open http://localhost:8910. No dependencies to install.

It listens on your network too, so you can playtest on your phone at `http://<this-computer's-IP>:8910`
(the game is designed mobile-first). Set `HOST=127.0.0.1` to keep it on this machine only.

## How to play

- **Choose your role** on the start screen (see below).
- **Hold Space** (or the big button) to work. Staying uninterrupted builds **Flow**; at **DEEP WORK**
  you work 3× faster.
- Notifications keep arriving. **Respond** and you're pulled away for a while. **Ignore** and it's
  gone — but ignoring something genuinely urgent costs **Reputation**.
- Some messages are traps. Anything *quick*, *small* or *just 2 mins* never is.
- 🎧 **Headphones**, once per round: 10 seconds with no non-urgent pings.
- 🤝 **Colleague favours**: reply to small talk from a colleague (a person, not a bot, group chat or
  family) and they owe you one, up to 3. Tap 🤝 on any message to pass it to them, even while you're
  stuck on a call. They'll handle a real emergency for you (no call, no lost focus, +5 rep); on anything
  else the favour is wasted, and a trap sends *them* into the "2-minute call".
- Finish your deliverable (100%) by the end of the morning with your reputation intact.

Keys: `1`–`5` pick a role (start screen) · `Space` hold to work · `R` respond · `X` ignore · `P` peek ·
`D` pass to a colleague · `H` headphones · `M` sound. Keys act on the notification closest to expiring, which is outlined.

## Roles

| Role | Deliverable | On screen | The trap to watch for |
|---|---|---|---|
| 💻 Developer | Ship the feature | `checkout.ts` | "Quick PR review? (3,200 lines)" |
| 🧪 Tester | Sign off the test cycle | a regression run | "Just retest everything, small release" |
| 📊 Analyst | Deliver the board report | a revenue SQL query | "Quick pivot table? 2 mins" |
| 🛟 Support Engineer | Clear the ticket queue | a customer reply | "Quick question: can you just reproduce this?" |
| 🧭 Manager | Get the release plan approved | the weekly status doc | "Quick sync to plan the planning?" |

Each role has its own urgent messages, traps, small talk, busy texts and aftermaths, plus a shared
pool of everyday life (Mom, the society WhatsApp group, chai). The last role you picked is remembered.

A role changes **what the messages say, never the rules**: timings, penalties and scoring are
identical, so scores compare fairly across roles, and the tell rules (traps minimise, urgent messages
never do, seven words at most) are tested for every role. The start and end screens show your best
score per role.

## The daily morning

The start screen offers **today's morning**: one a day, the same one for everyone (the Wordle model),
plus unlimited practice on random mornings.

- **Same for everyone.** Mornings are numbered from 11 Sep 2026 and turn over at midnight India time,
  wherever you are. Every arrival (when, which type, how long it lasts) is fixed by the morning's seed
  before play starts, so headphones or a full inbox never shift anyone onto a different morning. Every
  role gets the same rhythm on the same morning; only the words change.
- **One result per morning.** Your first finished run is the one that counts. Variant B is practice only.
- **Share it.** The result is spoiler-free: one square per message, a row per in-game hour.

  ```
  9 to 9 · Morning #1 🧪
  🥇 Signed off & respected · 1840
  🟩🟩🟩🟩
  🟩🟥🟩🟨🟩🟩
  🟩🟩🟥🟩🟩🟩🟩🟩🟩
  ⚡ 31s deep work · 🔥 2-day streak
  http://…
  ```

  🟩 right call · 🟨 answered small talk · 🟥 wrong call (ignored something urgent, or fell for a trap).
  Phones get the share sheet; desktops copy to the clipboard; there's also a WhatsApp button.

## Every morning is different: bosses, office events and follow-ups

**Boss of the day.** Each morning has one, and it changes the mix:

| Boss | What changes |
|---|---|
| 😌 The Reasonable One | a normal morning |
| 🔍 The Micromanager | more urgent messages |
| ⌛ The Last-Minute Boss | the same messages, stretched toward noon: a quiet start and a busy finish |
| 🙂 The Nice Trap | more traps, all asked very politely |

**Office events.** One or two a morning, never in the opening seconds and never overlapping:

| Event | What happens |
|---|---|
| 🔥 Fire drill | everyone out for 3.5s: no work and no actions, message timers pause, but your focus drains |
| 📶 Wi-Fi down | no messages for 6s, then the held ones land one after another |
| 👀 Boss walking by | keep working (or handle a real emergency) for +3 rep; get caught idle or on a pointless call for −6 |
| 🚨 Outage | the next three messages are all real emergencies |
| 🍕 Lunch arrives | the next three messages are chatty colleagues: a good time to bank favours |

**Follow-ups.** A trap you left unanswered asks again once, pushier, in words that still follow your
level's tell ("Just following up, quick one?" at Junior, "Circling back on my earlier message" at Senior,
"URGENT follow-up: still waiting on you!" at Lead). An urgent message you missed comes back once as an
escalation from the boss ("Leadership is asking why this is open"); ignoring that costs the same again.

The boss and events come from the morning's seed, so the daily morning's boss and events are the same for
everyone. They were balanced with the simulated players (`npm run sim`, section 5): the first version added
extra messages and brought back every declined trap, and a first-time player lost 17% of messages before
reading them. Now outage and lunch change what the next messages are instead of adding more, only
unanswered traps come back, and every kind of morning keeps a first-time player near 1% lost with good
judgment still earning gold. `test/events.test.js` holds all of this.

## Achievements and your desk

Ten achievements, each unlocking one object that appears in your office:

| | Achievement | How | Unlocks |
|---|---|---|---|
| 🗒️ | First morning | finish your first morning | sticky notes on the monitor |
| 🪴 | Human firewall | dodge 6 traps in one morning | a desk plant |
| 🏆 | Nothing slipped | finish the work without missing anything urgent | a small trophy |
| 🎧 | Deep diver | 40 seconds of deep work in one morning | a headphone stand |
| 🖼️ | The rescue | pass an emergency to a colleague while stuck on a call | a photo of the team |
| 🖥️ | Tried everything | finish the work in all five roles | a second monitor |
| 📅 | Three in a row | play the daily morning three days running | a wall calendar |
| 🐈 | Regular | play ten mornings | a photo of a cat |
| 🥇 | Gold star | earn 🥇 on a daily morning | a medal on the wall |
| 🧯 | Survivor | live through a fire drill and an outage in one morning | a fire extinguisher |

Unlocks are **cosmetic by design**: they change what your office looks like and never touch the rules,
so a long-time player and a first-timer face exactly the same morning. The start screen has a "Your desk"
section showing what's unlocked and the hint for what isn't, and the result screen says what a round just
earned. `awards.js` holds the conditions, `test/awards.test.js` checks each one.

## Graphics: the illustrated office

The work panel opens on a little office scene (`scene.js`) that reacts to how you play:

- You type while you hold the button, glow gold in DEEP WORK, take a call (with a speech bubble) when you
  respond, and go dizzy when you fall for a trap. Headphones appear when they're on; sweat when three or
  more messages pile up. Your shirt is your role's colour.
- The window goes from morning to noon and the wall clock follows the in-game time. Coffee steam fades as
  your focus drops.
- The desk phone buzzes when a message lands, a colleague walks over saying "On it!" when you pass
  something to them, confetti bursts when you finish and when you're promoted, and the screen shakes when
  something urgent is missed.
- Every person who messages you has a drawn portrait, the same face every time (keyed on their first
  name). Bots, teams and apps keep an icon, so people and systems are easy to tell apart.

It's all inline SVG and CSS: no image files, sharp on any screen, works offline. It only reads the game
state, so the rules and balance are untouched. Animations switch off for players whose device asks to
reduce motion. On phones the scene takes the code text's place, so the inbox keeps its space.
`test/scene.test.js` checks the portraits (people vs systems, one face per person, a varied cast, and that
message text can never reach the page as markup).

## Message variety

Every role has a large pool of messages, so rounds don't feel like the same list:

| Per role | Urgent | Traps | Small talk |
|---|---|---|---|
| 🌱 Junior | 14 | 14 | 19–20 (including 13 shared) |
| 🚀 Senior | 14 (same as Junior) | 12 | same as Junior |
| 👑 Lead | 12 | 12 | same as Junior |

Messages are dealt like a shuffled deck (`dealer` in `core.js`): a round never repeats a message while
unseen ones remain, and practice rounds put messages you saw in your last few rounds at the bottom of the
deck. The daily morning ignores that history, so it stays the same for everyone. Which messages you get
never changes *when* they arrive: the rhythm has its own random stream, so adding content can't alter the
balance. `test/variety.test.js` checks all of this.

## Career levels

Once you've learned that "quick" means trap, the game gets easy. Career levels keep it hard: as your
career grows, traps stop giving themselves away. The rules and timing never change, only how well a trap
hides, and so which reading skill each level tests.

| Level | Traps look like | Urgent looks like | What you have to read for |
|---|---|---|---|
| 🌱 Junior | "Quick call? 2 mins" | "PROD down. Join the bridge NOW" | the minimising word |
| 🚀 Senior | "Whenever you get a moment, thoughts?" | same as junior | is anything actually wrong? |
| 👑 Lead | "URGENT: need estimates for next quarter" | "Checkout errors climbing since your deploy" | what's broken, and who's waiting |

- A 🥇 at your highest level, in any role, unlocks the next. Pick your level on the start screen; locked
  levels say how to unlock them. (`?dev` unlocks everything.)
- The daily morning has the same rhythm at every level; the share text says who played it
  ("🧪 Senior Tester").
- All career wording is plain English with no local references.

`test/career.test.js` holds every level to its tell and checks it with keyword-only readers: "quick
means trap" earns gold at Junior and fails at Senior and Lead, trusting alarm words gets you put on a
PIP at Lead, and a reader who understands the messages does equally well at every level. Those bots
prove the shortcuts break; how much harder Senior and Lead *feel* to real people is for playtesting.

## Colleague favours

Before favours, the right move for small talk was always *ignore*. Now it's a real decision:

- Reply to a **colleague** (Kiran's chai, Swathi's biryani order, Meera from QA…) and they owe you a
  favour, up to 3. Bots, broadcasts, group chats and family never do, so read the sender. A quick reply
  to a colleague takes 0.8s, less than other small talk (1.2s).
- Tap **🤝** (or press `D`) on any message to pass it to whoever has owed you longest. It shows on every
  message, whatever its type, so it can't give anything away.
  - **Urgent**: they handle it. No call, no lost focus, +5 rep (answering yourself earns +8).
  - **Trap or small talk**: the favour is wasted (a trap sends *them* into the "2-minute call").
- It works **even while you're stuck on a call**, which is the big payoff: rescuing the urgent message
  that lands while a trap has you trapped.

Balanced with the simulated players (`npm run sim`, section 3). Using favours scores about 3% more for
a perfect reader and 4% more for a typical first-timer, but a 90% reader with favours still scores
below a perfect reader without them: favours reward being a decent colleague, they don't replace
reading well. `test/favours.test.js` holds both sides of that.

## Work personalities

Every round ends with a personality earned from how you played, shown on the result screen with the
stat that earned it, and added (by name only) to the daily share text. There are ten to find; the result
screen shows how many you've found and flags a new one.

| | Personality | Earned by |
|---|---|---|
| 👻 | The Ghost | getting put on a PIP |
| 🧘 | The Zen Master | finishing with every call right: no traps, no urgent missed, no small talk |
| 🥵 | The Martyr | taking 3+ traps and still finishing |
| 🙋 | The Yes Machine | taking 3+ traps |
| 🤝 | The Favour Banker | passing 2+ urgent messages to colleagues who owed you |
| 🛡️ | The Human Firewall | dodging 4+ traps without taking any |
| 🚒 | The Last Line of Defence | handling 4+ urgent messages without missing any |
| ☕ | The Chai Diplomat | answering 3+ bits of small talk |
| 🎧 | The Noise-Cancelled | using headphones and 25s+ of deep work |
| 🌊 | The Deep Diver | 30s+ of deep work |
| 🤹 | The Juggler | none of the above |

They're checked in that order and the first match wins. The rules live in `persona.js`, and
`test/persona.test.js` checks that naive play earns the satirical ones (answer everything → Yes Machine,
ignore everything → Ghost) while a typical player earns a spread of at least six.

### Do people come back?

To find out, `npm start` records **anonymous** play events in `data/events.jsonl`: a random ID the
browser makes, the morning number, and for a finished morning the role, rating, score and deep-work
seconds. No names, IP addresses or browser details, and the start screen says so. Then:

```bash
npm run stats
```

prints, for each morning, how many players showed up, how many finished, and how many came back the
next morning, plus the headline number: of the players whose first morning is over, how many played
the morning after.

Stats are off with `?dev` (so testing doesn't count) or `?nostats`. To send the game to colleagues it
has to be reachable: on the same Wi-Fi, `http://<your-IP>:8910` works as is; anyone else needs it hosted
somewhere that runs `npm start` (it has no dependencies). A static host also works for playing and
sharing, but then nothing is recorded.

**Dev mode** extras: `?dev&day=2` pretends it's Morning #2, to test streaks and the next-day flow.

## How to playtest it

1. Play **10 rounds**. Write down, honestly: *do I want an 11th?*
2. Play to **30**. Ask again. This is the one that matters — most minigames are fun at 5 and dead by 30.
3. Try **Variant B** (checkbox on the start screen): messages arrive collapsed, and peeking at one
   costs focus. It tests whether *information having a price* makes the decisions richer. After a few
   runs of each, the start screen shows your average score for A and B side by side.
4. Get someone who works in IT to play it without explanation, and watch where they get confused.

What to watch for: are you making **decisions**, or just reacting? Do you start recognising traps by
their language? Does DEEP WORK feel worth protecting?

## Balance tools

The rules are deterministic and separate from the UI, so they can be balanced with simulated players:

```bash
npm run sim     # every bot strategy over 300 runs
npm test        # rules, plus design checks
```

`sim` runs two kinds of simulated player, and balance is only trusted when both agree:

1. **Instant bots** that know each message's type and act immediately. With time taken out of the
   picture, they check that judgment matters: naive strategies (respond to everything, ignore
   everything) must fail, and every drop in reading accuracy must cost something.
2. **Human players** that read one message at a time, at a realistic pace. They check the timing: a
   first-time player should almost never lose a message before they can read it, while the finish
   gets busy enough that messages pile up and have to be prioritised. The first version of the
   prototype only had instant bots — they called the timing comfortable while real first-time
   players were losing about a quarter of all messages before they could read them.

The design checks in `npm test` enforce all of that, plus three content and fairness rules: a message's
countdown speed can't reveal its type, every trap uses minimising language while no urgent message
does, and no message runs longer than seven words.

All the balance knobs are in `TUNING` at the top of `core.js`.

**Dev mode.** Open http://localhost:8910/?dev and the browser console gets `nineDev.advance(seconds, hold)`,
which runs the session forward through the same code path as real play without waiting — useful for
jumping to the end screen while testing, or checking the UI in a background tab. `nineDev.state()`
returns the live game state, *including each message's hidden type*, so don't open the console while
playtesting for real.

## Project layout

| File | What it is |
|---|---|
| `core.js` | The rules. Pure and deterministic — no DOM, timers or sound |
| `content.js` | The five roles: their messages, work screens and wording, with the tell rules they must follow |
| `daily.js` | The daily morning: numbering, seeds, streaks and the share grid |
| `persona.js` | Work personalities: which one a round earns, and why |
| `awards.js` | Achievements and the desk objects they unlock |
| `scene.js` | The illustrated office scene and the portraits of the people who message you |
| `game.js` | Browser layer: role choice, daily morning, input, rendering, sound, run history |
| `stats.js` | `npm run stats`: do people come back? Reads `data/events.jsonl` |
| `index.html`, `style.css` | Page and styling (desktop and phone layouts) |
| `bots.js`, `sim.js` | Simulated players and the balance report |
| `test/core.test.js` | Rule tests and design checks |
| `server.js` | Zero-dependency static server (serves only the game files) |

## If this proves fun — next steps

- A real content pass: many more messages, so the tells stay learnable without becoming memorisable
- Colleague favours: answer someone's small talk now, cash in their help during an outage later
- Wire it into one full day loop (Morning → Work → Evening → Night)

If it doesn't prove fun after 30 rounds, that's the most valuable result this prototype can give —
it means redesigning the core mechanic before building a game around it.
