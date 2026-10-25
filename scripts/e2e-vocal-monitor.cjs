const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-monitor', `userdata-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });
  const env = {
    ...process.env,
    NT_USER_DATA: userData,
    NEUTRINO_ROOT: process.env.NEUTRINO_ROOT || '',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /打开示例曲/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });

  await page.locator('.tab', { hasText: '时序' }).click();
  await page.waitForTimeout(300);
  const prompt = await page.locator('.timing-surface .empty-overlay strong').innerText();
  console.log('TIMING_PROMPT', prompt);
  const button = page.locator('.timing-surface .empty-overlay button');
  console.log('EMPTY_RENDER_BUTTON', await button.innerText());
  await button.click();
  await page.waitForTimeout(500);
  console.log('RENDER_STARTED', await page.locator('.render-btn.running').count());
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  console.log('TIMING_OVERLAY_AFTER', await page.locator('.timing-surface .empty-overlay').count());

  await page.locator('.tab', { hasText: '乐谱' }).click();
  await page.waitForTimeout(200);
  const monitor = page.locator('.transport-monitor-select');
  console.log('MONITOR_OPTIONS', await monitor.locator('option').allInnerTexts());
  await monitor.selectOption('sine');
  await page.locator('.transport-play').click();
  await page.waitForTimeout(1200);
  console.log('SINE_PLAYING', (await page.locator('.transport-play').getAttribute('class'))?.includes('playing'), 'CURRENT', await page.locator('.time-current').innerText());
  await monitor.selectOption('mute');
  await page.waitForTimeout(300);
  console.log('MUTE_VALUE', await monitor.inputValue());
  await page.locator('.transport-play').click();
  await page.waitForTimeout(300);
  await monitor.selectOption('vocal');
  console.log('MONITOR_RESTORED', await monitor.inputValue());
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  console.log('MONITOR_HTML', await page.locator('.transport-monitor').evaluate((el) => el.outerHTML));
  console.log('MONITOR_BOX', await page.locator('.transport-monitor').boundingBox());
  console.log('MONITOR_STYLE', await page.locator('.transport-monitor').evaluate((el) => { const s=getComputedStyle(el); return {display:s.display,width:s.width,color:s.color,background:s.backgroundColor,overflow:s.overflow}; }));
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'vocal-monitor.png') });
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
