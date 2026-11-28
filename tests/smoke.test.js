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

  // ---------- the shell fills the screen exactly, on every screen ----------
  // with the phone's safe areas applied, which is where this went wrong: a
  // band of empty page sat under the tab bar and nothing here could see it
  for (const hash of ['home', 'capture/A', 'settings', 'progress', 'coach', 'report', 'health']) {
    await go(page, hash);
    await page.waitForTimeout(450);
    const g = await page.evaluate(() => {
      const nav = document.querySelector('nav.tabs');
      if (!nav) return { skip: true };
      const nr = nav.getBoundingClientRect();
      const M = document.querySelector('#main').getBoundingClientRect();
      return { skip: false,
        bodyH: Math.round(document.body.getBoundingClientRect().height),
        viewH: innerHeight,
        belowNav: Math.round(innerHeight - nr.bottom),
        mainToNav: Math.round(nr.top - M.bottom),
        navH: Math.round(nr.height) };
    });
    if (g.skip) continue;
    t.check(hash + ': the shell fills the screen', g.bodyH === g.viewH);
    t.check(hash + ': nothing below the tab bar', g.belowNav === 0);
    t.check(hash + ': no gap above it', g.mainToNav === 0);
    /* 49pt of bar is the iOS norm; with a 34pt home indicator that is 83-ish.
       Anything much over means dead space like the band this test was written for. */
    t.check(hash + ': the bar is a sensible height (' + g.navH + ')', g.navH >= 70 && g.navH <= 92);
  }

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

  // ---------- every number in a capture row is readable ----------
  // twice now a layout change has left one of the three boxes too narrow and
  // clipped the value — a weight of 162.5, or a plain 12 reps
  await page.evaluate(async () => {
    const mk = (id, name, load, sets, reps, mode) => ({ id, name, cue: '', load,
      sets, reps, mode: mode || 'reps', youtube: '', videoId: null });
    const a = mk('w_a', 'Widest', { kind: 'kg', value: 162.5 }, 3, 20);
    const b = mk('w_b', 'Held', { kind: 'none', value: null }, 3, 45, 'secs');
    const c = mk('w_c', 'Banded', { kind: 'bandKg', value: 100 }, 3, 12);
    c.places = [{ name: 'Home', load: { kind: 'bandKg', value: 20 }, sets: 3, reps: 12 },
                { name: 'City', load: { kind: 'bandKg', value: 100 }, sets: 3, reps: 12 },
                { name: 'Dolphins', load: { kind: 'bandKg', value: 55 }, sets: 3, reps: 12 }];
    c.place = 1;
    for (const e of [a, b, c]) { S.library[e.id] = e; S.templates.A.items.push(e.id); }
    await saveTemplates(); await loadState();
  });
  for (const size of [{ width: 320, height: 800 }, { width: 375, height: 812 },
                      { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await go(page, 'capture/A');
    await page.waitForTimeout(400);
    const clipped = await page.evaluate(() => {
      const bad = [];
      for (const row of document.querySelectorAll('.exrow'))
        for (const ctl of row.querySelectorAll('.ctl')) {
          const inp = ctl.querySelector('input');
          if (inp && inp.scrollWidth > inp.clientWidth + 1)
            bad.push(ctl.querySelector('label').textContent + '="' + inp.value + '"');
        }
      return bad;
    });
    t.check('no number is clipped at ' + size.width + 'px — ' + (clipped.join(', ') || 'all fit'),
      clipped.length === 0);
  }
  await page.setViewportSize({ width: 390, height: 950 });

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
