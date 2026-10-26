/* A session cut short: one set of three is still a set, and the day should
   hold it — then let you come back and finish the other two. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('partial');

const rows = (page) => page.locator('.exrow');
const marksOn = (page, i) => rows(page).nth(i).locator('.setmark.on').count();
const today = (page) => page.evaluate(() =>
  S.entries.find((e) => e.type === 'workout' && e.date === todayStr()) || null);

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    for (const e of S.entries.filter((x) => x.type === 'workout' && x.date === todayStr()))
      await entryDel(e.id);
    try { localStorage.clear(); } catch (err) {}
    await loadState();
  });
  const planned = await page.evaluate(() => S.templates.A.exercises[0].sets);
  t.check('the first exercise plans three sets', planned === 3);

  // ---------- one set of three, then save ----------
  await go(page, 'capture/A');
  t.check('nothing marked to begin with', (await marksOn(page, 0)) === 0);
  await rows(page).nth(0).locator('.setbtn').click();
  await page.waitForTimeout(250);
  t.check('one set is marked', (await marksOn(page, 0)) === 1);
  t.check('the row is not counted as done',
    !(await rows(page).nth(0).getAttribute('class')).includes('done'));
  t.check('the counter still says none done', (await page.textContent('#doneCount')).startsWith('0 of'));

  await page.click('.savebtn');
  await page.waitForTimeout(1000);

  const e1 = await today(page);
  t.check('the workout saved rather than being dropped', !!e1);
  t.check('the part-done exercise is in it', e1 && e1.exercises.length === 1);
  t.check('with one set, not three', e1.exercises[0].sets === 1);
  t.check('and the plan recorded alongside', e1.exercises[0].plan === 3);

  t.check('the template still plans three sets',
    (await page.evaluate(() => S.templates.A.exercises[0].sets)) === 3);

  // ---------- come back and pick it up where it was left ----------
  await go(page, 'capture/A');
  t.check('it comes back showing one of three', (await marksOn(page, 0)) === 1);
  t.check('not ticked off', !(await rows(page).nth(0).getAttribute('class')).includes('done'));
  t.check('the sets stepper shows the plan, not the part done',
    (await rows(page).nth(0).locator('.stepper input').nth(0).inputValue()) === '3');
  t.check('the tag says how much was saved',
    (await rows(page).nth(0).locator('.savedtag').textContent()) === '1 set saved');

  // ---------- finish the other two ----------
  await rows(page).nth(0).locator('.setbtn').click();
  await page.waitForTimeout(200);
  t.check('two of three now', (await marksOn(page, 0)) === 2);
  await rows(page).nth(0).locator('.setbtn').click();
  await page.waitForTimeout(300);
  t.check('three of three', (await marksOn(page, 0)) === 3);
  t.check('and the row ticks itself off',
    (await rows(page).nth(0).getAttribute('class')).includes('done'));

  await page.click('.savebtn');
  await page.waitForTimeout(1000);
  const e2 = await today(page);
  t.check('the day now holds all three sets', e2.exercises[0].sets === 3);
  t.check('and no longer calls itself part done', e2.exercises[0].plan === undefined);
  t.check('still one exercise, not two', e2.exercises.length === 1);

  await go(page, 'capture/A');
  t.check('it comes back fully ticked',
    (await rows(page).nth(0).getAttribute('class')).includes('done'));
  t.check('with the plain tag',
    (await rows(page).nth(0).locator('.savedtag').textContent()) === 'saved earlier');

  // ---------- a part-done exercise reads as "1 of 3" in the history ----------
  await page.evaluate(async () => {
    const e = S.entries.find((x) => x.type === 'workout' && x.date === todayStr());
    e.exercises[0].sets = 1; e.exercises[0].plan = 3;
    await saveEntry(e);
    /* the record is being changed behind the screen's back, so drop the draft
       the last visit left behind — a live draft rightly wins over the record */
    try { localStorage.clear(); } catch (err) {}
  });
  await go(page, 'entry/' + (await today(page)).id);
  await page.waitForTimeout(400);
  t.check('the entry shows one of three', (await page.textContent('body')).includes('1 of 3 × '));

  // ---------- dropping it back out still works ----------
  await go(page, 'capture/A');
  t.check('back to one of three', (await marksOn(page, 0)) === 1);
  await rows(page).nth(0).locator('.donebtn').click();   // on, fills the marks
  await page.waitForTimeout(200);
  await rows(page).nth(0).locator('.donebtn').click();   // off, clears them
  await page.waitForTimeout(250);
  t.check('no sets marked', (await marksOn(page, 0)) === 0);
  await page.click('.savebtn');
  await page.waitForTimeout(1000);
  t.check('the exercise came out of the day again', (await today(page)) === null ||
    !(await today(page)).exercises.some((x) => !x.skipped));

  // ---------- saving with nothing marked at all is still refused ----------
  await page.evaluate(async () => {
    for (const e of S.entries.filter((x) => x.type === 'workout' && x.date === todayStr()))
      await entryDel(e.id);
    try { localStorage.clear(); } catch (err) {}
    await loadState();
  });
  await go(page, 'capture/A');
  await page.click('.savebtn');
  await page.waitForTimeout(700);
  t.check('nothing was written', (await today(page)) === null);
  t.check('and it stayed on the capture screen', (await page.locator('.exrow').count()) > 0);

  await browser.close();
  t.end(errs);
})();
