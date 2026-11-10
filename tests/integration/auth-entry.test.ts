/** Real auth components with controlled session, generated operations and solver. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Window } from 'happy-dom';
import { act, createElement, StrictMode, type ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { signInAddress } from '../../apps/web/src/lib/sign-in-return.ts';

const browser = new Window({ url: 'http://localhost/' });
browser.document.write('<!doctype html><html><body></body></html>');
const globals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'MutationObserver',
  'fetch',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const name of globals) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  if (name !== 'fetch' && name !== 'IS_REACT_ACT_ENVIRONMENT')
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: browser[name],
    });
}
const unexpected: string[] = [];
const rejectNetwork = async (): Promise<never> => {
  unexpected.push('Unexpected network call');
  throw Error('Auth component fixture made an unexpected network call.');
};
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: rejectNetwork,
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true,
});
browser.fetch = rejectNetwork;
const fixtureUrl = new URL('./support/auth-entry-fixture.ts', import.meta.url)
  .href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    const parent = context.parentURL ?? '';
    if (parent.includes('/apps/web/dist/')) {
      if (
        specifier === '@notesapp/api-client' ||
        /^(\.\.\/)+app\.js$/.test(specifier) ||
        specifier.endsWith('/lib/proof-of-work.js')
      )
        return { url: fixtureUrl, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const fixture = await import('./support/auth-entry-fixture.ts');
const { createRoot } = await import('react-dom/client');
const { RequireSession } =
  await import('../../apps/web/dist/features/accounts/require-session.js');
const { LoginPage } =
  await import('../../apps/web/dist/features/accounts/accounts.js');
const { useAuthValidationFocus } =
  await import('../../apps/web/dist/features/accounts/auth-validation-focus.js');
const { Checkbox } = await import('@notesapp/ui');
const { SignUpPage, VerifyPage } =
  await import('../../apps/web/dist/features/accounts/sign-up.js');

await test(
  'auth entry validation and safe return',
  { timeout: 30000 },
  async (t) => {
    const container = document.createElement('div');
    document.body.append(container);
    let root: Root | null = null;
    let address = '';
    function Location() {
      const location = useLocation();
      address = `${location.pathname}${location.search}${location.hash}`;
      return null;
    }
    const currentRoot = () => {
      assert.ok(root);
      return root;
    };
    async function mount(
      element: ReactNode,
      path = '/login',
      strict = false,
      reset = true,
    ) {
      if (reset) fixture.reset();
      if (root) await act(async () => currentRoot().unmount());
      root = createRoot(container);
      await act(async () =>
        currentRoot().render(
          createElement(
            MemoryRouter,
            { initialEntries: [path] },
            createElement(Location),
            strict ? createElement(StrictMode, null, element) : element,
          ),
        ),
      );
    }
    async function rerender(element: ReactNode) {
      await act(async () =>
        currentRoot().render(
          createElement(
            MemoryRouter,
            { initialEntries: [address] },
            createElement(Location),
            element,
          ),
        ),
      );
    }
    function input(id: string): HTMLInputElement {
      const node = container.querySelector('#' + id);
      assert.ok(node instanceof HTMLInputElement);
      return node;
    }
    async function type(id: string, value: string) {
      const field = input(id);
      const setter = Object.getOwnPropertyDescriptor(
        browser.HTMLInputElement.prototype,
        'value',
      )?.set?.bind(field);
      assert.ok(setter);
      await act(async () => {
        setter(value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    async function toggle(id: string) {
      await act(async () => input(id).click());
    }
    async function submit(focus = 'button[type=submit]') {
      const trigger = container.querySelector<HTMLElement>(focus);
      assert.ok(trigger);
      trigger.focus();
      const form = container.querySelector('form');
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
      });
    }
    function noWrites() {
      assert.deepEqual(
        {
          proof: fixture.calls.proof,
          solve: fixture.calls.solve,
          signup: fixture.calls.signup.length,
          signIn: fixture.calls.signIn.length,
          owner: fixture.calls.owner.length,
        },
        { proof: 0, solve: 0, signup: 0, signIn: 0, owner: 0 },
      );
      assert.deepEqual(unexpected, []);
    }
    function authRoutes() {
      return createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/login',
          element: createElement(LoginPage),
        }),
        createElement(Route, {
          path: '*',
          element: createElement(RequireSession, {
            children: createElement(
              'p',
              { 'data-protected': '' },
              'Synthetic destination',
            ),
          }),
        }),
      );
    }
    try {
      await t.test(
        'signed-out route keeps its local query/hash and returns after ordinary sign-in',
        async () => {
          const target = '/w/synthetic/notes/a?mode=read&text=a%2Bb#section';
          await mount(authRoutes(), target);
          assert.equal(address, signInAddress(target));
          assert.equal(container.querySelector('[data-protected]'), null);
          await type('login-email', 'audit@example.invalid');
          await type('login-password', 'old');
          await submit();
          assert.equal(address, target);
          assert.ok(container.querySelector('[data-protected]'));
        },
      );
      await t.test(
        'one invalid signup submit shows email, password and consent errors before proof work',
        async () => {
          await mount(createElement(SignUpPage), '/signup');
          await type('signup-email', 'bad-email');
          await type('signup-password', 'short');
          await submit();
          assert.equal(
            input('signup-email').getAttribute('aria-invalid'),
            'true',
          );
          assert.equal(
            input('signup-password').getAttribute('aria-invalid'),
            'true',
          );
          const consent = input('signup-consent');
          assert.equal(consent.getAttribute('aria-invalid'), 'true');
          const errorId = consent.getAttribute('aria-describedby');
          assert.ok(errorId);
          assert.match(
            container.querySelector('#' + errorId)?.textContent ?? '',
            /Accept the terms and the privacy notice/,
          );
          assert.equal(document.activeElement?.id, 'signup-email');
          noWrites();
        },
      );
      await t.test(
        'empty sign-in fields keep required messages and focus the first invalid input',
        async () => {
          await mount(createElement(LoginPage));
          await submit();
          assert.equal(
            container.querySelector('#login-email-error')?.textContent,
            'Enter the email address.',
          );
          assert.equal(
            container.querySelector('#login-password-error')?.textContent,
            'Enter the password.',
          );
          assert.equal(document.activeElement?.id, 'login-email');
          noWrites();
        },
      );
      await t.test(
        'loading, signed-in, consent and locked branches remain in order',
        async () => {
          fixture.reset();
          fixture.setSession('loading');
          await mount(authRoutes(), '/w/synthetic', false, false);
          assert.equal(address, '/w/synthetic');
          assert.equal(container.querySelector('form'), null);
          fixture.setSession('signed-out');
          await rerender(authRoutes());
          assert.equal(address, signInAddress('/w/synthetic'));
          fixture.setSession('signed-in');
          await rerender(authRoutes());
          assert.equal(address, '/w/synthetic');
          assert.ok(container.querySelector('[data-protected]'));
          fixture.account.consentRequired = true;
          fixture.account.controls.standing = 'locked';
          await rerender(authRoutes());
          assert.equal(
            container.querySelector('h1')?.textContent,
            'Accept the terms',
          );
          assert.equal(container.querySelector('[data-protected]'), null);
          fixture.account.consentRequired = false;
          await rerender(authRoutes());
          assert.equal(
            container.querySelector('h1')?.textContent,
            'Your account is locked',
          );
          assert.equal(container.querySelector('[data-protected]'), null);
          noWrites();
        },
      );
      await t.test(
        'unsafe and looping next values fall back to root without a write',
        async () => {
          for (const next of [
            'https://other.example.invalid',
            '//other.example.invalid',
            '/\\other.example.invalid',
            '/a\tb',
            '/login?next=/login',
          ]) {
            fixture.reset();
            fixture.setSession('signed-in');
            await mount(
              authRoutes(),
              '/login?next=' + encodeURIComponent(next),
              false,
              false,
            );
            assert.equal(address, '/');
            assert.ok(container.querySelector('[data-protected]'));
            noWrites();
          }
        },
      );
      await t.test(
        'signup focus repeats, advances after corrections and does not move on typing',
        async () => {
          await mount(createElement(SignUpPage), '/signup');
          await type('signup-email', 'bad');
          await type('signup-password', 'short');
          await submit();
          assert.equal(document.activeElement?.id, 'signup-email');
          input('signup-password').focus();
          await type('signup-password', 'still-short');
          assert.equal(document.activeElement?.id, 'signup-password');
          noWrites();
          await submit();
          assert.equal(document.activeElement?.id, 'signup-email');
          await type('signup-email', 'audit@example.invalid');
          await submit();
          assert.equal(
            input('signup-email').getAttribute('aria-invalid'),
            'false',
          );
          assert.equal(document.activeElement?.id, 'signup-password');
          await type('signup-password', 'synthetic password long enough');
          await submit('#signup-password');
          assert.equal(
            input('signup-password').getAttribute('aria-invalid'),
            'false',
          );
          assert.equal(document.activeElement?.id, 'signup-consent');
          noWrites();
          const link = container.querySelector<HTMLAnchorElement>(
            'label[for=signup-consent] a',
          );
          assert.ok(link);
          link.addEventListener('click', (event) => event.preventDefault());
          await act(async () => link.click());
          assert.equal(input('signup-consent').checked, false);
          await toggle('signup-consent');
          await submit();
          assert.equal(fixture.calls.proof, 1);
          assert.equal(fixture.calls.solve, 1);
          assert.deepEqual(fixture.calls.signup, [
            {
              email: 'audit@example.invalid',
              password: 'synthetic password long enough',
              proof: {
                challenge: 'synthetic-challenge',
                solution: 'synthetic-solution',
              },
              consent: { termsVersion: 'terms-1', privacyVersion: 'privacy-1' },
            },
          ]);
          assert.match(
            container.textContent ?? '',
            /Open the link in your mail/,
          );
        },
      );
      await t.test(
        'empty signup fields keep required messages while consent is also marked',
        async () => {
          await mount(createElement(SignUpPage), '/signup');
          await submit();
          assert.equal(
            container.querySelector('#signup-email-error')?.textContent,
            'Enter the email address.',
          );
          assert.equal(
            container.querySelector('#signup-password-error')?.textContent,
            'Enter the password.',
          );
          assert.equal(
            input('signup-consent').getAttribute('aria-invalid'),
            'true',
          );
          assert.equal(document.activeElement?.id, 'signup-email');
          noWrites();
        },
      );
      await t.test(
        'native email rejection and normalization rejection never send',
        async () => {
          for (const email of ['a b@example.invalid', 'a@@example.invalid']) {
            await mount(createElement(LoginPage));
            await type('login-email', email);
            await type('login-password', 'old');
            await submit();
            assert.equal(
              input('login-email').getAttribute('aria-invalid'),
              'true',
            );
            assert.equal(document.activeElement?.id, 'login-email');
            noWrites();
          }
        },
      );
      await t.test(
        'no-document signup sends the same proof payload without consent',
        async () => {
          fixture.reset();
          fixture.setSetup({ legal: null });
          await mount(createElement(SignUpPage), '/signup', false, false);
          assert.equal(container.querySelector('#signup-consent'), null);
          await type('signup-email', 'audit@example.invalid');
          await type('signup-password', 'synthetic password long enough');
          await submit();
          assert.equal(fixture.calls.proof, 1);
          assert.equal(fixture.calls.solve, 1);
          assert.deepEqual(fixture.calls.signup, [
            {
              email: 'audit@example.invalid',
              password: 'synthetic password long enough',
              proof: {
                challenge: 'synthetic-challenge',
                solution: 'synthetic-solution',
              },
            },
          ]);
        },
      );
      await t.test(
        'late legal documents participate in the next invalid submit',
        async () => {
          fixture.reset();
          fixture.setSetup({ hold: true });
          await mount(createElement(SignUpPage), '/signup', false, false);
          assert.equal(container.querySelector('#signup-consent'), null);
          await type('signup-email', 'bad');
          await type('signup-password', 'short');
          await submit();
          noWrites();
          await act(async () => fixture.releaseSetup());
          assert.ok(container.querySelector('#signup-consent'));
          await submit();
          assert.equal(
            input('signup-consent').getAttribute('aria-invalid'),
            'true',
          );
          assert.equal(document.activeElement?.id, 'signup-email');
          noWrites();
        },
      );
      await t.test(
        'ordinary sign-in preserves case and raw short password including spaces',
        async () => {
          await mount(authRoutes(), '/login');
          await type('login-email', 'AuDiT@example.invalid');
          await type('login-password', ' old ');
          await submit();
          assert.deepEqual(fixture.calls.signIn, [
            { email: 'AuDiT@example.invalid', password: ' old ' },
          ]);
          assert.equal(address, '/');
          assert.equal(fixture.calls.owner.length, 0);
        },
      );
      await t.test(
        'setup keeps password bounds and confirmation before its one stubbed write',
        async () => {
          fixture.reset();
          fixture.setSetup({ initialized: false });
          await mount(createElement(LoginPage), '/login', false, false);
          await type('login-email', 'audit@example.invalid');
          await type('login-password', 'short');
          await type('login-password-again', 'short');
          await submit();
          assert.equal(
            container.querySelector('#login-password-error')?.textContent,
            'This password is too short.',
          );
          noWrites();
          await type('login-password', 'synthetic password long enough');
          await type('login-password-again', 'different password long enough');
          await submit();
          assert.equal(
            container.querySelector('#login-password-error')?.textContent,
            'The two passwords are not the same.',
          );
          noWrites();
          await type('login-password-again', 'synthetic password long enough');
          await submit();
          assert.deepEqual(fixture.calls.owner, [
            {
              email: 'audit@example.invalid',
              password: 'synthetic password long enough',
            },
          ]);
          assert.equal(fixture.calls.signIn.length, 0);
        },
      );
      await t.test(
        'OAuth sign-in keeps the signed query and uses the server redirect',
        async () => {
          fixture.reset();
          const query = 'state=synthetic%2Bstate&sig=synthetic-signature';
          const target =
            'https://client.example.invalid/callback?code=synthetic';
          fixture.setSignInReply({
            data: { ok: true, redirect: true, url: target },
          });
          const assigned: string[] = [];
          const original = Object.getOwnPropertyDescriptor(
            window.location,
            'assign',
          );
          window.location.assign = (url) => {
            assigned.push(String(url));
          };
          try {
            await mount(
              createElement<NonNullable<Parameters<typeof LoginPage>[0]>>(
                LoginPage,
                {
                  oauthQuery: query,
                },
              ),
              '/oauth/sign-in?' + query,
              false,
              false,
            );
            await type('login-email', 'audit@example.invalid');
            await type('login-password', 'old');
            await submit();
            assert.deepEqual(fixture.calls.signIn, [
              {
                email: 'audit@example.invalid',
                password: 'old',
                oauth_query: query,
              },
            ]);
            assert.deepEqual(assigned, [target]);
            assert.equal(fixture.calls.refresh, 0);
          } finally {
            if (original)
              Object.defineProperty(window.location, 'assign', original);
            else Reflect.deleteProperty(window.location, 'assign');
          }
        },
      );
      await t.test(
        'verification continuation still opens its fixed root',
        async () => {
          fixture.reset();
          const element = createElement(
            Routes,
            null,
            createElement(Route, {
              path: '/verify',
              element: createElement(VerifyPage),
            }),
            createElement(Route, {
              path: '/',
              element: createElement('p', null, 'Continued at root'),
            }),
          );
          await mount(
            element,
            '/verify?next=%2Fw%2Fother#synthetic-verification-token',
            false,
            false,
          );
          assert.equal(address, '/');
          assert.deepEqual(fixture.calls.verify, [
            { token: 'synthetic-verification-token' },
          ]);
          assert.equal(fixture.calls.refresh, 1);
        },
      );
      await t.test(
        'server errors keep their field mapping and do not add client-error focus',
        async () => {
          fixture.reset();
          fixture.setSignInReply({
            error: { issues: [{ path: '/body/email' }] },
            response: { status: 400 },
          });
          await mount(createElement(LoginPage), '/login', false, false);
          await type('login-email', 'audit@example.invalid');
          await type('login-password', 'old');
          await submit();
          assert.equal(
            input('login-email').getAttribute('aria-invalid'),
            'true',
          );
          assert.equal(document.activeElement?.tagName, 'BUTTON');
          fixture.setSignInReply({ error: {}, response: { status: 401 } });
          await submit();
          assert.match(
            container.textContent ?? '',
            /That address and password do not match an account/,
          );
          assert.equal(document.activeElement?.tagName, 'BUTTON');
        },
      );
      await t.test(
        'Strict Mode does not send for invalid input and sends once for one valid submit',
        async () => {
          await mount(createElement(SignUpPage), '/signup', true);
          await submit();
          noWrites();
          await type('signup-email', 'audit@example.invalid');
          await type('signup-password', 'synthetic password long enough');
          await toggle('signup-consent');
          await submit();
          assert.equal(fixture.calls.proof, 1);
          assert.equal(fixture.calls.solve, 1);
          assert.equal(fixture.calls.signup.length, 1);
        },
      );
      await t.test(
        'the focus helper ignores detached forms and requests pending at unmount',
        async () => {
          let request: (form: HTMLFormElement) => void = () => {
            throw Error('No focus probe.');
          };
          function Probe() {
            request = useAuthValidationFocus();
            return null;
          }
          await mount(createElement(Probe));
          const form = document.createElement('form');
          const field = document.createElement('input');
          field.id = 'probe-invalid';
          field.required = true;
          field.setAttribute('aria-invalid', 'true');
          form.append(field);
          const outside = document.createElement('button');
          outside.id = 'outside-probe';
          document.body.append(outside);
          outside.focus();
          try {
            await act(async () => request(form));
            assert.equal(document.activeElement?.id, outside.id);
            document.body.append(form);
            await act(async () => request(form));
            assert.equal(document.activeElement?.id, field.id);
            outside.focus();
            await act(async () => request(form));
            assert.equal(document.activeElement?.id, field.id);
            outside.focus();
            await act(async () => {
              request(form);
              currentRoot().unmount();
            });
            root = null;
            assert.equal(document.activeElement?.id, outside.id);
          } finally {
            form.remove();
            outside.remove();
          }
        },
      );
      await t.test(
        'Checkbox callers without invalid retain their attributes and optional bindings work',
        async () => {
          await mount(
            createElement(Checkbox, {
              id: 'plain-choice',
              label: 'Plain choice',
              checked: false,
              onChange: () => {},
            }),
          );
          assert.equal(
            input('plain-choice').getAttribute('aria-invalid'),
            null,
          );
          await rerender(
            createElement(Checkbox, {
              id: 'plain-choice',
              label: 'Plain choice',
              checked: false,
              onChange: () => {},
              invalid: true,
              describedBy: 'choice-error',
            }),
          );
          assert.equal(
            input('plain-choice').getAttribute('aria-invalid'),
            'true',
          );
          assert.equal(
            input('plain-choice').getAttribute('aria-describedby'),
            'choice-error',
          );
        },
      );
    } finally {
      if (root) await act(async () => currentRoot().unmount());
      container.remove();
      hooks.deregister();
      for (const [name, original] of originals) {
        if (original) Object.defineProperty(globalThis, name, original);
        else Reflect.deleteProperty(globalThis, name);
      }
      await browser.happyDOM.close();
      assert.deepEqual(
        Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'),
        originals.get('IS_REACT_ACT_ENVIRONMENT'),
      );
      assert.deepEqual(unexpected, []);
    }
  },
);
