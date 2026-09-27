/**
 * The seal of the address of a reported link (record 0123).
 *
 * The server keeps only a digest of a link token (record 0030), so a read of
 * the database yields no working link. A report must still let an
 * administrator open the link (record 0119). The report therefore keeps the
 * address sealed with AES-256-GCM, under a key that HKDF derives from the
 * secret of the server. A read of the database alone opens nothing.
 *
 * A sealed value that this key cannot open, for example after a change of the
 * secret, opens to `null`, and the administrator can still take the link down.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/** The version mark of a sealed value, so a later scheme can sit beside it. */
const sealVersion = 'v1';

/** The purpose that the key derivation binds, so no other key equals it. */
const keyPurpose = 'notesapp report address';

/** Seals and opens the address of a reported link. */
export type AddressSeal = {
  /** The sealed form of one address. Each call draws a new nonce. */
  seal(address: string): string;
  /** The address of one sealed value, or `null` when this key cannot open it. */
  open(sealed: string): string | null;
};

/** Builds the seal of one server secret. */
export function createAddressSeal(secret: string): AddressSeal {
  const key = Buffer.from(
    hkdfSync('sha256', secret, 'notesapp', keyPurpose, 32),
  );
  return {
    seal(address: string): string {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const body = Buffer.concat([
        cipher.update(address, 'utf8'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return `${sealVersion}.${Buffer.concat([nonce, tag, body]).toString('base64url')}`;
    },
    open(sealed: string): string | null {
      const [version, payload] = sealed.split('.');
      if (version !== sealVersion || payload === undefined) return null;
      const bytes = Buffer.from(payload, 'base64url');
      if (bytes.length < 28) return null;
      try {
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          bytes.subarray(0, 12),
        );
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString('utf8');
      } catch {
        // Another key, or a changed value: the tag does not match.
        return null;
      }
    },
  };
}
