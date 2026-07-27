# Shoulder Trainer — Functional Design

## The idea in one sentence

A home-screen app with one main screen — your **timeline** — and two big actions,
**Capture Workout** and **Physio Appointment**. Capturing a workout is pre-filled
from your defaults, so a normal day is three taps: **Capture → B → Save**. Anything
that differed that day (heavier weight, fewer reps, skipped exercise) you edit
inline before saving.

## Core concepts

**Session template (A / B / C)** — a named, editable list of exercises. Each
exercise has:

- **Name** and an optional short **cue** (e.g. "elbow next to body, pull to back of skull")
- **Load** — one of four kinds, because your loads aren't all kilograms:
  - dumbbell / weight in **kg** (e.g. 7.5 kg)
  - **band by color** (e.g. red, blue)
  - **band by kg** (e.g. 20 kg band)
  - **none / bodyweight** (e.g. dead bug, stretch)
- **Default sets × reps** (e.g. 3 × 15). An exercise can instead be **time-based**
  (hold seconds) — used for the hip flexor stretch.
- Optional **video**: a YouTube link *or* a video from your iPhone (recorded on the
  spot or picked from your library).

**Workout entry** — what gets saved when you capture a workout: the date, the
session (A/B/C), and per exercise the *actual* load, sets and reps of that day, a
per-exercise **skipped** toggle, plus one optional free-text note for the whole
workout ("shoulder felt tight").

**Physio appointment** — a date plus free-text comments.

**Snapshot rule** — saved entries are frozen copies. If you later raise the
Lateral Raise default from 5 kg to 6 kg, past entries keep the 5 kg you actually
lifted. History never rewrites itself. Defaults only affect future captures.

## Screens

### 1. Timeline (home screen)

- Two prominent buttons at the top: **➕ Capture Workout** and **🩺 Physio Appointment**.
- Below, a single reverse-chronological timeline mixing both entry types:
  - **Workout card**: date, a colored session badge (A / B / C each get a fixed
    color), a one-line summary ("6 exercises, 1 skipped"), and a note indicator if
    a note exists.
  - **Physio card**: visually distinct (own color/icon), date, first line of the
    comment.
- A small counter at the top: workouts this week.
- Tap any card to open its **detail view**.

### 2. Capture Workout

1. **Pick the session**: three big buttons — A, B, C — each showing its exercise count.
2. **Review & edit screen**, fully pre-filled from the template:
   - Date at the top, defaulting to today, editable (so you can back-fill a
     forgotten day).
   - One row per exercise showing load, sets, reps — all editable with quick
     steppers (e.g. weight in 0.5 kg steps).
   - A **skip** toggle per exercise (skipped exercises are saved as skipped, not
     deleted, so you can see patterns later).
   - An optional note field at the bottom.
3. **Save** → entry appears at the top of the timeline.

Edits made here apply to this entry only — never to the defaults.

### 3. Physio Appointment

Date (default today, editable) + multiline comments + Save. Deliberately minimal.

### 4. Entry detail view

- **Workout**: date, session, full exercise table with that day's actual values,
  skipped exercises marked, the note. Buttons: **Edit** and **Delete** (with
  confirmation).
- **Physio**: date, full comments. Also Edit / Delete.

### 5. Exercises (settings)

- Three sections: Session A, Session B, Session C.
- Per session: add, remove, and reorder exercises.
- Per exercise, edit: name, cue, load kind + value, default sets, default reps
  (or hold-seconds), and the video:
  - **YouTube**: paste a link; the app shows a thumbnail and plays it inline
    (needs internet to play).
  - **iPhone video**: record or pick from your library; stored inside the app on
    your phone, plays offline.
- **Backup**: Export all data as a file (via the iOS share sheet → Files/iCloud/
  AirDrop) and Import it back. This is your safety net, since all data lives only
  on your phone.

## Starting data (preloaded on first launch)

### Session A
| # | Exercise | Load | Volume | Notes |
|---|----------|------|--------|-------|
| 1 | Wall Slides | red band | 3 × 10 | band looped around wrists, walk/slide up the wall |
| 2 | Watson Shrug | blue band | 3 × 20 | elbow next to body, pull to back of skull |
| 3 | Lateral Raise 90/90 | 5 kg dumbbell | 3 × 15 | video: https://youtu.be/DSSjBbE4WNU |

### Session B
| # | Exercise | Load | Volume | Notes |
|---|----------|------|--------|-------|
| 1 | Internal Rotation wiper 90F | 20 kg band | 3 × 10 | arm up in front, internal rotation |
| 2 | External Rotation wiper 90F | 10 kg band | 3 × 10 | arm up in front, external rotation |
| 3 | Bent Over Row (DB) | 7.5 kg dumbbell | 3 × 10 | set count assumed — confirm |
| 4 | Floor Press (chest) | 7.5 kg dumbbell | 3 × 12 | set count assumed — confirm |
| 5 | Standing Cable Row | 50 kg band | 3 × 20 | set count assumed — confirm |
| 6 | Military Shoulder Press (standing) | 7.5 kg dumbbell | 3 × 10 | set count assumed — confirm |

### Session C
| # | Exercise | Load | Volume | Notes |
|---|----------|------|--------|-------|
| 1 | Pallof Press (core) | band (color/kg TBD) | 3 × 20 | |
| 2 | Dead Bug | bodyweight | 3 × 20 | |
| 3 | Hip Flexor Stretch | bodyweight | hold, seconds TBD | time-based |

Everything above is editable in the app afterwards — nothing is hard-coded.

## Technical behavior

- **App experience**: installed via "Add to Home Screen" in Safari; opens full
  screen with its own icon, no browser chrome, iPhone-sized layout, respects
  light/dark mode.
- **Offline-first**: the app itself and all your data work with no connection.
  The only thing needing internet is playing a YouTube video.
- **Privacy**: all data (entries, templates, phone videos) is stored locally on
  your iPhone. No account, no server, nothing leaves the device except when you
  explicitly export a backup.
- **Backup caveat**: because storage is on-device, deleting the app icon *and*
  clearing Safari website data would erase entries — hence the one-tap
  export/import backup.

## Decisions (confirmed 2026-07-27)

1. **Session B set counts** — 3 sets everywhere.
2. **Pallof press** — 20 kg band.
3. **Hip flexor stretch** — 10 s hold (time-based exercise).
4. **Progress chart** — per-exercise weight-over-time line chart on its own
   Progress tab (exercises with a numeric load: kg or band-kg).
5. **Injury break** — third entry type with its own button on the home screen:
   date + free-text comment, shown distinctly on the timeline.
6. Skipping an exercise on a given day is done with the per-exercise **Skip**
   toggle in the capture form; removing one permanently is done in the
   Exercises tab.
