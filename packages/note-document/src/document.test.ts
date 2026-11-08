import assert from 'node:assert/strict';
import test from 'node:test';
import * as Y from 'yjs';
import {
  advanceCoverage,
  applyDocumentUpdate,
  documentStateVector,
  encodeDocumentDelta,
  noteTextRoot,
  readDocumentText,
  replaceDocumentText,
  startDocument,
  stateVectorCovers,
} from './document.ts';
import { observeDocument, observedCoverage } from './observed.ts';
import { documentBounds } from './bounds.ts';

/** A device that holds one copy of a document. */
function device(document: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, document);
  return doc;
}

/** The update that one change of a device produces. */
function updateOf(doc: Y.Doc, change: (text: Y.Text) => void): Uint8Array {
  const updates: Uint8Array[] = [];
  const listen = (update: Uint8Array): void => {
    updates.push(update);
  };
  doc.on('update', listen);
  change(doc.getText(noteTextRoot));
  doc.off('update', listen);
  return Y.mergeUpdates(updates);
}

/** The accepted bytes after an update, or a failed test. */
function applied(document: Uint8Array, update: Uint8Array): Uint8Array {
  const result = applyDocumentUpdate(document, update);
  assert.ok(result.ok, result.ok ? '' : result.refusal);
  return result.value.document;
}

/** The refusal of an update, or a failed test. */
function refusal(document: Uint8Array, update: Uint8Array): string {
  const result = applyDocumentUpdate(document, update);
  assert.equal(result.ok, false);
  return result.ok ? '' : result.refusal;
}

await test('a started document reads back its text exactly', () => {
  for (const text of ['', 'abc', 'line\r\nline\n', 'é \u{1F600}\n'])
    assert.equal(readDocumentText(startDocument(text)), text);
});

await test('a deletion leaves the vector equal and the observed state not', () => {
  // Issue 154. `abc` and `ac` hold the same insertions, so their vectors are
  // equal. Only the deletion set tells them apart.
  const abc = startDocument('abc');
  const phone = device(abc);
  const deletion = updateOf(phone, (text) => {
    text.delete(1, 1);
  });
  const ac = applied(abc, deletion);
  assert.equal(readDocumentText(ac), 'ac');
  assert.deepEqual(documentStateVector(ac), documentStateVector(abc));
  assert.notDeepEqual(observeDocument(ac), observeDocument(abc));

  // A device that saw only `abc` has not seen the deletion.
  const sawAbc = { epoch: 1, state: observeDocument(abc) };
  assert.deepEqual(observedCoverage(sawAbc, { epoch: 1, document: ac }), {
    ok: true,
    value: 'unseen-work',
  });
  // The device that deleted saw everything, and so did one that holds `ac`.
  const sawAc = { epoch: 1, state: observeDocument(ac) };
  assert.deepEqual(observedCoverage(sawAc, { epoch: 1, document: ac }), {
    ok: true,
    value: 'covered',
  });
  // Coverage, not equality: local work that the server lacks is not unseen.
  assert.deepEqual(observedCoverage(sawAc, { epoch: 1, document: abc }), {
    ok: true,
    value: 'covered',
  });
});

await test('an unseen insertion is unseen work', () => {
  const base = startDocument('a');
  const seen = { epoch: 1, state: observeDocument(base) };
  const later = applied(
    base,
    updateOf(device(base), (text) => {
      text.insert(1, 'b');
    }),
  );
  assert.deepEqual(observedCoverage(seen, { epoch: 1, document: later }), {
    ok: true,
    value: 'unseen-work',
  });
});

await test('a partly covered deletion range is unseen work', () => {
  const base = startDocument('abcdef');
  const first = applied(
    base,
    updateOf(device(base), (text) => {
      text.delete(1, 2);
    }),
  );
  const seen = { epoch: 1, state: observeDocument(first) };
  const second = applied(
    first,
    updateOf(device(first), (text) => {
      text.delete(1, 2);
    }),
  );
  assert.equal(readDocumentText(second), 'af');
  assert.deepEqual(observedCoverage(seen, { epoch: 1, document: second }), {
    ok: true,
    value: 'unseen-work',
  });
});

await test('observed states of two epochs have no comparison', () => {
  const doc = startDocument('a');
  assert.deepEqual(
    observedCoverage(
      { epoch: 1, state: observeDocument(doc) },
      { epoch: 2, document: doc },
    ),
    { ok: true, value: 'other-epoch' },
  );
  assert.deepEqual(
    observedCoverage(
      { epoch: 1, state: new Uint8Array([255, 255, 255]) },
      { epoch: 1, document: doc },
    ),
    { ok: false, refusal: 'malformed' },
  );
});

await test('an update without its earlier insertion is refused and stays refused', () => {
  const base = startDocument('');
  const writer = device(base);
  const first = updateOf(writer, (text) => {
    text.insert(0, 'one ');
  });
  const second = updateOf(writer, (text) => {
    text.insert(4, 'two');
  });
  // Yjs alone would keep `second` as pending work and apply it later.
  assert.equal(refusal(base, second), 'missing-dependency');
  // The refused work was never stored, so the earlier insertion alone
  // arrives and nothing hidden becomes visible.
  const afterFirst = applied(base, first);
  assert.equal(readDocumentText(afterFirst), 'one ');
  assert.equal(readDocumentText(applied(afterFirst, second)), 'one two');
});

await test('a deletion of text the document lacks is refused', () => {
  const base = startDocument('');
  const writer = device(base);
  updateOf(writer, (text) => {
    text.insert(0, 'hidden');
  });
  const deletion = updateOf(writer, (text) => {
    text.delete(0, 3);
  });
  // The deletion carries only a deletion set, and its targets are unknown.
  assert.equal(refusal(base, deletion), 'missing-dependency');
});

await test('malformed and truncated bytes are refused', () => {
  const base = startDocument('a');
  const update = updateOf(device(base), (text) => {
    text.insert(1, 'bcdefgh');
  });
  assert.equal(refusal(base, new Uint8Array([1, 2, 3, 4, 5, 6])), 'malformed');
  assert.equal(refusal(base, update.slice(0, update.length - 3)), 'malformed');
});

await test('every structure other than plain text is refused', () => {
  const base = startDocument('abc');
  const cases: readonly [string, (doc: Y.Doc) => void][] = [
    [
      'a second root',
      (doc) => {
        doc.getMap('other').set('key', 'value');
      },
    ],
    [
      'a formatting mark',
      (doc) => {
        doc.getText(noteTextRoot).format(0, 1, { bold: true });
      },
    ],
    [
      'an embed',
      (doc) => {
        doc.getText(noteTextRoot).insertEmbed(1, { image: 'x' });
      },
    ],
    [
      'a nested type',
      (doc) => {
        doc.getText(noteTextRoot).insertEmbed(1, new Y.Map());
      },
    ],
    [
      'an attribute of the text',
      (doc) => {
        doc.getText(noteTextRoot).setAttribute('lang', 'en');
      },
    ],
  ];
  for (const [name, change] of cases) {
    const doc = device(base);
    const updates: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => updates.push(update));
    change(doc);
    assert.equal(
      refusal(base, Y.mergeUpdates(updates)),
      'unsupported-structure',
      name,
    );
  }
});

await test('each bound refuses the update', () => {
  const base = startDocument('a');
  const update = updateOf(device(base), (text) => {
    text.insert(1, 'x'.repeat(100));
  });
  const bounded = (key: keyof typeof documentBounds, value: number) =>
    applyDocumentUpdate(base, update, { ...documentBounds, [key]: value });
  assert.deepEqual(bounded('maxUpdateBytes', update.byteLength - 1), {
    ok: false,
    refusal: 'too-large',
  });
  assert.deepEqual(bounded('maxDocumentBytes', 50), {
    ok: false,
    refusal: 'too-large',
  });
  const many = updateOf(device(base), (text) => {
    for (let index = 0; index < 5; index += 1) text.insert(0, 'y');
  });
  assert.deepEqual(
    applyDocumentUpdate(base, many, {
      ...documentBounds,
      maxUpdateStructs: 2,
    }),
    { ok: false, refusal: 'too-large' },
  );
  assert.equal(bounded('maxUpdateBytes', update.byteLength).ok, true);
});

await test('a refusal leaves the document bytes unchanged', () => {
  const base = startDocument('abc');
  const copy = base.slice();
  const doc = device(base);
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  doc.getText(noteTextRoot).insert(3, 'd');
  doc.getMap('other').set('key', 1);
  assert.equal(refusal(base, Y.mergeUpdates(updates)), 'unsupported-structure');
  assert.deepEqual(base, copy);
});

await test('an empty update and an empty document are valid', () => {
  const empty = startDocument('');
  const result = applyDocumentUpdate(empty, Y.encodeStateAsUpdate(new Y.Doc()));
  assert.ok(result.ok);
  assert.equal(result.value.text, '');
});

await test('a delta carries exactly the work that a peer lacks', () => {
  const base = startDocument('shared');
  const peer = device(base);
  const server = applied(
    base,
    updateOf(device(base), (text) => {
      text.insert(6, ' text');
    }),
  );
  const delta = encodeDocumentDelta(server, Y.encodeStateVector(peer));
  assert.ok(delta.byteLength < server.byteLength);
  Y.applyUpdate(peer, delta);
  assert.equal(peer.getText(noteTextRoot).toJSON(), 'shared text');
});

await test('a text write edits the document and keeps its identities', () => {
  // Record 0081. A restore, an import, and a link rewrite write text. They
  // edit the live text, so a device that holds older work still merges.
  const base = startDocument('# One\nlink to notes/old.md\n');
  const offline = device(base);
  const away = updateOf(offline, (text) => {
    text.insert(5, ' plus');
  });
  const rewritten = replaceDocumentText(base, '# One\nlink to notes/new.md\n');
  assert.ok(rewritten.ok, rewritten.ok ? '' : rewritten.refusal);
  assert.equal(rewritten.value.text, '# One\nlink to notes/new.md\n');

  const joined = applyDocumentUpdate(rewritten.value.document, away);
  assert.ok(joined.ok, joined.ok ? '' : joined.refusal);
  assert.equal(joined.value.text, '# One plus\nlink to notes/new.md\n');
});

await test('a text write that changes nothing changes no identity', () => {
  const base = startDocument('same\n');
  const written = replaceDocumentText(base, 'same\n');
  assert.ok(written.ok);
  assert.deepEqual(
    observeDocument(written.value.document),
    observeDocument(base),
  );
});

await test('a vector covers what an older vector of the same document saw', () => {
  // Record 0175. A draft records the vector it saw, and the open of a note
  // takes the text of a document that covers it.
  const older = startDocument('# Note\n');
  const written = replaceDocumentText(older, '# Note\nmore\n');
  assert.ok(written.ok);
  const newer = written.ok ? written.value.document : older;
  assert.equal(
    stateVectorCovers(documentStateVector(newer), documentStateVector(older)),
    true,
  );
  assert.equal(
    stateVectorCovers(documentStateVector(older), documentStateVector(newer)),
    false,
  );
  // Another document names another client, which no vector covers.
  assert.equal(
    stateVectorCovers(
      documentStateVector(newer),
      documentStateVector(startDocument('x')),
    ),
    false,
  );
});

await test('coverage moves over work that continues from the known clock', () => {
  // One writer types three times. The second and third updates start in the
  // middle of its clocks, so documentStateVector names no clock for them.
  const doc = new Y.Doc();
  const text = doc.getText(noteTextRoot);
  const first = updateOf(doc, () => text.insert(0, 'one '));
  const second = updateOf(doc, () => text.insert(4, 'two '));
  const third = updateOf(doc, () => text.insert(8, 'three'));
  const client = doc.clientID;
  const clockOf = (vector: Uint8Array): number =>
    Y.decodeStateVector(vector).get(client) ?? 0;
  assert.equal(clockOf(documentStateVector(second)), 0);
  let known = advanceCoverage(new Uint8Array([0]), first);
  assert.equal(clockOf(known), 4);
  // A gap: the third update starts past the clock that is known, so it moves
  // nothing until the second arrives.
  assert.equal(clockOf(advanceCoverage(known, third)), 4);
  known = advanceCoverage(known, second);
  assert.equal(clockOf(known), 8);
  known = advanceCoverage(known, third);
  assert.equal(clockOf(known), 13);
  // A repeated or older update moves nothing.
  assert.equal(clockOf(advanceCoverage(known, first)), 13);
  assert.equal(clockOf(advanceCoverage(known, second)), 13);
  // A deletion carries no insertion and moves nothing.
  const removal = updateOf(doc, () => text.delete(0, 4));
  assert.deepEqual(advanceCoverage(known, removal), known);
  doc.destroy();
});

await test('coverage takes a new writer from clock zero and keeps others', () => {
  const one = new Y.Doc();
  const other = new Y.Doc();
  const start = updateOf(one, () => one.getText(noteTextRoot).insert(0, 'a'));
  Y.applyUpdate(other, start);
  const joined = updateOf(other, () =>
    other.getText(noteTextRoot).insert(1, 'b'),
  );
  const known = advanceCoverage(
    advanceCoverage(new Uint8Array([0]), start),
    joined,
  );
  const vector = Y.decodeStateVector(known);
  assert.equal(vector.get(one.clientID), 1);
  assert.equal(vector.get(other.clientID), 1);
  // A merged update that holds both writers in clock order moves both.
  const merged = Y.mergeUpdates([start, joined]);
  assert.deepEqual(
    Y.decodeStateVector(advanceCoverage(new Uint8Array([0]), merged)),
    vector,
  );
  one.destroy();
  other.destroy();
});
