/* An exercise done both at home and at the gym: each place keeps its own
   weight, remembers it, and gets its own line on the one chart. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('places');

const EX = 'Lateral Raise 90/90';   // lives in Session A, 5 kg, 3 x 15

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const tmpl = () => page.evaluate((n) => S.templates.A.exercises.find((x) => x.name === n), EX);
  const todayRow = () => page.evaluate((n) => {
    const e = S.entries.find((x) => x.type === 'workout' && x.date === todayStr());
    return e ? e.exercises.find((x) => x.name === n) : null;
  }, EX);

  // ---------- before: one set of numbers, no toggle ----------
  await go(page, 'capture/A');
  t.check('no Where toggle to begin with', (await page.locator('.lvbtn.place').count()) === 0);
  t.check('and nothing is placed', !(await tmpl()).places);

  // ---------- turn it on in the exercise editor ----------
  const exId = await page.evaluate((n) => S.templates.A.exercises.find((x) => x.name === n).id, EX);
  await go(page, 'exercise/A/' + exId);
  t.check('the editor offers the setting', (await page.locator('#fPlaces').count()) === 1);
  t.check('it starts off', (await page.inputValue('#fPlaces')) === '');
  await page.selectOption('#fPlaces', '1');
  await page.click('#bSave');
  await page.waitForTimeout(900);

  const te = await tmpl();
  t.check('two places exist', te.places && te.places.length === 2);
  t.check('named Home and Gym', te.places.map((p) => p.name).join() === 'Home,Gym');
  t.check('both start from what he already lifts',
    te.places[0].load.value === 5 && te.places[1].load.value === 5);
  t.check('both start from the same sets and reps',
    te.places[1].sets === 3 && te.places[1].reps === 15);
  t.check('it sits at Home', te.place === 0);
  t.check('past workouts were labelled Home', await page.evaluate((n) => {
    const done = S.entries.filter((e) => e.type === 'workout' &&
      e.exercises.some((x) => x.name === n && !x.skipped));
    return done.length > 0 && done.every((e) => {
      const x = e.exercises.find((v) => v.name === n);
      return x.skipped || (x.place && x.place.name === 'Home');
    });
  }, EX));

  // ---------- the toggle on the capture screen ----------
  await go(page, 'capture/A');
  const seg = page.locator('.lvbtn.place');
  t.check('a Where toggle appears', (await seg.count()) === 2);
  t.check('Home is selected', (await seg.nth(0).getAttribute('class')).includes('on'));
  t.check('Gym is not', !(await seg.nth(1).getAttribute('class')).includes('on'));
  t.check('the label reads Where', (await page.locator('.ctl.wide label')
    .filter({ hasText: 'Where' }).count()) === 1);

  const weightBox = page.locator('.exrow').filter({ hasText: EX }).locator('.stepper input').first();
  t.check('the home weight shows', (await weightBox.inputValue()) === '5');

  // ---------- do a gym workout at a different weight ----------
  await seg.nth(1).click();
  await page.waitForTimeout(250);
  t.check('Gym is now selected', (await seg.nth(1).getAttribute('class')).includes('on'));
  t.check('the weight came across from Gym', (await weightBox.inputValue()) === '5');
  await weightBox.fill('22.5');
  await weightBox.blur();
  await page.waitForTimeout(200);
  await page.locator('.exrow').filter({ hasText: EX }).locator('.donebtn').click();
  await page.waitForTimeout(200);
  await page.click('.savebtn');
  await page.waitForTimeout(1000);

  const row = await todayRow();
  t.check('the workout saved against Gym', row && row.place && row.place.name === 'Gym');
  t.check('at the gym weight', row.load.value === 22.5);

  const te2 = await tmpl();
  t.check('Gym remembered 22.5', te2.places[1].load.value === 22.5);
  t.check('Home is untouched at 5', te2.places[0].load.value === 5);
  t.check('the exercise now sits at Gym', te2.place === 1);
  t.check('and its own numbers mirror Gym', te2.load.value === 22.5);

  // ---------- come back: Gym is where he left off, Home still 5 ----------
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await go(page, 'capture/A');
  const seg2 = page.locator('.lvbtn.place');
  const w2 = page.locator('.exrow').filter({ hasText: EX }).locator('.stepper input').first();
  t.check('it opens where he last was', (await seg2.nth(1).getAttribute('class')).includes('on'));
  t.check('with the gym weight', (await w2.inputValue()) === '22.5');
  await seg2.nth(0).click();
  await page.waitForTimeout(250);
  t.check('switching back brings the home weight', (await w2.inputValue()) === '5');
  await seg2.nth(1).click();
  await page.waitForTimeout(250);
  t.check('and forward again brings the gym one', (await w2.inputValue()) === '22.5');

  // ---------- an earlier gym session, so both lines have something to join ----------
  await page.evaluate(async (n) => {
    const d = new Date(Date.now() - 18 * 86400000);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
    for (const e of S.entries.filter((x) => x.type === 'workout' && x.date === iso)) await entryDel(e.id);
    await entryPut({ id: uid(), type: 'workout', session: 'A', sessions: ['A'], date: iso,
      createdAt: Date.now() - 18 * 86400000, note: '', exercises: [
        { name: n, cue: '', load: { kind: 'kg', value: 20 }, sets: 3, reps: 12, mode: 'reps',
          skipped: false, place: { i: 1, name: 'Gym' } }] });
    await loadState();
  }, EX);

  // ---------- the chart ----------
  await go(page, 'progress/' + encodeURIComponent(EX));
  await page.waitForTimeout(600);
  t.check('the series knows it is split', await page.evaluate((n) =>
    !!(progressSeries().get(n) || {}).split, EX));
  t.check('split names both places', await page.evaluate((n) =>
    (progressSeries().get(n).split || []).join() === 'Home,Gym', EX));
  const legend = await page.locator('.vlegend span').allTextContents();
  t.check('the legend names Home and Gym', legend.join() === 'Home,Gym');
  t.check('a line is drawn for each place', (await page.locator('.viz-root svg path').count()) === 2);
  t.check('the two lines are different colours', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.viz-root svg path')].map((e) => e.getAttribute('stroke'));
    return p[0] !== p[1] && p.every((c) => /var\(--chart2?\)/.test(c));
  }));
  t.check('each line joins only its own place', await page.evaluate(() => {
    const d = [...document.querySelectorAll('.viz-root svg path')].map((e) =>
      (e.getAttribute('d').match(/[ML]/g) || []).length);
    return d[1] === 2;                       // the gym line joins its two points
  }));
  t.check('the headline reports both',
    /home 5 kg · gym 22\.5 kg/.test(await page.textContent('.vsub')));
  t.check('there is no reps line', !(await page.innerHTML('.viz-root svg')).includes('stroke-dasharray'));

  await page.locator('.datatable summary').click();
  await page.waitForTimeout(250);
  const heads = await page.locator('.datatable th').allTextContents();
  t.check('the table has a Where column', heads.includes('Where'));
  t.check('and still shows reps', heads.includes('reps'));
  t.check('nothing logged before the split fell off the chart', await page.evaluate((n) => {
    const a = progressSeries().get(n);
    return a.every((p) => p.place === 'Home' || p.place === 'Gym');
  }, EX));
  const firstRow = await page.locator('.datatable tr').nth(1).textContent();
  t.check('the newest row is the gym one', firstRow.includes('Gym') && firstRow.includes('22.5'));
  t.check('the weight is still editable',
    (await page.locator('.datatable .cellv').count()) > 0);

  // ---------- correcting a number from the table still works ----------
  await page.locator('.datatable .cellv').first().click();
  await page.waitForTimeout(200);
  await page.locator('.celledit').fill('24');
  await page.locator('.celledit').press('Enter');
  await page.waitForTimeout(900);
  t.check('the correction stuck', (await todayRow()).load.value === 24);
  t.check('and went to the gym place, not home', await page.evaluate((n) => {
    const te = S.templates.A.exercises.find((x) => x.name === n);
    return te.places[1].load.value === 24 && te.places[0].load.value === 5;
  }, EX));

  // ---------- the physio report ----------
  await go(page, 'report');
  await page.waitForTimeout(1100);
  const doc = page.frameLocator('#rprev');
  const body = await doc.locator('body').textContent();
  t.check('the programme lists the home row', body.includes(EX + ' · Home'));
  t.check('and the gym row', body.includes(EX + ' · Gym'));
  t.check('the session log labels the place', /Gym/.test(body));
  t.check('home and gym are not compared as one progression',
    !/· 5 kg → 24 kg/.test(body));

  // ---------- turning it off again ----------
  await go(page, 'exercise/A/' + exId);
  t.check('the setting shows as on', (await page.inputValue('#fPlaces')) === '1');
  await page.selectOption('#fPlaces', '');
  await page.click('#bSave');
  await page.waitForTimeout(900);
  const te3 = await tmpl();
  t.check('the places are gone', !te3.places);
  t.check('but the exercise keeps its numbers', te3.load.value === 24);
  await go(page, 'capture/A');
  t.check('and the toggle is gone', (await page.locator('.lvbtn.place').count()) === 0);

  // ---------- a levelled exercise is not offered places ----------
  const dbId = await page.evaluate(() => S.templates.C.exercises.find((x) => /dead ?bug/i.test(x.name)).id);
  await go(page, 'exercise/C/' + dbId);
  t.check('a levelled exercise has levels', await page.evaluate(() =>
    !!S.templates.C.exercises.find((x) => /dead ?bug/i.test(x.name)).levels));
  t.check('and is not offered places as well', (await page.locator('#fPlaces').count()) === 0);

  await browser.close();
  t.end(errs);
})();
