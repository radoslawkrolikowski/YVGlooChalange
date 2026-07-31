# Round – V4 Practical Clips: Screen Recording Guide

Everything you capture yourself from the real app: the seven filmed clips, the
still screenshots that become panes inside the AI clips, and the demo tail.

**The rule the filmed clips exist under:** anything showing a screen without a
face is filmed practically. Real hands beat AI hands; real screens beat rebuilt
ones.

### Filmed — a real phone in real hands, on camera

| Clip | What's on screen | Length |
|---|---|---|
| 6 | Ada's reply, naming her | 7s |
| 7 | Translated message, Show original toggle | 6s |
| 8b | Pre-reading prompts → passage → highlight | 8s |
| 9 | Passage open beside the paper Bible | 6s |
| 10b | Composing and sharing a reflection | 5s |
| 14 | A shared prayer request and its count | 5s |
| 15 | The digest's "Shared ground" block | 7s |
| — | Demo tail | ~40s |

### Screenshots — stills that become panes inside the AI clips

No camera, no hands. Device screenshots, taken in the same session as the filmed
clips, then finished in Canva and dropped over the AI footage as a static overlay.

| Clip | Screenshot needed | Crop |
|---|---|---|
| 4 | Messages app — incoming text and link | Full screen |
| 11 | Circle thread — Ada's message | Single bubble |
| 12 | Circle thread — Marcus's reflection | First line only |
| 13 | Circle thread — João's message, Portuguese original | Single bubble |
| 18 | Messages app — the same text, outgoing | Full screen |

See **Part 5**.

---

# Part 1 — Stage the app before you record

**Do this first. Three of the seven clips cannot be shot without it** — the demo
circle does not contain the states they need, and you can't fake them on the day.

Live app: **https://yv-gloo-chalange.vercel.app**
Demo circle id: `0d397fef-1677-4445-b879-47977b5f4344`

## What the demo circle actually contains right now

Verified against production. Five messages, nothing else:

```
message     Ada      "Hi everyone! I'm Ada…"
reflection  Ada      Psalm 1 reflection
reflection  Marcus   Psalm 1 reflection
starters    Round    discussion questions
digest      Round    with the "Shared ground" block
```

**No icebreaker. No translated message. No prayer request.** Those three have to
be staged.

## Refresh the demo data first

So the digest is same-day and the thread looks current:

```
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://yv-gloo-chalange.vercel.app/api/cron/daily
```

**This sweep also prunes anonymous session data.** Run it *before* you stage
anything, never after — it will delete the staging you just did.

## Session A — hers, the one you record

This is the session on camera for every clip.

1. Open the app, tap **Instant Access**
2. In onboarding, **set the display name to "Anna"** — clip 6 depends on this,
   Ada will address her by whatever name is set here
3. **Keep the language English.** Do not switch her to Portuguese; it would
   change her Bible version to BLT and break continuity with clips 8b and 9
4. **Pick the reading plan "Psalms in 30 Days."** A fresh session has no plan and
   `/read` shows *"Nothing to read yet"* — clips 8b, 9 and 10b all need this
5. Join the public demo circle

**Leave this session open and untouched for the whole shoot.** It's anonymous —
its state lives in `sessionStorage` and it dies with the browser tab.

## Session B — the second person, incognito window

Used only to stage things Anna must *receive*. Never on camera.

1. Incognito window, **Instant Access**, name it **"João"**
2. Join the demo circle
3. **Post a message in Portuguese** — this is what clip 7 records. Something
   ordinary, e.g.
   *"Também parei nessa mesma linha. Li três vezes antes de entender."*
4. **Create a prayer request and share it with the circle** — this is what clip 14
   records. Prayer tab → write a request → **Share with circle** → confirm

## Warm-up pass before rolling

Back in **session A**, open the circle thread once and wait. Two things resolve
in the background on first view:

- **Ada replies to any message posted in the thread.** If you want her reply
  addressing Anna by name for clip 6, post something short from session A first,
  then wait ~20s and refresh
- **Translations backfill into the reader's language.** João's Portuguese message
  will show *"Translating…"* on first view, then render in English with the
  **"Translated by Round"** label on a later poll. **Wait for it to resolve
  before recording clip 7**

Give it a minute, refresh, and confirm all three staged states are visible before
you start filming.

---

# Part 2 — Capture setup

**One phone, one orientation, one colour scheme for every clip and the tail.**
Switching mid-shoot changes the status bar and safe-area insets, and every shot
after that point stops matching.

Before rolling:

- **Do Not Disturb on.** One notification banner ruins a take
- **Lock screen brightness manually.** Auto-brightness drifts mid-take and there
  is no fixing it in post
- Neutral clock time, kept consistent across every recording
- Native device resolution, 60fps. Wired capture via QuickTime beats on-device
  recording — cleaner file, no recording indicator

While rolling:

- **Hold one full second of stillness before and after every tap.** Those frames
  are your only cut points
- **Scroll at half the speed that feels natural.** Fast scrolling reads as frantic
  and gives motion tracking nothing to lock to
- **Fingers off the glass** except during an actual gesture — clip 8b's selection
  is the one exception
- **Record everything three times.** They cost nothing and you will want options

## Filming the phone in-hand

- **Angle the phone 10–15° off perpendicular** — you, the camera and the light
  will all reflect in the glass otherwise. Wear dark clothing, keep the source
  off-axis. A polariser helps
- **Watch for banding.** Camera shutter beating against the display refresh gives
  rolling dark bars. Start at 1/60 or 1/50, check playback at 100% before
  committing to a take

## Framing rule

**Frame tight.** If the shot holds *hands, phone, one surface*, that is the entire
list of things that has to match the AI clips. No room, no wall, no furniture, no
face. **Clip 9 is the only exception**, and even there, crop to the surface.

**Aspect ratio — these are shot portrait and stay portrait.** They sit inside the
16:9 edit as pillarboxed strips with black either side, matching the demo tail's
vertical-in-16:9 treatment. Do not try to reframe for landscape on the day; the
conform happens in the edit. See **Part 6** for the rules, which apply to every
practical clip without exception.

## Continuity with the AI clips

- **Hands:** no rings, no watch, no bracelet, no nail polish
- **Sleeves pushed to mid-forearm** for clips 8b, 9, 10b, 14, 15. Clip 7 keeps the
  coat sleeve — she's still on the bus
- **Match the light direction to the approved AI clips.** If the AI bedroom lights
  from camera-left, yours does too. Wrong direction reads as a continuity error;
  wrong colour temperature is just a grade fix
- **Shoot these after the AI clips are approved**, and grade practical to AI,
  never the reverse

---

# Part 3 — The clips

## Clip 6 — Ada's reply · 7s

**Frame** — Over the shoulder, phone and hands only, head out of frame. Her lap
and coat fabric visible.

**Light** — Bus, morning, overcast. Cool, soft, one diffused source at ~45° from
one side, no fill. Ambient low — **the screen is the brightest thing in frame.**
No warm sources at all.

**Staged beforehand:** Anna has posted a short message; Ada has replied,
addressing her by name.

**Actions:**
1. (0.0–1.5) Thread is open, mid-scroll
2. (1.5–3.5) Scroll slows and stops, revealing Ada's reply — it uses Anna's name
3. (3.5–5.5) Still. The message is read
4. (5.5–7.0) Small scroll back up — she reads it a second time

**The scroll must *reveal* the message, not open on it.** The text has to be
genuinely readable — that legibility is the whole reason this is filmed rather
than rebuilt.

---

## Clip 7 — Translation toggle · 6s

**Frame** — Over the shoulder, phone and hands only, head out of frame.

**Light** — Bus, cool, one notch brighter than clip 6.

**Staged beforehand:** João's Portuguese message is in the thread and has finished
translating into English for Anna's session.

**Actions:**
1. (0.0–1.5) João's message is on screen, rendered in English, with the small
   **"Translated by Round"** label beneath it
2. (1.5–2.0) Thumb taps the **Show original** text-link
3. (2.0–3.5) The body swaps **immediately** to Portuguese; the link relabels to
   **Show translation**. Beat
4. (3.5–4.0) Taps again
5. (4.0–5.5) Swaps back to English
6. (5.5–6.0) Hold

**There is no press-and-hold.** It is a plain instant tap-to-swap, twice. If the
message still reads *"Translating…"*, the backfill hasn't finished — wait and
refresh rather than recording it.

---

## Clip 8b — Prompts, passage, highlight · 8s

**Frame** — Hands and phone, slight top-down. Duvet beneath.

**Light** — Warm-neutral, soft, single window direction. The screen now roughly
matches ambient rather than beating it.

**Actions:**
1. (0.0–2.0) `/read` has just loaded. A brief **"Preparing your prompts…"**
   shimmer plays under the **"Just for you"** header, then 2–3 short prompts
   populate. **The card is already open — it does not need expanding**
2. (2.0–3.5) Thumb scrolls down past the prompts card to the passage. The version
   chip is visible beside the reference
3. (3.5–5.5) **Long-press** a word partway through the passage, then drag the
   selection handles to extend across one full line
4. (5.5–6.5) A small **"Highlight"** pill button with a highlighter icon appears
   floating just above the selection
5. (6.5–7.5) Thumb taps that button. The selection clears and the phrase washes
   into the highlight colour, staying marked
6. (7.5–8.0) Thumb lifts. Hold on the highlighted line

**This is not a drag-to-highlight.** The drag only makes a text selection —
nothing is marked until the Highlight button is tapped. Fingers on the glass are
fine here and nowhere else.

**Highlight a line later in Psalm 1** than the one she couldn't get through in
clip 2 — by morning, with help, she reads further into the same passage than she
managed at night.

---

## Clip 9 — Both books open · 6s

**Frame** — Two-shot: paper Bible and phone flat, side by side, both readable.
**The one wider frame in the practical set.** Crop to the surface — books, hands,
an edge of duvet or table, nothing above.

**Light** — Identical setup to 8b, a touch brighter. **Shoot back to back with 8b
without moving anything.**

**Actions:**
1. (0.0–1.5) Phone flat on the duvet, passage open, static — no interaction
2. (1.5–3.0) Her hand enters frame and picks up the paper Bible
3. (3.0–4.5) She opens it flat beside the phone
4. (4.5–6.0) Both hands withdraw. Two open books, held

**The hinge of the film.** Same passage on both, version chip visible on the
phone. Hold the two-open-books frame a beat longer than feels necessary — Round
does not replace Scripture, it gets her back to it, and this is the only shot
that says so.

---

## Clip 10b — Reflection · 5s

**Frame** — Hands and phone. The banner visible above the keyboard.

**Light** — Same direction as 8b, one more notch up. Curtains a little wider.

**How to get into this state:** finish the reading and tap **"Finished reading"**.
That routes to the circle thread with reflection mode already primed.

**Actions:**
1. (0.0–1.0) The composer is already in reflection mode — a banner reads
   **"Reflecting on Day 1 — share what today's passage stirred in you"**, and the
   textarea placeholder is *"Share your reflection on today's passage…"*
2. (1.0–3.5) She types steadily — no hesitation, no deleting
3. (3.5–4.5) Thumb moves to the send button, which in this mode reads **"Share"**
4. (4.5–5.0) Taps. The field clears

**The button says "Share", not "Send" and not "Post".** "Post" does not exist
anywhere in the product — don't caption it that downstream either.

**Type a real sentence, not lorem.** It will be legible and it should sound like
something a person would actually write at that moment.

---

## Clip 14 — Prayer request · 5s

**Frame** — Over the shoulder, phone and hands, minimal desk beneath.

**Light** — Day, bright.

**Staged beforehand:** João's prayer request has been shared to the circle.

**Actions:**
1. (0.0–2.0) Scroll reveals the shared prayer request — **"Prayer request"** label
   with a praying-hands icon, the author's name, their words
2. (2.0–3.5) Scroll settles. The count line beneath is legible: *"3 people prayed
   for this"*
3. (3.5–5.0) Stillness. Hold on the count

**No tap, no interaction.** **The count line is the entire point of the shot**: a
request is prayed for by a number, never by a name, so nobody can see who did or
did not pray. Frame the scroll so that line is unmistakably legible — it is the
only thing in the shot doing work.

---

## Clip 15 — The digest · 7s

**Frame** — Both hands, framed chest-down, standing. Soft background, no surface
needed.

**Light** — Day, near a window or outdoors. Bright, cooler daylight, more ambient
fill. **The screen is now dimmer than its surroundings** — that inversion is the
film's light arc completing.

**Actions:**
1. (0.0–2.0) The digest card is open, labelled **"Daily digest · Day 1"**.
   Scrolling slowly through the synthesis paragraph
2. (2.0–3.0) Scroll stops on the **"Shared ground"** block — a gold-tinted panel
   with small round avatar chips, and beneath them the phrase **"landed on the
   same thread — [theme]"**
3. (3.0–5.0) Held completely still. Both the chips and the phrase legible
4. (5.0–6.0) Small scroll up — the line is read again
5. (6.0–7.0) Still. The phone lowers very slightly

**The most important text in the film.** The "Shared ground" block must be legible
for a **minimum of two seconds** — chips *and* phrase, not just one. It is the one
output a judge will not have seen in any other submission. **Record it three times
and pick the steadiest.**

Note: the chips currently name **Ada and Marcus**, not Anna. Getting her name into
the digest would require her reflection plus a fresh day's Facilitator run.

---

# Part 4 — The demo tail · ~40s

Runs after the end card. **Hard cut, no music, no voiceover.** Its only job is to
prove the product is real and works — judges have seen a lot of beautiful videos
attached to nothing. The silence is deliberate: it signals a gear change from film
to evidence.

**Clean screen capture, not a filmed phone.** The "Shared ground" block and the
version chip are small type; filming a screen costs the resolution that makes them
readable. A hard cut from warm bedroom to pixel-perfect capture *is* the gear
change.

Optional 2-second bridge: her hand setting the phone down, then cut.

| Time | Show |
|---|---|
| 0–5s | Landing page → **Instant Access** → straight into the app. No sign-up wall |
| 5–11s | Language + version picker. Select **Spanish**, then **RVES** |
| 11–17s | **Pre-reading prompts** expand, then the passage in Spanish, version chip visible, **Open in Bible App** button in frame |
| 17–23s | Drag-highlight a line, finish the reading, **conversation starters** appear in the thread |
| 23–29s | Share a reflection (button reads **"Share"**) → thread → a **translated message** with the **Show original** toggle |
| 29–35s | The **digest**'s "Shared ground" block, and the **lesson summary** expanded |
| 35–40s | **Prayer** tab: a shared request showing a **count** and no names |

**Captions, not narration.** Small lower-third labels so a judge watching on mute
still tracks it: *Instant Access — no account* · *Passage live from YouVersion* ·
*Pre-reading prompts — Gloo* · *Translated by Round* · *Daily digest — Facilitator
Agent* · *Prayed for by a count, never a name*.

**Vertical capture in a 16:9 timeline** leaves empty columns either side. Put the
captions there — it uses the dead area and looks deliberate.

## Two things that will bite you

**Version licensing.** Only one version per language is licensed to this app key —
**BSB** (English), **RVES** (Spanish), **BLT** (Portuguese). The others appear in
the picker disabled. **Pick a licensed one on camera.**

**The Agent Console is 404 in production.** `/dev/agents` is gated off the live
deployment by design. It is the strongest evidence shot available — every agent,
its prompt, the routed model, the log row — so record it from a **local dev
server** (`npm run dev`) or a **preview deployment**, where the gate is open.
Budget 8 extra seconds and put it at the very end.

---

# Part 5 — Screenshots for the panes

Clips 4, 11, 12, 13 and 18 are AI-generated with the phone screen turned away from
camera. The screen content is added afterwards as a **static image floating beside
the phone** — designed in Canva, dropped in as a fixed overlay, faded in and out.

These are **still screenshots, not video.** Take them on the same device, in the
same session, right after you finish the filmed clips — the thread will already be
staged exactly as you need it.

## How to capture

- **Device screenshot**, native resolution, full screen. Do not crop
- Same phone, same orientation, same colour scheme as everything else
- Same neutral clock time in the status bar
- Save as PNG

## What to capture

### Clips 11, 12, 13 — the circle thread

**Three different screenshots, not one scrolled.** Each shows a different point in
the thread, so the three locations in the montage don't appear to be looking at an
identical screen.

| Clip | Scroll so this is the visible message |
|---|---|
| 11 | **Ada's** message — *"Hi everyone! I'm Ada…"* |
| 12 | **Marcus's** reflection on Psalm 1 |
| 13 | **João's** Portuguese message, showing the **original**, not the translation — tap *Show original* first so the Portuguese is what's captured |

Clip 13 showing untranslated Portuguese is deliberate: it's the one frame in the
montage that says the circle is genuinely multilingual, without needing the label.

### Clips 4 and 18 — the messages app

Not Round. A real phone messages screen, so the bubble styling is authentic.

| Clip | What to capture |
|---|---|
| **4** | **Incoming** message from a contact named **Priya**, no photo: *"This one's different."* with a link preview card beneath showing the Round URL |
| **18** | **Outgoing** — the same text and link, right-aligned, *"Delivered"* small beneath it |

The two must be the **same words and the same link**. She sends on exactly what
she received — that's the film's closing rhyme, and it only lands if the bubbles
match.

Send yourself the message from another number, screenshot the incoming state for
clip 4, then screenshot the outgoing state on the sending device for clip 18. If
that's awkward, build both in Canva from scratch — the styling is simple and Canva
renders text correctly.

## Finishing them in Canva

- Canvas **1080 × 2340px**, phone-screen ratio
- For clips 11–13, the real screenshot **is** the base layer — edit only what you
  must, so the typography and spacing stay exactly as the product renders them. A
  judge who opens the live app will compare
- Export **PNG with a transparent background**, soft drop shadow baked in at
  export using Canva's built-in shadow effect
- **Opacity 90–95%** when placed — "a bit transparent" fights the legibility
  you're buying

## Placing them

- Fixed position, offset **above or beside** the phone in the AI shot, never on
  top of the device itself
- **Fade 6 frames in, 6 frames out**, timed to when her eyes go to the phone and
  away from it. Exact timings per clip:

| Clip | Length | Fade in | Fully visible | Fade out | Visible for |
|---|---|---|---|---|---|
| 4 | 8s | 2.0 | 2.25 → 6.0 | 6.0 | **3.75s** |
| 11 | 4s | 0.8 | 1.05 → 3.4 | 3.4 | **2.35s** |
| 12 | 4s | 0.8 | 1.05 → 3.4 | 3.4 | **2.35s** |
| 13 | 4s | 0.8 | 1.05 → 3.4 | 3.4 | **2.35s** |
| 18 | 6s | 1.5 | 1.75 → 3.5 | 3.5 | **1.75s** |

  Below about two seconds of full visibility a short message cannot be read.
  Clip 18 is deliberately shorter — the audience already read that exact message
  in clip 4, so it only needs recognising
- Same corner, same scale, same fade **every time**. First appearance is clip 4 —
  it sets the grammar. If the first pane a viewer sees turns up at clip 13, it
  reads as a patch rather than a language
- No motion tracking. If the phone moves noticeably, reposition with two or three
  manual keyframes

---

# Part 6 — Conforming portrait clips into the 16:9 edit

The practical clips were shot **portrait** on an iPhone; the AI clips are 16:9.
Cropping portrait to 16:9 keeps only about **32% of the frame height**, which
loses content on the shots where the action is spread vertically (8b's selection
and Highlight button, 10b's banner and Share button).

**The decision: keep them portrait and pillarbox — black bars either side.**

This is not a fallback. The demo tail was always going to be vertical inside a
16:9 frame with captions in the side columns, so the film already ends in this
language. Using it for the practical clips makes the whole film coherent: **every
time you are inside the phone, the frame narrows.** That reads as a device.

## Rules for the pillarbox

- **Pure black, never a blurred backdrop.** Blur is social-media grammar and
  reads as a conform mistake. Hard black edges read as chosen — and the film
  opens in near-darkness anyway, so black is already in the palette
- **Identical width on every clip.** 6, 7, 8b, 9, 10b, 14, 15 — no exceptions.
  One inconsistent frame and the audience reads all of them as errors
- **Full height, edge to edge.** Do not scale down and float the clip with margin
  on all four sides; that reads as apologetic. Filling the height reads as
  confident
- **Introduce it on clip 6**, the first practical clip and a strong beat (Ada
  naming her). Establish the device on a moment that lands and the audience
  accepts it before questioning it

## Give every pillarboxed clip a slow push-in

**What:** keyframe **Scale** from `100%` on the first frame to `103%` on the
last. One property, two keyframes, nothing else.

**Why:** the AI clips all move — clip 1 pushes in, clip 16 dollies back, most
carry at least a drift. The practical clips are locked off; nothing moves but the
scrolling. Cutting from a moving shot to a motionless one makes the motionless
one read as *frozen*, and a frozen frame sends the eye wandering — where the
first thing it finds is the black bars.

2–4% is too small to perceive as movement and enough to keep the shot alive. The
eye stays on the phone instead of going looking.

## Cut on motion at every AI → practical seam

**What:** land the cut while something on screen is moving, never during a still
moment. Clip 5 ends with her hand still travelling toward the phone; clip 6
begins with the thread **already scrolling**, not on a static screen that then
starts to scroll.

**Why:** at a cut the eye needs a moment to re-orient. If both sides are still,
it has time to inspect the frame and notice the width changed. If it is tracking
motion across the cut, it is busy following movement and the format change slips
past.

**This is why you recorded a second of stillness before and after every tap** —
that stillness is **handles**, not screen time. Trim into the motion: the first
frame of clip 6 in the timeline should be mid-scroll, with the recorded still
second sitting unused before the cut. Same at the tail. Handles give you options;
the edit throws most of them away.

## The one clip to check individually

**Clip 15.** If the "Shared ground" block ends up too small to read inside the
narrow strip, that is a real problem — it is the single most important text in
the film.

Test it first. If it is marginal, **crop into clip 15 specifically** — a tighter
horizontal band centred on the block — and accept that it is the one clip with
different framing. An odd frame beats an illegible payoff.

## What not to do

**Do not mix treatments.** Cropping some clips and pillarboxing others gives the
film a stutter more visible than either problem alone. One frame size, everything
conformed to it.

---

# Troubleshooting

**"Nothing to read yet" on `/read`** — the session has no plan. Go to onboarding
and pick "Psalms in 30 Days".

**No "Translated by Round" label on João's message** — the backfill hasn't
finished. It triggers on first view of the thread and resolves on a later poll.
Wait ~20s, refresh, check again.

**The prayer request isn't in the thread** — it was created but not shared.
Creation is always private; **Share with circle** is a separate explicit action
with its own confirmation.

**Ada hasn't replied** — she replies to messages posted in the thread. Post
something from session A, wait ~20s, refresh.

**Everything staged has vanished** — the daily cron sweep prunes anonymous session
data. Run the refresh *before* staging, never after.

**A version appears greyed out in the picker** — it isn't licensed to this app
key. Only BSB, RVES and BLT are selectable.
