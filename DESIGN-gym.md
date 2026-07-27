# Gym Trainer (son's app) — Functional Design

Lives at `/gym/` in this repo → https://andrekorte.github.io/excercise_app/gym/
Separate installable app: own icon (teal), own name ("Gym"), own on-device
IndexedDB — fully independent from the Shoulder Trainer at the repo root.

## Model: one bundle per calendar day

- **Add Day 1** — pre-filled: Shoulder, Leg extension, Leg pull/curl, Leg press,
  Calf raises, Chest press, Core sit ups, Core machine.
- **Add Day 2** — pre-filled: Biceps curl machine, Biceps dumbbells, Triceps
  pull down, Triceps row, Back lat pull, Back lat pull 2, Core sit ups, Core machine.
- **Add Single Exercise** — searchable picker of all 14 → one pre-filled row.

Merge rules:
1. One timeline card per day, labeled "Day 1", "Day 2", "Day 1+2",
   "+n extra" suffix for singles beyond the plan, or "Mixed (n)" if only singles.
2. A plan capture absorbs same-day singles without duplicating (name match:
   the plan capture form is pre-filled from the existing bundle, and its values
   win on save).
3. Adding a single that's already in the bundle appends a second instance;
   surplus rows can be removed in Edit.
4. The capture date is editable; merging targets the chosen date.

## Defaults & blank weights

All exercises default 3 × 12. Default weights start **blank**; blank weight
fields get an amber highlight in capture/edit but can be saved blank.
Core sit ups is reps-only (no weight field). "Leg pull/curl" = leg curl.

## Personal records

On save, any non-skipped exercise whose weight strictly beats his previous
best (earlier dates only; first-ever log doesn't count) triggers a PR toast,
a trophy marker on the day card, and a PR flag on the progress chart point.
Blank weights never trigger PRs.

## Tabs

**Home** (3 buttons + timeline) · **Weeks** · **Progress** · **Exercises**

- **Weeks**: one row per week, newest first — "This week" / "Last week" /
  "Jul 20–26", workout count, tappable chips (D1/D2/D1+2/Mix) in date order,
  PR count. Zero weeks show grayed "—".
- **Progress**: weight-over-time per exercise, PR points marked.
- **Exercises**: the 14 exercises with day-plan membership (D1/D2/both/neither),
  weight-vs-reps-only type, defaults, cue, video (YouTube or phone), reorder,
  add/remove, JSON export/import.

Explicitly excluded (kept simple): physio/injury entries, week strip on home,
streaks, points/levels, volume stats, timers.
