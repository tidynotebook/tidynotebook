import { Inset, Button, Notice } from '@notesapp/ui';
/**
 * The notice that one open note shows while a Review waits (record 0087).
 *
 * The note reads the Reviews of this device from the store and reads them
 * again when a Review of the note is recorded or cleared, so an answer that
 * merged reaches the open note without a reload. `lib/review.ts` decides the
 * one event and its words. Review opens the comparison, and Dismiss clears
 * that event on this device only.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { LocalStore, ReviewRecord } from '@notesapp/sync';

import { reviewDismissFailed, reviewNotice } from '../../lib/review.ts';

/** The Reviews that wait for one note, and a way to read them again. */
export function useReviews(
  store: LocalStore | null,
  accountId: string | null,
  workspaceId: string,
  fileId: string,
): readonly ReviewRecord[] {
  const [reviews, setReviews] = useState<readonly ReviewRecord[]>([]);

  useEffect(() => {
    if (store === null || accountId === null) {
      setReviews([]);
      return;
    }
    const activeStore = store;
    const activeAccount = accountId;
    let cancelled = false;
    const read = async (): Promise<void> => {
      try {
        const found = await activeStore.listReviews(
          activeAccount,
          workspaceId,
          fileId,
        );
        if (!cancelled) setReviews(found);
      } catch {
        // A Review is an aid. A failed read leaves the note as it is, and
        // the next change of the store reads again.
      }
    };
    void read();
    const unsubscribe = activeStore.subscribe((change) => {
      if (
        change.accountId === activeAccount &&
        change.workspaceId === workspaceId &&
        (change.fileId === null || change.fileId === fileId) &&
        (change.kind === 'review' || change.kind === 'reset')
      )
        void read();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store, accountId, workspaceId, fileId]);

  return reviews;
}

/** The notice of the Review that the open note offers, or nothing. */
export function ReviewNoticeBar({
  store,
  accountId,
  workspaceId,
  fileId,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly fileId: string;
}): ReactNode {
  const navigate = useNavigate();
  const notice = reviewNotice(
    useReviews(store, accountId, workspaceId, fileId),
  );
  const [failed, setFailed] = useState(false);

  const dismiss = useCallback(
    (reviewId: string): void => {
      void store.clearReview(accountId, workspaceId, reviewId).then(
        () => {
          setFailed(false);
        },
        () => {
          setFailed(true);
        },
      );
    },
    [store, accountId, workspaceId],
  );

  if (notice === null) return null;
  return (
    <Inset as="div">
      <Notice
        tone="info"
        message={failed ? reviewDismissFailed : notice.message}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigate(`/w/${workspaceId}/notes/${fileId}/review`);
          }}
        >
          Review
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismiss(notice.reviewId);
          }}
        >
          Dismiss
        </Button>
      </Notice>
    </Inset>
  );
}
