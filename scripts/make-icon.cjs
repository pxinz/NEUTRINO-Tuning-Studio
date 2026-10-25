const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

function writeIcns(output, images) {
  const chunks = [];
  for (const [type, file] of images) {
    const data = fs.readFileSync(file);
    const chunk = Buffer.alloc(8 + data.length);
    chunk.write(type, 0, 4, 'ascii');
    chunk.writeUInt32BE(8 + data.length, 4);
    data.copy(chunk, 8);
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + body.length, 4);
  fs.writeFileSync(output, Buffer.concat([header, body]));
}

(async () => {
  const root = path.join(__dirname, '..');
  const assets = path.join(root, 'src', 'assets', 'icon');
  const build = path.join(root, 'build');
  const iconsDir = path.join(build, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  const sources = {
    small: path.join(assets, 'ts-only.png'),
    large: path.join(assets, 'ts-for-neutrino-mark.png'),
  };
  // Use the TS mark at small sizes and the full lockup once the wordmark is
  // legible.
  const sourceFor = (size) => (size <= 64 ? sources.small : sources.large);
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const files = [];
  for (const size of sizes) {
    const out = path.join(build, `icon-${size}.png`);
    await sharp(sourceFor(size))
      .resize(size, size, { kernel: sharp.kernel.nearest, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    files.push(out);
    fs.copyFileSync(out, path.join(iconsDir, `${size}x${size}.png`));
  }
  fs.copyFileSync(path.join(build, 'icon-1024.png'), path.join(build, 'icon.png'));
  for (const size of [16, 32, 48, 64, 128, 256]) {
    fs.copyFileSync(path.join(build, `icon-${size}.png`), path.join(iconsDir, `${size}x${size}.png`));
  }
  const icoSources = [16, 24, 32, 48, 64, 128, 256].map((s) => path.join(build, `icon-${s}.png`));
  fs.writeFileSync(path.join(build, 'icon.ico'), await pngToIco(icoSources));
  writeIcns(path.join(build, 'icon.icns'), [
    ['icp4', path.join(build, 'icon-16.png')],
    ['icp5', path.join(build, 'icon-32.png')],
    ['icp6', path.join(build, 'icon-64.png')],
    ['ic07', path.join(build, 'icon-128.png')],
    ['ic08', path.join(build, 'icon-256.png')],
    ['ic09', path.join(build, 'icon-512.png')],
    ['ic10', path.join(build, 'icon-1024.png')],
  ]);
  console.log('Icon sources: TS only (16–64), full lockup (128+)');
  console.log('Wrote build/icon.png, build/icon.ico, build/icon.icns, build/icons/*.png');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
