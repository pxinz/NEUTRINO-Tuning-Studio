const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const out = path.join(root, 'docs', 'screenshots');
  const exe = path.join(root, 'release', 'win-unpacked', 'NEUTRINO Tuning Studio.exe');
  const env = { ...process.env, NT_USER_DATA: path.join(root, 'scratch', `userdata-pkg-${Date.now()}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: exe, args: [], env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 30000 });
  console.log('PACKAGED_VERSION', await page.title());
  await page.getByRole('button', { name: /打开示例曲/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  console.log('PACKAGED_RENDER_RESULT', await page.locator('.render-result').count());
  console.log('AUDIO_STATUS', (await page.locator('.statusbar').innerText()).slice(0, 220));
  await page.screenshot({ path: path.join(out, 'windows-packaged.png') });
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
