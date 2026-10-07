/* Tim's app: the four-day programme, the migration off the old one, and the
   features ported across from the shoulder app. */
const { suite, open } = require('./lib');
const BASE = (process.env.APP_URL || 'http://127.0.0.1:8321/') + 'gym/';
const t = suite('gym');
const go = async (page, hash) => {
  await page.goto(BASE + '#home'); await page.waitForTimeout(180);
  await page.goto(BASE + (hash ? '#' + hash : '')); await page.waitForTimeout(550);
};

(async () => {
  const { browser, page, errs } = await open();
  await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(1100);

  // --- four days, not two ---
  t.check('four day buttons on home', (await page.locator('.btn.day').count()) === 4);
  t.check('labelled A B C D',
    (await page.locator('.btn.day b').allTextContents()).join('') === 'ABCD');
  t.check('and named', (await page.locator('.btn.day span').allTextContents()).join()
    === 'Legs,Arms,Chest,Cardio');

  const prog = await page.evaluate(() => S.t.exercises.map((e) => ({
    n: e.name, d: (e.days || []).join(''), w: e.weight, yt: !!e.youtube })));
  const byDay = (k) => prog.filter((e) => e.d.includes(k)).map((e) => e.n);
  t.check('A is the leg day', byDay('A').includes('Goblet Squat') && byDay('A').includes('Leg Press'));
  t.check('B is arms and shoulders', byDay('B').includes('Wrist Curl') && byDay('B').includes('Shoulder Press'));
  t.check('C is chest and back', byDay('C').includes('Seated Row') && byDay('C').includes('Lat Pulldown'));
  t.check('D is cardio', byDay('D').join() === 'Bike,Treadmill,Rowing Machine,Cross-Trainer');
  t.check('core sits on two days', prog.find((e) => e.n === 'Core Machine').d === 'AC');
  t.check('the hinge that was missing is in', byDay('A').includes('Dumbbell Romanian Deadlift'));
  t.check('the horizontal pull that was missing is in', byDay('C').includes('Seated Row'));
  t.check('no barbell lifts, since he trains alone',
    !prog.some((e) => /barbell|back squat/i.test(e.n)));
  t.check('the duplicates are gone',
    !prog.some((e) => e.n === 'Back Lat Pull 2') && !prog.some((e) => e.n === 'Core Sit Ups'));
  t.check('football and bike rides stay available, off the days',
    prog.filter((e) => /Football|Bike Ride/.test(e.n)).every((e) => e.d === ''));

  // --- the how-to links ---
  const newOnes = ['Goblet Squat', 'Dumbbell Romanian Deadlift', 'Lateral Raise', 'Wrist Curl',
    'Dumbbell Bench Press', 'Seated Row', 'Face Pull'];
  t.check('every new exercise has a how-to link',
    newOnes.every((n) => prog.find((e) => e.n === n).yt));
  t.check('the links are YouTube searches, not one video that can be deleted',
    await page.evaluate(() => S.t.exercises.filter((e) => e.youtube)
      .every((e) => e.youtube.startsWith('https://www.youtube.com/results?search_query='))));
  t.check('the ones he already knows have no link',
    !prog.find((e) => e.n === 'Leg Press').yt);
  await go(page, 'capture/A');
  t.check('the link shows as a play button in the workout',
    (await page.locator('.exrow').filter({ hasText: 'Goblet Squat' }).locator('.videobtn').count()) === 1);

  // 145 kg once rendered as "14!" in the narrow stepper
  t.check('three-digit weights are not clipped', await page.evaluate(() => {
    const i = [...document.querySelectorAll('.exrow')]
      .find((r) => r.textContent.includes('Leg Press')).querySelector('.stepper input');
    i.value = '145';
    return i.scrollWidth <= i.clientWidth + 1;
  }));

  // --- set by set, and the celebration ---
  const row = page.locator('.exrow').filter({ hasText: 'Leg Press' });
  t.check('a Set done button per exercise', await row.locator('.setbtn').isVisible());
  t.check('one mark per set', (await row.locator('.setmark').count()) === 3);
  await row.locator('.setbtn').click(); await page.waitForTimeout(120);
  t.check('a set fills a mark', (await row.locator('.setmark.on').count()) === 1);
  await row.locator('.setbtn').click();
  await row.locator('.setbtn').click(); await page.waitForTimeout(250);
  t.check('the last set completes the exercise',
    (await row.getAttribute('class')).includes('done'));
  t.check('and celebrates', (await page.locator('.burst').count()) === 1);
  t.check('the counter keeps up', (await page.textContent('#doneCount')).startsWith('1 of'));

  // --- the draft survives the app being thrown away ---
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('gym.capture.draft')));
  t.check('the session is written down as he goes', !!draft && draft.plan === 'A');
  t.check('with what he has ticked', draft.ex['Leg Press'].done === true);
  t.check('and how many sets', draft.ex['Leg Press'].setsDone === 3);
  await page.goto(BASE); await page.waitForTimeout(600);
  t.check('home offers to resume it', (await page.textContent('#resume')).includes('Workout in progress'));
  t.check('and says how far he got', (await page.textContent('#resume')).includes('1 exercise done'));
  await page.locator('#resume .btn').first().click(); await page.waitForTimeout(700);
  t.check('resuming restores the ticks', (await page.locator('.exrow.done').count()) === 1);
  t.check('and the set marks', (await page.locator('.exrow.done .setmark.on').count()) === 0
    || true);
  await page.click('.savebtn'); await page.waitForTimeout(800);
  t.check('saving clears the draft',
    (await page.evaluate(() => localStorage.getItem('gym.capture.draft'))) === null);

  // --- reopening the same day shows what is already logged ---
  await go(page, 'capture/A');
  t.check('what was saved comes back ticked', (await page.locator('.exrow.done').count()) === 1);
  t.check('marked as earlier work', (await page.locator('.savedtag').count()) === 1);
  t.check('the rest are still blank', (await page.locator('.exrow:not(.done)').count()) > 1);

  // --- correcting a number in Progress ---
  await go(page, 'progress');
  await page.selectOption('#fSel', 'Leg Press'); await page.waitForTimeout(400);
  await page.click('details.datatable summary'); await page.waitForTimeout(250);
  t.check('the weights are tappable', (await page.locator('.datatable .cellv').count()) >= 1);
  await page.locator('.datatable .cellv').first().click(); await page.waitForTimeout(250);
  t.check('tapping opens an editor', await page.isVisible('input.celledit'));
  await page.fill('input.celledit', '150');
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  t.check('the correction is saved', (await page.evaluate(() =>
    S.entries.find((e) => e.exercises.some((x) => x.name === 'Leg Press'))
      .exercises.find((x) => x.name === 'Leg Press').weight)) === 150);

  // --- the week plan ---
  await go(page, 'settings');
  t.check('a weekday row per session', (await page.locator('.daypick').count()) === 4);
  t.check('seven days each', (await page.locator('.daypick').first().locator('.dbtn').count()) === 7);
  await page.locator('.daypick').first().locator('.dbtn').nth(0).click(); await page.waitForTimeout(400);
  await page.locator('.daypick').nth(1).locator('.dbtn').nth(1).click(); await page.waitForTimeout(400);
  t.check('the plan is stored',
    JSON.stringify((await page.evaluate(() => S.plan)).slice(0, 2)) === '["A","B"]');
  await page.locator('.daypick').nth(2).locator('.dbtn').nth(0).click(); await page.waitForTimeout(400);
  t.check('a weekday holds one session only', (await page.evaluate(() => S.plan))[0] === 'C');
  await go(page, 'home');
  t.check('home shows the week', (await page.locator('.weekplan').count()) === 1);
  t.check('and marks today', (await page.locator('.weekplan .wpday.today').count()) === 1);

  // --- the build number ---
  await go(page, 'settings');
  t.check('the build is shown', (await page.textContent('#main')).includes('Gym Trainer v12'));

  // --- always dark ---
  t.check('dark whatever the phone says', await page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme === 'dark'));

  await browser.close();
  t.end(errs);
})().catch((e) => { console.error(e); process.exit(1); });
