/**
 * The two places a route writes into the frame header.
 *
 * The header is the context of the route: the sidebar toggle and the
 * breadcrumb on the left, then the actions of the route, then Search and the
 * account. The frame cannot know those actions, because they belong to the
 * screen, and the screen cannot reach the header, because it renders below
 * it. This module is the one link between the two. See
 * [decision 0064](../../../../docs/decisions/0064-the-frame-header-is-the-context-of-the-route.md).
 *
 * The last part of the breadcrumb is the second place. It names the route, so
 * a route that writes that name itself, such as the note route with its name
 * field, claims the part and the frame draws no word of its own. See
 * [decision 0069](../../../../docs/decisions/0069-the-note-name-is-the-last-part-of-the-breadcrumb.md).
 *
 * A slot is a portal and not a node held in state. A route passes a new
 * element on every render, so a provider that kept the element in state would
 * set that state from the route, re-render the route, and receive a new
 * element again: one render loop with no fixed point. A portal writes the
 * nodes of the route into an element of the header, so React owns the order,
 * the keys and the clean up, and the header re-renders only when the header
 * changes.
 *
 * A claim is a count and not a flag. React runs every clean up of one commit
 * before every effect of it, so a move from one note to the next gives the
 * part back and takes it again, and a count reaches the same number it
 * started at while a flag would end up false.
 *
 * The shell renders one `HeaderSlot` and one `HeaderLeafSlot` inside the
 * header, and each route renders at most one `HeaderActions` and one
 * `HeaderLeaf`. A screen with neither leaves the middle empty and keeps the
 * word of the frame.
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { Inline } from '@notesapp/ui';
import { createPortal } from 'react-dom';

/** What the frame publishes and a route reads. */
type HeaderSlotValue = {
  /** The element of the header that holds the actions of the route. */
  readonly host: HTMLElement | null;
  /** The frame calls this with the element it rendered, and with null. */
  readonly setHost: (element: HTMLElement | null) => void;
  /** The element of the breadcrumb that holds the last part of the route. */
  readonly leafHost: HTMLElement | null;
  /** The frame calls this with the element it rendered, and with null. */
  readonly setLeafHost: (element: HTMLElement | null) => void;
  /** True while a route names the last part of the breadcrumb itself. */
  readonly leafFilled: boolean;
  /** Claims the last part. Call what it returns to give the part back. */
  readonly claimLeaf: () => () => void;
};

const HeaderSlotContext = createContext<HeaderSlotValue | null>(null);

/**
 * Holds the header slots for one application frame.
 *
 * It wraps the whole frame, so the header and every route read one context.
 */
export function HeaderSlotProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [leafHost, setLeafHost] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claimLeaf = useCallback((): (() => void) => {
    setClaims((count) => count + 1);
    return (): void => {
      setClaims((count) => count - 1);
    };
  }, []);
  return (
    <HeaderSlotContext.Provider
      value={{
        host,
        setHost,
        leafHost,
        setLeafHost,
        leafFilled: claims > 0,
        claimLeaf,
      }}
    >
      {children}
    </HeaderSlotContext.Provider>
  );
}

/** The value a component outside a frame reads: two slots that go nowhere. */
const noSlots: HeaderSlotValue = {
  host: null,
  setHost: (): void => undefined,
  leafHost: null,
  setLeafHost: (): void => undefined,
  leafFilled: false,
  claimLeaf: () => (): void => undefined,
};

/**
 * Reads the header slots.
 *
 * A component outside a `HeaderSlotProvider` receives slots with no host, so
 * a screen rendered on its own, such as an error page, renders its actions
 * nowhere instead of failing.
 */
export function useHeaderSlot(): HeaderSlotValue {
  return useContext(HeaderSlotContext) ?? noSlots;
}

/**
 * The element of the header that the actions of the route render into.
 *
 * The frame renders this once, where the actions belong. The `ref` callback
 * publishes the element while it is in the document and clears it when the
 * frame unmounts, so a route never writes into an element that has gone.
 */
export function HeaderSlot({
  className,
}: {
  readonly className?: string | undefined;
}): ReactNode {
  const { setHost } = useHeaderSlot();
  return <Inline gap={1} className={className} ref={setHost} />;
}

/**
 * The element of the breadcrumb that the last part of the route renders into.
 *
 * The frame renders this inside the last item of the breadcrumb, so what a
 * route writes lands where the word of that route would stand.
 */
export function HeaderLeafSlot({
  className,
}: {
  readonly className?: string | undefined;
}): ReactNode {
  const { setLeafHost } = useHeaderSlot();
  return <div className={className} ref={setLeafHost} />;
}

/**
 * The actions of one route, placed in the header.
 *
 * A route renders this with its own buttons and menus. It draws nothing until
 * the frame has published its element, which is the first paint of the frame,
 * so the header never shows the actions of the route it just left.
 */
export function HeaderActions({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const { host } = useHeaderSlot();
  if (host === null) return null;
  return createPortal(children, host);
}

/**
 * The last part of the breadcrumb, written by the route itself.
 *
 * The claim runs as a layout effect, so the frame knows the part is taken for
 * as long as this is mounted and draws its own word again the moment it goes.
 * A layout effect runs before the browser paints, so the frame hides its word
 * in the same frame that the part of the route appears. A passive effect ran
 * after that paint, and the header showed the name of the note twice for one
 * frame each time a note opened.
 */
export function HeaderLeaf({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const { leafHost, claimLeaf } = useHeaderSlot();
  useLayoutEffect(() => claimLeaf(), [claimLeaf]);
  if (leafHost === null) return null;
  return createPortal(children, leafHost);
}
