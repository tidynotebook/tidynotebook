import type { ReactNode } from 'react';
import type { LegalDocuments } from '@notesapp/api-client';
import {
  Viewport,
  Inline,
  Inset,
  Stack,
  AppMarkIcon,
  PublicFooter,
  installationFooterColumns,
  Card,
} from '@notesapp/ui';
import { productName } from '@notesapp/core';
import { useLegalDocuments } from './legal-links.tsx';
/**
 * The frame of a screen before a session: the wordmark over one raised panel
 * on the chrome plane (decisions 0062 and 0064). Sign in, first-run setup,
 * the acceptance of an invitation and the reset of a password use it. The
 * public footer sits outside the panel and uses the installation legal URLs.
 */
export function AuthFrame({
  documents: suppliedDocuments,
  title,
  children,
  footer,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly documents?: LegalDocuments | null;
}): ReactNode {
  const documents = useLegalDocuments(suppliedDocuments);
  const columns = installationFooterColumns(
    documents === null
      ? []
      : [
          { label: 'Terms', href: documents.terms.url },
          { label: 'Privacy', href: documents.privacy.url },
        ],
  );
  return (
    <Viewport
      as="div"
      gap={6}
      pad={{ fine: 6, coarse: 4 }}
      align="center"
      className="justify-center bg-surface"
    >
      <Inline
        gap={3}
        align="center"
        as="div"
        className="text-title-header text-strong"
      >
        <span
          className="inline-flex size-7 items-center justify-center rounded-md bg-active text-strong"
          aria-hidden="true"
        >
          <AppMarkIcon />
        </span>
        <span>{productName}</span>
      </Inline>
      <Card className="w-full max-w-sm">
        <Stack pad={{ fine: 6, coarse: 4 }} gap={4}>
          <Inset
            as="h1"
            className="text-title-page tracking-heading text-strong"
          >
            {title}
          </Inset>
          {children}
        </Stack>
      </Card>
      {footer === undefined || footer === null ? null : (
        <Inset as="div" className="w-full max-w-sm">
          {footer}
        </Inset>
      )}
      <div className="w-full max-w-5xl">
        <PublicFooter home="/" columns={columns} />
      </div>
    </Viewport>
  );
}
