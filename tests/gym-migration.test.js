/* Tim's phone is already running the old two-day programme with months of
   history on it. This is what happens to that when the new one arrives. */
const { suite, open } = require('./lib');
const BASE = (process.env.APP_URL || 'http://127.0.0.1:8321/') + 'gym/';
const t = suite('gym-migration');

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);

  // put the device back to exactly what his screenshots showed, with history
  await page.evaluate(async () => {
    const ex = (name, d1, d2, hasWeight, weight) => ({ id: 'x' + name, name, cue: '',
      hasWeight: hasWeight !== false, activity: false, minutes: null, weight,
      sets: 3, reps: 12, d1, d2, youtube: '', videoId: null });
    await kvSet('templates', { exercises: [
      ex('Shoulder', true, false, true, 20), ex('Leg Extension', true, false, true, 45),
      ex('Leg Pull/Curl', true, false, true, 35), ex('Leg Press', true, false, true, 145),
      ex('Calf Raises', true, false, true, 65), ex('Biceps Curl Machine', false, true, true, 25),
      ex('Biceps Dumbbells', false, true, true, 7), ex('Triceps Pull Down', false, true, true, 36.5),
      ex('Triceps Row', false, true, true, 75), ex('Back Lat Pull', false, true, true, 72.5),
      ex('Back Lat Pull 2', false, true, true, 45), ex('Chest Press', true, false, true, 25),
      ex('Core Sit Ups', true, true, false, null), ex('Core Machine', true, true, true, 30),
    ] });
    await kvSet('programmeV2', null);
    await entryPut({ id: 'h1', date: '2026-09-10', createdAt: 1, plans: ['D2'], note: '', exercises: [
      { name: 'Triceps Row', hasWeight: true, weight: 70, sets: 3, reps: 10, skipped: false, partOfPlan: true },
      { name: 'Back Lat Pull', hasWeight: true, weight: 70, sets: 3, reps: 6, skipped: false, partOfPlan: true },
      { name: 'Back Lat Pull 2', hasWeight: true, weight: 45, sets: 3, reps: 12, skipped: false, partOfPlan: true },
      { name: 'Core Sit Ups', hasWeight: false, weight: null, sets: 3, reps: 12, skipped: false, partOfPlan: true } ] });
    await entryPut({ id: 'h2', date: '2026-09-20', createdAt: 2, plans: ['D2'], note: 'felt good', exercises: [
      { name: 'Triceps Row', hasWeight: true, weight: 75, sets: 3, reps: 10, skipped: false, partOfPlan: true } ] });
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1300);

  const after = await page.evaluate(() => ({
    prog: S.t.exercises.map((e) => e.name + '|' + (e.days || []).join('') + '|' + e.weight),
    names: S.t.exercises.map((e) => e.name),
    hist: S.entries.map((e) => e.exercises.map((x) => x.name + '@' + x.weight)),
    series: [...progressSeries().keys()],
    flag: null,
  }));
  const weight = (n) => {
    const r = after.prog.find((p) => p.startsWith(n + '|'));
    return r ? r.split('|')[2] : null;
  };

  // --- nothing he lifts is forgotten ---
  t.check('leg press keeps 145', weight('Leg Press') === '145');
  t.check('calf raises keep 65', weight('Calf Raises') === '65');
  t.check('chest press keeps 25', weight('Chest Press') === '25');
  t.check('biceps dumbbells keep 7', weight('Biceps Dumbbells') === '7');
  t.check('triceps pull down keeps 36.5', weight('Triceps Pull Down') === '36.5');
  t.check('core machine keeps 30', weight('Core Machine') === '30');

  // --- renames carry the weight and the history with them ---
  t.check('Shoulder became Shoulder Press, still 20', weight('Shoulder Press') === '20');
  t.check('Leg Pull/Curl became Leg Curl, still 35', weight('Leg Curl') === '35');
  t.check('Back Lat Pull became Lat Pulldown, still 72.5', weight('Lat Pulldown') === '72.5');
  t.check('Triceps Row became Triceps Dip Machine, still 75', weight('Triceps Dip Machine') === '75');
  t.check('no old names left in the programme',
    !after.names.some((n) => ['Shoulder', 'Leg Pull/Curl', 'Back Lat Pull', 'Triceps Row'].includes(n)));

  t.check('his past sessions follow the rename',
    JSON.stringify(after.hist).includes('Triceps Dip Machine@75')
    && JSON.stringify(after.hist).includes('Triceps Dip Machine@70'));
  t.check('so does the lat pulldown', JSON.stringify(after.hist).includes('Lat Pulldown@70'));
  t.check('the chart is one unbroken line, not two',
    after.series.includes('Triceps Dip Machine') && !after.series.includes('Triceps Row'));
  t.check('with both of its points', (await page.evaluate(() =>
    progressSeries().get('Triceps Dip Machine').length)) === 2);
  t.check('and the personal record still counts', (await page.evaluate(() =>
    progressSeries().get('Triceps Dip Machine').some((p) => p.pr))));

  // --- dropped from the programme is not deleted from the past ---
  t.check('Back Lat Pull 2 leaves the programme', !after.names.includes('Back Lat Pull 2'));
  t.check('Core Sit Ups leaves the programme', !after.names.includes('Core Sit Ups'));
  t.check('but the session he did them in still has them',
    JSON.stringify(after.hist).includes('Back Lat Pull 2@45')
    && JSON.stringify(after.hist).includes('Core Sit Ups@null'));
  t.check('his note survived', (await page.evaluate(() =>
    S.entries.find((e) => e.id === 'h2').note)) === 'felt good');

  // --- the new ones arrive blank, with a how-to ---
  t.check('new exercises have no invented weight', weight('Goblet Squat') === 'null');
  t.check('and carry a how-to link', await page.evaluate(() =>
    !!S.t.exercises.find((e) => e.name === 'Goblet Squat').youtube));

  // --- and it only runs once ---
  const before = await page.evaluate(() => S.t.exercises.length);
  await page.evaluate(async () => {
    const t = await kvGet('templates');
    t.exercises.find((e) => e.name === 'Leg Press').weight = 150;
    await kvSet('templates', t);
  });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  t.check('a second launch does not run it again',
    (await page.evaluate(() => S.t.exercises.length)) === before);
  t.check('and does not undo his own edits',
    (await page.evaluate(() => S.t.exercises.find((e) => e.name === 'Leg Press').weight)) === 150);

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
