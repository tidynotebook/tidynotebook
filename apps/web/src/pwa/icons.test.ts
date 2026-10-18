import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appIcons,
  emittedImages,
  iconBuiltAddress,
  iconHashLength,
  iconLinkElements,
  iconSourceAddress,
  iconSourceAddresses,
  socialCard,
} from './icons.ts';

await test('the shell links one icon of the build for each relation', () => {
  const links = iconLinkElements(iconSourceAddresses());
  for (const icon of appIcons) {
    if (icon.relation === null) {
      assert.ok(!links.includes(icon.file), icon.file);
      continue;
    }
    assert.ok(links.includes(`rel="${icon.relation}"`), icon.file);
    assert.ok(
      links.includes(`href="${iconSourceAddress(icon.file)}"`),
      icon.file,
    );
  }
  // An iPhone reads the size of the icon it copies into the home screen.
  assert.ok(links.includes('sizes="180x180"'));
  assert.ok(links.includes('rel="apple-touch-icon"'));
});

await test('an icon address follows the bytes of that icon', () => {
  const one = iconBuiltAddress('icon-192.png', 'a'.repeat(64));
  const other = iconBuiltAddress('icon-192.png', 'b'.repeat(64));
  assert.notEqual(one, other);
  assert.equal(one, iconBuiltAddress('icon-192.png', 'a'.repeat(64)));
  // A fixed address is what a stale cache entry answers. Every icon carries
  // a hash of the length that the bundler writes, so one rule of the server
  // reads an emitted chunk and an icon alike.
  assert.equal(one, `/assets/icon-192-${'a'.repeat(iconHashLength)}.png`);
});

await test('every icon states what it is for', () => {
  const files = new Set<string>();
  for (const icon of appIcons) {
    assert.ok(!files.has(icon.file), icon.file);
    files.add(icon.file);
    // An icon that no document names is an icon that nothing serves.
    assert.ok(icon.purpose !== null || icon.relation !== null, icon.file);
    assert.ok(icon.file.includes('.'), icon.file);
  }
  // The installed manifest needs a drawing for a round mask and a square one.
  assert.ok(appIcons.some((icon) => icon.purpose === 'maskable'));
  assert.ok(appIcons.some((icon) => icon.purpose === 'any'));
});

await test('the card of a link preview takes a hashed name and is no icon', () => {
  assert.equal(
    iconBuiltAddress(socialCard.file, 'abcdef0123456789'),
    '/assets/social-card-abcdef01.png',
  );
  assert.equal(socialCard.type, 'image/png');
  assert.ok(!appIcons.some((icon) => icon.file === socialCard.file));
  assert.ok(emittedImages.includes(socialCard));
  // No link of the shell names it.
  assert.ok(!iconLinkElements(iconSourceAddresses()).includes('social-card'));
});
