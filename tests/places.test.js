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
  t.check('three places exist', te.places && te.places.length === 3);
  t.check('named Home, City and Dolphins',
    te.places.map((p) => p.name).join() === 'Home,City,Dolphins');
  t.check('all start from what he already lifts',
    te.places.every((p) => p.load.value === 5));
  t.check('and from the same sets and reps',
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
  t.check('a Where toggle appears', (await seg.count()) === 3);
  t.check('Home is selected', (await seg.nth(0).getAttribute('class')).includes('on'));
  t.check('the gyms are not', !(await seg.nth(1).getAttribute('class')).includes('on'));
  t.check('the label reads Where', (await page.locator('.ctl.wide label')
    .filter({ hasText: 'Where' }).count()) === 1);

  const weightBox = page.locator('.exrow').filter({ hasText: EX }).locator('.stepper input').first();
  t.check('the home weight shows', (await weightBox.inputValue()) === '5');

  // ---------- do a gym workout at a different weight ----------
  await seg.nth(1).click();
  await page.waitForTimeout(250);
  t.check('City is now selected', (await seg.nth(1).getAttribute('class')).includes('on'));
  t.check('the weight came across from City', (await weightBox.inputValue()) === '5');
  await weightBox.fill('22.5');
  await weightBox.blur();
  await page.waitForTimeout(200);
  await page.locator('.exrow').filter({ hasText: EX }).locator('.donebtn').click();
  await page.waitForTimeout(200);
  await page.click('.savebtn');
  await page.waitForTimeout(1000);

  const row = await todayRow();
  t.check('the workout saved against City', row && row.place && row.place.name === 'City');
  t.check('at the gym weight', row.load.value === 22.5);

  const te2 = await tmpl();
  t.check('City remembered 22.5', te2.places[1].load.value === 22.5);
  t.check('Home is untouched at 5', te2.places[0].load.value === 5);
  t.check('the exercise now sits at City', te2.place === 1);
  t.check('and its own numbers mirror City', te2.load.value === 22.5);

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
          skipped: false, place: { i: 1, name: 'City' } }] });
    await loadState();
  }, EX);

  // ---------- the chart ----------
  await go(page, 'progress/' + encodeURIComponent(EX));
  await page.waitForTimeout(600);
  t.check('the series knows it is split', await page.evaluate((n) =>
    !!(progressSeries().get(n) || {}).split, EX));
  t.check('split names the places used', await page.evaluate((n) =>
    (progressSeries().get(n).split || []).join() === 'Home,City', EX));
  const legend = await page.locator('.vlegend span').allTextContents();
  t.check('the legend names the places used', legend.join() === 'Home,City');
  t.check('a line is drawn for each place', (await page.locator('.viz-root svg path').count()) === 2);
  t.check('the two lines are different colours', await page.evaluate(() => {
    const p = [...document.querySelectorAll('.viz-root svg path')].map((e) => e.getAttribute('stroke'));
    return p[0] !== p[1] && p.every((c) => /var\(--chart\d?\)/.test(c));
  }));
  t.check('each line joins only its own place', await page.evaluate(() => {
    const d = [...document.querySelectorAll('.viz-root svg path')].map((e) =>
      (e.getAttribute('d').match(/[ML]/g) || []).length);
    return d[1] === 2;                       // the gym line joins its two points
  }));
  t.check('the headline reports both',
    /home 5 kg · city 22\.5 kg/.test(await page.textContent('.vsub')));
  t.check('there is no reps line', !(await page.innerHTML('.viz-root svg')).includes('stroke-dasharray'));

  await page.locator('.datatable summary').click();
  await page.waitForTimeout(250);
  const heads = await page.locator('.datatable th').allTextContents();
  t.check('the table has a Where column', heads.includes('Where'));
  t.check('and still shows reps', heads.includes('reps'));
  t.check('nothing logged before the split fell off the chart', await page.evaluate((n) => {
    const a = progressSeries().get(n);
    return a.every((p) => p.place === 'Home' || p.place === 'City');
  }, EX));
  const firstRow = await page.locator('.datatable tr').nth(1).textContent();
  t.check('the newest row is the city one', firstRow.includes('City') && firstRow.includes('22.5'));
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
  t.check('and the city row', body.includes(EX + ' · City'));
  t.check('the session log labels the place', /City/.test(body));
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

  // ---------- one exercise, used by two sessions ----------
  // there is no longer any such thing as two copies of a name with numbers of
  // their own: a session lists which exercises it uses, and this is one of them
  await page.evaluate(async () => {
    try { localStorage.clear(); } catch (err) {}
    const ex = { id: 'tri1', name: 'Triceps', cue: '', load: { kind: 'kg', value: 80 },
      sets: 3, reps: 12, mode: 'reps', youtube: '', videoId: null,
      places: [{ name: 'Home', load: { kind: 'kg', value: 30 }, sets: 3, reps: 12 },
               { name: 'City', load: { kind: 'kg', value: 80 }, sets: 3, reps: 12 },
               { name: 'Dolphins', load: { kind: 'kg', value: 60 }, sets: 3, reps: 12 }], place: 1 };
    S.library[ex.id] = ex;
    S.templates.A.items.push(ex.id);
    S.templates.B.items.push(ex.id);
    await saveTemplates(); await loadState();
  });

  const tri = (p) => p.locator('.exrow').filter({ hasText: 'Triceps' });
  const weight = (p) => tri(p).locator('.stepper input').first().inputValue();
  const tap = async (p, i) => { await tri(p).locator('.lvbtn.place').nth(i).click(); await p.waitForTimeout(250); };

  t.check('one exercise, not two', (await page.evaluate(() =>
    Object.values(S.library).filter((e) => e.name === 'Triceps').length)) === 1);
  t.check('and both sessions use it', (await page.evaluate(() =>
    sessionsWith('tri1').join())) === 'A,B');

  await go(page, 'capture/B');
  await page.waitForTimeout(400);
  t.check('B opens at the city weight', (await weight(page)) === '80');
  await tap(page, 0);
  t.check('Home gives the home weight', (await weight(page)) === '30');
  await tap(page, 2);
  t.check('Dolphins gives its own', (await weight(page)) === '60');
  await tap(page, 1);
  t.check('and City gives 80 back', (await weight(page)) === '80');

  await go(page, 'capture/A');
  await page.waitForTimeout(400);
  await tap(page, 0);
  await tap(page, 1);
  t.check('the other session sees the same 80', (await weight(page)) === '80');

  // ---------- a place can be renamed, and the history follows ----------
  await page.evaluate(async () => {
    await applyHealthImport({ days: new Map(), workouts: [] });   // no-op, keeps state settled
    await saveEntry({ id: uid(), type: 'workout', session: 'B', sessions: ['B'],
      date: '2026-11-02', createdAt: Date.now(), note: '', exercises: [
        { name: 'Triceps', cue: '', load: { kind: 'kg', value: 80 }, sets: 3, reps: 12,
          mode: 'reps', skipped: false, place: { i: 1, name: 'City' } }] });
  });
  t.check('the place reports its use', (await page.evaluate(() => placeUseCount('City'))) >= 1);
  await page.evaluate(async () => { await renamePlace('City', 'Town'); await loadState(); });
  t.check('the place was renamed', (await page.evaluate(() => places().join())) === 'Home,Town,Dolphins');
  t.check('the exercise kept its weights under the new name', await page.evaluate(() => {
    const e = S.library.tri1;
    return e.places[1].name === 'Town' && e.places[1].load.value === 80;
  }));
  t.check('and the workout logged there came along', (await page.evaluate(() =>
    S.entries.some((e) => (e.exercises || []).some((x) => x.place && x.place.name === 'Town')))) === true);
  await page.evaluate(async () => { await renamePlace('Town', 'City'); await loadState(); });

  // ---------- the mirror is put back in step on the way in ----------
  await page.evaluate(async () => {
    const te = S.templates.B.exercises.find((x) => x.name === 'Triceps');
    te.load = { kind: 'kg', value: 999 };        // knocked out of step by hand
    await saveTemplates(); await loadState();
  });
  t.check('a drifted mirror is corrected against its place', (await page.evaluate(() =>
    S.templates.B.exercises.find((x) => x.name === 'Triceps').load.value)) === 80);

  await browser.close();
  t.end(errs);
})();
