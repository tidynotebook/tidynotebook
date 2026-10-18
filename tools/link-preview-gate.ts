/**
 * Writes the static fixture of the og:url click check of design 028.
 *
 * The preview block names the root of the origin in `og:url`. A chat service
 * could send a click on the preview there and not to the shared address. A
 * person checks this in Slack and in WhatsApp before the runtime change is
 * approved. This tool writes the pages for that check, and nothing more. It
 * sends nothing, uploads nothing and starts no server.
 *
 * The output has two pages with the same block as the server writes:
 *
 * - `index.html` is the root. Its heading says "Root".
 * - `shared/sample/index.html` is the address to share. Its heading says
 *   "Shared address".
 *
 * A person puts the folder on an approved public origin, shares the address of
 * the second page, selects the preview, and writes down which heading opens.
 *
 * Usage: `node tools/link-preview-gate.ts <origin> <card file> <out directory>`
 * The origin is one full origin with no path, such as
 * `https://sample.example.com`. The card file is the emitted
 * `apps/web/dist/web/assets/social-card-<hash>.png`.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { productName } from '@notesapp/core';
import {
  linkPreviewBlock,
  linkPreviewCardFile,
} from '../apps/server/src/link-preview.ts';
import { readOrigin } from '../apps/server/src/served-origins.ts';

/** The address to share, from the root of the origin. */
export const sharedPath = '/shared/sample/';

/** One page of the fixture, with the block in its head. */
export function gatePage(block: string, heading: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    ${block}
    <title>${productName}</title>
  </head>
  <body>
    <h1>${heading}</h1>
    <p>This page is a test of a link preview. It holds no data.</p>
  </body>
</html>
`;
}

/** The files of the fixture, by path inside the output directory. */
export function gateFiles(
  origin: string,
  cardName: string,
): Readonly<Record<string, string>> {
  const block = linkPreviewBlock(origin, `/assets/${cardName}`);
  return {
    'index.html': gatePage(block, 'Root'),
    [`${sharedPath.slice(1)}index.html`]: gatePage(block, 'Shared address'),
  };
}

async function main(): Promise<void> {
  const [rawOrigin, card, out] = process.argv.slice(2);
  const origin = readOrigin(rawOrigin ?? '');
  if (origin === null || card === undefined || out === undefined) {
    process.stderr.write(
      'Usage: node tools/link-preview-gate.ts <origin> <card file> <out directory>\n',
    );
    process.exit(1);
  }
  const cardName = basename(card);
  if (!linkPreviewCardFile.test(cardName)) {
    process.stderr.write('Give the emitted card, social-card-<hash>.png.\n');
    process.exit(1);
  }
  for (const [path, html] of Object.entries(gateFiles(origin, cardName))) {
    const target = join(out, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, html, 'utf8');
  }
  await mkdir(join(out, 'assets'), { recursive: true });
  await copyFile(card, join(out, 'assets', cardName));
  process.stdout.write(
    `Share ${origin}${sharedPath}. A click that opens "Root" goes back to review.\n`,
  );
}

if (import.meta.main) await main();
