/**
 * The Review of one note: the text that caused it, beside the note now.
 *
 * A save of this device that joined work of another device keeps its own
 * checkpoint, and an upgrade that could not place earlier work keeps that
 * text. The screen compares that kept text with the text of the note on this
 * device, line by line, through the comparison History uses (record 0087).
 *
 * Opening the Review clears its event on this device, after the screen holds
 * what it shows, so the notice of the note goes and a later merge can offer
 * Review again. Nothing here changes the text of the note: the work of both
 * devices is in it already. The one action of a kept text opens Needs
 * attention, where that text waits.
 *
 * The screen reads the local store only. It calls no network operation.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import type { DiffHunk } from '@notesapp/editor';
import type { LocalStore, ReviewRecord } from '@notesapp/sync';
import {
  buttonClassName,
  CheckIcon,
  EmptyState,
  LoadingState,
  Notice,
  Page,
  PageHeader,
} from '@notesapp/ui';
import { useLocalStore, useSession } from '../../app.tsx';
import { attentionTitle } from '../attention/attention-link.tsx';
import { requestDiff } from '../history/diff-worker.ts';
import { InlineDiff } from '../history/inline-diff.tsx';
import {
  noReviewDescription,
  noReviewTitle,
  reviewPage,
  reviewReadFailed,
  reviewTooFarApart,
} from '../../lib/review.ts';

/** What the screen holds for the Review it opened. */
type Opened =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly review: ReviewRecord;
      readonly current: string;
    };

/** The state of the comparison. */
type Comparison =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly hunks: readonly DiffHunk[] }
  | { readonly status: 'limit' }
  | { readonly status: 'failed' };

/** The routed Review of one note. */
export function ReviewView(): ReactNode {
  const params = useParams();
  const workspaceId =
    typeof params.workspaceId === 'string' ? params.workspaceId : null;
  const fileId = typeof params.fileId === 'string' ? params.fileId : null;
  const session = useSession();
  const { store } = useLocalStore();
  const accountId = session.account?.accountId ?? null;
  if (
    workspaceId === null ||
    fileId === null ||
    accountId === null ||
    store === null
  )
    return (
      <Page>
        <PageHeader title="Review" />
        <LoadingState label="The review is loading." />
      </Page>
    );
  return (
    <ReviewDetail
      store={store}
      accountId={accountId}
      workspaceId={workspaceId}
      fileId={fileId}
    />
  );
}

/** Opens the oldest Review of one note and shows its comparison. */
function ReviewDetail({
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
  const [opened, setOpened] = useState<Opened>({ status: 'loading' });
  const [comparison, setComparison] = useState<Comparison>({
    status: 'loading',
  });

  // One read per mount. The event is cleared only after the screen holds the
  // texts, and a read that the screen abandoned clears nothing, so a second
  // run of the effect opens the same event.
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const [review] = await store.listReviews(
          accountId,
          workspaceId,
          fileId,
        );
        if (cancelled) return;
        if (review === undefined) {
          setOpened({ status: 'none' });
          return;
        }
        const note = await store.readCachedNote(accountId, workspaceId, fileId);
        if (cancelled) return;
        setOpened({ status: 'ready', review, current: note?.text ?? '' });
        await store.clearReview(accountId, workspaceId, review.reviewId);
      } catch {
        if (!cancelled) setOpened({ status: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, accountId, workspaceId, fileId]);

  const kept = opened.status === 'ready' ? opened.review.text : null;
  const current = opened.status === 'ready' ? opened.current : null;
  useEffect(() => {
    if (kept === null || current === null) return;
    let cancelled = false;
    setComparison({ status: 'loading' });
    requestDiff(kept, current).then(
      (compared) => {
        if (cancelled) return;
        setComparison(
          compared.kind === 'complete'
            ? { status: 'ready', hunks: compared.hunks }
            : { status: 'limit' },
        );
      },
      () => {
        if (!cancelled) setComparison({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kept, current]);

  if (opened.status === 'loading')
    return (
      <Page>
        <PageHeader title="Review" />
        <LoadingState
          shape="list"
          rows={4}
          label="The review of this note is loading."
        />
      </Page>
    );
  if (opened.status === 'none' || opened.status === 'failed')
    return (
      <Page>
        <PageHeader title="Review" />
        {opened.status === 'failed' ? (
          <Notice tone="problem" message={reviewReadFailed} />
        ) : (
          <EmptyState
            icon={<CheckIcon size={20} />}
            title={noReviewTitle}
            description={noReviewDescription}
          />
        )}
      </Page>
    );

  const page = reviewPage(opened.review);
  return (
    <Page>
      <PageHeader title={page.title} description={page.description} />
      <div className="space-y-4">
        {page.opensAttention ? (
          <div>
            <Link
              className={buttonClassName({ variant: 'primary', size: 'sm' })}
              to={`/w/${workspaceId}/attention`}
            >
              {`Open ${attentionTitle}`}
            </Link>
          </div>
        ) : null}
        {page.missing !== null ? (
          <p className="m-0 text-help text-muted">{page.missing}</p>
        ) : comparison.status === 'loading' ? (
          <LoadingState
            shape="list"
            rows={4}
            label="The comparison is loading."
          />
        ) : comparison.status === 'ready' ? (
          <InlineDiff
            hunks={comparison.hunks}
            idPrefix={`review-${opened.review.reviewId}`}
            oldLabel={page.keptLabel}
            newLabel={page.currentLabel}
            sameText={page.sameText}
          />
        ) : comparison.status === 'limit' ? (
          <p className="m-0 text-help text-muted">{reviewTooFarApart}</p>
        ) : (
          <Notice tone="problem" message="The comparison did not finish." />
        )}
      </div>
    </Page>
  );
}
