const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const shots = path.join(root, 'docs', 'screenshots');
  fs.mkdirSync(shots, { recursive: true });
  const env = { ...process.env, NT_USER_DATA: path.join(root, 'scratch', `userdata-final-${Date.now()}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(shots, 'welcome.png') });
  await page.getByRole('button', { name: /打开示例曲/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  await page.waitForTimeout(800);
  // Select a note so the inspector is populated.
  await page.locator('.note').nth(4).click({ position: { x: 12, y: 10 } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, 'score.png') });

  await page.locator('.render-primary').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.locator('.tab', { hasText: '时序' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, 'timing.png') });
  await page.locator('.tab', { hasText: '音高' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, 'pitch.png') });
  await page.locator('.tab', { hasText: '动态' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, 'dynamics.png') });

  await page.locator('.topbar-actions-right [aria-label="设置"]').click();
  await page.waitForSelector('.settings-layout');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, 'settings.png') });
  await page.locator('.modal-header .icon-btn').click();
  await page.waitForTimeout(200);
  await page.locator('.topbar-actions-right [aria-label="语言"]').click();
  await page.getByText('日本語', { exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shots, 'japanese.png') });
  console.log('SHOTS_OK');
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
