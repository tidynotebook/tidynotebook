/** A miniature theme uses the same variables as the page. */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { applyTheme, type Theme } from './theme.ts';
import { Stack } from './primitives.tsx';
export function ThemePreview({
  theme,
  className = '',
}: {
  readonly theme: Theme;
  readonly className?: string;
}): ReactNode {
  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (element)
      applyTheme(
        {
          setAttribute: (name, value) => element.setAttribute(name, value),
          setProperty: (name, value) => element.style.setProperty(name, value),
        },
        theme,
      );
  }, [theme]);
  return (
    <span
      ref={root}
      aria-hidden="true"
      className={`flex h-14 min-w-0 overflow-hidden bg-app ${className}`}
    >
      <Stack
        as="span"
        gap={1}
        pad={2}
        className="w-1/4 border-r border-edge-subtle bg-surface"
      >
        {[0, 1, 2].map((line) => (
          <span key={line} className="block h-1 rounded-sm bg-muted" />
        ))}
      </Stack>
      <Stack as="span" gap={1} pad={2} className="flex-1">
        <span className="block h-1.5 w-1/2 rounded-sm bg-strong" />
        <span className="block h-1 w-3/4 rounded-sm bg-muted" />
        <span className="block h-1 w-2/3 rounded-sm bg-muted" />
        <span className="block h-1 w-1/4 rounded-sm bg-accent-fill" />
      </Stack>
    </span>
  );
}
