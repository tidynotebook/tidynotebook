import {
  IdentityMark,
  Viewport,
  Inline,
  Inset,
  Stack,
  AppMarkIcon,
  PublicFooter,
  installationFooterColumns,
  Card,
} from '@notesapp/ui';
import type { ReactNode } from 'react';
import type { LegalDocuments } from '@notesapp/api-client';

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
  description,
  children,
  footer,
  showSignIn = true,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly showSignIn?: boolean;
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
    { signIn: showSignIn ? '/login' : null },
  );
  return (
    <Viewport
      as="div"
      gap={6}
      padX={{ fine: 6, coarse: 4 }}
      padY={{ fine: 6, coarse: 12 }}
      align="center"
      className="fine:justify-center coarse:justify-start bg-surface"
    >
      <Inline
        gap={3}
        align="center"
        as="div"
        className="text-title-header text-strong"
      >
        <IdentityMark size="brand">
          <AppMarkIcon />
        </IdentityMark>
        <span>{productName}</span>
      </Inline>
      <Card className="w-full max-w-sm">
        <Stack pad={{ fine: 6, coarse: 4 }} gap={{ fine: 6, coarse: 4 }}>
          <Stack gap={1}>
            <Inset
              as="h1"
              className="text-title-page tracking-heading text-strong"
            >
              {title}
            </Inset>
            {description === undefined ? null : (
              <p className="text-secondary text-muted wrap-anywhere">
                {description}
              </p>
            )}
          </Stack>
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
