/* The shell against the geometry phones actually report — including the one
   that cost four releases: a home-screen app handed the screen less the
   status bar, laid out from the top, so the page stops short of the bottom. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('shell');

const set = async (page, sat, sab) => {
  await page.addStyleTag({ content: `:root{--sat:${sat}!important;--sab:${sab}!important}` });
  await page.evaluate(() => fitShell());
  await page.waitForTimeout(250);
};
const geom = (page) => page.evaluate(() => {
  const nav = document.querySelector('nav.tabs'), r = nav.getBoundingClientRect();
  const root = getComputedStyle(document.documentElement);
  return { navH: Math.round(r.height), pad: parseFloat(getComputedStyle(nav).paddingBottom),
    endsAt: Math.round(r.bottom), view: window.innerHeight,
    sabEff: root.getPropertyValue('--sabEff').trim(),
    vh: root.getPropertyValue('--vh').trim(),
    bodyH: Math.round(document.body.getBoundingClientRect().height) };
});

(async () => {
  // a viewport 62pt shorter than the screen: his phone exactly
  const { browser, page, errs } = await open({ viewport: { width: 402, height: 812 }, insets: false });
  await page.addInitScript(() => {
    Object.defineProperty(window.screen, 'height', { get: () => 874, configurable: true });
    Object.defineProperty(window.screen, 'width', { get: () => 402, configurable: true });
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ---------- the page does not reach the bottom of the screen ----------
  await go(page, 'settings'); await set(page, '62px', '34px');
  let g = await geom(page);
  t.check('the page is shorter than the screen', g.view === 812);
  t.check('no space is kept for an indicator outside the page', g.sabEff === '0px');
  t.check('so the bar is only a bar (' + g.navH + 'px)', g.navH <= 56);
  t.check('and it still ends at the foot of the page', g.endsAt === g.view);
  t.check('the shell is the measured height', g.vh === '812px' && g.bodyH === 812);

  // ---------- the page sits below the status bar and does reach the bottom ----------
  await go(page, 'settings'); await set(page, '0px', '34px');
  g = await geom(page);
  t.check('with no top inset the indicator is taken as real', g.sabEff === '34px');
  t.check('and the bar keeps its clearance (' + g.navH + 'px)', g.navH >= 80 && g.navH <= 92);
  t.check('still ending at the foot of the page', g.endsAt === g.view);

  // ---------- the ordinary case: the page fills the screen ----------
  await page.evaluate(() => Object.defineProperty(window.screen, 'height',
    { get: () => window.innerHeight, configurable: true }));
  await go(page, 'settings'); await set(page, '59px', '34px');
  g = await geom(page);
  t.check('a full-screen page keeps the indicator clearance', g.sabEff === '34px');
  t.check('with a normal bar (' + g.navH + 'px)', g.navH >= 80 && g.navH <= 92);

  // ---------- and nothing the phone reports can inflate it ----------
  for (const sab of ['0px', '34px', '99px', '150px']) {
    await go(page, 'settings'); await set(page, '59px', sab);
    g = await geom(page);
    t.check('inset ' + sab + ': the bar stays a bar (' + g.navH + 'px)', g.navH <= 92);
    t.check('inset ' + sab + ': at most the indicator below it', g.pad <= 34);
    t.check('inset ' + sab + ': flush with the foot of the page', g.endsAt === g.view);
  }

  // ---------- the status bar style that caused it is gone ----------
  t.check('the page no longer asks to draw under the status bar', await page.evaluate(() => {
    const m = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    return !!m && m.content !== 'black-translucent';
  }));

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
