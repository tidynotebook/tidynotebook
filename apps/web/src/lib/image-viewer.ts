/**
 * What the image viewer of a note shows and does (record 0145).
 *
 * A click on a picture of the note opens it in one dialog. The dialog fits the
 * picture to the screen, zooms it in fixed steps, and offers the actions that
 * the page can do with that picture. Every rule of that is a pure function
 * here, so a unit test holds it and `features/editor/image-viewer.tsx` only
 * turns it into elements and browser calls.
 */

/** A width and a height in CSS pixels. */
export type ImageSize = {
  readonly width: number;
  readonly height: number;
};

/**
 * The zoom steps that the buttons and the keys move between, from the
 * smallest zoom to the largest.
 */
export const zoomSteps = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

/**
 * The smallest and the largest zoom that a person chooses.
 *
 * The fit of a very large picture on a small screen can be smaller than the
 * smallest step, and the fit always shows the whole picture, so the lowest
 * zoom of one picture is the smaller of the two (`lowestZoom`).
 */
export const zoomLimits = { min: 0.1, max: 8 } as const;

/** Two zooms closer than this are the same step. */
const sameStep = 0.001;

/** The lowest zoom of one picture: the smallest step, or its fit below it. */
export function lowestZoom(fitted: number): number {
  return Math.min(zoomLimits.min, fitted);
}

/** Holds a zoom between the lowest zoom of a picture and the largest. */
export function clampZoom(
  scale: number,
  lowest: number = zoomLimits.min,
): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(zoomLimits.max, Math.max(lowest, scale));
}

/**
 * The zoom that shows the whole picture in the room of the viewer.
 *
 * A picture smaller than the room shows at its own size and never grows,
 * because a small picture that fills the screen reads as a blurred one. A
 * picture or a room with no size yet shows at its own size.
 */
export function fitZoom(natural: ImageSize, room: ImageSize): number {
  if (natural.width <= 0 || natural.height <= 0) return 1;
  if (room.width <= 0 || room.height <= 0) return 1;
  // No step holds the fit: a 4000 px photo on a 360 px phone fits below the
  // smallest step, and a fit held to that step would not show the photo.
  return Math.min(1, room.width / natural.width, room.height / natural.height);
}

/** The next step closer than `scale`, or the largest zoom. */
export function zoomIn(scale: number): number {
  return zoomSteps.find((step) => step > scale + sameStep) ?? zoomLimits.max;
}

/** The next step wider than `scale`, or the lowest zoom of the picture. */
export function zoomOut(
  scale: number,
  lowest: number = zoomLimits.min,
): number {
  return (
    zoomSteps.findLast(
      (step) => step < scale - sameStep && step >= lowest - sameStep,
    ) ?? Math.min(scale, lowest)
  );
}

/**
 * The zoom after one turn of the wheel with Ctrl or Cmd held.
 *
 * A wheel and a trackpad report a distance, not a step, so the zoom follows
 * the distance smoothly: a turn up comes closer and a turn down goes wider.
 */
export function wheelZoom(
  scale: number,
  deltaY: number,
  lowest: number = zoomLimits.min,
): number {
  return clampZoom(scale * Math.exp(-deltaY / 500), lowest);
}

/** What a key does in the viewer, or null for a key it leaves alone. */
export function zoomKey(key: string): 'in' | 'out' | 'fit' | 'actual' | null {
  if (key === '+' || key === '=') return 'in';
  if (key === '-' || key === '_') return 'out';
  if (key === '0') return 'fit';
  if (key === '1') return 'actual';
  return null;
}

/** The size the picture takes at one zoom, in whole pixels. */
export function zoomedSize(natural: ImageSize, scale: number): ImageSize {
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

/** The zoom as a person reads it, for example `150%`. */
export function zoomPercent(scale: number): string {
  return `${String(Math.round(scale * 100))}%`;
}

/** One action of the viewer. */
export type ImageAction = 'copy-image' | 'download' | 'copy-link' | 'open';

/**
 * The actions that the page can do with one picture.
 *
 * The page holds the bytes of a picture of the workspace, so it copies and
 * saves that picture. It cannot read the bytes of a picture on another host,
 * so it copies the address and opens the original instead, where the browser
 * of the person can save it.
 */
export function imageActions(external: boolean): readonly ImageAction[] {
  return external ? ['copy-link', 'open'] : ['copy-image', 'download'];
}

/**
 * Whether an action needs the pixels of a picture that loaded.
 *
 * Copy image draws the picture, so it waits for it. Download saves the bytes
 * of the address, and Copy link and Open original need the address alone, so
 * a picture that did not load keeps them.
 */
export function actionNeedsPicture(action: ImageAction): boolean {
  return action === 'copy-image';
}

/** The words of each action. */
export const imageActionLabels: Readonly<Record<ImageAction, string>> = {
  'copy-image': 'Copy image',
  download: 'Download',
  'copy-link': 'Copy link',
  open: 'Open original',
};

/** The line the viewer states after an action, or after one that failed. */
export const imageActionMessages = {
  copiedImage: 'The image is on the clipboard.',
  copiedLink: 'The link is on the clipboard.',
  copyImageFailed: 'This browser cannot copy the image. Use Download.',
  copyLinkFailed: 'This browser cannot copy the link.',
  notLoaded: 'The image did not load.',
} as const;

/**
 * The one line of status the viewer states.
 *
 * The result of the last action wins, because it answers what the person just
 * did. Before any action, a picture that did not load says so.
 */
export function viewerStatus(state: {
  readonly failed: boolean;
  readonly message: string;
}): string {
  if (state.message !== '') return state.message;
  return state.failed ? imageActionMessages.notLoaded : '';
}

/** The name of a viewer that shows a picture with no alt text. */
export const untitledImage = 'Image';

/** The title of the viewer: the alt text, or a plain name. */
export function imageTitle(alt: string): string {
  const name = alt.trim();
  return name === '' ? untitledImage : name;
}

/** A UUID, which the editor puts before the name of an uploaded file. */
const uuidPrefix =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-|$)/i;

/** The characters that no common file system takes in a name. */
const unsafeNameCharacters = /[\\/:*?"<>|]+/g;

/** The text without its control characters, which no file name holds. */
function printable(text: string): string {
  return Array.from(text)
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .join('');
}

/** Decodes one percent encoded part, or keeps it when it is not encoded. */
function decodedPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * The name the browser saves one picture of the workspace under.
 *
 * The last part of the destination names the file. The editor writes an
 * upload as the identifier of the note, a hyphen and the name of the file,
 * so the identifier leaves the name. A destination that names no file, such
 * as the revision of an older note, takes the alt text, and then `image`.
 */
export function imageDownloadName(destination: string, alt: string): string {
  const path = destination.split(/[?#]/, 1)[0] ?? '';
  const last = decodedPart(path.split('/').at(-1) ?? '');
  const fromPath = last.replace(uuidPrefix, '');
  const chosen = fromPath.trim() !== '' ? fromPath : alt;
  const safe = printable(chosen)
    .replace(unsafeNameCharacters, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return safe === '' ? 'image' : safe;
}

/** How far a press travels before it is a drag and no longer a tap. */
export const tapDistance = 4;

/**
 * Whether the release of one press closes the viewer.
 *
 * A tap on the scrim beside the picture closes it, as most viewers do. A
 * press that starts on the picture, or one that travels, is a drag of the
 * picture and keeps the viewer open.
 */
export function closesOnRelease(press: {
  readonly onScrim: boolean;
  readonly dx: number;
  readonly dy: number;
}): boolean {
  return press.onScrim && Math.hypot(press.dx, press.dy) < tapDistance;
}
