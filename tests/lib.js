/* Shared harness. Every suite drives the real app in Chromium against a local
   server; nothing is stubbed except the Anthropic API, which is intercepted so
   the tests neither need a key nor spend anything. */
const { chromium } = require('playwright-core');

const BASE = process.env.APP_URL || 'http://127.0.0.1:8321/';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

function suite(name) {
  let failures = 0, count = 0;
  return {
    check(what, ok) { count++; console.log((ok ? '  ok  ' : ' FAIL ') + what); if (!ok) failures++; },
    fail() { failures++; },
    end(errs) {
      console.log('errors: ' + (errs && errs.length ? errs.join('; ') : 'none'));
      if (errs && errs.length) failures++;
      console.log(failures === 0 ? name.toUpperCase() + ' PASSED (' + count + ')'
                                 : failures + ' FAILURES in ' + name);
      process.exit(failures ? 1 : 0);
    },
  };
}

async function open(opts) {
  const o = opts || {};
  const browser = await chromium.launch({ executablePath: CHROME, args: o.args || [] });
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 390, height: 950 } });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    // a deliberately failed fetch logs to the console; that is the test working
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text());
  });
  page.on('dialog', (d) => d.accept());
  return { browser, ctx, page, errs };
}

/* navigating to the hash you are already on does nothing, which has bitten
   every suite at least once — always come at a screen from somewhere else */
async function go(page, hash) {
  await page.goto(BASE + '#home');
  await page.waitForTimeout(180);
  await page.goto(BASE + (hash ? '#' + hash : ''));
  await page.waitForTimeout(550);
}

module.exports = { BASE, CHROME, suite, open, go };
