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

  // Open settings from the toolbar (the configurable settings shortcut was removed).
  await page.getByRole('button', { name: '设置' }).first().click();
  await page.waitForSelector('.modal h2', { timeout: 5000 });
  console.log('SETTINGS_OPENED', await page.locator('.modal h2').innerText());
  await page.getByRole('button', { name: '快捷键' }).click();
  const loopRow = page.locator('.shortcut-setting-row').filter({ hasText: '切换循环' });
  const capture = loopRow.locator('.shortcut-setting-capture');
  await capture.click();
  await page.keyboard.press('Alt+K');
  await page.waitForTimeout(200);
  console.log('RECORDED_LOOP_SHORTCUT', await capture.innerText());
  console.log('DUPLICATE_WARNING', await page.locator('.shortcut-warning').count());
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'shortcuts-settings.png') });
  await page.locator('.modal-footer button').filter({ hasText: '保存' }).click();
  await page.waitForTimeout(700);
  console.log('MODAL_AFTER_SAVE', await page.locator('.modal').count());
  console.log('LOOP_BEFORE', await page.locator('.transport-group button[aria-label="已关闭循环"]').count());
  await page.keyboard.press('Alt+K');
  await page.waitForTimeout(300);
  console.log('LOOP_AFTER', await page.locator('.transport-group button[aria-label="已开启循环"]').count());
  await page.keyboard.press('b');
  await page.waitForTimeout(250);
  console.log('PENCIL_ACTIVE', (await page.locator('.editor-toolbar button').nth(1).getAttribute('class'))?.includes('active'));
  await page.getByRole('button', { name: '帮助' }).first().click();
  await page.waitForSelector('.help-shortcuts', { timeout: 5000 });
  await page.waitForTimeout(500);
  const helpRows = await page.locator('.help-shortcuts .shortcut-row').allInnerTexts();
  console.log('HELP_HAS_PENCIL', helpRows.some((row) => row.includes('画笔工具')));
  console.log('HELP_HAS_OPEN_SETTINGS', helpRows.some((row) => row.includes('打开设置')));
  console.log('HELP_RENDER_ROW', helpRows.find((row) => row.includes('渲染人声')));
  console.log('HELP_SPACE_LABEL', helpRows.some((row) => row.trim().startsWith('空格')));
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'help-shortcuts.png') });
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
