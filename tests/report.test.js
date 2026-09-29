/* The physio report: the summary since the last visit, and a log that reads
   newest first with the appointments ruling it off. */
const { BASE, suite, open, go } = require('./lib');
const t = suite('report');

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  // a visit, then a fortnight of work after it with a load raised and notes written
  await page.evaluate(async () => {
    await entryPut({ id: 'v1', type: 'physio', date: '2026-08-01', createdAt: 1,
      comments: 'Cleared for heavier lateral raises' });
    await entryPut({ id: 'w-pre', type: 'workout', date: '2026-07-30', createdAt: 2,
      session: 'A', sessions: ['A'], note: 'before the visit',
      exercises: [{ name: 'Lateral Raise 90/90', load: { kind: 'kg', value: 5 },
        sets: 3, reps: 15, mode: 'reps', skipped: false }] });
    await entryPut({ id: 'w-post', type: 'workout', date: '2026-08-14', createdAt: 3,
      session: 'A', sessions: ['A'], note: 'felt strong, no pain',
      exercises: [{ name: 'Lateral Raise 90/90', load: { kind: 'kg', value: 7.5 },
        sets: 3, reps: 12, mode: 'reps', skipped: false }] });
    await entryPut({ id: 'i1', type: 'injury', date: '2026-08-09', createdAt: 4,
      comments: 'twinge after gardening' });
    await loadState();
  });
  await go(page, 'report');
  await page.waitForTimeout(1000);

  const doc = page.frameLocator('#rprev');
  const body = await doc.locator('body').textContent();

  // --- the summary ---
  t.check('there is a summary section', body.includes('Summary since last physio visit'));
  t.check('it comes first', (await doc.locator('.snum').first().textContent()) === '01');
  t.check('it names the appointment it counts from', body.includes('Since the appointment on'));
  t.check('and how long ago that was', /\d+ days?\./.test(body));
  t.check('it counts the sessions since', body.includes('Session A'));
  t.check('it reports the load that changed', body.includes('Lateral Raise 90/90'));
  const changed = await doc.locator('.sumgrid .sumcard').nth(2).textContent();
  t.check('the headline counts the changes', changed.includes('1'));
  t.check('pain days counted', (await doc.locator('.sumgrid .sumcard').nth(3).textContent()).includes('1'));
  t.check('the before figure is the one from the visit', body.includes('5 kg'));
  t.check('a single reading is not printed as a range', !/(\d+)–\1/.test(body));
  // the report is an A4 document; on a phone the cards are meant to wrap
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.waitForTimeout(400);
  t.check('all four summary cards sit on one row at page width',
    await doc.locator('.sumgrid').evaluate((g) => {
      const tops = [...g.children].map((c) => c.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops) < 2;
    }));
  await page.setViewportSize({ width: 390, height: 950 });
  await page.waitForTimeout(300);
  t.check('and the after figure is now', body.includes('7.5 kg'));

  // --- the commentary, quoted as he wrote it ---
  t.check('his notes are quoted', body.includes('felt strong, no pain'));
  t.check('so are the injury comments', body.includes('twinge after gardening'));
  const quoted = await doc.locator('.quotes').textContent();
  t.check('but the quotes skip anything from before the visit',
    !quoted.includes('before the visit'));
  t.check('each quote is dated', (await doc.locator('.quotes .qd').count()) >= 2);

  // --- the log ---
  const logSec = doc.locator('section').filter({ hasText: 'Session log' }).first();
  const rows = await logSec.locator('tbody tr').allTextContents();
  t.check('the log is newest first', rows.length > 1
    && /Aug 14/.test(rows[0]) && !/Aug 14/.test(rows[rows.length - 1]));
  t.check('it says so in the header', body.includes('most recent first'));
  t.check('the appointment is a full-width divider', (await doc.locator('tr.visit').count()) === 1);
  t.check('and the divider sits between the work either side of it', await (async () => {
    const i = rows.findIndex((r) => r.includes('PHYSIO APPOINTMENT'));
    return i > 0 && i < rows.length - 1;
  })());
  t.check('it spans every column',
    (await doc.locator('tr.visit td').getAttribute('colspan')) === '4');
  t.check('it is labelled', (await doc.locator('tr.visit').textContent()).includes('PHYSIO APPOINTMENT'));
  t.check('and carries what the physio said',
    (await doc.locator('tr.visit').textContent()).includes('Cleared for heavier'));
  t.check('the appointment is not also an ordinary row',
    rows.filter((r) => r.includes('Physio')).length === 0);
  t.check('sections renumbered below it', body.includes('Full data'));

  // --- the same in the plain text, which is what the coach reads ---
  const txt = await page.evaluate(() => reportText(reportModel()));
  t.check('text report leads with the summary', txt.includes('1. SUMMARY SINCE LAST PHYSIO VISIT'));
  t.check('text log is newest first', txt.includes('3. SESSION LOG (most recent first)'));
  const logPart = txt.split('3. SESSION LOG')[1].split('4. LOAD')[0];
  t.check('the appointment rules off the text log', logPart.includes('--- PHYSIO APPOINTMENT'));
  t.check('newest row precedes oldest in the text',
    logPart.indexOf('2026-08-14') < logPart.indexOf('2026-07-30'));
  t.check('the coach gets the summary too',
    (await page.evaluate(() => coachData())).includes('SUMMARY SINCE LAST PHYSIO'));

  // --- and in the PDF ---
  const raw = await page.evaluate(() => {
    const b = reportPDF(reportModel());
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  });
  t.check('the PDF has the summary', raw.includes('1. SUMMARY SINCE LAST PHYSIO VISIT'));
  t.check('the PDF log says most recent first', raw.includes('MOST RECENT FIRST'));
  t.check('the PDF marks the appointment', raw.includes('PHYSIO APPOINTMENT'));
  t.check('the PDF quotes his notes', raw.includes('felt strong'));
  t.check('the PDF is still well formed', raw.startsWith('%PDF-1.') && raw.trimEnd().endsWith('%%EOF'));

  // --- with no appointment recorded at all, it still says something sensible ---
  await page.evaluate(async () => { await entryDel('v1'); await loadState(); });
  await go(page, 'report');
  await page.waitForTimeout(900);
  const body2 = await page.frameLocator('#rprev').locator('body').textContent();
  t.check('no visit yet is handled', body2.includes('No physio appointment has been recorded'));
  t.check('and it covers everything instead', body2.includes('whole period'));

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
