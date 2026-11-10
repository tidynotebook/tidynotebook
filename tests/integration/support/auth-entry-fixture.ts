/** Controlled boundaries for real auth entry components. No service writes. */
import type { LegalDocuments } from '@notesapp/api-client';
import type { SessionStatus } from '../../../apps/web/dist/app.js';
export * from '@notesapp/api-client';

export const documents: LegalDocuments = {
  terms: { url: 'https://legal.example.invalid/terms', version: 'terms-1' },
  privacy: {
    url: 'https://legal.example.invalid/privacy',
    version: 'privacy-1',
  },
};
const signIn: unknown[] = [];
const signup: unknown[] = [];
const owner: unknown[] = [];
const verify: unknown[] = [];
export const calls = {
  signIn,
  signup,
  owner,
  verify,
  proof: 0,
  solve: 0,
  refresh: 0,
};
type Reply = {
  data?: { ok: boolean; redirect?: boolean; url?: string };
  error?: unknown;
  response?: { status: number };
};
export let signInReply: Reply = { data: { ok: true } };
export const account = {
  accountId: 'auth-entry-account',
  email: 'audit@example.invalid',
  accountPortal: false,
  consentRequired: false,
  controls: {
    standing: 'active',
    trialState: 'none',
    trialEndsAt: null,
    removalAt: null,
  },
};
export let sessionStatus: SessionStatus = 'signed-out';
let initialized = true;
let legal: LegalDocuments | null = documents;
let holdSetup = false;
type Setup = {
  data: {
    initialized: boolean;
    openRegistration: boolean;
    passwordReset: boolean;
    legalDocuments: LegalDocuments | null;
  };
};
const setupRequests: ReturnType<typeof Promise.withResolvers<Setup>>[] = [];
export function reset() {
  for (const values of [calls.signIn, calls.signup, calls.owner, calls.verify])
    values.length = 0;
  calls.proof = 0;
  calls.solve = 0;
  calls.refresh = 0;
  sessionStatus = 'signed-out';
  account.consentRequired = false;
  account.controls.standing = 'active';
  initialized = true;
  legal = documents;
  holdSetup = false;
  setupRequests.length = 0;
  signInReply = { data: { ok: true } };
}
export function setSession(status: SessionStatus) {
  sessionStatus = status;
}
export function setSetup(options: {
  initialized?: boolean;
  legal?: LegalDocuments | null;
  hold?: boolean;
}) {
  initialized = options.initialized ?? initialized;
  if ('legal' in options) legal = options.legal ?? null;
  holdSetup = options.hold ?? false;
}
export function setSignInReply(reply: Reply) {
  signInReply = reply;
}
export function releaseSetup() {
  holdSetup = false;
  for (const request of setupRequests.splice(0)) request.resolve(setup());
}
function setup(): Setup {
  return {
    data: {
      initialized,
      openRegistration: true,
      passwordReset: true,
      legalDocuments: legal,
    },
  };
}
export async function getSetupStatus(): Promise<Setup> {
  if (!holdSetup) return setup();
  const request = Promise.withResolvers<Setup>();
  setupRequests.push(request);
  return request.promise;
}
const refresh = () => {
  calls.refresh += 1;
  sessionStatus = 'signed-in';
};
const recheck = () => {};
const signOut = () => {};
export function useSession() {
  return {
    status: sessionStatus,
    account: sessionStatus === 'signed-in' ? account : null,
    refresh,
    recheck,
    signOut,
  };
}
export function useLocalStore() {
  return { store: null };
}
export function problemMessage() {
  return 'The service did not answer. Try again.';
}
export async function signInWithPassword({ body }: { body: unknown }) {
  calls.signIn.push(body);
  return signInReply;
}
export async function createOwner({ body }: { body: unknown }) {
  calls.owner.push(body);
  return { data: { ok: true } };
}
export async function getSignUpChallenge() {
  calls.proof += 1;
  return {
    data: {
      challenge: 'synthetic-challenge',
      value: 'synthetic-value',
      difficulty: 1,
    },
  };
}
export async function solveChallenge(value: string, difficulty: number) {
  if (value !== 'synthetic-value' || difficulty !== 1)
    throw Error('Unexpected solver input.');
  calls.solve += 1;
  return 'synthetic-solution';
}
export async function signUpAccount({ body }: { body: unknown }) {
  calls.signup.push(body);
  return { data: { ok: true } };
}

export async function verifyAddress({ body }: { body: unknown }) {
  calls.verify.push(body);
  return { data: { signedIn: true, email: account.email } };
}
