# Round – V4 Colour Grading: Practical Clips to AI Clips

Done in the edit, after everything is shot and the AI clips are approved. All
seven practical clips were shot bright; the AI clips carry the film's light ramp.
**Grade practical to AI, never the reverse.**

All numbers are CapCut **Adjust** panel values. They are starting points — the
last word is the reference still sitting on the track above.

## The rule that governs every number here

**Every clip must be brighter than the one before it.** That is the spine of the
film (see the light ramp in the Cinema Studio Guide). Grade in ramp order —
6, 7, 8b, 9, 10b, 14, 15 — never clip by clip out of sequence, or the ramp drifts
and you will not see it until the whole thing is assembled.

## Setup before you touch a slider

- Export a reference still from the AI clip that **precedes** each practical
  clip: 5 before 6, 8a before 8b, 10a before 10b, 13 before 14, 16 after 15.
  Put it on the track above at 50% opacity and toggle it while grading.
- **Match hand skin tone first, room second.** Skin is what a viewer catches; a
  wall being two points off is invisible.
- Grade the clean frame, then add the pillarbox and the 100 → 103% push-in. The
  order doesn't affect the result, but grading is easier before the bars.
- Carry the grade forward: right-click clip → Copy → Paste format onto the next
  one, then nudge. Keeps the ramp coherent instead of seven independent guesses.

## The technique, and where it applies

Pull shadows and midtones down, leave highlights alone. The room lives in the
shadows and midtones; the screen lives in the highlights. Pulling the bottom of
the range down while leaving the top alone darkens everything except the screen.
One adjustment, no mask, no tracking.

If your CapCut version has **Curves**, that's cleaner: anchor a point top-right
to protect the screen, drag the lower-middle of the line down. Same effect, finer
control.

**Works — clips 6 and 7.** The bus clips are spec'd with the screen as the
brightest thing in frame. Luminance separation and the film's design agree, so
pushing it is free.

**Doesn't work — clips 8b, 9, 10b.** The bedroom clips are spec'd so the screen
roughly matches ambient. No luminance gap to exploit; pulling shadows down just
darkens the screen along with everything else. Move the whole range instead, by a
smaller amount.

**Actively wrong — clips 14 and 15.** Those want the screen *dimmer* than its
surroundings, the ramp inverting. Darkening the room fights the design.

---

## Clip 6 — bus, darkest practical, screen brightest

```
Temperature  −15
Tint          −4
Saturation   −10
Shadows      −45
Blacks       −22
Brightness   −18
Highlights    +8
Contrast     +12
Vignette      15
```

Screen wins by design here, so the shadow crush is free. **Watch the hands** — if
skin goes grey and dead, back Shadows off to −35 and take Vignette to 20 instead.

## Clip 7 — one notch up

```
Temperature  −12
Tint          −4
Saturation    −8
Shadows      −35
Blacks       −18
Brightness   −12
Highlights    +6
Contrast     +10
Vignette      10
```

Coat sleeve still in frame — same cool cast as clip 6, just less crushed.

## Clip 8b — bedroom morning, screen ≈ ambient

No luminance gap. **Do not crush the shadows.** Move the whole range down a small
amount and warm it up.

```
Temperature  +12
Tint          +3
Saturation    +3
Shadows      −10
Blacks        −8
Brightness    −8
Highlights    −5
Contrast      +5
```

Highlights go **down** here, not up — the screen has to fall with the room, or it
separates again and breaks the spec.

## Clip 9 — 8b plus a touch

Paste 8b's format, then only:

```
Shadows      −6
Brightness   −5
Highlights   −3
```

Everything else identical to 8b. These two were shot back to back without moving
anything, so any difference in temperature or tint reads as an error.

## Clip 10b — curtains wider

```
Temperature  +8       (less warm — more daylight coming in)
Tint         +2
Shadows      −3
Blacks       −4
Brightness    0
Highlights    0
Contrast     +4
```

## Clip 14 — bright day, same family as the 11–13 montage

Already bright. Don't darken it — match the montage clips instead.

```
Temperature  +3
Saturation   +3
Shadows      +5       (open, not crushed — it's a bright day)
Brightness   +2
Highlights   −3
Contrast     +5
```

## Clip 15 — brightest, screen dimmer than the room

Inverted. **Raise the room, lower the screen.**

```
Temperature  −10      (cool daylight)
Tint          −2
Brightness   +10
Shadows      +20
Blacks        +8
Highlights   −10
Contrast      −5
```

Then check the **"Shared ground"** panel at 100%, *inside the pillarboxed strip*,
not on the full frame. Lowered highlights plus lifted blacks flattens the
gold-tinted panel, and this is the most important text in the film. If the chips
or the phrase lose legibility, back Highlights off to −5 and Blacks to +4.
**Legibility beats the light arc on this one clip.**

---

## Final check

Play 6 → 15 muted, window small, and squint. Any dip in brightness means the ramp
is broken. Fix the clip that dips, not its neighbours — the neighbours are already
matched to their own AI reference stills.
