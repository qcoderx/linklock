// Key out the near-white background of generated PNGs → clean transparent cutouts.
// The golden-yellow subject has low blue, so near-white/gray (high min channel) is the background.
// Run from backend/ (where jimp is installed): node ../scripts/cutout.mjs <abs.png> ...
import { Jimp } from 'jimp';

const files = process.argv.slice(2);
const THRESH = 208; // min(r,g,b) above this ⇒ background

for (const f of files) {
  const img = await Jimp.read(f);
  const { data } = img.bitmap;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const min = Math.min(r, g, b);
    if (min > THRESH) {
      data[i + 3] = 0; // fully transparent
    } else if (min > THRESH - 24) {
      // feather the anti-aliased edge so there is no white halo
      const t = (min - (THRESH - 24)) / 24;
      data[i + 3] = Math.round(data[i + 3] * (1 - t));
    }
  }
  await img.write(f);
  console.log(`cut ${f.split(/[\\/]/).pop()}`);
}
