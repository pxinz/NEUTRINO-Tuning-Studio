const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'scratch', 'shots');
const dialogDir = path.join(root, 'scratch', 'e2e-out');
fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(dialogDir, { recursive: true, force: true });
fs.mkdirSync(dialogDir, { recursive: true });
const userData = path.join(root, 'scratch', `userdata-e2e-${Date.now()}`);

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
}

async function waitRender(page) {
  await page.waitForTimeout(300);
  await page
    .waitForFunction(() => !!document.querySelector('.render-btn.running'), null, { timeout: 4000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 180000 });
  await page.waitForTimeout(500);
}

async function openLogAndText(page) {
  const logButton = page.locator('.topbar-actions-right [aria-label="日志"]');
  if (!(await page.locator('.log-drawer').count())) await logButton.click();
  await page.waitForSelector('.log-drawer');
  await page.waitForTimeout(200);
  const text = await page.locator('.log-body').innerText();
  await logButton.click();
  return text;
}

(async () => {
  const env = {
    ...process.env,
    NT_USER_DATA: userData,
    NT_TEST: '1',
    NT_TEST_DIALOG_DIR: dialogDir,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.stack || err.message}`));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /打开示例曲/ }).click();
  await page.waitForSelector('.editor-area', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '13-e2e-score.png') });
  const scoreInfo = await page.locator('.editor-toolbar').innerText();
  console.log('NOTES_RENDERED', await page.locator('.note').count(), 'SCORE_INFO', scoreInfo.replace(/\s+/g, ' '));
  assert(scoreInfo.includes('29'), 'demo score declares 29 notes');

  console.log('full render…');
  await page.locator('.render-primary').click();
  await waitRender(page);
  assert(await page.locator('.render-result').count() === 1, 'render result visible');
  assert((await page.locator('.render-result').innerText()).includes('48000 Hz'), 'audio info visible');
  await page.screenshot({ path: path.join(outDir, '14-e2e-rendered.png') });
  console.log('full render OK');

  await page.locator('.tab', { hasText: '音高' }).click();
  await page.waitForTimeout(400);
  const pitchBox = await page.locator('.pitch-surface').boundingBox();
  assert(pitchBox, 'pitch surface exists');
  const px = pitchBox.x + pitchBox.width * 0.33;
  const py = pitchBox.y + pitchBox.height * 0.5;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 40, py - 12, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert(await page.locator('.edited-pill').count() >= 1, 'pitch edited marker appears');
  await page.screenshot({ path: path.join(outDir, '15-e2e-pitch-edited.png') });
  console.log('vocode render…');
  await page.locator('.render-primary').click();
  await waitRender(page);
  const vocodeLog = await openLogAndText(page);
  assert(vocodeLog.includes('mode=vocode'), 'vocode mode used for pitch-only render');
  assert(vocodeLog.includes('use gpu'), 'gpu log present');
  await page.screenshot({ path: path.join(outDir, '16-e2e-vocoded.png') });
  console.log('vocode render OK');

  // Save the project through the real save flow (test dialog redirects).
  await page.locator('.topbar-actions-left .icon-btn[aria-label="保存"]').click();
  await page.waitForTimeout(800);
  const projectFile = path.join(dialogDir, 'Spring Breeze.ntstudio');
  assert(fs.existsSync(projectFile), 'project file was saved');
  const saved = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  assert(saved.format === 'neutrino-tuning-studio', 'saved project format');
  assert(saved.pitch && saved.pitch.current, 'saved project contains F0 data');
  assert(saved.render && saved.render.wavPath, 'saved project contains render info');
  console.log('project save OK', projectFile);

  await page.locator('.tab', { hasText: '时序' }).click();
  await page.waitForTimeout(500);
  const workspaceBase = path.join(userData, 'workspace');
  const workspace = fs.readdirSync(workspaceBase).map((d) => path.join(workspaceBase, d))[0];
  const timingLines = fs.readFileSync(path.join(workspace, 'timing.lab'), 'utf8').trim().split(/\r?\n/);
  const boundary = Number(timingLines[Math.min(8, timingLines.length - 1)].split(/\s+/)[0]) / 1e7;
  const timingBox = await page.locator('.timing-surface').boundingBox();
  assert(timingBox, 'timing surface exists');
  const tx = timingBox.x + boundary * 70;
  if (tx > timingBox.x + 40 && tx < timingBox.x + timingBox.width - 40) {
    await page.mouse.move(tx, timingBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(tx + 24, timingBox.y + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
  assert(await page.locator('.edited-pill').count() >= 1, 'timing edited marker appears');
  await page.screenshot({ path: path.join(outDir, '17-e2e-timing-edited.png') });
  console.log('timing render…');
  await page.locator('.render-primary').click();
  await waitRender(page);
  const timingLog = await openLogAndText(page);
  assert(timingLog.includes('mode=timing'), 'timing mode used');
  await page.screenshot({ path: path.join(outDir, '18-e2e-timing-rerendered.png') });
  console.log('timing render OK');

  await page.locator('.tab', { hasText: '动态' }).click();
  await page.waitForTimeout(300);
  const dynBox = await page.locator('.dynamics-surface').boundingBox();
  if (dynBox) {
    await page.mouse.click(dynBox.x + dynBox.width * 0.42, dynBox.y + dynBox.height * 0.35);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(outDir, '19-e2e-dynamics.png') });

  // Export vocal WAV through the test save dialog.
  await page.getByRole('button', { name: 'WAV', exact: true }).click();
  await page.waitForTimeout(1500);
  const wavPath = path.join(dialogDir, 'Spring Breeze-vocal.wav');
  assert(fs.existsSync(wavPath), 'exported vocal WAV exists');
  assert(fs.statSync(wavPath).size > 100000, 'exported WAV has audio data');
  console.log('WAV export OK', fs.statSync(wavPath).size);

  // Language switch.
  await page.locator('.topbar-actions-right [aria-label="语言"]').click();
  await page.getByText('日本語', { exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, '20-e2e-japanese.png') });
  assert((await page.locator('body').innerText()).includes('スコア'), 'Japanese UI active');
  await page.locator('.topbar-actions-right [aria-label="言語"]').click();
  await page.getByText('English', { exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, '21-e2e-english.png') });
  assert((await page.locator('body').innerText()).includes('Score'), 'English UI active');

  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((err) => { console.error(err); process.exit(1); });
