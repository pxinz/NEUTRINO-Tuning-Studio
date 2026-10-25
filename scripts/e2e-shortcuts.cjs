const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-shortcuts', `userdata-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });
  const env = { ...process.env, NT_USER_DATA: userData, NEUTRINO_ROOT: process.env.NEUTRINO_ROOT || '' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /新建空白项目/ }).click();
  await page.waitForSelector('.grid-surface', { timeout: 10000 });
  await page.waitForTimeout(300);

  // Theme icon must represent "system", not the resolved dark theme.
  await page.getByRole('button', { name: '主题' }).click();
  await page.getByRole('button', { name: '跟随系统' }).click();
  await page.waitForTimeout(300);
  const themeIconClasses = await page.getByRole('button', { name: '主题' }).locator('svg').first().getAttribute('class');
  console.log('THEME_SYSTEM_ICON', themeIconClasses);

  // Default Settings shortcut opens the settings modal.
  await page.keyboard.press('Control+,');
  await page.waitForSelector('.modal h2', { timeout: 5000 });
  console.log('SETTINGS_VIA_SHORTCUT', await page.locator('.modal h2').innerText());
  await page.getByRole('button', { name: '快捷键' }).click();
  const loopRow = page.locator('.shortcut-row').filter({ hasText: '切换循环' });
  const capture = loopRow.locator('.shortcut-capture');
  await capture.click();
  await page.keyboard.press('Alt+K');
  await page.waitForTimeout(200);
  console.log('RECORDED_LOOP_SHORTCUT', await capture.innerText());
  console.log('DUPLICATE_WARNING', await page.locator('.shortcut-warning').count());
  await page.locator('.modal-footer button').filter({ hasText: '保存' }).click();
  await page.waitForTimeout(700);
  console.log('MODAL_AFTER_SAVE', await page.locator('.modal').count());
  console.log('LOOP_BEFORE', await page.locator('.transport-group button[aria-label="已关闭循环"]').count());
  await page.keyboard.press('Alt+K');
  await page.waitForTimeout(300);
  console.log('LOOP_AFTER', await page.locator('.transport-group button[aria-label="已开启循环"]').count());
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'shortcuts-settings.png') });
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
