/**
 * The icons of the application, and the addresses they are served under.
 *
 * `appIcons` is the one list. The files that the build emits, the links of the
 * shell document and the icon list of the installed manifest all read it, so
 * an icon is added in one place and no document names one by hand.
 *
 * Every emitted address carries a digest of the bytes of that icon, so a new
 * drawing arrives under an address that no cache holds and the old address
 * answers nothing. A fixed address was pinned for a year by
 * `apps/server/src/plugins/static-assets.ts`, and an installed icon on an
 * iPhone stayed at the drawing of the deployment that first served it. See
 * [decision 0074](../../../../docs/decisions/0074-the-build-names-every-cached-asset.md).
 *
 * This module is pure. `vite.config.ts` reads the bytes and holds the effects.
 */

/** The directory of the icon sources, under this application. */
export const iconDirectory = 'icons';

/**
 * The count of hash characters that an emitted name carries.
 *
 * It is the length that the bundler writes, so one rule of the server reads a
 * bundler name and an icon name alike. This application is browser code and
 * imports no server package, so `tests/integration/web-build.test.ts` holds
 * this number and `assetHashLength` together.
 */
export const iconHashLength = 8;

/** One icon file of the build, and what it is for. */
export type AppIcon = {
  /** The file under `icons/`. */
  readonly file: string;
  /** The media type of the bytes. */
  readonly type: string;
  /** The pixel size, or null for a drawing that states none. */
  readonly sizes: string | null;
  /** How the installed manifest lists it, or null when it lists it not. */
  readonly purpose: 'any' | 'maskable' | null;
  /** The link relation of the shell, or null when the shell links it not. */
  readonly relation: 'icon' | 'apple-touch-icon' | null;
};

/** Every icon that the build emits. */
export const appIcons: readonly AppIcon[] = [
  {
    file: 'icon.svg',
    type: 'image/svg+xml',
    sizes: null,
    purpose: null,
    relation: 'icon',
  },
  {
    file: 'apple-touch-icon.png',
    type: 'image/png',
    // An iPhone reads this size when it copies the icon into the home screen.
    sizes: '180x180',
    purpose: null,
    relation: 'apple-touch-icon',
  },
  {
    file: 'icon-192.png',
    type: 'image/png',
    sizes: '192x192',
    purpose: 'any',
    relation: null,
  },
  {
    file: 'icon-512.png',
    type: 'image/png',
    sizes: '512x512',
    purpose: 'any',
    relation: null,
  },
  {
    file: 'maskable-512.png',
    type: 'image/png',
    sizes: '512x512',
    purpose: 'maskable',
    relation: null,
  },
];

/** One image file that the build emits under a hashed name. */
export type EmittedImage = Pick<AppIcon, 'file' | 'type'>;

/**
 * The card of a link preview (design 028).
 *
 * It sits beside the icons and takes their hashed name, but it is no icon:
 * only a crawler reads it, through the tags that the server writes at start,
 * so no document and no manifest name it and the worker does not precache
 * it. Its text is drawn into the pixels, so no font loads. The server finds
 * the emitted card by its stem, `linkPreviewCardFile` of
 * `apps/server/src/link-preview.ts`.
 */
export const socialCard: EmittedImage = {
  file: 'social-card.png',
  type: 'image/png',
};

/** Every image that the build emits: each icon, then the card. */
export const emittedImages: readonly EmittedImage[] = [...appIcons, socialCard];

/** The address of every icon, by file name. */
export type IconAddresses = Readonly<Record<string, string>>;

/**
 * The address of one icon while the development server runs.
 *
 * No build runs there, so the source file answers under its own name.
 */
export function iconSourceAddress(file: string): string {
  return `/${iconDirectory}/${file}`;
}

/** The source address of every icon. */
export function iconSourceAddresses(): IconAddresses {
  return Object.fromEntries(
    appIcons.map((icon) => [icon.file, iconSourceAddress(icon.file)]),
  );
}

/**
 * The emitted address of one icon, from a digest of its bytes.
 *
 * The caller passes the whole digest and this module takes the part it needs,
 * so the length of a hashed name is stated once.
 */
export function iconBuiltAddress(file: string, digest: string): string {
  const dot = file.lastIndexOf('.');
  const stem = file.slice(0, dot);
  const extension = file.slice(dot);
  return `/assets/${stem}-${digest.slice(0, iconHashLength)}${extension}`;
}

/**
 * The icon links of the shell document.
 *
 * The relation and the size come from the one list, so the shell cannot name
 * an icon that the build does not write.
 */
export function iconLinkElements(addresses: IconAddresses): string {
  return appIcons
    .filter((icon) => icon.relation !== null)
    .map((icon) => {
      const sizes = icon.sizes === null ? '' : ` sizes="${icon.sizes}"`;
      const href = addresses[icon.file] ?? '';
      return `<link rel="${String(icon.relation)}" type="${icon.type}"${sizes} href="${href}" />`;
    })
    .join('\n    ');
}
