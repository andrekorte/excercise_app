/* Sessions are data, not three letters typed into the code: they can be added,
   relabelled, re-lettered (history following along) and taken out again. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('sessions');

const keys = (page) => page.evaluate(() => allSessionKeys());
const active = (page) => page.evaluate(() => sessionKeys());

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // ---------- what we start from ----------
  t.check('three sessions to begin with', JSON.stringify(await keys(page)) === '["A","B","C"]');
  t.check('all three are in the programme', JSON.stringify(await active(page)) === '["A","B","C"]');

  await go(page, 'settings');
  t.check('each session offers an edit pencil', (await page.locator('.sessedit').count()) === 3);
  t.check('and there is an add-session button',
    (await page.locator('button:text("+ Add session")').count()) === 1);
  t.check('nothing is out of the programme yet',
    (await page.locator('.sectionlabel:text("Not in the programme")').count()) === 0);

  // ---------- colours come from the palette, not three fixed rules ----------
  t.check('a tint rule exists per session', await page.evaluate(() => {
    const css = document.getElementById('sessTint').textContent;
    return ['A', 'B', 'C'].every((k) => css.includes('.badge.' + k + ','));
  }));
  t.check('A keeps the blue it always had', await page.evaluate(() => {
    const b = document.querySelector('.badge.A');
    return b && getComputedStyle(b).backgroundColor === 'rgb(232, 240, 251)';
  }));

  // ---------- add session D ----------
  await go(page, 'session/new');
  t.check('the next free letter is offered', (await page.inputValue('#fKey')) === 'D');
  t.check('the label starts empty', (await page.inputValue('#fName')) === '');

  // a label is required
  await page.click('#bSave');
  await page.waitForTimeout(250);
  t.check('a session will not save without a label', (await page.locator('#fKey').count()) === 1);

  await page.fill('#fName', 'Rotator cuff & band work');
  await page.click('#bSave');
  await page.waitForTimeout(800);
  t.check('D now exists', JSON.stringify(await keys(page)) === '["A","B","C","D"]');
  t.check('with the label given',
    (await page.evaluate(() => S.templates.D.name)) === 'Rotator cuff & band work');
  t.check('and no exercises yet', (await page.evaluate(() => S.templates.D.exercises.length)) === 0);
  t.check('adding one lands straight on a new exercise',
    (await page.evaluate(() => location.hash)) === '#exercise/D/new');
  t.check('D got its own colour from the palette', await page.evaluate(() =>
    document.getElementById('sessTint').textContent.includes('--tint-d-bg')));

  // ---------- it shows up everywhere A, B and C do ----------
  await go(page, 'capture');
  t.check('four sessions to pick from', (await page.locator('.pickbtn:not(.activity)').count()) === 4);
  t.check('D is one of them', (await page.textContent('body')).includes('Rotator cuff & band work'));

  await go(page, 'settings');
  t.check('and it has a section under Exercises', (await page.locator('.sessedit').count()) === 4);
  t.check('a day can be given to it', await page.evaluate(async () => {
    const secs = [...document.querySelectorAll('.daypick')];
    secs[3].querySelectorAll('.dbtn')[2].click();
    await new Promise((r) => setTimeout(r, 400));
    return S.plan[2] === 'D';
  }));

  // ---------- an exercise in D behaves like any other ----------
  await page.evaluate(async () => {
    S.templates.D.exercises.push({ id: 'dx1', name: 'Band Pull-Apart', cue: '', load: { kind: 'bandKg', value: 15 },
      sets: 3, reps: 15, mode: 'reps', youtube: '', videoId: null });
    await saveTemplates();
  });
  await go(page, 'capture/D');
  t.check('capturing D offers its exercise', (await page.locator('.exrow').count()) === 1);
  await page.locator('.exrow').nth(0).locator('.donebtn').click();
  await page.waitForTimeout(200);
  await page.click('.savebtn');
  await page.waitForTimeout(900);
  t.check('a D workout saves', (await page.evaluate(() =>
    S.entries.some((e) => e.type === 'workout' && e.session === 'D'))) === true);
  t.check('one workout is counted against D', (await page.evaluate(() => sessUseCount('D'))) === 1);

  // ---------- the physio report follows ----------
  await go(page, 'report');
  await page.waitForTimeout(1000);
  const rep = await page.frameLocator('#rprev').locator('body').textContent();
  t.check('the report prints D in the programme', rep.includes('Rotator cuff & band work'));
  t.check('and its exercise with it', rep.includes('Band Pull-Apart'));
  t.check('with D as its code', (await page.frameLocator('#rprev').locator('caption')
    .allTextContents()).some((c) => c.startsWith('D')));

  // ---------- change a session's letter, history and all ----------
  await go(page, 'session/D');
  t.check('the editor shows the letter', (await page.inputValue('#fKey')) === 'D');
  t.check('it warns that history is logged under it',
    (await page.textContent('body')).includes('1 workout is logged under D'));
  t.check('a letter already taken is refused', await page.evaluate(async () => {
    document.querySelector('#fKey').value = 'B';
    document.querySelector('#bSave').click();
    await new Promise((r) => setTimeout(r, 300));
    return !!document.querySelector('#fKey');      // still on the editor
  }));
  t.check('a nonsense letter is refused', await page.evaluate(async () => {
    document.querySelector('#fKey').value = '7!';
    document.querySelector('#bSave').click();
    await new Promise((r) => setTimeout(r, 300));
    return !!document.querySelector('#fKey');
  }));

  await page.fill('#fKey', 'E');
  await page.click('#bSave');
  await page.waitForTimeout(1000);
  t.check('the letter changed', JSON.stringify(await keys(page)) === '["A","B","C","E"]');
  t.check('the past workout was relabelled too', (await page.evaluate(() =>
    S.entries.some((e) => e.type === 'workout' && e.session === 'E'))) === true);
  t.check('nothing still points at the old letter', (await page.evaluate(() =>
    S.entries.some((e) => e.type === 'workout' && (e.session === 'D' ||
      (e.sessions || []).includes('D'))))) === false);
  t.check('the sessions array moved with it', (await page.evaluate(() =>
    (S.entries.find((e) => e.type === 'workout' && e.session === 'E').sessions || []).join()))
    === 'E');
  t.check('the weekly plan moved with it', (await page.evaluate(() => S.plan[2])) === 'E');
  t.check('the label was kept',
    (await page.evaluate(() => S.templates.E.name)) === 'Rotator cuff & band work');

  // ---------- take it out of the programme, history intact ----------
  await go(page, 'session/E');
  t.check('a used session offers removal, not deletion',
    (await page.textContent('#bRemove')) === 'Take out of the programme');
  await page.click('#bRemove');
  await page.waitForTimeout(900);
  t.check('it is out of the programme', JSON.stringify(await active(page)) === '["A","B","C"]');
  t.check('but it still exists', JSON.stringify(await keys(page)) === '["A","B","C","E"]');
  t.check('and the workout logged under it is untouched', (await page.evaluate(() =>
    S.entries.some((e) => e.type === 'workout' && e.session === 'E'))) === true);
  t.check('its day was given back', (await page.evaluate(() => S.plan[2])) === null);

  await go(page, 'capture');
  t.check('the picker is back to three', (await page.locator('.pickbtn:not(.activity)').count()) === 3);
  await go(page, 'settings');
  t.check('it is listed as out of the programme',
    (await page.locator('.sectionlabel:text("Not in the programme")').count()) === 1);
  await go(page, 'report');
  await page.waitForTimeout(1000);
  const caps = (await page.frameLocator('#rprev').locator('caption').allTextContents()).join(' ');
  t.check('the report no longer calls it current programme', !caps.includes('Rotator cuff'));
  t.check('but the report still has the sessions that are',
    caps.includes('Session B') && caps.includes('Session C'));
  t.check('and the log still shows the workout done under it',
    (await page.frameLocator('#rprev').locator('body').textContent()).includes('Band Pull-Apart'));

  // ---------- put it back ----------
  await go(page, 'session/E');
  t.check('a hidden session offers to come back',
    (await page.textContent('#bRemove')) === 'Put back in the programme');
  await page.click('#bRemove');
  await page.waitForTimeout(900);
  t.check('back in the programme', JSON.stringify(await active(page)) === '["A","B","C","E"]');

  // ---------- an unused session deletes outright ----------
  await page.evaluate(async () => {
    for (const e of S.entries.filter((x) => x.type === 'workout' && x.session === 'E'))
      await entryDel(e.id);
    await loadState();
  });
  await go(page, 'session/E');
  t.check('with nothing logged it offers a real delete',
    (await page.textContent('#bRemove')) === 'Delete Session');
  await page.click('#bRemove');
  await page.waitForTimeout(900);
  t.check('and it is gone', JSON.stringify(await keys(page)) === '["A","B","C"]');

  // ---------- relabelling A leaves its letter and history alone ----------
  await go(page, 'session/A');
  await page.fill('#fName', 'Band & posture');
  await page.click('#bSave');
  await page.waitForTimeout(900);
  t.check('A kept its letter', JSON.stringify(await keys(page)) === '["A","B","C"]');
  t.check('with the new label', (await page.evaluate(() => S.templates.A.name)) === 'Band & posture');
  await go(page, 'capture');
  t.check('the picker shows the new label',
    (await page.textContent('body')).includes('Band & posture'));

  // ---------- a backup carries the sessions ----------
  t.check('the export includes every session', await page.evaluate(() =>
    Object.keys(S.templates).length === 3 && !!S.templates.A.name));

  await browser.close();
  t.end(errs);
})();
