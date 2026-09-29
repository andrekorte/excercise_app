/* The physio report as a PDF, and the tap that hands it to the share sheet. */
const fs = require('fs');
const { BASE, suite, open, go } = require('./lib');
const t = suite('pdf');

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // something from every section, so the document exercises all of them
  await page.evaluate(async () => {
    await entryPut({ id: 'bpA', type: 'bp', date: '2026-09-27', time: '08:30', createdAt: 1,
      sys: 113, dia: 76, pulse: 82, tag: 'post', comments: '' });
    await entryPut({ id: 'medA', type: 'meditation', date: '2026-09-28', createdAt: 2,
      afterWake: true, outside: true, minutes: 10, timed: true, points: 3 });
    await entryPut({ id: 'swimA', type: 'swim', date: '2026-09-20', createdAt: 3,
      laps: 20, style: 'front crawl', comments: '' });
    await loadState();
  });
  await go(page, 'report');
  await page.waitForTimeout(900);

  t.check('the button says what it does',
    (await page.textContent('#bPdf')) === 'Email as PDF');
  t.check('the old print button is gone', (await page.locator('#bPrint').count()) === 0);

  // --- the document ---
  const built = await page.evaluate(() => {
    const t0 = performance.now();
    const bytes = reportPDF(reportModel());
    const ms = performance.now() - t0;
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return { ms, len: bytes.length, b64: btoa(s) };
  });
  const buf = Buffer.from(built.b64, 'base64');
  const raw = buf.toString('latin1');
  fs.writeFileSync(__dirname + '/out.pdf', buf);

  t.check('it is a PDF', raw.startsWith('%PDF-1.'));
  t.check('and a complete one', raw.trimEnd().endsWith('%%EOF'));
  t.check('of a sensible size', buf.length > 8000 && buf.length < 4e6);

  // Fast enough to run inside the tap. iOS only opens the share sheet for a
  // handler that is still inside its user gesture, so this is not a nicety.
  t.check('built in well under a second', built.ms < 400);

  // --- the cross-reference table has to be right or viewers reject the file ---
  const start = parseInt(raw.slice(raw.lastIndexOf('startxref') + 9).trim(), 10);
  t.check('startxref points at the table', raw.slice(start, start + 4) === 'xref');
  const lines = raw.slice(start).split('\n');
  const total = parseInt(lines[1].split(' ')[1], 10);
  let offsetsGood = true;
  for (let i = 1; i < total; i++) {
    const off = parseInt(lines[2 + i].slice(0, 10), 10);
    if (!new RegExp('^' + i + ' 0 obj').test(raw.slice(off, off + 20))) offsetsGood = false;
  }
  t.check('every object offset lands on its object', offsetsGood);
  t.check('the trailer counts them', raw.includes('/Size ' + total));
  t.check('there is a catalog', /\/Type \/Catalog/.test(raw));

  const pages = (raw.match(/\/Type \/Page[^s]/g) || []).length;
  const declared = parseInt((raw.match(/\/Count (\d+)/) || [])[1], 10);
  t.check('more than one page', pages > 1);
  t.check('the page tree count matches the pages', pages === declared);
  t.check('stream lengths match their streams', await page.evaluate(() => {
    const bytes = reportPDF(reportModel());
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const re = /<< \/Length (\d+) >>\nstream\n/g; let m, ok = true;
    while ((m = re.exec(s))) {
      const body = s.slice(m.index + m[0].length, m.index + m[0].length + Number(m[1]));
      if (s.slice(m.index + m[0].length + body.length, m.index + m[0].length + body.length + 11)
        !== '\nendstream\n') ok = false;
    }
    return ok;
  }));

  // --- the content ---
  t.check('titled', raw.includes('Shoulder rehabilitation'));
  t.check('has the summary', raw.includes('1. SUMMARY SINCE LAST PHYSIO VISIT'));
  t.check('has the programme', raw.includes('2. CURRENT PROGRAMME'));
  t.check('has the session log', raw.includes('3. SESSION LOG'));
  t.check('has the progression', raw.includes('4. LOAD PROGRESSION'));
  t.check('has the blood pressure', raw.includes('5. BLOOD PRESSURE'));
  t.check('has the charts', raw.includes('PROGRESS CHARTS'));
  t.check('has the full data', raw.includes('FULL DATA'));
  t.check('the readings are in it', raw.includes('113') && raw.includes('After workout'));
  t.check('meditation is left out, as it is everywhere else',
    !/meditat/i.test(raw.replace(/\/[A-Za-z]+/g, '')));
  t.check('charts are drawn as vectors, not pictures', raw.includes(' l\n') || / l /.test(raw));
  t.check('no image objects at all', !raw.includes('/Subtype /Image'));

  // Helvetica is a standard font, so nothing is embedded and the file stays small
  t.check('uses the built-in fonts', raw.includes('/BaseFont /Helvetica'));
  t.check('with the right encoding', raw.includes('/Encoding /WinAnsiEncoding'));

  // --- accented and typographic characters must not corrupt the file ---
  const odd = await page.evaluate(() => {
    const bytes = (function () {
      const d = pdfDoc(); d.page();
      d.text('André · 7.5 kg × 3 — “quoted” … 20°', 40, 11, {});
      return pdfBytes(d.done());
    })();
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  });
  t.check('accents are encoded, not dropped', odd.includes('\\351'));      // e-acute
  t.check('the middot survives', odd.includes('\\267'));
  t.check('the multiplication sign survives', odd.includes('\\327'));
  t.check('parentheses would be escaped', (await page.evaluate(() => pdfStr('a (b) c\\d'))) === 'a \\(b\\) c\\\\d');

  // --- the tap itself ---
  const shared = await page.evaluate(async () => {
    const seen = {};
    navigator.canShare = () => true;
    navigator.share = (data) => {
      seen.files = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
      seen.title = data.title;
      // the whole point: still inside the gesture when share is called
      seen.activation = navigator.userActivation ? navigator.userActivation.isActive : null;
      return Promise.resolve();
    };
    document.getElementById('bPdf').click();
    await new Promise((r) => setTimeout(r, 400));
    return seen;
  });
  t.check('tapping shares a file', !!shared.files && shared.files.length === 1);
  t.check('it is a PDF', shared.files[0].type === 'application/pdf');
  t.check('named for the day', /^shoulder-report-\d{4}-\d{2}-\d{2}\.pdf$/.test(shared.files[0].name));
  t.check('with real bytes in it', shared.files[0].size > 8000);
  t.check('the share sheet still has permission to open', shared.activation !== false);

  // --- and when the phone will not take a file ---
  const fell = await page.evaluate(async () => {
    navigator.canShare = () => false;
    let downloaded = null;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
    document.getElementById('bPdf').click();
    await new Promise((r) => setTimeout(r, 300));
    HTMLAnchorElement.prototype.click = realClick;
    return { downloaded, msg: document.getElementById('pdfMsg').textContent };
  });
  t.check('it saves the file instead', /\.pdf$/.test(fell.downloaded || ''));
  t.check('and says where it went', /downloads/i.test(fell.msg));

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
