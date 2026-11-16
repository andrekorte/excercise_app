/* The one-time move of his real data: sessions that owned their exercises
   become sessions that list them, duplicate names merge into one carrying the
   most recent weights, and "Gym" becomes "City" with Dolphins beside it. */
const { BASE, suite, open } = require('./lib');
const t = suite('librarymig');

/* the shape his phone holds before the update */
const OLD_TEMPLATES = {
  A: { key: 'A', name: 'Session A', exercises: [
    { id: 'a1', name: 'Wall Slides', cue: 'wall', load: { kind: 'bandColor', value: 'red' },
      sets: 3, reps: 10, mode: 'reps', youtube: '', videoId: null },
    { id: 'a2', name: 'Triceps', cue: '', load: { kind: 'kg', value: 100 },
      sets: 3, reps: 12, mode: 'reps', youtube: '', videoId: null,
      places: [{ name: 'Home', load: { kind: 'kg', value: 30 }, sets: 3, reps: 12 },
               { name: 'Gym', load: { kind: 'kg', value: 100 }, sets: 3, reps: 12 }], place: 1 },
  ] },
  B: { key: 'B', name: 'Session B', exercises: [
    { id: 'b1', name: 'Triceps', cue: 'elbows in', load: { kind: 'kg', value: 55 },
      sets: 4, reps: 10, mode: 'reps', youtube: 'https://youtu.be/abc', videoId: null,
      places: [{ name: 'Home', load: { kind: 'kg', value: 25 }, sets: 4, reps: 10 },
               { name: 'Gym', load: { kind: 'kg', value: 55 }, sets: 4, reps: 10 }], place: 0 },
    { id: 'b2', name: 'Floor Press', cue: '', load: { kind: 'kg', value: 7.5 },
      sets: 3, reps: 12, mode: 'reps', youtube: '', videoId: null },
  ] },
};
/* the newest Triceps workout: 80 kg at the gym, 32 at home a week earlier */
const OLD_ENTRIES = [
  { id: 'e1', type: 'workout', session: 'B', sessions: ['B'], date: '2026-11-08',
    createdAt: 1, note: '', exercises: [
      { name: 'Triceps', cue: '', load: { kind: 'kg', value: 80 }, sets: 3, reps: 11,
        mode: 'reps', skipped: false, place: { i: 1, name: 'Gym' } }] },
  { id: 'e2', type: 'workout', session: 'A', sessions: ['A'], date: '2026-11-01',
    createdAt: 1, note: '', exercises: [
      { name: 'Triceps', cue: '', load: { kind: 'kg', value: 32 }, sets: 3, reps: 12,
        mode: 'reps', skipped: false, place: { i: 0, name: 'Home' } },
      { name: 'Wall Slides', cue: '', load: { kind: 'bandColor', value: 'red' }, sets: 3,
        reps: 10, mode: 'reps', skipped: false }] },
];

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // put the old world back and run the migration over it
  await page.evaluate(async (fix) => {
    for (const e of await entryAll()) await entryDel(e.id);
    for (const k of ['library', 'placesV2', 'places', 'seedHistoryV1', 'levelBackfillV2'])
      await kvSet(k, undefined);
    await tx('kv', 'readwrite', (s) => { for (const k of ['library', 'placesV2', 'places']) s.delete(k); });
    await kvSet('templates', fix.t);
    await kvSet('seedHistoryV1', true);
    for (const e of fix.e) await entryPut(e);
    await loadState();
  }, { t: OLD_TEMPLATES, e: OLD_ENTRIES });

  const L = (p) => p.evaluate(() => libAll().map((e) => e.name));

  // ---------- the library ----------
  t.check('three exercises, not four', (await L(page)).length === 3);
  t.check('the two Triceps became one',
    (await L(page)).filter((n) => n === 'Triceps').length === 1);
  t.check('Wall Slides survived', (await L(page)).includes('Wall Slides'));
  t.check('Floor Press survived', (await L(page)).includes('Floor Press'));

  // ---------- the sessions still hold what they held ----------
  t.check('A lists two', (await page.evaluate(() => S.templates.A.items.length)) === 2);
  t.check('B lists two', (await page.evaluate(() => S.templates.B.items.length)) === 2);
  t.check('and both point at the same Triceps', await page.evaluate(() => {
    const a = S.templates.A.exercises.find((x) => x.name === 'Triceps');
    const b = S.templates.B.exercises.find((x) => x.name === 'Triceps');
    return !!a && a === b;
  }));
  t.check('nothing was orphaned', (await page.evaluate(() => orphanEx().length)) === 0);

  // ---------- the merged one kept the most recent weights ----------
  const tri = await page.evaluate(() => libAll().find((e) => e.name === 'Triceps'));
  t.check('the city weight is what he last lifted there',
    tri.places.find((p) => p.name === 'City').load.value === 80);
  t.check('the home weight is what he last lifted there',
    tri.places.find((p) => p.name === 'Home').load.value === 32);
  t.check('with the reps from that workout too',
    tri.places.find((p) => p.name === 'City').reps === 11);
  t.check('the cue was not lost in the merge', tri.cue === 'elbows in');
  t.check('nor the video link', tri.youtube === 'https://youtu.be/abc');

  // ---------- Gym became City, Dolphins arrived empty ----------
  t.check('three places now', (await page.evaluate(() => places().join())) === 'Home,City,Dolphins');
  t.check('the exercise keeps numbers for all three', tri.places.length === 3);
  t.check('nothing is still called Gym', !tri.places.some((p) => p.name === 'Gym'));
  t.check('Dolphins starts from somewhere sensible',
    typeof tri.places.find((p) => p.name === 'Dolphins').load.value === 'number');

  // ---------- the history was relabelled, not rewritten ----------
  t.check('the gym workout now reads City', (await page.evaluate(() =>
    S.entries.find((e) => e.date === '2026-11-08').exercises[0].place.name)) === 'City');
  t.check('at the weight it was actually done', (await page.evaluate(() =>
    S.entries.find((e) => e.date === '2026-11-08').exercises[0].load.value)) === 80);
  t.check('the home workout was left alone', (await page.evaluate(() =>
    S.entries.find((e) => e.date === '2026-11-01').exercises[0].place.name)) === 'Home');
  t.check('both workouts are still there', (await page.evaluate(() =>
    S.entries.filter((e) => e.type === 'workout').length)) === 2);
  t.check('and the chart has one unbroken Triceps line', await page.evaluate(() => {
    const a = progressSeries().get('Triceps');
    return a && a.length === 2 && a.split && a.split.join() === 'Home,City';
  }));

  // ---------- running it again changes nothing ----------
  const snap = await page.evaluate(() => JSON.stringify({ lib: S.library, t: S.templates, p: S.places }));
  await page.evaluate(async () => { await loadState(); });
  t.check('a second load is a no-op', (await page.evaluate(() =>
    JSON.stringify({ lib: S.library, t: S.templates, p: S.places }))) === snap);

  // ---------- and it survives a real restart ----------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  t.check('still one Triceps after reopening',
    (await L(page)).filter((n) => n === 'Triceps').length === 1);
  t.check('still three places', (await page.evaluate(() => places().join())) === 'Home,City,Dolphins');
  t.check('still 80 at City', (await page.evaluate(() =>
    libAll().find((e) => e.name === 'Triceps').places.find((p) => p.name === 'City').load.value)) === 80);

  await browser.close();
  t.end(errs);
})();
