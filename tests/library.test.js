/* Exercises are their own things now. A session lists which it uses, so one
   exercise can be in several sessions, or in none, and still be there to log. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('library');

const lib = (page) => page.evaluate(() => libAll().map((e) => e.name));

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ---------- the seeded programme became a library ----------
  t.check('every exercise is in the library', (await lib(page)).length === 12);
  t.check('each session lists ids, not exercises', await page.evaluate(() =>
    Array.isArray(S.templates.A.items) && S.templates.A.items.length === 3));
  t.check('and resolves them to the same objects', await page.evaluate(() =>
    S.templates.A.exercises[0] === S.library[S.templates.A.items[0]]));
  t.check('nothing is loose to begin with', (await page.evaluate(() => orphanEx().length)) === 0);
  t.check('the stored template carries no exercises array', await page.evaluate(async () =>
    !(await kvGet('templates')).A.exercises));

  // ---------- an exercise can be put in a second session ----------
  const wallId = await page.evaluate(() => S.templates.A.items[0]);
  await go(page, 'exercise/A/' + wallId);
  await page.waitForTimeout(400);
  t.check('the editor offers the sessions', (await page.locator('.sessbtn').count()) === 3);
  t.check('with the one it is in turned on',
    (await page.locator('.sessbtn.on').allTextContents()).join() === 'A');
  await page.locator('.sessbtn[data-k="C"]').click();
  await page.waitForTimeout(200);
  t.check('the note says where it will live',
    (await page.textContent('#sessNote')).includes('A, C'));
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('it is now in both', (await page.evaluate((id) => sessionsWith(id).join(), wallId)) === 'A,C');
  t.check('still only one of it', (await lib(page)).length === 12);
  t.check('and both sessions point at the same object', await page.evaluate((id) =>
    S.templates.A.exercises.find((x) => x.id === id) === S.templates.C.exercises.find((x) => x.id === id), wallId));

  // ---------- one set of numbers, wherever it is used ----------
  await go(page, 'capture/C');
  await page.waitForTimeout(400);
  const row = page.locator('.exrow').filter({ hasText: 'Wall Slides' });
  t.check('it shows up in the second session', (await row.count()) === 1);
  await page.evaluate((id) => { S.library[id].sets = 7; }, wallId);
  await go(page, 'capture/A');
  await page.waitForTimeout(400);
  t.check('a change reaches both sessions', (await page.evaluate((id) =>
    S.templates.C.exercises.find((x) => x.id === id).sets, wallId)) === 7);
  await page.evaluate(async (id) => { S.library[id].sets = 3; await saveTemplates(); }, wallId);

  // ---------- taking it out of every session leaves it in the list ----------
  await go(page, 'exercise/A/' + wallId);
  await page.waitForTimeout(400);
  await page.locator('.sessbtn[data-k="A"]').click();
  await page.locator('.sessbtn[data-k="C"]').click();
  await page.waitForTimeout(200);
  t.check('the note says it is in none',
    (await page.textContent('#sessNote')).includes('In no session'));
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('it is in no session', (await page.evaluate((id) => sessionsWith(id).length, wallId)) === 0);
  t.check('but it is still in the library', (await lib(page)).includes('Wall Slides'));
  t.check('and listed as loose', (await page.evaluate(() =>
    orphanEx().map((e) => e.name))).includes('Wall Slides'));

  await go(page, 'settings');
  await page.waitForTimeout(500);
  t.check('Exercises shows a section for it',
    (await page.locator('.sectionlabel:text("Not in any session")').count()) === 1);
  t.check('with the exercise in it', (await page.textContent('body')).includes('Wall Slides'));
  await go(page, 'capture/A');
  await page.waitForTimeout(400);
  t.check('Session A no longer offers it',
    (await page.locator('.exrow').filter({ hasText: 'Wall Slides' }).count()) === 0);

  // ---------- a loose exercise can still be added to a workout ----------
  await page.click('#bAddEx');
  await page.waitForTimeout(400);
  const opts = await page.locator('#fAddEx option').allTextContents();
  t.check('the picker offers it', opts.some((o) => o.includes('Wall Slides')));
  t.check('marked as belonging to no session',
    opts.some((o) => o.startsWith('—') && o.includes('Wall Slides')));
  await page.selectOption('#fAddEx', { label: opts.find((o) => o.includes('Wall Slides')) });
  await page.waitForTimeout(400);
  t.check('and it joins the workout',
    (await page.locator('.exrow').filter({ hasText: 'Wall Slides' }).count()) === 1);

  // ---------- its history was never touched ----------
  t.check('the chart still has its line', (await page.evaluate(() =>
    [...progressSeries().keys()].some((k) => /Wall Slides/.test(k)) ||
    S.entries.some((e) => (e.exercises || []).some((x) => x.name === 'Wall Slides')))) === true);

  // ---------- put it back in a session ----------
  await go(page, 'exercise/-/' + wallId);
  await page.waitForTimeout(400);
  t.check('the editor opens from the loose list', (await page.inputValue('#fName')) === 'Wall Slides');
  await page.locator('.sessbtn[data-k="A"]').click();
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('it is back in A', (await page.evaluate((id) => sessionsWith(id).join(), wallId)) === 'A');
  t.check('and nothing is loose again', (await page.evaluate(() => orphanEx().length)) === 0);

  // ---------- a brand new exercise, in no session ----------
  await go(page, 'exercise/-/new');
  await page.waitForTimeout(400);
  t.check('a new one starts in no session', (await page.locator('.sessbtn.on').count()) === 0);
  await page.fill('#fName', 'Farmer Carry');
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('it was created', (await lib(page)).includes('Farmer Carry'));
  t.check('belonging to nothing', (await page.evaluate(() =>
    orphanEx().map((e) => e.name))).includes('Farmer Carry'));

  // ---------- two exercises cannot share a name ----------
  await go(page, 'exercise/-/new');
  await page.waitForTimeout(400);
  await page.fill('#fName', 'Farmer Carry');
  await page.click('#bSave');
  await page.waitForTimeout(600);
  t.check('a duplicate name is refused', (await page.locator('#fName').count()) === 1);
  t.check('and nothing was added', (await lib(page)).filter((n) => n === 'Farmer Carry').length === 1);

  // ---------- deleting takes it out everywhere, history intact ----------
  const fcId = await page.evaluate(() => libAll().find((e) => e.name === 'Farmer Carry').id);
  await go(page, 'exercise/-/' + fcId);
  await page.waitForTimeout(400);
  await page.click('#bDel');
  await page.waitForTimeout(900);
  t.check('it is gone from the library', !(await lib(page)).includes('Farmer Carry'));

  // ---------- deleting a session leaves its exercises alone ----------
  const before = (await lib(page)).length;
  await page.evaluate(async () => {
    S.templates.Z = { key: 'Z', name: 'Spare', items: [S.templates.B.items[0]] };
    await saveTemplates();
  });
  await go(page, 'session/Z');
  await page.waitForTimeout(400);
  await page.click('#bRemove');
  await page.waitForTimeout(900);
  t.check('the session went', (await page.evaluate(() => !!S.templates.Z)) === false);
  t.check('its exercise stayed in the library', (await lib(page)).length === before);
  t.check('and is still in the session it came from', (await page.evaluate(() =>
    S.templates.B.exercises.length)) === 6);

  await browser.close();
  t.end(errs);
})();
