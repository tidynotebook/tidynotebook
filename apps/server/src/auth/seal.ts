/**
 * The seal of a value that the database keeps and must not open alone.
 *
 * Each value is sealed with AES-256-GCM under a key that HKDF derives from
 * the secret of the server and from one purpose, so a key of one purpose
 * opens no value of another. Two values use it:
 *
 * - The address of a reported link (record 0123). The server keeps only a
 *   digest of a link token (record 0030), and a report must still let an
 *   administrator open the link (record 0119).
 * - The password of the mail server that an administrator sets (record
 *   0148).
 *
 * A sealed value that this key cannot open, for example after a change of the
 * secret, opens to `null`. The administrator can still take a reported link
 * down, and enters the mail password again.
 */
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/** The version mark of a sealed value, so a later scheme can sit beside it. */
const sealVersion = 'v1';

/** The purpose of each key, which the key derivation binds. */
const keyPurposes = {
  address: 'notesapp report address',
  mailPassword: 'notesapp mail password',
} as const;

/** Seals and opens one kind of value. */
export type Seal = {
  /** The sealed form of one value. Each call draws a new nonce. */
  seal(value: string): string;
  /** The value of one sealed text, or `null` when this key cannot open it. */
  open(sealed: string): string | null;
};

/** Seals and opens the address of a reported link. */
export type AddressSeal = Seal;

/** Builds the seal of the address of a reported link (record 0123). */
export function createAddressSeal(secret: string): AddressSeal {
  return createSeal(secret, keyPurposes.address);
}

/** Builds the seal of the mail password (record 0148). */
export function createMailPasswordSeal(secret: string): Seal {
  return createSeal(secret, keyPurposes.mailPassword);
}

/** Builds the seal of one server secret and one purpose. */
function createSeal(secret: string, purpose: string): Seal {
  const key = Buffer.from(hkdfSync('sha256', secret, 'notesapp', purpose, 32));
  return {
    seal(value: string): string {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const body = Buffer.concat([
        cipher.update(value, 'utf8'),
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
