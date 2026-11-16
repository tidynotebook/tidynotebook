/** A template preview uses the same sanitized Markdown renderer as published notes. */
import '../../lib/markdown.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { classifyUrl, renderMarkdown } from '@notesapp/markdown';
import type { LocalStore } from '@notesapp/sync';
import { Stack, PreviewSurface, LoadingState, Notice } from '@notesapp/ui';
import { useAttachmentUrls } from '../editor/note-editor-attachments.ts';

const noUploads: ReadonlyMap<string, string> = new Map();

/** Draws inert note content and marks filled template values only in this preview. */
export default function TemplatePreview({
  store,
  accountId,
  workspaceId,
  path,
  text,
  label,
  highlights,
  fill = false,
  expandOnPhone = false,
}: {
  readonly store: LocalStore;
  readonly accountId: string;
  readonly workspaceId: string;
  readonly path: string;
  readonly text: string;
  readonly label: string;
  readonly highlights: readonly string[];
  readonly fill?: boolean;
  readonly expandOnPhone?: boolean;
}): ReactNode {
  const host = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const { attachmentUrls, scan } = useAttachmentUrls(
    store,
    accountId,
    workspaceId,
    pathRef,
    text,
    noUploads,
  );
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => scan(text), [scan, text, path]);
  useEffect(() => {
    let active = true;
    setState('loading');
    void renderMarkdown(text, {
      sourcePath: path,
      noteHref: () => null,
      attachmentHref: (destination) => {
        const target = classifyUrl(destination, path);
        return (
          attachmentUrls.get(
            target.kind === 'attachment' ? target.id : destination,
          ) ?? null
        );
      },
    })
      .then((html) => {
        if (!active || host.current === null) return;
        // Only the shared sanitizer output enters this inert document. Import
        // its nodes instead of writing HTML into the application document.
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        if (
          (parsed.body.textContent ?? '').trim() === '' &&
          parsed.body.querySelector('img, hr, pre, table, input') === null
        ) {
          const empty = parsed.createElement('p');
          empty.className = 'text-muted';
          empty.textContent =
            'This template is empty. New notes will start blank.';
          parsed.body.replaceChildren(empty);
        }
        const values = [...new Set(highlights)]
          .filter((value) => value !== '')
          .sort((a, b) => b.length - a.length);
        const walker = parsed.createTreeWalker(
          parsed.body,
          NodeFilter.SHOW_TEXT,
        );
        const nodes: Text[] = [];
        while (walker.nextNode()) {
          if (walker.currentNode instanceof Text)
            nodes.push(walker.currentNode);
        }
        for (const node of nodes) {
          let remaining = node.data;
          const fragment = parsed.createDocumentFragment();
          while (remaining !== '') {
            const matches = values
              .map((value) => ({ value, index: remaining.indexOf(value) }))
              .filter((match) => match.index >= 0)
              .sort((a, b) => a.index - b.index);
            const next = matches[0];
            if (next === undefined) {
              fragment.append(remaining);
              break;
            }
            fragment.append(remaining.slice(0, next.index));
            const mark = parsed.createElement('mark');
            mark.className = 'rounded-sm bg-hover text-strong';
            mark.textContent = next.value;
            fragment.append(mark);
            remaining = remaining.slice(next.index + next.value.length);
          }
          node.replaceWith(fragment);
        }
        host.current.replaceChildren(
          ...Array.from(parsed.body.childNodes, (node) =>
            document.importNode(node, true),
          ),
        );
        setState('ready');
      })
      .catch(() => {
        if (active) setState('failed');
      });
    return () => {
      active = false;
    };
  }, [text, path, highlights, attachmentUrls]);
  return (
    <Stack fill={fill}>
      {state === 'loading' ? (
        <LoadingState shape="note" label="Loading preview" />
      ) : null}
      {state === 'failed' ? (
        <Notice
          tone="problem"
          message="The preview could not be shown. Choose the template again."
        />
      ) : null}
      <PreviewSurface
        fill={fill}
        expandOnPhone={expandOnPhone}
        ref={host}
        role="region"
        aria-label={label}
        aria-busy={state === 'loading'}
      />
    </Stack>
  );
}
