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

  // ---------- an exercise done in three places is still one exercise ----------
  // it used to take a row per place in the programme and in the progression,
  // which reads to a physio as three different exercises
  await page.evaluate(async () => {
    const ex = { id: 'tri1', name: 'Triceps', cue: 'Elbows in', load: { kind: 'kg', value: 80 },
      sets: 3, reps: 12, mode: 'reps', youtube: '', videoId: null,
      places: [{ name: 'Home', load: { kind: 'kg', value: 30 }, sets: 3, reps: 12 },
               { name: 'City', load: { kind: 'kg', value: 80 }, sets: 3, reps: 12 },
               { name: 'Dolphins', load: { kind: 'kg', value: 62.5 }, sets: 3, reps: 10 }], place: 1 };
    S.library[ex.id] = ex; S.templates.B.items.push(ex.id);
    await saveTemplates();
    const plan = [['2026-09-26', 'Home', 26], ['2026-10-03', 'City', 70],
                  ['2026-10-17', 'Dolphins', 55], ['2026-10-31', 'Home', 30],
                  ['2026-11-14', 'City', 77.5], ['2026-11-19', 'Dolphins', 62.5]];
    for (const [iso, place, kg] of plan) {
      for (const e of S.entries.filter((x) => x.type === 'workout' && x.date === iso)) await entryDel(e.id);
      await entryPut({ id: uid(), type: 'workout', session: 'B', sessions: ['B'], date: iso,
        createdAt: Date.parse(iso), note: '', exercises: [{ name: 'Triceps', cue: '',
          load: { kind: 'kg', value: kg }, sets: 3, reps: 12, mode: 'reps', skipped: false,
          place: { i: places().indexOf(place), name: place } }] });
    }
    await loadState();
  });
  await go(page, 'report');
  await page.waitForTimeout(1200);
  const d2 = page.frameLocator('#rprev');

  const progRows = (await d2.locator('table tr').allTextContents()).filter((r) => /Triceps/.test(r));
  t.check('the programme names it once', await page.evaluate(() => {
    const rows = [];
    for (const k of sessionKeys()) for (const x of S.templates[k].exercises) rows.push(...tmplRows(x));
    return rows.filter((r) => r.name === 'Triceps').length === 1;
  }));
  t.check('the progression has one record for it', await page.evaluate(() =>
    reportModel().prog.filter((r) => r.name === 'Triceps').length === 1));
  t.check('no row is labelled with a place', !progRows.some((r) => /Triceps · /.test(r)));

  const model = await page.evaluate(() => {
    const m = reportModel();
    const r = m.prog.find((x) => x.name === 'Triceps');
    const row = tmplRows(S.library.tri1)[0];
    return { first: r.first.load, latest: r.latest.load, vol: r.first.vol,
             up: r.up, count: r.count, progLoad: row.load, progSets: row.sets, progVol: row.vol };
  });
  t.check('the first column lists each place', model.first === '26 kg home · 70 kg city · 55 kg dolphins');
  t.check('and so does the latest', model.latest === '30 kg home · 77.5 kg city · 62.5 kg dolphins');
  t.check('sets and reps are said once when they match everywhere', model.vol === '3 × 12');
  t.check('it counts every session, wherever it was done', model.count === 6);
  t.check('and is marked as a rise', model.up === true);
  t.check('the programme row lists the three weights', model.progLoad.split(' · ').length === 3);
  t.check('with the sets collapsed, since they are all three', String(model.progSets) === '3');
  t.check('and the reps spelled out, since one place differs',
    model.progVol === '3 × 12 home · 3 × 12 city · 3 × 10 dolphins');

  const txt2 = await page.evaluate(() => reportText(reportModel()));
  /* three tables mention it — what changed since the visit, the programme,
     and the progression — and each names it exactly once */
  t.check('the text report names it once per table',
    txt2.split('\n').filter((l) => l.startsWith('Triceps\t')).length === 3);
  t.check('the data sheet does not repeat the place in the name',
    !txt2.split('\n').some((l) => /\tTriceps · /.test(l)));

  // ---------- each session is headed with the days it is scheduled for ----------
  await page.evaluate(async () => {
    S.plan = ['A', 'A', 'A', 'B', null, 'C', null];   // Mon-Wed A, Thu B, Sat C
    await savePlan();
  });
  await go(page, 'report');
  await page.waitForTimeout(1200);
  const caps = (await page.frameLocator('#rprev').locator('caption').allTextContents()).join(' | ');
  t.check('the screen names the days in brackets', /Session A \(Mon, Tue, Wed\)/.test(caps));
  t.check('a session on one day too', /Session B \(Thu\)/.test(caps));

  const txt3 = await page.evaluate(() => reportText(reportModel()));
  t.check('the plain text carries them', txt3.includes('Session A (Mon, Tue, Wed)'));
  const mail = await page.evaluate(() => reportEmailHTML(reportModel()));
  t.check('the pasted email carries them', mail.includes('Session A (Mon, Tue, Wed)'));
  t.check('and the PDF does', await page.evaluate(() => {
    const s = new TextDecoder('latin1').decode(reportPDF(reportModel()));
    return s.includes('Session A \\(Mon, Tue, Wed\\)');
  }));

  // a session with no day assigned gets no empty brackets
  await page.evaluate(async () => { S.plan = ['A', null, null, null, null, null, null]; await savePlan(); });
  await go(page, 'report');
  await page.waitForTimeout(1200);
  const caps2 = (await page.frameLocator('#rprev').locator('caption').allTextContents()).join(' | ');
  t.check('an unscheduled session has no brackets', /Session B ·/.test(caps2));
  t.check('while the scheduled one still shows its day', /Session A \(Mon\)/.test(caps2));

  // ---------- the weekly schedule, a line per day ----------
  await page.evaluate(async () => {
    S.plan = ['A', 'A', 'A', 'B', null, 'C', null];
    await savePlan();
  });
  await go(page, 'report');
  await page.waitForTimeout(1300);
  const fr3 = page.frameLocator('#rprev');
  const heads = (await fr3.locator('.shead h2').allTextContents());
  t.check('there is a weekly schedule section', heads.includes('Weekly schedule'));
  t.check('it sits right after the programme',
    heads.indexOf('Weekly schedule') === heads.indexOf('Current programme') + 1);
  t.check('the sections below it renumbered themselves',
    (await fr3.locator('.shead .snum').allTextContents()).join() === '01,02,03,04,05,06,07');

  const wk = await page.evaluate(() => weekRows());
  t.check('seven days, one line each', wk.length === 7);
  t.check('Monday names its session', wk[0].session === 'Session A');
  t.check('and lists that day\'s exercises',
    wk[0].ex === 'Wall Slides, Watson Shrug, Lateral Raise 90/90');
  t.check('the same exercises on every day that session falls', wk[1].ex === wk[0].ex);
  t.check('an empty day reads Rest day', wk[4].session === 'Rest day' && wk[4].ex === '');
  t.check('and so does Sunday', wk[6].session === 'Rest day');
  t.check('Saturday has its own session', wk[5].session === 'Session C');

  const wkTxt = await page.evaluate(() => reportText(reportModel()));
  t.check('the plain text has the section', wkTxt.includes('WEEKLY SCHEDULE'));
  t.check('with a day per line',
    /Mon\tSession A\tWall Slides, Watson Shrug, Lateral Raise 90\/90/.test(wkTxt));
  t.check('and the rest days', /Fri\tRest day/.test(wkTxt));
  const wkMail = await page.evaluate(() => reportEmailHTML(reportModel()));
  t.check('the pasted email has it', wkMail.includes('Weekly schedule') && wkMail.includes('Rest day'));
  t.check('the PDF has it', await page.evaluate(() => {
    const s = new TextDecoder('latin1').decode(reportPDF(reportModel()));
    return /\d\. WEEKLY SCHEDULE/.test(s) && s.includes('Rest day');
  }));

  // with nothing planned the section stays away rather than printing seven rest days
  await page.evaluate(async () => { S.plan = [null, null, null, null, null, null, null]; await savePlan(); });
  await go(page, 'report');
  await page.waitForTimeout(1300);
  t.check('no plan, no section',
    !(await page.frameLocator('#rprev').locator('.shead h2').allTextContents()).includes('Weekly schedule'));
  t.check('and the numbering closes up', (await page.frameLocator('#rprev')
    .locator('.shead .snum').allTextContents()).join() === '01,02,03,04,05,06');

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
