const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

(async () => {
  const root = path.join(__dirname, '..');
  const brand = path.join(root, 'src', 'assets', 'brand');
  const build = path.join(root, 'build');
  const iconsDir = path.join(build, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  const sources = {
    small: path.join(brand, 'ts-only.png'),
    medium: path.join(brand, 'ts-mark.png'),
    large: path.join(brand, 'ts-for-neutrino-mark.png'),
  };
  const sourceFor = (size) => (size <= 48 ? sources.small : size <= 64 ? sources.medium : sources.large);
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
  // Application icon: full lockup at large sizes, compact at small sizes.
  fs.copyFileSync(path.join(build, 'icon-1024.png'), path.join(build, 'icon.png'));
  for (const size of [16, 32, 48, 64, 128, 256]) {
    fs.copyFileSync(path.join(build, `icon-${size}.png`), path.join(iconsDir, `${size}x${size}.png`));
  }
  const icoSources = [16, 24, 32, 48, 64, 128, 256].map((s) => path.join(build, `icon-${s}.png`));
  fs.writeFileSync(path.join(build, 'icon.ico'), await pngToIco(icoSources));
  console.log('Icon sources: TS-only (≤48), TS for (64), full lockup (≥128)');
  console.log('Wrote build/icon.png, build/icon.ico, build/icons/*.png');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
