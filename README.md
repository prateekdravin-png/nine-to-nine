# 9 to 9 — Deep Work prototype

A playable prototype of the single most important mechanic in *9 to 9*, the Indian IT employee
life-sim: the **Deep Work** session. It exists to answer one question before anything else gets
built:

> **Is triaging interruptions while protecting your focus actually fun — and does it stay fun?**

The design idea it tests: in real IT work, the coding isn't the hard part. The interruptions are.
So the game isn't about typing speed. It's about deciding, fast and under pressure, what deserves
to break your focus.

## Hosting it

`npm run build` assembles **dist/** — the 15 files the browser actually loads, about 360 KB. The
server, the simulated players, the balance report and the tests stay out of it. The file list is not
written twice: `sw.js` already has to name every file for offline caching, so the build reads that list
and fails if it names something that is not there.

Any static host works. On Cloudflare Pages, point a Git-connected project at the repo with build
command `npm run build` and output directory `dist`.

### The stats endpoint

Cloudflare hosts this two ways and the dashboard steers you to whichever it prefers, so the repo
supports both rather than depending on which button was pressed:

| | reads | serves the game from |
|---|---|---|
| **Pages** | `functions/api/*.js` by convention | the build output |
| **Workers** | `wrangler.toml` → `worker.js` | the `ASSETS` binding |

The endpoints are written once. `worker.js` imports the very same handlers the Pages build uses, so
there is one copy of the validation and one copy of the storage whichever product is running, and a
test fails if it ever stops importing them.


A static host has no `/api/event`, and the game is built to shrug that off — the post fails and play
carries on. To keep the retention numbers, `functions/` holds the same endpoint as a Cloudflare Pages
Function, storing events in KV instead of `data/events.jsonl`. Cloudflare picks that directory up from
the repository root; it is deliberately not part of `dist/`.

In the Pages project:

1. **Workers & Pages → KV** → create a namespace, e.g. `nine-to-nine-stats`
2. **Settings → Functions → KV namespace bindings** → variable `STATS`, bound to that namespace
3. **Settings → Environment variables** → `STATS_TOKEN`, any long random string, kept secret

Then read the log back the same way you always did:

```
npm run stats                                          # data/events.jsonl, from npm start
npm run stats -- --from https://<site>                  # the hosted log, token in NINE_STATS_TOKEN
```

Everything below that line is the same code, because it is the same events in the same shape: the
playtest reads identically whether it ran on your laptop or on the internet.

**Why the token.** The events are anonymous, but they are still the only record of what a playtest did,
and an open endpoint is one that gets scraped and spammed. With no `STATS_TOKEN` configured the read
endpoint refuses everything rather than defaulting to open, and the comparison does not short-circuit,
so how long it takes says nothing about how much of the token was right.

**Why the validation is duplicated.** A Worker has no `require()` and cannot load the game's UMD
modules, so the endpoint carries its own copy of the role, level and rating lists. A copy that drifts
is the whole risk and it would drift silently — the local server accepting something the hosted one
rejects, or the reverse. `test/stats-endpoint.test.js` puts the same twenty-odd payloads through both
and fails if they ever disagree, and separately checks the copied constants against `content.js`,
`core.js` and `daily.js`.

`?dev` only works on localhost. It unlocks every career level and exposes `nineDev.advance`, which is a
tool here and a cheat on a hosted copy — and one that would quietly corrupt a playtest.

## Taking it to a phone

It is already an installable app: a manifest, a maskable icon, and a service worker that caches every
file, so once it has been opened on a phone it starts from the home screen with no browser chrome and
runs with no network at all. Verified by killing the server and reloading.

On a phone it also buzzes on the two things worth feeling — falling for a trap, letting a real emergency
go — holds the screen awake for the sixty seconds of a round, and refuses pinch-zoom and pull-to-refresh,
because a zoom in the middle of a round is never something the player meant. Every one of those is
guarded: the game plays identically on a browser that offers none of them.

**Android is the target.** The plan, in order:

1. ~~Installable, offline, native feel~~ — done, and needed for every path
2. Capacitor wrapper and an Android project (buildable from Windows; iOS would need a Mac)
3. Store assets: 512×512 icon, feature graphic, screenshots, privacy policy, age rating, and a data
   disclosure for the anonymous play stats
4. Closed test on Play — a new personal developer account needs 12 testers for 14 consecutive days
   before production, which is also the playtest this prototype has been waiting for
5. Production

The stats endpoint is the one thing that needs a server; everything else is static files.

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
- ⏳ **A run of right calls buys time.** Twelve decisions right in a row banks **5 seconds**, spent
  automatically on your next interruptions — on top of your inbox, you get off calls faster. Falling
  for a trap ends the run, and the bank never pays for a trap.
- 🙅 **Say no** when you genuinely can't tell. It costs a few points of Reputation every time, whatever
  the message turns out to be — far less than ignoring a real emergency, far more than reading it
  properly. It's for the messages you can't read in time, not for all of them.
- 🎧 **Headphones**, once per round: 10 seconds with no non-urgent pings.
- 🗓️ **The work week**: five mornings on one set of meters (⚡ energy, 🏡 home). A morning you win by
  emptying yourself is a morning Tuesday pays for.
- 🤝 **Colleague favours**: reply to small talk from a colleague (a person, not a bot, group chat or
  family) and they owe you one, up to 3. Tap 🤝 on any message to pass it to them, even while you're
  stuck on a call. They'll handle a real emergency for you (no call, no lost focus, +5 rep); on anything
  else the favour is wasted, and a trap sends *them* into the "2-minute call".
- Finish the work by the end of the morning with your reputation intact. How much of it counts as
  finished depends on your career level: about 85% for a junior, all of it for a lead, plus limits on
  what else may slip. Each kind of morning moves that number again.

Keys: `1`–`5` pick a role (start screen) · `Space` hold to work · `R` respond · `N` say no · `X` ignore · `P` peek ·
`D` pass to a colleague · `H` headphones · `M` sound. Keys act on the notification closest to expiring, which is outlined.

In the game these rules are **one card at a time**, with Next, ending on the goal for the role and career
level you have picked. Seven rules and a goal on screen together were most of the start screen: the role,
the ladder and today's morning all began below the fold. Anyone who has read them through once lands on
the goal card, with "↺ Read it again" beside it.

**The start screen is kept short on purpose.** Its one job is to get you into a morning, so anything you
read once and then scroll past for ever is folded behind a summary line that carries the useful part: the
desk, the keys and privacy note, your record ("📈 7 runs · best 1449"), and the perk picker on a campaign
card ("🎁 Perk: ☕ Strong coffee"). The perk fold survives the redraw that picking a perk causes, or it
would shut in your face mid-choice. Between the folds, the one-rule-at-a-time box and the two-up desk,
the screen went from **3850px tall to about 1900** on a 375px phone.

## What finishing means, by career level

Asking a junior for the same hundred per cent as a lead was never realistic. Nobody delivers a whole
feature in a morning full of interruptions, and at the start of a career nobody expects you to. What
grows with the career is **both halves of the job**: the share of the work you are expected to land, and
whether anything else is allowed to slip while you land it.

| | Deliver | And also | A reader at 95% / 85% reaches gold |
|---|---|---|---|
| 🌱 Junior | **85%** | fall for no more than 3 traps | 95% / 72% |
| 🚀 Senior | **90%** | ≤2 traps, miss no more than 2 urgent | 91% / 68% |
| 👑 Lead | **100%** | ≤1 trap, miss nothing urgent | 64% / 26% |

The share multiplies the day type's own number, so a backlog day still asks for more than an ordinary
one at every level — a junior's backlog day is 89%, a lead's is 105%. Landing the work while dropping
the rest of the job has its own result, **🧩 Delivered, but things slipped**, rather than being filed as
a silver: the feature shipped, some of your job did not.

**Lowering the bar alone breaks the game, which is the interesting part.** The delivery target was doing
the work of making interruptions expensive. Drop it to 80% with nothing in its place and *answering every
message blindly* goes from 43% gold to 86% — the strategy the whole game argues against becomes viable,
because its only weakness was running out of time. That is what the "and also" column is for, and why it
exists at every level rather than only at the top.

The result is a ladder that gets more discriminating as you climb (`npm run sim`, section 10):

```
level      asks for                 reading  answering-everyone  margin
🌱 Junior   85%, ≤3 traps               99%                 76%     24%
🚀 Senior   90%, ≤2 traps, ≤2 missed    99%                 67%     32%
👑 Lead     100%, ≤1 trap, 0 missed     96%                 44%     52%
```

A junior morning forgives a lot and still rewards reading; a lead morning forgives almost nothing. If a
junior morning separated good play from bad as sharply as a lead one, there would be nothing to be
promoted *into*. `test/timebank.test.js` fails if that margin ever stops widening as you are promoted,
and `test/days.test.js` fails if a level stops asking for less than the one above it.

While you play, a **goal bar** under the header keeps all of it in front of you: how much of the work
is left, and how many traps and missed emergencies you have spent out of your allowance, counting up as
they happen. In the campaign the level's own goals sit there too, ticked off live. Neither counter can
leak anything — both only move once a message has already been decided, which the game announces at
that moment anyway.

One day type had to be retuned for this: **working from home** used to ask for 95%, the gentlest number
in the game. With a junior's share applied that fell to 76%, and answering every message blindly became
a viable way to spend a quiet morning. It now asks for **105%** — more than an ordinary day, not less.
Its card always did say *"all the quiet you wanted. Now use it."*

## The campaign: the game as a ladder

Everything this prototype can do used to arrive at once — flow, traps, headphones, favours, saying no,
day types, career levels, bought time. The campaign is the curriculum: **sixteen levels, one morning
each, every one asking for something the level before it taught, and a whole week at the end.**

| # | Level | What it asks | What it teaches |
|---|---|---|---|
| 1 | 💼 First morning | Finish the work | The work only moves while you are working |
| 2 | 🚨 Read the room | Miss nothing urgent | Silence on a real emergency costs reputation |
| 3 | 🪤 It's never quick | Dodge 5 traps | Traps give themselves away at junior |
| 4 | 🌊 The deep end | 25 seconds in Deep Work | Flow is the point of protecting your attention |
| 5 | 🎧 Headphones on | Use them, take no traps | You have one tool, once a morning |
| 6 | 🤝 Be a colleague | Bank 3 favours, spend one | A little focus now for a rescue later |
| 7 | 🙅 When you can't tell | ≤2 traps, say no twice | Saying no is the cheapest way to be wrong → **🚀 Senior** |
| 8 | 📋 Appraisal week | Finish on 88 reputation | A day type changes what the morning is for |
| 9 | 🗃️ Backlog day | Clear it, ≤1 trap | Sometimes focus buys you nothing |
| 10 | 🚀 Release day | Miss nothing urgent | No slack on the days that matter |
| 11 | ⏳ On a roll | A run of 12 right calls | Reading well is worth time, not just calm |
| 12 | 👑 Lead | Finish on a gold | Alarm words mislead → **👑 Lead** |
| 13 | 🏠 Working from home | Clear it, 35s in Deep Work | A quiet morning is not an easy one |
| 14 | 🔍 The micromanager | Miss nothing urgent, handle 3 | When the alarms are real, they cost time, not judgement |
| 15 | 🙂 All so polite | Clear it, no traps at all | Politeness is not safety |
| 16 | ⌛ It all lands at noon | Miss nothing urgent, 40s in Deep Work | Spend the quiet building a lead |
| 17 | 🗓️ A week that holds | 3 of 5 mornings, 40 energy, 40 at home | Everything above, five times running |

**The work week is the last level, not a mode beside it.** Levels 1–16 each teach a piece of a single
morning; level 17 asks whether you can do it five times running without emptying yourself, which is the
question the whole game is about. Before you reach it the week has no separate card at all, so the start
screen never offers two unrelated runs of mornings at once; at level 17 the campaign card *becomes* the
week, and once the ladder is finished the week returns as a standalone card you can replay. One
description of a week, in one place, in one renderer.

**Career levels are campaign rewards now.** They used to unlock by scoring a gold, which promoted you
for a good morning rather than for learning anything. Clearing the level that teaches senior traps is
what makes you a senior. One ladder instead of two.

**Every role climbs the ladder itself.** A level is the same morning whoever plays it — the same arrival
times, the same types, the same boss, the same target — but the only thing it teaches is how a trap hides
in *that role's* words, and a developer who can spot "quick PR review?" has learned nothing about "can
you just re-run the regression pack?". So the ladder is walked per role: clearing it as a developer
leaves a tester at level 1, and the career it hands out (junior → senior → lead) belongs to the role that
did the reading. The first cut shared the ladder and kept only the career per role, which meant picking
tester dropped you straight onto level 12.

What does **not** reset is anything the player earned rather than the role: stars stay at their best per
level, and a perk unlocked once is yours in every role from then on. The star count beside the ladder
counts only the rungs on the ladder in front of you, so the number always matches what you can see. Each
cleared level records every role that has cleared it, so "I did that one as a developer" is visible and
true, and a level saved before roles were recorded counts for everyone — there is no way to know who
played it, and nobody should be sent back down a ladder they have already climbed. Those saves hand out no
promotions, though: the first role to clear level 7 or 12 again earns the career for itself.
`test/campaign.test.js` holds both halves — two roles at two different rungs out of one store, and a
role-less save still counting for all five.

**The ladder is also the level picker.** Anything you have cleared stays open to play again, and stays
green whatever happens in the replay — clearing a level is a fact about you, not a score you can lose.
Levels you have not reached yet are shown but not selectable, so the strip is both your progress and
your menu.

Each level **pins its seed**, so it is a designed challenge you can learn rather than a lottery you
re-roll — fail it and you already know what is coming. Your **role is never pinned**: it changes only
wording, so the campaign plays the same for a tester as for a developer.

Every seed was found by search, not by guessing, and `test/campaign.test.js` re-checks two things on
every run:

- **every level can be cleared, in all five roles**, by a simulated player who has learned its lesson
- **no level falls to a player who has not** — level 3 must beat "respond to everything", level 7 must
  beat the same reader guessing instead of hedging, level 12 must beat trusting alarm words, and level 13
  must beat the player who delivers all five mornings by emptying themselves

### What clearing a level gives back: stars and perks

Clearing a level used to give you the next level and nothing else. Now it gives two things, deliberately
unequal. Both live in `rewards.js`.

**Stars, one to three per level, change nothing about how the game plays.** They are a reason to go back
to a level you have already cleared, and a record of how well you know it. Each star needs the one before
it, and a worse replay never takes one away.

| | A morning (levels 1–16) | The week (level 17) |
|---|---|---|
| ★ | Clear the level | Clear the level |
| ★★ | Finish on a gold | Deliver 4 of the 5 mornings |
| ★★★ | On a gold, with no traps taken and nothing urgent missed | Deliver all 5, and finish on 60 energy |

Chosen with the simulated players on every pinned morning: a perfect reader takes all three on every
level (a test holds that), a 90% reader usually stops at two, and an 80% reader at one where it clears at
all. On levels 8 and 12 a gold is already part of clearing, so the second star comes with the first. A
level cleared before stars existed counts as one.

**Perks change the rules, which is why there are five of them, and you carry one.** Clearing a level
unlocks the perk that softens the thing that level taught. Before any campaign morning you pick one, or
none. Perks never apply to the daily morning or a challenge, which have to be the same game for everyone,
or to the week, which is five mornings taken as they come.

| Perk | Unlocked by | What it does |
|---|---|---|
| ☕ Strong coffee | Level 2, Read the room | Your first 2 emergencies don't drain your focus while you are on them |
| 🎧 Spare headphones | Level 5, Headphones on | A second go: a 6-second pair, once 15 seconds have passed since the first came off |
| 🛡️ Manager's cover | Level 7, When you can't tell | The first trap you take costs 3s instead of 4.5s, and your focus survives it |
| 🙅 Polite exit | Level 8, Appraisal week | Your first 2 polite noes cost no reputation. Writing them still takes the time it takes |
| 📌 Second chance | Level 10, Release day | The first emergency you miss costs no reputation, and the escalation still comes back |

Each is held to three things in `test/rewards.test.js`: it may not narrow the gap between reading the
messages and not reading them by more than 12 points at any career level, no campaign level may fall to
a player who has not learned it just because they carry one, and every perk has to be worth at least 20
points to **the player whose mistake it softens** — the polite exit is worth 104 points to a reader who
hedges when they cannot tell, and nothing at all to one who never says no.

**The first idea was more headphones as the levels went on, and the simulated players ruled it out.**
Headphones block exactly the traps a player who doesn't read would fall into, so every extra pair protects
not reading:

| Answers everything without reading (junior, gold rate) | 1 pair | 2 pairs | 3 pairs | 4 pairs |
|---|---|---|---|---|
| | 6% | 18% | 51% | 80% |

A reader who got every message right stayed at 98% throughout. The rewards would have been paying people
to stop reading. So the rule came first, and each perk was tuned until it passed:

- a perk may narrow the gold-rate gap between a 90% reader and a player who answers everything unread by
  **at most 12 points**, at any career level
- it must be worth **at least 20 points** to an 80% reader, or nobody would notice picking it
- **no campaign level may fall** to its naive player while that player carries it, however they time
  their headphones

Every perk failed the first time. Three emergencies of coffee let "respond to everything" clear Release day,
and two don't. The cover over at the 1.1s floor cleared it too, while keeping only your focus was safe but
worth 13 points. A second full pair of headphones narrowed the gap by 23 points at junior. Two pairs
back to back over the finish also cleared Appraisal for a player who ignores every colleague, because on
that morning blocked chat can't cost you reputation. A 10-second spare with a wait still narrowed the gap
by 14, so the spare is 6 seconds.

| Perk (final) | Worst gap narrowing | Worth to an 80% reader | Levels that fall |
|---|---|---|---|
| ☕ coffee ×2 | 8 points | +43 | none |
| 🎧 6s spare, 15s wait | 6 points | +24 | none |
| 🛡️ cover at 3s | 2 points | +35 | none |

`test/rewards.test.js` re-checks all three rules on every run, trying the spare pair at every sensible
pair of times. The numbers behind each perk are written next to it in `TUNING.PERKS` in `core.js`.

The week level is checked differently from the rest, because it has to be: a week is the player's own
rather than a pinned seed, so it is played across eight of them and has to clear most and fail all when
played badly.

A level nobody can pass is a wall; a level a naive strategy clears teaches nothing. Both are easy to
create by accident with a tuning change somewhere else, which is exactly what that file is for.

## Bought time: what a run of right calls is worth

Reading well had only ever been rewarded by what it *saves* you — no reputation lost, no call taken —
and avoiding a loss is a much weaker feeling than being handed something. Twelve right calls in a row
banks **5 seconds**, spent automatically on your next interruptions, down to a floor.

Both numbers were set by the simulator, and both fights are worth recording.

**Adding the seconds to the end of the morning does not work.** It is the obvious design and it is
backwards: a longer morning means the backlog you were carrying at noon now expires instead of being
saved by the bell. Messages lost before they could be read went from 3% to 14%, and a first-timer's gold
rate *fell* from 62% to 52% the more time they won. A reward that punishes you for earning it is worse
than no reward. Spending the seconds on interruptions instead can't cost anyone a message.

**Five seconds is an enormous gift.** An urgent call is 1.6 seconds and a trap is 4.5, out of a morning
that is only sixty. Behind a short run, the bonus went to everyone: answering every message blindly went
from 43% gold to 88%, and a reader who fell for every trap at senior went from 7% to 21%. Giving back
working time pays off exactly the mistake the game is about.

The fix was not to shrink the gift but to put it out of reach of anyone making that mistake — **a trap
taken ends the run**, so a long run excludes those players and leaves a good reader untouched:

| Run required | Gift | Reading beats answering-everyone by | Falls-for-every-trap reaches gold |
|---|---|---|---|
| *no bonus* | – | 52 points | 7% |
| 4 | 5s | **11 points** | **21%** |
| 8 | 5s | 52 points | **13%** |
| **12** | **5s** | **55 points** | **8%** |

A morning at full marks earns it every time, a strong reader about two mornings in three, a shaky one
about a quarter. Two smaller rules keep it honest: the bank never pays for a trap, and it can't discount
an interruption below a floor — without that floor, handling an emergency yourself became as cheap as
having a colleague take it, and colleague favours stopped paying. `test/timebank.test.js` holds all of it.

## Saying no: a third option

For a long time there were two answers to a notification, and once you knew the tells there was only
ever one *right* one — respond to what's urgent, ignore the rest. That makes a fine execution test and
a poor decision: the answer is always knowable, so after a dozen rounds the game stops asking you
anything. **Say no** exists to make the messages you *can't* read into a decision instead of a coin flip.

| | Reputation | Time | Comes back? |
|---|---|---|---|
| Respond to something urgent | **+8** | a call, and the focus it costs | no |
| Ignore something urgent | **−15** | free | yes, as an escalation from your boss |
| Say no | **−4**, always | a moment to write it | no |

Saying no is never the best answer and never a disaster. That's the whole design: it's much the
cheapest way to be *wrong*, so knowing that you don't know is worth something. Two rules keep it
honest — the cost is identical for every type of message, and so is the line shown while you write it,
or saying no would be a way to *ask the game* what a message was instead of deciding without knowing.

The simulated players in `bots.js` are what set the price (`npm run sim`, section 6). A reader who can
always tell never touches it. A reader who is unsure a fifth of the time goes from **57% to 85% gold**
using it about twice a morning. Saying no to everything ends in a PIP — the reputation cost compounds,
and the small pause each time wrecks your focus as surely as any call.

<details>
<summary>What didn't work: parking a message for later</summary>

The other verb tried here was **park it** — put a message down now and let it come back later, bigger.
The simulator killed it. A message is only worth parking when the inbox is deep enough to be costing
you focus, and that only happens in the last twenty seconds of the morning — by which point there is no
"later" left to park into. Every version was used about half a time per morning and moved the gold rate
by a point, which is a button rather than a decision. It's a good verb for a longer horizon, so it may
come back with the work week: *park it till tomorrow* is a decision worth having.
</details>

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

## Challenge links

The daily morning is for the whole team. A **challenge** is for one person: finish a practice round and
send that exact morning on, with your score in the link for them to beat.

```
9 to 9 · a challenge from 💻 Senior Developer
🥇 1840 to beat on this exact morning
🧐 Boss of the day: The Micromanager
Same seed, same interruptions, same three hours. Good luck.
http://…/#c=1.1ps9wxb.1.1.0.mk.1.mfn
```

- **The whole challenge is in the link.** The seed, the role and career level it was played at, the
  variant and the score — about 24 characters. Nothing is stored, there is no account, and a challenge
  works on a static host with no back end.
- **It rides in the fragment**, after the `#`, which browsers never send to a server. The play stats
  hear only that *a* challenge was made or opened, never which one.
- **The same morning for both players.** The recipient's game is rebuilt from the seed: the same boss,
  the same office events, the same interruptions at the same moments. Only the wording of individual
  messages can differ, because practice rounds deal recently seen messages last and the two players
  have seen different ones — what each message *is* and *when* it lands is fixed by the seed, so the
  two scores compare.
- **Played at the sender's role and level**, for that round only: your own choices on the start screen
  are untouched, and a level you haven't unlocked opens for the challenge without granting a promotion.
- **Beat it and you can send it straight back** with your score on it, which is the loop worth watching.
- **Never the daily morning.** A link to today's morning would hand the recipient the one thing the
  daily has going for it, so the challenge button appears on practice results only.

A mangled link — truncated by a chat app, a character eaten — fails a checksum and is ignored, so the
game never plays a random morning while claiming it was the challenge.

## The work week

**This is level 13, the last rung of the campaign** — it has no separate entry point until the ladder is
finished, and then it becomes freely replayable.

A single morning has no tomorrow, so there is never a reason not to spend everything you have: hold the
button every second, take every call, answer nobody at home. **The week exists to put a price on that.**
Five mornings — one of each kind, Monday always an ordinary one — on one set of meters, about five
minutes end to end.

- ⚡ **Energy** is spent by the very thing that wins a morning. Deep focus is tiring, and so is being
  pulled into calls. The night gives back a fixed amount, never quite enough to cover a hard morning.
- 🏡 **Home** is spent by leaving the people outside work unanswered, and by the mornings you had to
  stay late to finish. A week guarantees a couple of messages from outside work each morning, so this
  is a decision you can plan around rather than a coin flip on the message pools.

**Only energy touches the rules of a morning**, and only in one way: tired people build focus slower,
lose it faster, and past a point cannot reach deep work *at all* — the top gear is simply gone. Home
never touches a morning. It decides how much of your energy the night gives back, so neglecting it
doesn't make any single morning harder, it makes every morning after it harder to recover from. One
lever on the loop, one lever on the week, instead of two things fighting over the same numbers.

Between mornings you get the evening: what the day cost, itemised, so you can see which of your own
choices is being charged for rather than watching a bar move.

```
habit                         Fri energy  Fri home  delivered   points   most common verdict
Push flat out, ignore home             6        22      4.6/5     8501   burnt 98%
Push flat out, answer home            36        98      3.8/5     7901   hero 88%
Pace it, ignore home                  40        23      4.7/5     6986   burnt 99%
Pace it, answer home                  58        98      3.8/5     6976   hero 89%
```

The week is judged on two axes and never one number, because the whole point is that what you delivered
and what it cost can come apart. The most *points* come from the week that ends with nothing left — and
that week is scored "Delivered. At a cost." Keeping a life costs about three quarters of a delivery a
week; that trade is the mode. `npm run sim` section 8 is the check, and `test/week.test.js` fails if
pacing ever stops paying or if answering home ever becomes free.

The one thing it took to get there: slowing the climb to deep work wasn't a real cost. The simulated
weeks hit the same targets on an empty tank until exhaustion started removing the top gear outright.

## Day types: what the morning is FOR

The rules never change. What changes is what the morning is for, and that turns out to be enough to
change how you play it. Which kind you get comes from the seed, like the boss, so everyone shares it
on a daily morning — and it's named on the card before you play, because a day type you only discover
afterwards is just bad luck.

Each number below is what the day asks of a **lead**; a junior is asked for 85% of it and a senior 90%
(see the career ladder above).

| | | Asks a lead for | What it changes |
|---|---|---|---|
| 🗓️ | **A normal morning** | 100%, 70 rep | The mix you already know |
| 📋 | **Appraisal week** | 80%, **88 rep** | Everyone is watching: unanswered small talk now costs you too |
| 🗃️ | **Backlog day** | **105%**, 70 rep | No deep end at all — flow multipliers gone, the work pays flat and fast |
| 🏠 | **Working from home** | **105%**, 70 rep | Half the interruptions, and focus builds slower and drains faster |
| 🚀 | **Release day** | 95%, 70 rep | Mostly real emergencies, and they count double both ways |

**The test that matters is whether the best way to play changes.** If one strategy won every kind of
morning, day types would be scenery. `npm run sim` section 7 puts two of them side by side — *reading*
(answer what's urgent, ignore the rest) against *answering* (reply to everyone but traps):

```
player                          🗓️ normal  📋 appraisal  🗃️ backlog  🏠 wfh  🚀 release
instant: READING the messages        95%           32%         92%     93%        85%
instant: ANSWERING all but traps     45%           90%         28%     81%        52%
first-timer, every day alike         62%           12%         56%     76%        57%
first-timer, answers everyone        46%           36%         32%     70%        44%
```

Appraisal week inverts it completely: the play that wins an ordinary morning is the worst one there,
and the reverse. The bottom two rows say the same is true for a person and not only for a bot — someone
who adapts to the day triples their gold rate on an appraisal morning. A test (`test/days.test.js`)
fails if that inversion ever disappears.

Every day type is only a short list of overrides on the existing knobs, resolved once into `s.rules`
when a game starts. Nothing in the loop asks what kind of day it is, so a day type can't grow into a
special case, and one balance pass covers all of them.

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

The desk is **folded away** behind one line — "4 of 10 unlocked 🗒️ 🪴 🏆 🎧" — and opens to the full
list, **two to a row** on a phone: emoji and name on the top line, what it unlocked underneath across the
whole card. Ten cards one per row was a page of scrolling between you and the button that starts a
morning.

## Graphics: the illustrated office

The room is lit, not flat-filled. The wall carries a gradient that falls away from the window, the
floor has a skirting line and everything on it has a contact shadow, a shaft of daylight crosses the
desk with dust turning in it, the monitor throws its own light back onto the desk, and a vignette keeps
the eye on the middle. All of it is still reactive: the wall warms and the shaft sharpens as the clock
runs to noon, the monitor glow turns gold in deep work and red in an outage, and the daylight fades out
altogether during a fire drill when everyone has left the floor. Still no image files.

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

Every role has a large pool of messages at every level:

| Per role | Urgent | Traps | Small talk | Total |
|---|---|---|---|---|
| 🌱 Junior | 28 | 24 | 21 | **73** |
| 🚀 Senior | 28 (same as Junior) | 25 | same as Junior | **74** |
| 👑 Lead | 28 | 24 | same as Junior | **73** |

About 57% of what a role hears is its own work; the rest reaches everybody — HR, IT, facilities,
finance, legal, the front desk. Those shared pools are the cheapest honest way to deepen the game: one
message written there is one message added for **all five roles**, where a role-specific one is a fifth
of that. They follow the same tells, so they are split by level where the tell differs — shared traps
minimise at junior, go politely open-ended at senior and shout at lead.

Messages are dealt like a shuffled deck (`dealer` in `core.js`): a round never repeats a message while
unseen ones remain, and practice rounds and the work week put messages you saw recently at the bottom of
the deck. The daily morning and a challenge ignore that history, so they stay identical for everyone who
plays them. Which messages you get never changes *when* they arrive: the rhythm has its own random
stream, so adding content can't alter the balance.

**What was wrong, and how it was found.** A round never repeating itself was never the problem. Five
rounds in a row was — which is exactly what the work week asks you to play, and the week carried no
memory from one morning to the next. Measured over a week: **89 messages dealt, 45 of them distinct, and
one message turned up on all five mornings.** Each pool was about two mornings deep (a morning dealt 47%
of the urgent pool), so by the third morning everything was a rerun however well any single round was
dealt.

Both halves were fixed: the pools got deeper, and the week carried its history the way practice rounds
always did.

**It came back, because the campaign had the same hole.** A campaign level pins its seed so the challenge
is learnable — which meant a level you retried five times showed you the same twenty messages five times,
and the campaign passed no history at all, so six junior levels dealt 114 messages of which only 51 were
distinct. Campaign rounds now carry history too. Because history changes only WHICH text is dealt, never
when it arrives or what type it is, a retry is the identical challenge that simply reads differently.
The same six levels now deal 73 distinct messages out of 114, and messages seen three or more times fell
from 21 to 9. The same week now deals **56 distinct messages out of 89 — the whole pool,
which is the ceiling** — and across any three mornings in a row nothing comes round twice.
`test/variety.test.js` holds both: no message twice in three consecutive mornings, no morning eating
more than a third of any pool, and a week showing you at least 90% of what you have.

## Career levels

Once you've learned that "quick" means trap, the game gets easy. Career levels keep it hard: as your
career grows, traps stop giving themselves away. The rules and timing never change, only how well a trap
hides, and so which reading skill each level tests.

| Level | Traps look like | Urgent looks like | What you have to read for |
|---|---|---|---|
| 🌱 Junior | "Quick call? 2 mins" | "PROD down. Join the bridge NOW" | the minimising word |
| 🚀 Senior | "Whenever you get a moment, thoughts?" | same as junior | is anything actually wrong? |
| 👑 Lead | "URGENT: need estimates for next quarter" | "Checkout errors climbing since your deploy" | what's broken, and who's waiting |

- Levels unlock by clearing the campaign level that teaches them: level 7 for 🚀 Senior, level 12 for
  👑 Lead. They used to unlock by scoring a 🥇, which promoted you for a good morning rather than for
  learning anything. Pick your level on the start screen; locked ones say how to unlock. (`?dev` unlocks
  everything.)
- **A promotion is the role's, not the account's.** Clearing level 7 as a developer makes you a senior
  developer; a tester starts at 🌱 Junior, on level 1 of its own ladder, until a tester clears it.
- **Each role names the rungs itself.** The ladder is the same three steps, but the jobs are not
  interchangeable: a promoted manager is a 👑 **Director**, not a "lead manager", a tester becomes the
  **QA Lead** and a support engineer the **Support Lead**. `TITLES` in `content.js` holds a short `rank`
  for the picker chips — three of them sit side by side on a phone — and the full `title` for share text,
  promotions and personal bests.
- The daily morning has the same rhythm at every level; the share text says who played it
  ("🧪 Senior Tester", "🧭 Director").
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

## What you misread

A score tells you that you got it wrong. It does not tell you what you could have seen. Every round now
ends with **up to three of your wrong calls, each quoting the message and naming the tell in it**:

> 🪤 **You took one that shouted** — Legal: *"Priority: compliance sign-off needed today"*
> It shouted "priority". At lead the loud ones are the traps, and the real emergencies are calm.
> Leave it. It comes back once, and it is still not quick.

Three rules keep it honest and keep it teaching:

* **Only messages you got wrong are ever explained.** Naming the tell in one you read correctly would
  spoil a message you had already earned.
* **The word it quotes is found in the message**, not assumed from your career level — a senior trap
  gives itself away by nothing being broken at all, so for those it quotes nothing and says that.
* **A second lesson beats a third example of the first.** Four emergencies missed and one trap taken is
  two lessons, so the trap is shown before a third missed emergency.

Worst first: an emergency left to burn, then an hour lost to a trap, then a polite no to something real.
The wrong calls are recorded separately from the share grid on purpose — `stats.decisions` carries
verdicts only, so sharing a morning can never spoil its traps for whoever reads it, and a test holds
that. The rules live in `review.js` and `test/review.test.js`.

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
| `test/days.test.js` | Day types: that the best way to play really does change with the morning |
| `challenge.js` | Challenge links: packing a morning and a score into a URL fragment, and reading it back |
| `week.js` | The work week: what a morning costs you, what the night gives back, and how a week is judged |
| `campaign.js` | The seventeen levels, what each one asks for, and which of them promote you |
| `review.js` | "What you misread": the wrong calls from a morning, each with the tell that gave the message away |
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

- Colleague favours: answer someone's small talk now, cash in their help during an outage later
- Park a message until tomorrow — the verb that had no room in a single morning now has a week to land in
- Wire it into one full day loop (Morning → Work → Evening → Night)

If it doesn't prove fun after 30 rounds, that's the most valuable result this prototype can give —
it means redesigning the core mechanic before building a game around it.
