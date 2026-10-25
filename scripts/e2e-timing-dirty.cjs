const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-timing-dirty', `userdata-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });
  const sampleXml = process.env.NT_SAMPLE_XML || (process.env.NEUTRINO_ROOT
    ? path.join(process.env.NEUTRINO_ROOT, 'score', 'musicxml', 'sample1.musicxml')
    : '');
  if (!sampleXml) throw new Error('Set NT_SAMPLE_XML or NEUTRINO_ROOT.');
  const env = {
    ...process.env,
    NT_USER_DATA: userData,
    NT_TEST: '1',
    NT_TEST_OPEN_PATH: sampleXml,
    NT_TEST_DIALOG_DIR: path.join(userData, 'saved'),
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
  await page.waitForTimeout(400);
  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(700);

  const workspace = path.join(userData, 'workspace', fs.readdirSync(path.join(userData, 'workspace'))[0]);
  fs.copyFileSync(path.join(workspace, 'output.wav'), path.join(userData, 'before.wav'));
  await page.locator('.tab', { hasText: '时序' }).click();
  await page.waitForSelector('.timing-surface');
  await page.waitForTimeout(500);
  const timingLines = fs.readFileSync(path.join(workspace, 'timing.lab'), 'utf8').trim().split(/\r?\n/);
  const boundaryLine = timingLines[Math.min(8, timingLines.length - 1)].split(/\s+/);
  const boundary = Number(boundaryLine[0]) / 1e7;
  const zoomText = await page.locator('.zoom-label').innerText();
  const pxPerSec = Number(zoomText.split(/\s+/)[0]);
  const box = await page.locator('.timing-surface').boundingBox();
  if (!box) throw new Error('timing surface missing');
  const x = box.x + boundary * pxPerSec;
  console.log('TIMING_EDIT', { boundary, pxPerSec, x, width: box.width });
  await page.mouse.move(x, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(x + 24, box.y + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  console.log('EDITED_PILL', await page.locator('.edited-pill').count());

  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  const log = fs.readFileSync(path.join(workspace, 'render.log'), 'utf8');
  const timingWindows = [...log.matchAll(/timing dirty splice windows=([^\r\n]+)/g)].map((m) => m[1]);
  console.log('LOG_MODE_TIMING', /mode=timing/.test(log));
  console.log('TIMING_WINDOWS', timingWindows);
  console.log('DONE_MODE', await page.locator('.render-mode-label').innerText());
  fs.copyFileSync(path.join(workspace, 'output.wav'), path.join(userData, 'after.wav'));

  // Dynamics-only changes must not launch a full render.
  await page.locator('.tab', { hasText: '动态' }).click();
  await page.waitForTimeout(400);
  const dyn = await page.locator('.dynamics-surface').boundingBox();
  if (dyn) await page.mouse.click(dyn.x + dyn.width * 0.4, dyn.y + dyn.height * 0.5);
  await page.waitForTimeout(300);
  await page.locator('.render-primary').click();
  await page.waitForTimeout(500);
  console.log('DYNAMICS_RENDER_RUNNING', await page.locator('.render-btn.running').count());
  console.log('TOAST_TEXT', await page.locator('.toast').last().innerText().catch(() => ''));
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
