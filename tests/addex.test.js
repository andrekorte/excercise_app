/* Adding an exercise to a session while you are doing it, not only when
   editing it afterwards. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('addex');

const rows = (page) => page.locator('.exrow');
const names = (page) => rows(page).locator('.exname').allTextContents();
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

  // ---------- the button is there on a live session ----------
  await go(page, 'capture/A');
  t.check('Session A starts with its own three', (await names(page)).length === 3);
  t.check('and offers to add another', (await page.locator('#bAddEx').count()) === 1);
  t.check('the picker is out of the way until asked for',
    (await page.locator('#addSel.hidden').count()) === 1);

  await page.click('#bAddEx');
  await page.waitForTimeout(300);
  const opts = await page.locator('#fAddEx option').allTextContents();
  t.check('the picker opened', opts.length > 1);
  t.check('it offers exercises from the other sessions',
    opts.some((o) => o.startsWith('B · ')) && opts.some((o) => o.startsWith('C · ')));
  t.check('and not the three already on screen',
    !opts.some((o) => o.includes('Wall Slides')));

  // ---------- add one ----------
  const pick = opts.find((o) => o.includes('Floor Press'));
  await page.selectOption('#fAddEx', { label: pick });
  await page.waitForTimeout(400);
  const after = await names(page);
  t.check('it joined the list', after.length === 4);
  t.check('at the bottom', after[3].includes('Floor Press'));
  t.check('the picker closed again', (await page.locator('#addSel.hidden').count()) === 1);
  t.check('the counter counts it', (await page.textContent('#doneCount')).includes('of 4'));
  t.check('it came with its own numbers', await page.evaluate(() => {
    const te = S.templates.B.exercises.find((x) => /Floor Press/.test(x.name));
    const inp = [...document.querySelectorAll('.exrow')][3].querySelectorAll('.stepper input');
    return inp[0].value === String(te.load.value);
  }));
  t.check('and can be ticked set by set like any other',
    (await rows(page).nth(3).locator('.setmark').count()) > 0);

  // ---------- it survives the phone locking mid-session ----------
  await rows(page).nth(3).locator('.setbtn').click();
  await page.waitForTimeout(300);
  await go(page, 'home');
  await go(page, 'capture/A');
  await page.waitForTimeout(400);
  const back = await names(page);
  t.check('the added exercise came back', back.length === 4 && back[3].includes('Floor Press'));
  t.check('with the set already marked against it',
    (await rows(page).nth(3).locator('.setmark.on').count()) === 1);

  // ---------- and it saves into the day ----------
  await rows(page).nth(0).locator('.donebtn').click();
  await page.waitForTimeout(200);
  await page.click('.savebtn');
  await page.waitForTimeout(1100);
  const e = await today(page);
  t.check('the day holds both', e && e.exercises.length === 2);
  t.check('including the one added by hand',
    e.exercises.some((x) => /Floor Press/.test(x.name)));
  t.check('with the one set it got', e.exercises.find((x) => /Floor Press/.test(x.name)).sets === 1);

  // ---------- editing afterwards still offers it too ----------
  await go(page, 'editworkout/' + e.id);
  await page.waitForTimeout(500);
  t.check('the edit screen still has the button', (await page.locator('#bAddEx').count()) === 1);
  await page.click('#bAddEx');
  await page.waitForTimeout(300);
  t.check('and no longer offers what is already in the day',
    !(await page.locator('#fAddEx option').allTextContents()).some((o) => o.includes('Floor Press')));

  // ---------- nothing left to add says so ----------
  await page.evaluate(async () => {
    const ent = S.entries.find((x) => x.type === 'workout' && x.date === todayStr());
    for (const k of sessionKeys()) for (const te of S.templates[k].exercises)
      if (!ent.exercises.some((x) => x.name === te.name))
        ent.exercises.push({ name: te.name, cue: '', load: JSON.parse(JSON.stringify(te.load)),
          sets: te.sets, reps: te.reps, mode: te.mode, skipped: false });
    await saveEntry(ent);
  });
  await go(page, 'editworkout/' + e.id);
  await page.waitForTimeout(500);
  await page.click('#bAddEx');
  await page.waitForTimeout(300);
  t.check('the picker stays shut when there is nothing to add',
    (await page.locator('#fAddEx').count()) === 0);

  await browser.close();
  t.end(errs);
})();
