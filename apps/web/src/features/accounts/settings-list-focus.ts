/** Return focus to the visible Settings row after Back on a phone. */
import { useEffect, useRef, type RefObject } from 'react';

/** Focus the originating visible row after Back, without crossing workspace scope. */
export function useSettingsListFocus(
  scope: string,
  path: string | undefined,
): RefObject<HTMLDivElement | null> {
  const list = useRef<HTMLDivElement | null>(null);
  const previous = useRef({ scope, path });
  useEffect(() => {
    const before = previous.current;
    previous.current = { scope, path };
    if (
      before.scope !== scope ||
      before.path === undefined ||
      path !== undefined
    )
      return;
    const row = [
      ...(list.current?.querySelectorAll<HTMLElement>('[data-settings-page]') ??
        []),
    ].find((item) => item.dataset['settingsPage'] === before.path);
    row?.focus();
  }, [scope, path]);
  return list;
}
