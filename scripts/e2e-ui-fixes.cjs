const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

(async () => {
  const root = path.join(__dirname, '..');
  const userData = path.join(root, 'scratch-fixes', `userdata-${Date.now()}`);
  fs.mkdirSync(userData, { recursive: true });
  const env = { ...process.env, NT_USER_DATA: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ['.'], cwd: root, env, timeout: 60000 });
  const page = await app.firstWindow({ timeout: 30000 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.welcome', { timeout: 20000 });
  await page.getByRole('button', { name: /打开示例曲/ }).click();
  await page.waitForSelector('.note', { timeout: 10000 });
  await page.waitForTimeout(700);

  // Light theme, then start a render and inspect the running button contrast.
  await page.locator('.topbar-actions-right [aria-label="主题"]').click();
  await page.getByText('浅色', { exact: true }).click();
  await page.waitForTimeout(300);
  assert((await page.locator('html').getAttribute('data-theme')) === 'light', 'light theme active');
  await page.locator('.render-primary').click();
  const running = page.locator('.render-btn.running');
  await running.waitFor({ state: 'visible', timeout: 8000 });
  const style = await running.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, text: el.innerText };
  });
  console.log('LIGHT_RUNNING_BUTTON', style);
  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'light-render-progress.png') });
  assert(style.color !== 'rgb(255, 255, 255)', 'running button text is not white in light mode');
  await page.waitForFunction(() => !document.querySelector('.render-btn.running'), null, { timeout: 120000 });
  await page.waitForTimeout(500);
  assert((await page.locator('.render-result').count()) === 1, 'render completed');

  // Offset check: first sung frame must be at the very beginning, not one bar in.
  const workspaces = fs.readdirSync(path.join(userData, 'workspace'));
  const workspace = path.join(userData, 'workspace', workspaces[0]);
  const f0Buf = fs.readFileSync(path.join(workspace, 'output.f0'));
  const f0 = new Float32Array(f0Buf.buffer, f0Buf.byteOffset, f0Buf.byteLength / 4);
  let firstVoiced = -1;
  for (let i = 0; i < f0.length; i++) if (f0[i] > 0) { firstVoiced = i / 100; break; }
  const timingHead = fs.readFileSync(path.join(workspace, 'timing.lab'), 'utf8').split(/\r?\n/).slice(0, 3);
  console.log('FIRST_VOICED_SEC', firstVoiced, 'TIMING_HEAD', timingHead);
  assert(firstVoiced >= 0 && firstVoiced < 0.1, 'audio no longer starts one bar late');

  // Pencil drag creates a note whose duration follows the drag.
  const beforePencil = await page.locator('.note').count();
  await page.locator('.editor-toolbar [aria-label="画笔"]').click();
  const grid = await page.locator('.grid-surface').boundingBox();
  assert(grid, 'grid exists');
  const y = grid.y + grid.height * 0.83;
  const x1 = grid.x + grid.width * 0.55;
  const x2 = x1 + 120;
  await page.mouse.move(x1, y);
  await page.mouse.down();
  await page.mouse.move(x2, y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterPencil = await page.locator('.note').count();
  console.log('PENCIL_COUNT', beforePencil, afterPencil);
  assert(afterPencil === beforePencil + 1, 'pencil drag creates one note');
  const widths = await page.locator('.note').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  assert(Math.max(...widths) > 80, 'pencil note has an extended width');

  // Eraser drag removes multiple notes.
  await page.locator('.editor-toolbar [aria-label="橡皮"]').click();
  const boxes = await page.locator('.note').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  let pair = null;
  for (let i = 0; i < boxes.length && !pair; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (Math.abs(boxes[i].y - boxes[j].y) < 3 && Math.abs(boxes[i].x - boxes[j].x) > 20) {
        pair = [boxes[i], boxes[j]];
        break;
      }
    }
  }
  assert(pair, 'found two notes on one pitch row');
  const beforeErase = await page.locator('.note').count();
  const rowY = pair[0].y + pair[0].h / 2;
  const startX = Math.min(pair[0].x, pair[1].x) + 2;
  const endX = Math.max(pair[0].x + pair[0].w, pair[1].x + pair[1].w) - 2;
  await page.mouse.move(startX, rowY);
  await page.mouse.down();
  await page.mouse.move(endX, rowY, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterErase = await page.locator('.note').count();
  console.log('ERASER_COUNT', beforeErase, afterErase);
  assert(afterErase <= beforeErase - 2, 'eraser drag removes multiple notes');

  // Drag a note over a neighbour to trigger the overlap warning.
  await page.locator('.editor-toolbar [aria-label="选择"]').click();
  const boxes2 = await page.locator('.note').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  assert(boxes2.length > 2, 'notes remain for overlap test');
  const target = boxes2[2];
  await page.mouse.move(target.x + target.w / 2, target.y + target.h / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.w / 2 - 34, target.y + target.h / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  console.log('OVERLAP_WARNINGS', await page.locator('.overlap-warning').count(), 'OVERLAP_NOTES', await page.locator('.note.overlap').count());
  assert((await page.locator('.overlap-warning').count()) === 1, 'overlap warning is shown');
  assert((await page.locator('.note.overlap').count()) >= 2, 'overlapping notes are highlighted');

  await page.screenshot({ path: path.join(root, 'docs', 'screenshots', 'score-overlap-light.png') });
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await app.evaluate(({ app }) => app.exit(0));
})().catch((e) => { console.error(e); process.exit(1); });


