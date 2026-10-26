import { useState, type ReactNode } from 'react';
import { Button, CloseIcon } from '@notesapp/ui';
import { nextWritingTip, writingTips } from '../../lib/writing-tips.ts';

/** Optional compact help keeps the existing account and workspace key. */
export function WritingStart({
  preferenceKey,
}: {
  readonly preferenceKey: string;
}): ReactNode {
  const [tip, setTip] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(preferenceKey) === 'dismissed';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <section
      className="my-4 flex min-h-13 items-center gap-1 rounded-lg border border-edge-subtle bg-card pl-3 pr-1"
      aria-label="Writing tip"
    >
      <p className="m-0 min-w-0 flex-1 text-control text-muted">
        {writingTips[tip]}
      </p>
      <Button variant="ghost" size="sm" onClick={() => setTip(nextWritingTip)}>
        Next
      </Button>
      <Button
        variant="ghost"
        size="sm"
        label="Close tips"
        className="size-11 md:size-11"
        icon={<CloseIcon />}
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(preferenceKey, 'dismissed');
          } catch {
            /* Closing works without storage. */
          }
        }}
      />
    </section>
  );
}
