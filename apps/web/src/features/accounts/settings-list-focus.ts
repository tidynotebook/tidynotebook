/** Return focus to the visible settings row after leaving its phone page. */
import { useEffect, useRef, type RefObject } from 'react';

/** Focus the originating visible row after Back, without crossing workspace scope. */
export function useSettingsListFocus(
  scope: string,
  path: string | undefined,
): RefObject<HTMLElement | null> {
  const list = useRef<HTMLElement | null>(null);
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
    const row = [...(list.current?.querySelectorAll('a') ?? [])].find(
      (link) => link.getAttribute('href') === `${scope}/${before.path}`,
    );
    row?.focus();
  }, [scope, path]);
  return list;
}
