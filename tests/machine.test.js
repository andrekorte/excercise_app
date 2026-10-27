/* A machine set by notch rather than by weight: its load is a level, and a
   level is a number the app can trend like any other. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('machine');

const EX = 'Standing Cable Row';   // Session B, band (kg) to begin with

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const tmpl = () => page.evaluate((n) => S.templates.B.exercises.find((x) => x.name === n), EX);
  const exId = await page.evaluate((n) => S.templates.B.exercises.find((x) => x.name === n).id, EX);

  // ---------- the new load type is on offer ----------
  await go(page, 'exercise/B/' + exId);
  const kinds = await page.locator('#fKind option').allTextContents();
  t.check('Machine level is a load type', kinds.includes('Machine level'));
  t.check('alongside the three that were there',
    kinds.filter((k) => /kg|Band|Bodyweight/.test(k)).length === 4);

  await page.selectOption('#fKind', 'machine');
  await page.waitForTimeout(300);
  t.check('the field is captioned as a level',
    (await page.textContent('#loadField label')) === 'Default level');
  t.check('it starts at level 1, not the old band weight',
    (await page.locator('#loadField input').inputValue()) === '1');
  t.check('and says what it is for',
    (await page.textContent('#loadField')).includes('set by notch'));

  await page.locator('#loadField input').fill('7');
  await page.locator('#loadField input').blur();
  await page.waitForTimeout(200);
  await page.click('#bSave');
  await page.waitForTimeout(900);

  const te = await tmpl();
  t.check('the exercise is on machine levels now', te.load.kind === 'machine');
  t.check('at level 7', te.load.value === 7);

  await go(page, 'settings');
  t.check('the exercise list reads level 7',
    (await page.textContent('body')).includes('level 7'));
  t.check('and does not claim kilos', !(await page.textContent('body')).includes('7 kg band'));

  // ---------- capturing it ----------
  await go(page, 'capture/B');
  const row = page.locator('.exrow').filter({ hasText: EX });
  t.check('the control is captioned Level',
    (await row.locator('.ctl label').first().textContent()) === 'Level');
  t.check('showing the default', (await row.locator('.stepper input').first().inputValue()) === '7');
  await row.locator('.stepper input').first().fill('8');
  await row.locator('.stepper input').first().blur();
  await page.waitForTimeout(200);
  await row.locator('.donebtn').click();
  await page.waitForTimeout(200);
  await page.click('.savebtn');
  await page.waitForTimeout(1000);

  const saved = await page.evaluate((n) => {
    const e = S.entries.find((x) => x.type === 'workout' && x.date === todayStr());
    return e ? e.exercises.find((x) => x.name === n) : null;
  }, EX);
  t.check('the workout recorded a machine level', saved && saved.load.kind === 'machine');
  t.check('at level 8', saved.load.value === 8);
  t.check('and level 8 became the default', (await tmpl()).load.value === 8);

  // ---------- it reads as a level everywhere ----------
  const entryId = await page.evaluate(() =>
    S.entries.find((e) => e.type === 'workout' && e.date === todayStr()).id);
  await go(page, 'entry/' + entryId);
  await page.waitForTimeout(400);
  t.check('the entry shows level 8', (await page.textContent('body')).includes('level 8'));

  // ---------- and it trends ----------
  await go(page, 'progress/' + encodeURIComponent(EX));
  await page.waitForTimeout(600);
  t.check('the series is charted', await page.evaluate((n) =>
    (progressSeries().get(n) || []).length > 0, EX));
  t.check('it trends only what the exercise is on now', await page.evaluate((n) =>
    progressSeries().get(n).every((p) => p.kind === 'machine'), EX));
  t.check('the band sessions before it were set aside, not mixed in',
    await page.evaluate((n) => progressSeries().get(n).dropped > 0, EX));
  const sub = await page.textContent('.vsub');
  t.check('the headline says level 8, not 8 level', sub.includes('latest level 8'));
  t.check('and says what was left out', /earlier sessions on a different unit/.test(sub));
  t.check('nothing calls the levels kg', !/\d+ kg/.test(sub));
  const heads = await page.locator('.datatable th').allTextContents();
  t.check('the data column is headed level', heads.includes('level'));

  // ---------- the physio report ----------
  await go(page, 'report');
  await page.waitForTimeout(1100);
  const doc = page.frameLocator('#rprev');
  const body = await doc.locator('body').textContent();
  t.check('the programme shows the level', body.includes('level 8'));
  t.check('the progression table has the exercise', body.includes(EX));
  t.check('a rise in level counts as a rise', await page.evaluate((n) => {
    const m = reportModel();
    const r = m.prog.find((x) => x.name.startsWith(n));
    return !!r && r.first.num != null && r.latest.num != null;
  }, EX));

  // ---------- it works with home and gym too ----------
  await go(page, 'exercise/B/' + exId);
  await page.selectOption('#fPlaces', '1');
  await page.click('#bSave');
  await page.waitForTimeout(900);
  const te2 = await tmpl();
  t.check('both places are on machine levels',
    te2.places.every((p) => p.load.kind === 'machine'));
  await go(page, 'capture/B');
  const row2 = page.locator('.exrow').filter({ hasText: EX });
  t.check('the Where toggle is there', (await row2.locator('.lvbtn.place').count()) === 2);
  t.check('and the level control with it',
    (await row2.locator('.ctl label').nth(1).textContent()) === 'Level');

  // ---------- switching back to kilos still works ----------
  await go(page, 'exercise/B/' + exId);
  await page.selectOption('#fKind', 'kg');
  await page.waitForTimeout(250);
  t.check('the caption goes back to weight',
    (await page.textContent('#loadField label')) === 'Default weight (kg)');
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('the exercise is back on kilos', (await tmpl()).load.kind === 'kg');

  await browser.close();
  t.end(errs);
})();
