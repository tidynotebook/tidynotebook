import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consentMatches,
  consentRequired,
  type LegalDocuments,
} from './legal.ts';

const documents: LegalDocuments = {
  terms: { url: 'https://example.test/terms', version: '2026-09' },
  privacy: { url: 'https://example.test/privacy', version: '3' },
};

await test('an installation with no documents asks for nothing', () => {
  assert.equal(consentRequired(null, null), false);
  assert.equal(
    consentRequired(null, { termsVersion: 'x', privacyVersion: 'y' }),
    false,
  );
});

await test('an account needs consent until it accepted both current versions', () => {
  assert.equal(consentRequired(documents, null), true);
  const current = { termsVersion: '2026-09', privacyVersion: '3' };
  assert.equal(consentRequired(documents, current), false);
  assert.equal(consentMatches(documents, current), true);
  // A raised version of either document asks again.
  assert.equal(
    consentRequired(documents, { ...current, termsVersion: '2026-01' }),
    true,
  );
  assert.equal(
    consentRequired(documents, { ...current, privacyVersion: '2' }),
    true,
  );
});
