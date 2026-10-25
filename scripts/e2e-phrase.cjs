const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-phrase', `userdata-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });
  const sampleXml =
    process.env.NT_SAMPLE_XML ||
    (process.env.NEUTRINO_ROOT
      ? path.join(process.env.NEUTRINO_ROOT, 'score', 'musicxml', 'sample1.musicxml')
      : '');
  if (!sampleXml) {
    throw new Error('Set NT_SAMPLE_XML or NEUTRINO_ROOT to a NEUTRINO installation with sample1.musicxml.');
  }
  const env = {
    ...process.env,
    NT_USER_DATA: userData,
    NT_TEST: '1',
    NT_TEST_OPEN_PATH: sampleXml,
    NT_TEST_DIALOG_DIR: path.join(root, 'scratch-phrase', 'saved'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /导入 MusicXML/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  console.log('IMPORTED_NOTES', await page.locator('.note').count());
  await page.waitForTimeout(500);

  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  const workspaces = fs.readdirSync(path.join(userData, 'workspace'));
  const ws = path.join(userData, 'workspace', workspaces[0]);
  const phrasesPath = path.join(ws, 'phrases.txt');
  if (!fs.existsSync(phrasesPath)) throw new Error('phrases.txt was not generated');
  const phraseLines = fs.readFileSync(phrasesPath, 'utf8').trim().split(/\r?\n/);
  console.log('PHRASES', phraseLines.length, phraseLines.slice(0, 5).join(' | '));
  fs.copyFileSync(path.join(ws, 'output.wav'), path.join(root, 'scratch-phrase', 'before.wav'));

  await page.locator('.tab', { hasText: '音高' }).click();
  await page.waitForSelector('.pitch-surface');
  await page.waitForTimeout(400);
  const box = await page.locator('.pitch-surface').boundingBox();
  if (!box) throw new Error('pitch surface missing');
  const y = box.y + box.height * 0.45;
  await page.mouse.move(box.x + box.width * 0.12, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.16, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'pitch-phrase-edit.png') });

  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => document.querySelector('.render-btn.running') !== null, null, { timeout: 10000 }).catch(() => {});
  const runningMode = (await page.locator('.render-mode-label').innerText()).replace(/\s+/g, ' ');
  console.log('RUNNING_MODE', runningMode);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const doneMode = (await page.locator('.render-mode-label').innerText()).replace(/\s+/g, ' ');
  console.log('DONE_MODE', doneMode);
  const log = fs.readFileSync(path.join(ws, 'render.log'), 'utf8');
  console.log('LOG_MODE_PHRASE', /mode=phrase/.test(log));
  console.log('LOG_PHRASE_STAGE', /\[studio\] phrase 1\/1/.test(log));
  console.log('LOG_SINGLE_PHRASE', /use single phrase prediction\s*:\s*on/.test(log));
  console.log('LOG_PHRASE_TAIL', log.split(/\r?\n/).filter((l) => /phrase|mode=/.test(l)).slice(-8).join('\n'));
  console.log('AUDIO_STATUS', (await page.locator('.statusbar').innerText()).replace(/\s+/g, ' ').slice(0, 250));
  fs.copyFileSync(path.join(ws, 'output.wav'), path.join(root, 'scratch-phrase', 'after.wav'));
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
