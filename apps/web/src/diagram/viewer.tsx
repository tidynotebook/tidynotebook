/** The expanded drawing reuses the image viewer, with a second sandboxed frame. */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { VectorViewer } from '../features/editor/image-viewer.tsx';
import {
  createDiagramFrame,
  type DiagramTheme,
  type DiagramSize,
} from './frame.ts';

type Options = {
  readonly source: string;
  readonly theme: DiagramTheme;
  readonly framePath: string;
};
function Drawing({
  options,
  scale,
  onSize,
  onError,
}: {
  readonly options: Options;
  readonly scale: number;
  readonly onSize: (size: DiagramSize) => void;
  readonly onError: () => void;
}): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ReturnType<typeof createDiagramFrame> | null>(null);
  const callbacks = useRef({ onSize, onError });
  callbacks.current = { onSize, onError };
  useLayoutEffect(() => {
    const target = host.current;
    if (!target) return;
    const frame = createDiagramFrame({
      ...options,
      expanded: true,
      onSize: (size) => callbacks.current.onSize(size),
      onFailure: () => callbacks.current.onError(),
    });
    handle.current = frame;
    target.append(frame.element);
    return () => {
      handle.current = null;
      frame.dispose();
    };
  }, [options]);
  useLayoutEffect(() => handle.current?.setScale(scale), [scale]);
  return <div ref={host} className="shrink-0" />;
}

export function openDiagramViewer(
  options: Options & {
    readonly returnFocus: () => void;
    readonly onClosed: () => void;
  },
): () => void {
  const mount = document.createElement('div');
  document.body.append(mount);
  const root = createRoot(mount);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    root.unmount();
    mount.remove();
    options.onClosed();
  };
  root.render(
    <VectorViewer
      onClose={close}
      returnFocus={options.returnFocus}
      content={{
        title: 'Diagram',
        render: ({ scale, onSize, onError }) => (
          <Drawing
            options={options}
            scale={scale}
            onSize={onSize}
            onError={onError}
          />
        ),
      }}
    />,
  );
  return close;
}
