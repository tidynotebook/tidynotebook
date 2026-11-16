/** Read fixtures for the Settings frame. Real mutation coverage uses the test services. */
import type { AccountSummary, Installation } from '@notesapp/api-client';
export * from '@notesapp/api-client';
export const adminWrites: string[] = [];
const installation: Installation = {
  registrationPolicy: 'invitation',
  registrationPolicySource: 'application',
  mailConfigured: false,
  invitationLifetimeHours: 168,
  defaultLimitBytes: 5_000_000_000,
  mail: {
    source: 'none',
    host: null,
    port: null,
    security: null,
    username: null,
    passwordStored: false,
    sender: null,
  },
  legalDocuments: { source: 'none', terms: null, privacy: null },
};
const account: AccountSummary = {
  accountId: 'account-2',
  email: 'sam@example.com',
  name: 'Sam Lee',
  installationRole: 'member',
  state: 'enabled',
  createdAt: '2026-10-20T00:00:00.000Z',
  lastActiveAt: null,
  self: false,
  storage: { usedBytes: 1000, limitBytes: 5_000_000_000 },
  controls: {
    revision: 1,
    standing: 'active',
    removalAt: null,
    limitBytes: 5_000_000_000,
    textLimitBytes: null,
    publishedTransferLimitBytes: null,
    downloadLimitBytes: null,
    features: { teams: false, collaboration: false },
    trialEndsAt: null,
    trialState: 'none',
  },
};
export async function getInstallation() {
  return { data: installation };
}
let lastAdministrator = false;
export function setLastAdministrator(value: boolean): void {
  lastAdministrator = value;
}
export async function listAccounts() {
  const listed: AccountSummary = lastAdministrator
    ? { ...account, installationRole: 'administrator', self: true }
    : account;
  return { data: { accounts: [listed] } };
}
export async function listInvitations() {
  return { data: { invitations: [] } };
}
export async function listReports() {
  return { data: { reports: [] } };
}
export async function getLegalDocumentSettings() {
  return {
    data: {
      source: 'none',
      document: null,
      template: '# Terms\n\nExample service.',
    },
  };
}
