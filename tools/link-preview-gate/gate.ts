/**
 * Writes the static bundle of the og:url click check of design 028.
 *
 * The preview block names the root of the origin in `og:url`. A chat service
 * could send a click on the preview there and not to the shared address. The
 * owner checks this in Slack and in WhatsApp before the runtime change is
 * approved. This tool writes the files for that check, and nothing more. It
 * sends nothing, uploads nothing and starts no server.
 *
 * The bundle holds two pages with the block that the server writes, byte for
 * byte, the card under its hashed name, a README with the steps, and
 * `expected.json` with the values that the check compares.
 *
 * Usage: `node tools/link-preview-gate/gate.ts <https origin> <out directory>`
 * Run `pnpm build` first, so the emitted card exists.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { productName } from '@notesapp/core';
import { linkPreviewBlock, linkPreviewCardFile } from '@notesapp/server';

/** The root of the repository. */
const root = resolve(import.meta.dirname, '../..');

/** The emitted assets of the web build. */
const assets = join(root, 'apps/web/dist/web/assets');

/** The address to share, from the root of the origin. */
export const sharedPath = '/shared/sample/';

/** The headings that tell the owner where a click went. */
export const headings = { root: 'Root', shared: 'Shared address' } as const;

/**
 * The origin of the check, or `null`.
 *
 * It is one public HTTPS origin with no path, no query, no fragment and no
 * credential, because a chat service fetches it from the internet.
 */
export function gateOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
  return url.origin;
}

/** One page of the bundle, with the block in its head. */
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

/** The two pages of the bundle, by path inside the output directory. */
export function gatePages(
  origin: string,
  cardName: string,
): Readonly<Record<string, string>> {
  const block = linkPreviewBlock(origin, `/assets/${cardName}`);
  return {
    'index.html': gatePage(block, headings.root),
    [`${sharedPath.slice(1)}index.html`]: gatePage(block, headings.shared),
  };
}

/** The steps for the owner, with the values of this bundle. */
export function gateReadme(input: {
  readonly origin: string;
  readonly cardName: string;
  readonly cardDigest: string;
  readonly source: string;
}): string {
  const shared = `${input.origin}${sharedPath}`;
  const card = `${input.origin}/assets/${input.cardName}`;
  return `# Link preview click check

This folder checks where a click on a link preview goes in Slack and in
WhatsApp (design 028). It holds no account, no note, no token and no secret.

- Source commit: ${input.source}
- Origin: ${input.origin}
- Card: ${input.cardName}, sha256 ${input.cardDigest}

## Host

Serve this folder as static files at ${input.origin}, over HTTPS, with no
sign-in. Check each address in a private browser window:

| Address | Must answer |
| --- | --- |
| ${input.origin}/ | 200, text/html, heading "${headings.root}" |
| ${shared} | 200, text/html, heading "${headings.shared}" |
| ${card} | 200, image/png |

Do not put any other file in the folder.

## Check

Do these steps in Slack and then in WhatsApp, in a chat of your own:

1. Paste ${shared} as the only text of a new message, and send it.
2. Wait for the preview card. Take a screenshot of the message and its card.
3. Select the picture or the title of the card, not the plain link text.
4. Write down the address that opens and the heading that the page shows. If
   the application opens the page inside itself, also use its menu to open
   the page in the browser, and write down that address.
5. Take a screenshot of the page that opened.
6. Also select the plain link text, and write down where it goes.

Crop each screenshot to the message and the page. Show no other chat.

## Result

- Pass: the card opens "${headings.shared}" at ${shared} in both services.
- Fail: the card opens "${headings.root}" at ${input.origin}/ in either
  service. Then og:url goes back to review, and the first alternative is to
  omit it.

The access log of the host can show the paths that each service fetched.
Record only the path, the status and the user agent of each request.
`;
}

async function main(): Promise<void> {
  const [rawOrigin, out] = process.argv.slice(2);
  const origin = gateOrigin(rawOrigin ?? '');
  if (origin === null || out === undefined) {
    process.stderr.write(
      'Usage: node tools/link-preview-gate/gate.ts <https origin> <out directory>\n',
    );
    process.exit(1);
  }
  const cards = (await readdir(assets)).filter((name) =>
    linkPreviewCardFile.test(name),
  );
  const cardName = cards[0];
  if (cards.length !== 1 || cardName === undefined) {
    process.stderr.write(
      'Run pnpm build first. The build holds no single card.\n',
    );
    process.exit(1);
  }
  const bytes = await readFile(join(assets, cardName));
  const cardDigest = createHash('sha256').update(bytes).digest('hex');
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
    .toString()
    .trim();
  for (const [path, html] of Object.entries(gatePages(origin, cardName))) {
    const target = join(out, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, html, 'utf8');
  }
  await mkdir(join(out, 'assets'), { recursive: true });
  await copyFile(join(assets, cardName), join(out, 'assets', cardName));
  await writeFile(
    join(out, 'README.md'),
    gateReadme({ origin, cardName, cardDigest, source }),
    'utf8',
  );
  await writeFile(
    join(out, 'expected.json'),
    `${JSON.stringify(
      {
        source,
        origin,
        shared: `${origin}${sharedPath}`,
        root: `${origin}/`,
        card: `${origin}/assets/${cardName}`,
        cardSha256: cardDigest,
        pass: headings.shared,
        fail: headings.root,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(`Wrote the bundle for ${origin} to ${out}.\n`);
}

if (import.meta.main) await main();
