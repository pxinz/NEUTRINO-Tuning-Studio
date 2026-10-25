const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const testDir = path.join(root, 'scratch-full-vs-inc');
  const userData = path.join(testDir, `userdata-${Date.now()}`);
  const dialogDir = path.join(testDir, 'saved');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(dialogDir, { recursive: true });
  const sampleXml = process.env.NT_SAMPLE_XML || (process.env.NEUTRINO_ROOT
    ? path.join(process.env.NEUTRINO_ROOT, 'score', 'musicxml', 'sample1.musicxml')
    : '');
  if (!sampleXml) throw new Error('Set NT_SAMPLE_XML or NEUTRINO_ROOT.');
  const baseEnv = {
    ...process.env,
    NT_USER_DATA: userData,
    NT_TEST: '1',
    NT_TEST_DIALOG_DIR: dialogDir,
  };
  delete baseEnv.ELECTRON_RUN_AS_NODE;

  const launch = async (openPath) => {
    const env = { ...baseEnv };
    if (openPath) env.NT_TEST_OPEN_PATH = openPath;
    const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
    const page = await app.firstWindow({ timeout: 30000 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    return { app, page, errors };
  };
  const waitRender = async (page) => {
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
    await page.waitForTimeout(700);
  };

  // Take A: full render with the original pitch curve.
  let { app, page, errors } = await launch(sampleXml);
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /导入 MusicXML/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator('.render-primary').click();
  await waitRender(page);
  const ws = path.join(userData, 'workspace', fs.readdirSync(path.join(userData, 'workspace'))[0]);
  fs.copyFileSync(path.join(ws, 'output.wav'), path.join(testDir, 'full-original.wav'));

  // Edit pitch and take B: dirty-region render.
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
  await page.waitForTimeout(400);
  await page.locator('.render-primary').click();
  await waitRender(page);
  const incremLog = fs.readFileSync(path.join(ws, 'render.log'), 'utf8');
  const windows = [...incremLog.matchAll(/dirty window (\d+)-(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  console.log('INCREMENTAL_WINDOWS', JSON.stringify(windows));
  fs.copyFileSync(path.join(ws, 'output.wav'), path.join(testDir, 'incremental.wav'));
  fs.copyFileSync(path.join(ws, 'output.f0'), path.join(testDir, 'incremental.f0'));
  fs.copyFileSync(path.join(ws, 'output.melspec'), path.join(testDir, 'incremental.melspec'));
  fs.copyFileSync(path.join(ws, 'timing.lab'), path.join(testDir, 'incremental.timing.lab'));

  // Save, then strip render metadata so a reopen must perform a full re-render.
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(900);
  const savedFiles = fs.readdirSync(dialogDir).filter((f) => f.endsWith('.ntstudio'));
  if (!savedFiles.length) throw new Error('project was not saved');
  const savedPath = path.join(dialogDir, savedFiles[0]);
  const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  saved.render = null;
  fs.writeFileSync(savedPath, JSON.stringify(saved, null, 2));
  console.log('SAVED_PROJECT', savedPath);
  console.log('ERRORS_RUN1', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));

  // Take C: reopen the same pitch/timing state without render metadata, full render.
  ({ app, page, errors } = await launch(savedPath));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: '打开项目' }).first().click();
  await page.waitForSelector('.note', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.locator('.render-primary').click();
  await waitRender(page);
  fs.copyFileSync(path.join(ws, 'output.wav'), path.join(testDir, 'full-edited.wav'));
  fs.copyFileSync(path.join(ws, 'output.f0'), path.join(testDir, 'full-edited.f0'));
  fs.copyFileSync(path.join(ws, 'output.melspec'), path.join(testDir, 'full-edited.melspec'));
  fs.copyFileSync(path.join(ws, 'timing.lab'), path.join(testDir, 'full-edited.timing.lab'));
  const fullLog = fs.readFileSync(path.join(ws, 'render.log'), 'utf8');
  console.log('FULL_MODE_LOG', /mode=full/.test(fullLog), /mode=vocode/.test(fullLog));
  console.log('ERRORS_RUN2', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
