/* Re-opening a session you half-finished today: what is already in the day
   comes back ticked, and unticking it takes it out again. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('resume');

const capture = async (page, key) => { await go(page, 'capture/' + key); };
const rows = (page) => page.locator('.exrow');

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // start from a clean day
  await page.evaluate(async () => {
    for (const e of S.entries.filter((x) => x.type === 'workout' && x.date === todayStr()))
      await entryDel(e.id);
    await loadState();
  });

  // --- do two of Session A's three and save ---
  await capture(page, 'A');
  const names = await rows(page).locator('.exname').allTextContents();
  t.check('three exercises to do', names.length === 3);
  t.check('all blank to begin with', (await page.locator('.exrow.done').count()) === 0);
  t.check('nothing claims to be saved yet', (await page.locator('.savedtag').count()) === 0);
  await rows(page).nth(0).locator('.donebtn').click();
  await rows(page).nth(1).locator('.donebtn').click();
  await page.waitForTimeout(250);
  await page.click('.savebtn');
  await page.waitForTimeout(800);
  t.check('two logged for the day', (await page.evaluate(() =>
    S.entries.find((e) => e.type === 'workout' && e.date === todayStr()).exercises.length)) === 2);

  // --- come back to it: they are ticked, the third is not ---
  await capture(page, 'A');
  t.check('what was done comes back ticked', (await page.locator('.exrow.done').count()) === 2);
  t.check('and is marked as earlier work', (await page.locator('.savedtag').count()) === 2);
  t.check('the tag sits on the right rows', await page.evaluate((n) => {
    const r = [...document.querySelectorAll('.exrow')];
    return !!r[0].querySelector('.savedtag') && !!r[1].querySelector('.savedtag')
      && !r[2].querySelector('.savedtag');
  }, names));
  t.check('the one still to do is blank',
    !(await rows(page).nth(2).getAttribute('class')).includes('done'));
  t.check('the counter agrees', (await page.textContent('#doneCount')).startsWith('2 of 3'));
  t.check('their set marks are filled', await page.evaluate(() => {
    const r = document.querySelectorAll('.exrow')[0];
    const marks = r.querySelectorAll('.setmark');
    return marks.length > 0 && [...marks].every((m) => m.classList.contains('on'));
  }));
  t.check('no celebration fired on the way in', (await page.locator('.burst').count()) === 0);

  // --- finish the third; all three end up in the day ---
  await rows(page).nth(2).locator('.donebtn').click();
  await page.waitForTimeout(250);
  await page.click('.savebtn');
  await page.waitForTimeout(800);
  t.check('all three logged now', (await page.evaluate(() =>
    S.entries.find((e) => e.type === 'workout' && e.date === todayStr()).exercises.length)) === 3);

  // --- unticking one takes it out, after a confirmation ---
  let asked = '';
  page.on('dialog', (d) => { asked = d.message(); });
  await capture(page, 'A');
  t.check('all three come back ticked', (await page.locator('.exrow.done').count()) === 3);
  await rows(page).nth(1).locator('.donebtn').click();
  await page.waitForTimeout(250);
  await page.click('.savebtn');
  await page.waitForTimeout(900);
  t.check('it asks before removing', /Remove .+ from today/.test(asked));
  t.check('and names what is going', asked.includes(names[1]));
  t.check('and warns it cannot be undone', /cannot be undone/.test(asked));
  const left = await page.evaluate(() =>
    S.entries.find((e) => e.type === 'workout' && e.date === todayStr()).exercises.map((x) => x.name));
  t.check('the unticked one is gone', !left.includes(names[1]));
  t.check('the others stayed', left.length === 2 && left.includes(names[0]));

  // --- unticking everything removes the day rather than leaving an empty card ---
  await capture(page, 'A');
  for (const i of [0, 2]) { await rows(page).nth(i).locator('.donebtn').click(); await page.waitForTimeout(120); }
  t.check('nothing ticked now', (await page.locator('.exrow.done').count()) === 0);
  await page.click('.savebtn');
  await page.waitForTimeout(900);
  t.check('the empty day is removed entirely', (await page.evaluate(() =>
    !S.entries.some((e) => e.type === 'workout' && e.date === todayStr()))));
  t.check('so the timeline has no empty card',
    !(await page.textContent('#feed')).includes('0 exercises'));

  // --- a session that shares no exercises with the day is unaffected ---
  await capture(page, 'A');
  await rows(page).nth(0).locator('.donebtn').click();
  await page.waitForTimeout(150);
  await page.click('.savebtn'); await page.waitForTimeout(800);
  await capture(page, 'B');
  t.check('another session starts blank', (await page.locator('.exrow.done').count()) === 0);
  t.check('and claims nothing was saved', (await page.locator('.savedtag').count()) === 0);

  // --- an older day is never touched by this ---
  await page.evaluate(async () => {
    await entryPut({ id: 'old', type: 'workout', date: '2026-06-15', createdAt: 1,
      session: 'A', sessions: ['A'], note: '',
      exercises: [{ name: 'Wall Slides', load: { kind: 'bandColor', value: 'red' },
        sets: 3, reps: 10, mode: 'reps', skipped: false }] });
    await loadState();
  });
  await capture(page, 'A');
  await page.fill('#fDate', '2026-06-15');
  await page.waitForTimeout(200);
  await rows(page).nth(1).locator('.donebtn').click();
  await page.waitForTimeout(150);
  await page.click('.savebtn'); await page.waitForTimeout(900);
  const old = await page.evaluate(() =>
    S.entries.find((e) => e.id === 'old').exercises.map((x) => x.name));
  t.check('saving to an older date only adds', old.length === 2 && old.includes('Wall Slides'));
  t.check('and today is untouched by it', (await page.evaluate(() => {
    const e = S.entries.find((x) => x.type === 'workout' && x.date === todayStr());
    return e ? e.exercises.length : 0; })) === 1);

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
