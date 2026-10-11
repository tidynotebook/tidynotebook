/** Makes an exact, temporary diagnostic copy of the accepted service harness. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const canonicalDigest =
  'a1e7189270387b5fbc61f5143e7868718b1c93f8aea3e7ff286d08c9167c3d5b';

/** Refuses source drift before it adds measurement hooks.
 * @param {string} source */
export function diagnosticSource(source) {
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== canonicalDigest)
    throw new Error('The diagnostic source changed.');
  /** @type {[string, string][]} */
  const hooks = [
    [
      "import pg from 'pg';",
      "import pg from 'pg';\nimport { beginSave, endSave, finishDiagnostic, markRound } from '../../tools/performance/diagnostic-profile.mjs';",
    ],
    ["from './corpus.ts';", "from '../../tools/performance/corpus.ts';"],
    [
      '  await saveRound(0, false);',
      '  await beginSave(migrationUrl);\n  await saveRound(0, false);',
    ],
    [
      '  const saveP95Ms = percentile(saveSamples, 0.95);',
      '  await endSave(migrationUrl);\n  const saveP95Ms = percentile(saveSamples, 0.95);',
    ],
    [
      '    await Promise.all(\n      prepared.map',
      "    markRound(round, measured, 'start');\n    await Promise.all(\n      prepared.map",
    ],
    [
      '        if (measured) saveSamples.push(elapsed);\n      }),\n    );\n  };',
      "        if (measured) saveSamples.push(elapsed);\n      }),\n    );\n    markRound(round, measured, 'end');\n  };",
    ],
    [
      '} finally {\n  if (store !== null)',
      '} finally {\n  await finishDiagnostic();\n  if (store !== null)',
    ],
  ];
  // Check all anchors against the original before a hook adds another anchor.
  for (const [anchor] of hooks) {
    if (source.split(anchor).length !== 2)
      throw new Error('The diagnostic phase anchor changed.');
  }
  let result = source;
  for (const [anchor, replacement] of hooks)
    result = result.replace(anchor, replacement);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = await readFile(
    new URL('./service.ts', import.meta.url),
    'utf8',
  );
  const output = new URL(
    '../../.tooling/performance-diagnostic/',
    import.meta.url,
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL('generated-service.ts', output),
    diagnosticSource(source),
  );
  await writeFile(
    new URL('inputs.json', output),
    JSON.stringify(
      {
        canonicalDigest,
        diagnosticDigest: createHash('sha256')
          .update(diagnosticSource(source))
          .digest('hex'),
        mode: 'diagnostic only, canonical failure remains',
      },
      null,
      2,
    ),
  );
}
