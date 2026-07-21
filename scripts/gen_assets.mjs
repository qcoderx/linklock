// One-off asset generator for LinkLock brand imagery via OpenAI gpt-image-1-mini.
// Usage: OPENAI_API_KEY=... node scripts/gen_assets.mjs
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('Set OPENAI_API_KEY'); process.exit(1); }

const OUT = path.resolve('frontend/public/assets');
const MODEL = 'gpt-image-1-mini';

const STYLE = 'Soft 3D claymorphic render, glossy golden yellow (#F5B301) with warm highlights and soft studio lighting, smooth rounded forms, centered and filling the frame, isolated on a plain solid pure white (#FFFFFF) background with no shadow, premium minimal fintech brand asset, no text, no words.';

const ASSETS = [
  { file: 'hero-padlock', size: '1024x1024', prompt: `A padlock whose shackle is formed by two interlocking rounded chain links, keyhole on the body. ${STYLE}` },
  { file: 'icon-link', size: '1024x1024', prompt: `Two interlocking rounded chain links joined together, like a secure connected link. ${STYLE}` },
  { file: 'icon-lock', size: '1024x1024', prompt: `A closed padlock, simple and bold, keyhole visible. ${STYLE}` },
  { file: 'icon-ship', size: '1024x1024', prompt: `A sealed cardboard shipping parcel box wrapped and ready to dispatch, but rendered in the same glossy golden yellow. ${STYLE}` },
  { file: 'icon-check', size: '1024x1024', prompt: `A bold rounded checkmark inside a soft circle badge, meaning confirmed and released. ${STYLE}` },
];

async function gen({ file, prompt, size }) {
  process.stdout.write(`→ ${file} ... `);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, size, n: 1 }),
  });
  const json = await res.json();
  if (!res.ok || !json.data?.[0]) {
    console.log(`FAILED: ${json?.error?.message || res.status}`);
    return false;
  }
  const b64 = json.data[0].b64_json;
  fs.writeFileSync(path.join(OUT, `${file}.png`), Buffer.from(b64, 'base64'));
  console.log(`ok (${Math.round(b64.length / 1365)} KB)`);
  return true;
}

const only = process.argv.slice(2);
const list = only.length ? ASSETS.filter((a) => only.includes(a.file)) : ASSETS;
for (const a of list) {
  try { await gen(a); } catch (e) { console.log(`ERROR ${a.file}: ${e.message}`); }
}
console.log('done.');
