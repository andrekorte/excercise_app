/* Apple Health data, brought in from a file a Shortcut writes, since iOS
   gives a web app no way into HealthKit itself. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('health');

const CSV = [
  '2026-10-28,sleep,7.4',
  '2026-10-28,restingHR,54',
  '2026-10-28,hrv,61',
  '2026-10-28,weight,84.2',
  '2026-10-29,sleep,6.1',
  '2026-10-29,restingHR,58',
  '2026-10-29,hrv,47',
  '2026-10-29,run,5.2',
].join('\n');

const parse = (page, text) => page.evaluate((x) => {
  const p = parseHealthImport(x);
  return { days: [...p.days.entries()], workouts: p.workouts };
}, text);

const apply = (page, text) => page.evaluate(async (x) => {
  const r = await applyHealthImport(parseHealthImport(x));
  await loadState();
  return r;
}, text);

const healthDays = (page) => page.evaluate(() =>
  S.entries.filter((e) => e.type === 'health').map((e) => e.date).sort());

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // ---------- the parser is forgiving about shape ----------
  const p1 = await parse(page, CSV);
  t.check('two days read out of the lines', p1.days.length === 2);
  t.check('all four metrics on the first', Object.keys(p1.days[0][1]).length === 4);
  t.check('sleep came through', p1.days[0][1].sleep === 7.4);
  t.check('resting heart rate rounded to a whole number', p1.days[0][1].restingHR === 54);
  t.check('the run was taken as a workout, not a metric',
    p1.workouts.length === 1 && p1.workouts[0].kind === 'run' && p1.workouts[0].km === 5.2);

  t.check('it takes the long names a shortcut might use', await page.evaluate(() => {
    const p = parseHealthImport('2026-10-28,Resting Heart Rate,51\n2026-10-28,Heart Rate Variability,70');
    const d = p.days.get('2026-10-28');
    return d.restingHR === 51 && d.hrv === 70;
  }));
  t.check('it takes JSON records too', await page.evaluate(() => {
    const p = parseHealthImport('[{"date":"2026-10-28","metric":"sleep","value":8}]');
    return p.days.get('2026-10-28').sleep === 8;
  }));
  t.check('and JSON objects with a field per metric', await page.evaluate(() => {
    const p = parseHealthImport('[{"date":"2026-10-28","sleep":8,"weight":84}]');
    const d = p.days.get('2026-10-28');
    return d.sleep === 8 && d.weight === 84;
  }));
  t.check('rubbish lines are skipped rather than crashing', await page.evaluate(() => {
    const p = parseHealthImport('hello\n,,\n2026-10-28,sleep,abc\nnot-a-date,sleep,7\n2026-10-28,sleep,7');
    return p.days.size === 1 && p.days.get('2026-10-28').sleep === 7;
  }));
  t.check('an unknown metric is ignored, not guessed at', await page.evaluate(() =>
    parseHealthImport('2026-10-28,bloodGlucose,5.4').days.size === 0));

  // ---------- importing ----------
  const r1 = await apply(page, CSV);
  t.check('two days were added', r1.added === 2);
  t.check('nothing was counted as an update yet', r1.updated === 0);
  t.check('and the run came in', r1.runs === 1);
  t.check('the days are stored', (await healthDays(page)).join() === '2026-10-28,2026-10-29');
  t.check('the run is a run entry with its distance', await page.evaluate(() => {
    const e = S.entries.find((x) => x.type === 'run' && x.date === '2026-10-29');
    return !!e && e.km === 5.2;
  }));

  // ---------- importing the same file again changes nothing ----------
  const r2 = await apply(page, CSV);
  t.check('re-importing adds nothing', r2.added === 0 && r2.updated === 0);
  t.check('and does not duplicate the run', r2.runs === 0);
  t.check('still two days', (await healthDays(page)).length === 2);
  t.check('and still one run that day', (await page.evaluate(() =>
    S.entries.filter((e) => e.type === 'run' && e.date === '2026-10-29').length)) === 1);

  // ---------- a corrected reading updates the day ----------
  const r3 = await apply(page, '2026-10-28,restingHR,52');
  t.check('a changed value counts as an update', r3.updated === 1 && r3.added === 0);
  t.check('the value changed', (await page.evaluate(() =>
    S.entries.find((e) => e.id === 'h_2026-10-28').restingHR)) === 52);
  t.check('and the rest of that day survived', (await page.evaluate(() =>
    S.entries.find((e) => e.id === 'h_2026-10-28').sleep)) === 7.4);

  // ---------- a run logged by hand is filled in, not duplicated ----------
  await page.evaluate(async () => {
    await saveEntry({ id: uid(), type: 'run', date: '2026-10-20', createdAt: Date.now(),
      km: null, comments: 'easy one along the river' });
  });
  const r4 = await apply(page, '2026-10-20,run,6.4');
  t.check('the hand-written run was filled in', r4.runs === 1);
  t.check('there is still only one run that day', (await page.evaluate(() =>
    S.entries.filter((e) => e.type === 'run' && e.date === '2026-10-20').length)) === 1);
  t.check('with its distance and its note intact', await page.evaluate(() => {
    const e = S.entries.find((x) => x.type === 'run' && x.date === '2026-10-20');
    return e.km === 6.4 && e.comments === 'easy one along the river';
  }));

  // ---------- it stays off the timeline ----------
  await go(page, 'home');
  await page.waitForTimeout(500);
  t.check('health days are not cards on the home feed', await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#feed .card')].length;
    const health = S.entries.filter((e) => e.type === 'health').length;
    return health > 0 && ids < S.entries.length;
  }));
  t.check('but there is a way in from Home', (await page.locator('#bHealth').count()) === 1);

  // ---------- the screen ----------
  await go(page, 'health');
  await page.waitForTimeout(500);
  const body = await page.textContent('body');
  t.check('it says how much is in', body.includes('2 days'));
  t.check('it shows the latest resting heart rate', body.includes('58 bpm'));
  t.check('taken from the most recent day that has one', body.includes('Oct 29'));
  t.check('and the latest sleep', body.includes('6.1 h'));
  t.check('and body weight', body.includes('84.2 kg'));
  t.check('with a button through to each trend',
    (await page.locator('.btnrow .btn.small').count()) === 4);

  // ---------- trends ----------
  t.check('each metric trends', await page.evaluate(() => {
    const s = progressSeries();
    return ['Sleep', 'Resting heart rate', 'Heart rate variability', 'Body weight']
      .every((n) => (s.get(n) || []).length > 0);
  }));
  t.check('runs trend their distance now', await page.evaluate(() =>
    (progressSeries().get('Running (km)') || []).length === 2));
  t.check('the units are right', await page.evaluate(() => {
    const s = progressSeries();
    return s.get('Sleep').unit === 'h' && s.get('Resting heart rate').unit === 'bpm'
      && s.get('Heart rate variability').unit === 'ms' && s.get('Body weight').unit === 'kg';
  }));

  // ---------- kept out of the physio's report, given to the coach ----------
  t.check('the health series are marked personal', await page.evaluate(() =>
    ['Sleep', 'Body weight'].every((n) => progressSeries().get(n).personal === true)));
  await go(page, 'report');
  await page.waitForTimeout(1100);
  const rep = await page.frameLocator('#rprev').locator('body').textContent();
  t.check('the report has no sleep chart', !rep.includes('Heart rate variability'));
  t.check('the report still has its own charts', rep.includes('Progress charts'));
  t.check('but the coach is told about it', await page.evaluate(() =>
    /SLEEP, RECOVERY AND WEIGHT/.test(coachData())));

  // ---------- a backup carries it ----------
  t.check('health days are in the export', await page.evaluate(() =>
    S.entries.some((e) => e.type === 'health')));

  await browser.close();
  t.end(errs);
})();
