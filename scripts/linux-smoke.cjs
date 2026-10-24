const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const outDir = path.join(root, 'scratch-linux');
  fs.mkdirSync(outDir, { recursive: true });
  const userData = path.join(outDir, `userdata-${Date.now()}`);
  const env = {
    ...process.env,
    NT_USER_DATA: userData,
    NT_TEST: '1',
    NT_NO_SANDBOX: '1',
    NT_DISABLE_GPU: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    cwd: root,
    env,
    timeout: 60000,
  });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.stack || err.message}`));
  await page.waitForSelector('.welcome', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 'linux-welcome.png') });
  console.log('WELCOME_OK', await page.locator('.welcome').count());
  await page.getByRole('button', { name: /打开示例曲|Open demo|デモ曲を開く/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, 'linux-score.png') });
  console.log('NOTES', await page.locator('.note').count());
  console.log('SCROLLBAR', await page.locator('.pitch-scrollbar').count());
  await page.locator('.log-toggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'linux-log.png') });
  const b1 = await page.locator('.note').first().boundingBox();
  await page.locator('.log-toggle').click();
  await page.waitForTimeout(300);
  console.log('NOTE_HEIGHT', b1 && b1.height);
  console.log('PLATFORM', await page.evaluate(() => navigator.platform));
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((err) => { console.error(err); process.exit(1); });
