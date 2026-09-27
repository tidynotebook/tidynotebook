import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expiryInstant,
  expiryPhrase,
  folderScopeSentences,
  linkFacts,
  linkPasswordRule,
  linkTitle,
  noteCountPhrase,
  notesInScope,
  parseExpiryChoice,
  publishedLinkAddress,
  publishFailureSentence,
  shownLinkFacts,
  sortLinks,
  takenDownFact,
  type OwnedLink,
} from './publishing.ts';

const now = Date.parse('2026-09-16T12:00:00.000Z');

await test('the address joins the serving origin and the reader path', () => {
  assert.equal(
    publishedLinkAddress('https://notes.example', 'abc'),
    'https://notes.example/published/abc',
  );
});

await test('a trailing separator on the origin does not double', () => {
  assert.equal(
    publishedLinkAddress('https://notes.example/', 'abc'),
    'https://notes.example/published/abc',
  );
});

await test('no token gives no address', () => {
  assert.equal(publishedLinkAddress('https://notes.example', ''), '');
});

await test('each expiry choice gives the instant it names', () => {
  assert.equal(expiryInstant('never', now), null);
  assert.equal(expiryInstant('day', now), '2026-09-17T12:00:00.000Z');
  assert.equal(expiryInstant('week', now), '2026-09-23T12:00:00.000Z');
  assert.equal(expiryInstant('month', now), '2026-10-16T12:00:00.000Z');
});

await test('a value that is not a choice reads as no expiry', () => {
  assert.equal(parseExpiryChoice('week'), 'week');
  assert.equal(parseExpiryChoice('yesterday'), 'never');
  assert.equal(parseExpiryChoice(''), 'never');
});

await test('a count reads as a whole phrase', () => {
  assert.equal(noteCountPhrase(0), 'no note');
  assert.equal(noteCountPhrase(1), '1 note');
  assert.equal(noteCountPhrase(3), '3 notes');
});

await test('the folder sentences state the reach before the person confirms', () => {
  assert.deepEqual(folderScopeSentences(3), [
    'This link lists the name of every note in this folder.',
    'It opens 3 notes now.',
    'It also opens every note that you add to this folder later.',
  ]);
  assert.equal(folderScopeSentences(1)[1], 'It opens 1 note now.');
  assert.equal(folderScopeSentences(0)[1], 'It opens no note now.');
});

await test('a folder link counts the notes below it and nothing else', () => {
  const notes = [
    { fileId: 'a', path: 'trip/day one.md' },
    { fileId: 'b', path: 'trip/deep/day two.md' },
    { fileId: 'c', path: 'trips-2026/other.md' },
    { fileId: 'd', path: 'trip.md' },
  ];
  assert.equal(notesInScope({ kind: 'folder', path: 'trip' }, notes), 2);
});

await test('a note link counts the one note it names', () => {
  const notes = [
    { fileId: 'a', path: 'trip/day one.md' },
    { fileId: 'b', path: 'trip/day two.md' },
  ];
  assert.equal(notesInScope({ kind: 'note', fileId: 'b' }, notes), 1);
  assert.equal(notesInScope({ kind: 'note', fileId: 'gone' }, notes), 0);
});

await test('the password rule states that an empty field makes an open link', () => {
  assert.equal(
    linkPasswordRule,
    'Leave this empty for a link that opens without a password. A password needs at least 15 characters.',
  );
});

await test('a note link takes the name of its note and hides the suffix', () => {
  const notes = [{ fileId: 'a', path: 'trip/day one.md' }];
  assert.equal(linkTitle({ kind: 'note', fileId: 'a' }, notes), 'trip/day one');
});

await test('a link to a note that left the list says so', () => {
  assert.equal(
    linkTitle({ kind: 'note', fileId: 'gone' }, []),
    'A note that is not in your notes',
  );
});

await test('a folder link takes its folder', () => {
  assert.equal(linkTitle({ kind: 'folder', path: 'trip' }, []), 'trip');
});

await test('an expiry reads as words and never as a stored instant', () => {
  assert.equal(expiryPhrase(null, now), 'No expiry');
  assert.equal(expiryPhrase('2026-09-15T12:00:00.000Z', now), 'Expired');
  assert.equal(
    expiryPhrase('2026-09-23T12:00:00.000Z', now),
    'Stops in 7 days',
  );
  assert.equal(
    expiryPhrase('2026-09-16T12:00:30.000Z', now),
    'Stops in a moment',
  );
});

await test('an expiry that cannot be read never opens the link for ever by name', () => {
  assert.equal(expiryPhrase('not an instant', now), 'No expiry');
});

await test('the row facts state the reach, the password, the expiry and the age', () => {
  const link: OwnedLink = {
    publicationId: 'p1',
    scope: { kind: 'folder', path: 'trip' },
    createdAt: '2026-09-14T12:00:00.000Z',
    expiresAt: '2026-09-23T12:00:00.000Z',
    passwordProtected: true,
    takenDown: false,
  };
  assert.deepEqual(linkFacts(link, 3, now), [
    'Folder with 3 notes',
    'Password',
    'Stops in 7 days',
    'published 2 days ago',
  ]);
});

await test('a note link with no password and no expiry reads plainly', () => {
  const link: OwnedLink = {
    publicationId: 'p2',
    scope: { kind: 'note', fileId: 'a' },
    createdAt: '2026-09-16T12:00:00.000Z',
    expiresAt: null,
    passwordProtected: false,
    takenDown: false,
  };
  assert.deepEqual(linkFacts(link, 1, now), [
    'One note',
    'No expiry',
    'published just now',
  ]);
});

await test('a row shows the first two facts and keeps the rest', () => {
  const link: OwnedLink = {
    publicationId: 'p3',
    scope: { kind: 'note', fileId: 'a' },
    createdAt: '2026-09-14T12:00:00.000Z',
    expiresAt: null,
    passwordProtected: true,
    takenDown: false,
  };
  const facts = linkFacts(link, 1, now);
  assert.deepEqual(facts.slice(0, shownLinkFacts), ['One note', 'Password']);
  assert.deepEqual(facts.slice(shownLinkFacts), [
    'No expiry',
    'published 2 days ago',
  ]);
});

await test('the newest link comes first and a tie keeps a stable order', () => {
  const links: readonly OwnedLink[] = [
    {
      publicationId: 'old',
      scope: { kind: 'folder', path: 'b' },
      createdAt: '2026-09-10T12:00:00.000Z',
      expiresAt: null,
      passwordProtected: false,
      takenDown: false,
    },
    {
      publicationId: 'tie-b',
      scope: { kind: 'folder', path: 'zeta' },
      createdAt: '2026-09-15T12:00:00.000Z',
      expiresAt: null,
      passwordProtected: false,
      takenDown: false,
    },
    {
      publicationId: 'tie-a',
      scope: { kind: 'folder', path: 'alpha' },
      createdAt: '2026-09-15T12:00:00.000Z',
      expiresAt: null,
      passwordProtected: false,
      takenDown: false,
    },
  ];
  const sorted = sortLinks(links, (link) => linkTitle(link.scope, []));
  assert.deepEqual(
    sorted.map((link) => link.publicationId),
    ['tie-a', 'tie-b', 'old'],
  );
});

await test('a link whose instant cannot be read sorts last and is still listed', () => {
  const links: readonly OwnedLink[] = [
    {
      publicationId: 'broken',
      scope: { kind: 'folder', path: 'a' },
      createdAt: 'not an instant',
      expiresAt: null,
      passwordProtected: false,
      takenDown: false,
    },
    {
      publicationId: 'good',
      scope: { kind: 'folder', path: 'b' },
      createdAt: '2026-09-10T12:00:00.000Z',
      expiresAt: null,
      passwordProtected: false,
      takenDown: false,
    },
  ];
  const sorted = sortLinks(links, (link) => linkTitle(link.scope, []));
  assert.deepEqual(
    sorted.map((link) => link.publicationId),
    ['good', 'broken'],
  );
});

await test('the link limit gets its own sentence and names no code', () => {
  const sentence = publishFailureSentence('quota_exceeded', 413);
  assert.equal(
    sentence,
    'This workspace holds 200 published links. Revoke a link, then publish again.',
  );
  assert.ok(!sentence.includes('quota'));
});

await test('every other cause keeps the shared sentence', () => {
  assert.equal(
    publishFailureSentence('not_found', 404),
    'That note is not on the server.',
  );
  assert.equal(
    publishFailureSentence(null, 500),
    'The server had a problem. Try again in a moment.',
  );
});

await test('a taken down link says so first', () => {
  const link: OwnedLink = {
    publicationId: 'p9',
    scope: { kind: 'note', fileId: 'a' },
    createdAt: '2026-09-16T12:00:00.000Z',
    expiresAt: null,
    passwordProtected: false,
    takenDown: true,
  };
  const facts = linkFacts(link, 1, now);
  assert.equal(facts[0], takenDownFact);
  assert.ok(facts.slice(0, shownLinkFacts).includes(takenDownFact));
});
