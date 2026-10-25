import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  candidateRoots,
  findBinaries,
  resolveRunner,
  nativeEnv,
  buildCommand,
} = require('../electron/lib/neutrino.cjs');

describe('macOS native distribution', () => {
  it('detects the official macOS layout and resolves the native runner', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-mac-layout-'));
    try {
      fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
      fs.mkdirSync(path.join(root, 'model', 'MERROW'), { recursive: true });
      fs.writeFileSync(path.join(root, 'bin', 'neutrino'), '');
      fs.writeFileSync(path.join(root, 'bin', 'musicXMLtoLabel'), '');
      fs.writeFileSync(path.join(root, 'bin', 'neutrino.exe'), '');
      fs.writeFileSync(path.join(root, 'bin', 'musicXMLtoLabel.exe'), '');
      fs.writeFileSync(path.join(root, 'model', 'MERROW', 'p.bin'), '');

      const found = findBinaries(root, 'darwin');
      expect(found).not.toBeNull();
      expect(path.basename(found.neutrino)).toBe('neutrino');
      expect(path.basename(found.converter)).toBe('musicXMLtoLabel');

      const runner = resolveRunner({
        runner: 'wine',
        neutrinoPath: found.neutrino,
        platform: 'darwin',
      });
      expect(runner.runner).toBe('native');
      expect(runner.available).toBe(true);

      const env = nativeEnv(root, 'darwin');
      expect(env.DYLD_LIBRARY_PATH.startsWith(path.join(root, 'bin'))).toBe(true);

      const cmd = buildCommand(root, found.neutrino, ['--help'], 'native', 'wine', 'darwin');
      expect(cmd.command).toBe(found.neutrino);
      expect(cmd.env.DYLD_LIBRARY_PATH.startsWith(path.join(root, 'bin'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('only auto-detects standard Programs/NEUTRINO locations', () => {
    if (process.platform !== 'win32') return;
    const programDirs = candidateRoots().filter((p: string) => /Program/i.test(p));
    expect(programDirs).toEqual(['C:\\Program Files\\NEUTRINO']);
  });

  it('uses Wine only on Linux with a Windows executable', () => {
    const linux = resolveRunner({
      runner: 'auto',
      neutrinoPath: '/opt/NEUTRINO/bin/neutrino.exe',
      platform: 'linux',
    });
    expect(linux.runner).toBe('wine');
    const native = resolveRunner({
      runner: 'auto',
      neutrinoPath: '/opt/NEUTRINO/bin/neutrino',
      platform: 'linux',
    });
    expect(native.runner).toBe('native');
  });
});
