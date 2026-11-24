/* A walk through every screen. Cheap insurance that a change somewhere has not
   thrown an exception somewhere else. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('smoke');

(async () => {
  const { browser, ctx, page, errs } = await open();
  // the coach screens need a key to show anything but the setup form
  await ctx.route('https://api.anthropic.com/**', (r) => r.fulfill({ status: 200,
    contentType: 'text/event-stream', body: '' }));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => kvSet('aiKey', 'sk-ant-test'));

  t.check('the app comes up', (await page.textContent('#appbar h1')) === 'Shoulder Trainer');
  t.check('the seeded history is there', (await page.locator('#feed .card').count()) > 5);

  // --- the home screen offers everything it should ---
  for (const [id, what] of [['bCap', 'capture'], ['bPhy', 'physio'], ['bInj', 'injury break'],
    ['bMed', 'meditation'], ['bBP', 'blood pressure']])
    t.check('home has ' + what, await page.isVisible('#' + id));

  t.check('four tabs', (await page.locator('nav.tabs a').count()) === 4);
  t.check('tabs named', (await page.locator('nav.tabs a').allTextContents()).join()
    === 'Home,Progress,Exercises,Coach');

  // --- every route renders something and throws nothing ---
  const routes = ['home', 'capture', 'capture/A', 'capture/B', 'capture/C',
    'physio', 'injury', 'run', 'swim', 'bike', 'bp', 'bplog',
    'meditate', 'medlog', 'progress', 'settings', 'report', 'coach', 'coach/log', 'coach/setup'];
  for (const r of routes) {
    await go(page, r);
    const body = (await page.textContent('#main')) || '';
    const ok = body.trim().length > 0 && !body.includes('Something went wrong');
    t.check('#' + r + ' renders', ok);
  }

  // --- capture still works end to end ---
  await go(page, 'capture/A');
  t.check('exercises listed', (await page.locator('.exrow').count()) === 3);
  await page.locator('.exrow .donebtn').first().click();
  await page.waitForTimeout(250);
  t.check('ticking marks it done', (await page.locator('.exrow.done').count()) === 1);
  const before = await page.evaluate(() => S.entries.length);
  await page.click('.savebtn');
  await page.waitForTimeout(700);
  t.check('saving adds or merges a workout',
    (await page.evaluate(() => S.entries.length)) >= before);
  t.check('and lands back home', (await page.textContent('#appbar h1')) === 'Shoulder Trainer');

  // --- progress has the series it should ---
  await go(page, 'progress');
  const opts = await page.locator('#fSel option').allTextContents();
  t.check('all exercises is the default', opts[0] === 'All exercises');
  t.check('weighted exercises trend', opts.some((o) => /Lateral Raise/.test(o)));
  t.check('charts drawn', (await page.locator('.viz-root svg').count()) > 0);

  // --- the report builds ---
  await go(page, 'report');
  await page.waitForTimeout(900);
  const rep = await page.frameLocator('#rprev').locator('body').textContent();
  t.check('report has content', rep.length > 500);
  t.check('report names the programme', rep.includes('Session A'));
  t.check('report offers email, PDF and address',
    await page.isVisible('#bMail') && await page.isVisible('#bPdf') && await page.isVisible('#bAddr'));

  // --- export carries the right things and not the key ---
  const exp = await page.evaluate(async () => {
    const about = (await kvGet('aiAbout')) || '';
    const facts = await aiFacts();
    return JSON.stringify({ app: 'shoulder-trainer', templates: S.templates,
      entries: S.entries, about, facts });
  });
  t.check('a backup has the data', exp.includes('Wall Slides'));
  t.check('a backup never has the key', !exp.includes('sk-ant-test'));

  // ---------- the tab bar is part of the layout, not floating over it ----------
  // it used to be position:fixed over a scrolling page, and iOS would now and
  // then strand it in the middle of the screen with the workout showing below
  for (const size of [{ width: 320, height: 700 }, { width: 390, height: 844 },
                      { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await go(page, 'capture/A');
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav.tabs'), r = nav.getBoundingClientRect();
      const M = document.querySelector('#main'), mr = M.getBoundingClientRect();
      return { pos: getComputedStyle(nav).position,
        atBottom: Math.abs(r.bottom - innerHeight) < 1,
        pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
        mainAboveNav: Math.round(mr.bottom) <= Math.round(r.top) + 1,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    const at = size.width + 'px';
    t.check('the bar is not floating at ' + at, m.pos !== 'fixed');
    t.check('it sits on the bottom edge at ' + at, m.atBottom);
    t.check('the page itself does not scroll at ' + at, !m.pageScrolls);
    t.check('and nothing can hide behind it at ' + at, m.mainAboveNav);
    t.check('no sideways scroll at ' + at, !m.sideways);
  }
  await page.setViewportSize({ width: 390, height: 950 });

  // the long screens scroll inside themselves, and reach their end
  for (const hash of ['capture/B', 'settings', 'progress']) {
    await go(page, hash);
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      const M = document.querySelector('#main');
      M.scrollTop = M.scrollHeight;
      const nav = document.querySelector('nav.tabs').getBoundingClientRect();
      return Math.round(M.getBoundingClientRect().bottom) <= Math.round(nav.top) + 1;
    });
    t.check(hash + ' scrolls to its end above the bar', ok);
  }

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
