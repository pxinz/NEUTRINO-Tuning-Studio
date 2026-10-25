const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-history', `userdata-${Date.now()}`);
  const dialogDir = path.join(root, 'scratch-history', 'saved');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(dialogDir, { recursive: true });
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /新建空白项目/ }).click();
  await page.waitForSelector('.grid-surface', { timeout: 10000 });
  await page.waitForTimeout(400);

  // The empty-state overlay must not swallow grid clicks.
  const overlayCount = await page.locator('.grid-surface .empty-overlay').count();
  console.log('EMPTY_OVERLAY', overlayCount);
  console.log('REFERENCE_DISABLED', await page.locator('.transport-toggles button', { hasText: '参考曲' }).isDisabled());
  console.log('MONITOR_PRESENT', await page.locator('.transport-monitor-select').count());
  await page.locator('.editor-toolbar [aria-label="画笔"]').click();
  const grid = await page.locator('.grid-surface').boundingBox();
  if (grid) await page.mouse.click(grid.x + grid.width * 0.18, grid.y + grid.height * 0.78);
  await page.waitForTimeout(500);
  const notesAfterDraw = await page.locator('.note').count();
  console.log('NOTES_AFTER_DRAW', notesAfterDraw);

  // Save once so a recent-project entry exists.
  await page.locator('.topbar-actions-left .dropdown-trigger').first().click();
  await page.locator('.dropdown-menu .dropdown-item').filter({ hasText: '保存' }).click();
  await page.waitForTimeout(800);
  const saved = fs.readdirSync(dialogDir).filter((f) => f.endsWith('.ntstudio'));
  console.log('SAVED', saved);
  await page.locator('.topbar-actions-left .dropdown-trigger').first().click();
  await page.waitForTimeout(300);
  console.log('RECENT_HEADER', await page.locator('.dropdown-item', { hasText: '最近项目' }).count());
  const recentNames = await page.locator('.dropdown-item').allInnerTexts();
  console.log('MENU_ITEMS', recentNames.join(' | '));
  await page.keyboard.press('Escape');

  // Make it dirty again, then New must offer save/discard/cancel.
  if (grid) await page.mouse.click(grid.x + grid.width * 0.82, grid.y + grid.height * 0.25);
  await page.waitForTimeout(300);
  await page.locator('.topbar-actions-left .dropdown-trigger').first().click();
  await page.getByRole('button', { name: '新建' }).click();
  await page.waitForTimeout(300);
  console.log('DISCARD_TITLE', await page.locator('.modal h2').innerText());
  console.log('DISCARD_BUTTONS', await page.locator('.modal-footer button').allInnerTexts());
  await page.getByRole('button', { name: '放弃更改' }).click();
  await page.waitForTimeout(700);
  console.log('NEW_AFTER_DISCARD_NOTES', await page.locator('.note').count());
  console.log('NEW_OVERLAY', await page.locator('.grid-surface .empty-overlay').count());

  // Make dirty and open the saved recent project; discard should open it.
  await page.locator('.editor-toolbar [aria-label="画笔"]').click();
  const grid2 = await page.locator('.grid-surface').boundingBox();
  if (grid2) await page.mouse.click(grid2.x + grid2.width * 0.25, grid2.y + grid2.height * 0.7);
  await page.waitForTimeout(300);
  await page.locator('.topbar-actions-left .dropdown-trigger').first().click();
  const savedName = saved[0] ? saved[0].replace(/\.ntstudio$/i, '') : '未命名';
  const recent = page.locator('.dropdown-menu .dropdown-item').filter({ hasText: savedName }).last();
  console.log('RECENT_ITEM_COUNT', await recent.count());
  await recent.click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '放弃更改' }).click();
  await page.waitForTimeout(800);
  console.log('REOPENED_NOTES', await page.locator('.note').count());
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'discard-confirm.png') });
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });
