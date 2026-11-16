// Run only at build time in the fixed base. No app data is used.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire('/app/server/package.json');
/** @param {unknown} value @returns {value is typeof import('sharp').default} */
function isSharp(value) {
  return (
    typeof value === 'function' &&
    'concurrency' in value &&
    typeof value.concurrency === 'function' &&
    'cache' in value &&
    typeof value.cache === 'function' &&
    'versions' in value
  );
}
/** @type {unknown} */
const sharp = require('sharp');
if (!isSharp(sharp)) throw new Error('The fixed Sharp module is required.');
sharp.concurrency(1);
sharp.cache(false);
const dir = '/out/fixtures';
await mkdir(dir, { recursive: true });
/** @type {Array<[string, number, number, 'png' | 'jpeg' | 'gif' | 'webp', boolean, boolean]>} */
const cases = [
  ['small.png', 8, 8, 'png', true, false],
  ['small.jpeg', 8, 8, 'jpeg', false, false],
  ['small.gif', 8, 8, 'gif', false, false],
  ['small.webp', 8, 8, 'webp', true, false],
  ['wide.png', 32767, 1, 'png', false, false],
  ['tall.png', 1, 32767, 'png', false, false],
  ['limit.png', 8000, 5000, 'png', false, false],
  ['limit.jpeg', 8000, 5000, 'jpeg', false, false],
  ['limit.webp', 8000, 5000, 'webp', true, false],
  ['metadata.jpeg', 8, 8, 'jpeg', false, true],
];
const manifest = [];
for (const [name, width, height, format, alpha, metadata] of cases) {
  let image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: { r: 24, g: 48, b: 96, alpha: alpha ? 0.5 : 1 },
    },
  });
  if (metadata) image = image.withMetadata({ orientation: 6 });
  const data = await image.toFormat(format).toBuffer();
  await writeFile(`${dir}/${name}`, data);
  manifest.push({
    name,
    width,
    height,
    format,
    alpha,
    metadata,
    expected: await sharp(data, {
      animated: true,
      limitInputPixels: 40000000,
    }).metadata(),
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}
const frames = Buffer.alloc(8000 * 5000 * 3, 40);
frames.fill(80, 8000 * 2500 * 3);
const animation = await sharp(frames, {
  raw: { width: 8000, height: 5000, channels: 3, pageHeight: 2500 },
})
  .gif()
  .toBuffer();
await writeFile(`${dir}/animated-limit.gif`, animation);
manifest.push({
  name: 'animated-limit.gif',
  width: 8000,
  height: 5000,
  pageHeight: 2500,
  pages: 2,
  format: 'gif',
  alpha: false,
  metadata: false,
  expected: await sharp(animation, {
    animated: true,
    limitInputPixels: 40000000,
  }).metadata(),
  bytes: animation.length,
  sha256: createHash('sha256').update(animation).digest('hex'),
});
await writeFile(
  '/out/fixture-manifest.json',
  JSON.stringify(
    {
      status: 'LOCAL_ONLY',
      pixelLimit: 40000000,
      generator: 'fixed base sharp',
      versions: sharp.versions,
      fixtures: manifest,
      publication: false,
      boundaryProved: false,
    },
    null,
    2,
  ) + '\n',
);
