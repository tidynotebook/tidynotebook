/** Measure complete outline reads and document cache reuse without Docker. */
import { EditorState } from '@codemirror/state';
import { noteMarkdown, outlineOf } from '@notesapp/editor';

const source = Array.from(
  { length: 42 },
  (_, index) =>
    `${'#'.repeat((index % 6) + 1)} Section ${String(index + 1)}\n\n${'Synthetic text for a long note. '.repeat(28)}\n\n`,
)
  .join('')
  .replace('Synthetic', 'Test note');
const report = [];
for (const repeats of [1, 25]) {
  const doc = source.repeat(repeats);
  let state = EditorState.create({ doc, extensions: [noteMarkdown()] });
  let start = performance.now();
  const rows = outlineOf(state);
  const initialMs = performance.now() - start;
  const times: number[] = [];
  for (let index = 0; index < 50; index += 1) {
    state = state.update({
      changes: { from: state.doc.length, insert: 'a' },
    }).state;
    start = performance.now();
    outlineOf(state);
    times.push(performance.now() - start);
  }
  start = performance.now();
  for (let index = 0; index < 10000; index += 1)
    outlineOf(
      state.update({ selection: { anchor: index % state.doc.length } }).state,
    );
  const cachedSelectionMs = (performance.now() - start) / 10000;
  times.sort((left, right) => left - right);
  report.push({
    characters: doc.length,
    headings: rows.length,
    initialMs,
    editMedianMs: times[25],
    editP95Ms: times[47],
    editMaxMs: times[49],
    cachedSelectionMs,
  });
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
