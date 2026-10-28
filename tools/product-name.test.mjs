import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { record, root } from './workspace.mjs';
import { productName, productShortName } from '../packages/core/src/product.ts';
import { productName as docsProductName } from '../apps/docs/src/site.ts';

// Record 0187: `productName` of `packages/core/src/product.ts` is the one
// source of the name that a person reads. A surface that cannot import it is
// held to it here.

/**
 * A spelling of the old name, or of the new name in another case. No word
 * boundary leads, so a name after an escape such as `\n` is found too. The
 * lowercase `notesapp` and `tidynotebook` stay out: they are the package
 * scope, the settings and the addresses, which a person never reads.
 */
const spellings = /Notes ?[Aa]pp\b|[Tt]idy [Nn]otebook\b|Tidy[Nn]otebook\b/g;

/** History: these documents state what was true when somebody wrote them. */
const history = [
  'docs/decisions/',
  'docs/design/',
  'docs/plans/',
  'docs/audits/',
  'CHANGELOG.md',
];

await test('the name is written in lowercase', () => {
  // Record 0203: the name keeps its lowercase on every surface, even at the
  // start of a sentence.
  assert.equal(productName, 'tidy notebook');
  assert.equal(productShortName, 'tidy');
});

await test('the documentation site names the product of the core', () => {
  assert.equal(docsProductName, productName);
});

await test('no surface spells the product another way', async () => {
  const listed = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(listed.status, 0, listed.stderr);
  const files = listed.stdout
    .split('\0')
    .filter(
      (file) =>
        file !== '' && !history.some((prefix) => file.startsWith(prefix)),
    );
  assert.ok(files.length > 0, 'git lists no file');
  /** @type {string[]} */
  const found = [];
  for (const file of files) {
    let text = await readFile(resolve(root, file), 'utf8').catch(() => '');
    if (text.includes('\0')) continue;
    if (file === 'integrations/chatgpt/tidy-notebook/plugin.json') {
      // The owner selected a title-case directory name. Check that exact
      // presentation separately; all other package text keeps the core name.
      const manifest = record(JSON.parse(text));
      const extensions = record(manifest.extensions);
      const openai = record(extensions['com.openai']);
      const presentation = record(openai.interface);
      const directoryName = productName.replace(/\b\w/g, (letter) =>
        letter.toUpperCase(),
      );
      assert.equal(presentation.displayName, directoryName);
      text = JSON.stringify({
        ...manifest,
        extensions: {
          ...extensions,
          'com.openai': {
            ...openai,
            interface: { ...presentation, displayName: productName },
          },
        },
      });
    }
    for (const match of text.matchAll(spellings))
      if (match[0] !== productName) found.push(`${file}: ${match[0]}`);
  }
  assert.deepEqual(found, []);
});
