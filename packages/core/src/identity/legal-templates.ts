/**
 * The templates of the terms and of the privacy notice (records 0140, 0148).
 *
 * Each template states what this product stores, for how long, and which
 * service it sends data to. The server fills the facts that it knows: the
 * address of the service, the life of a pending sign-up, and whether a new
 * password is checked against Have I Been Pwned. Every other blank is a
 * marker in double braces, which the accounts page shows as a field and which
 * the server refuses to serve. A template names no version: the page of a
 * document states the version that the settings hold, so the two cannot
 * differ. A template is not legal advice, and the
 * operator answers for the words.
 */
import type { LegalDocumentName } from './installation-settings.ts';

/** What the server knows of the service when it fills a template. */
export type LegalTemplateFacts = {
  /** The host name of the service, for example notes.example.com. */
  readonly serviceAddress: string;
  /** How long a sign-up waits for its verification (record 0114). */
  readonly pendingHours: number;
  /** Whether a new password is checked for a breach (record 0116). */
  readonly breachCheck: boolean;
};

/** The template of the privacy notice. */
function privacyTemplate(facts: LegalTemplateFacts): string {
  const breach = facts.breachCheck
    ? '- **Have I Been Pwned** checks each new password against a list of leaked passwords. The server sends only the first five characters of a digest of the password. Your password and your address never leave the server.\n'
    : '';
  return `# Privacy notice

In effect from {{effective date}}.

This notice tells you which personal data {{operator name}} keeps when you use NotesApp at ${facts.serviceAddress}, why, for how long, and what you can do about it.

## Who is responsible

{{operator name}}, {{postal address}}, is responsible for your personal data. Write to [{{contact address}}](mailto:{{contact address}}) with a question about this notice or to use a right below.

## What we keep

**Your account.** Your email address, the name that you give, and your password. We keep the password only as a hash, so nobody can read it. We also keep the date that you made the account, whether you proved your address, your role, the storage that you use, and the versions of the terms and of this notice that you accepted, with the time.

**Your notes.** The notes, folders, pictures and files that you save, each earlier version of a note, and the notes in Trash. The server keeps them so that it can show, search and sync them on your devices.

**What you publish.** A published link shows the notes that you choose to any person who has the address. We keep a digest of each link and its settings, not the address itself.

**Your devices.** For each device that is signed in, the network address and the browser description of the sign-in, so that you can see your devices in Settings and sign out one of them.

**Protection against abuse.** For a short time, a count of attempts from each network address and to each email address, so that nobody can guess passwords or send many messages to one mailbox.

**Reports.** When you report a published page, we keep the reason and the words that you write. We do not keep who you are.

**Messages.** When you ask for an account, an invitation or a new password, we send a message to your address.

## Why we keep it

- To give you the service that you asked for: your account, your notes, sync on your devices, and the links that you publish. This is necessary for our agreement with you.
- To keep the service safe: the attempt counts, the device list, the check of new passwords, and the reports of harmful pages. This is our legitimate interest in a safe service.
- To obey the law, when a law requires us to keep or give data.

We do not sell your data. We do not show advertisements. The application loads no analytics, no tracker and no script from another company.

## Who else receives data

- **{{hosting provider}}** runs the servers that hold the data.
- **{{mail provider}}** delivers the messages that we send to you.
${breach}- A person who has the address of a link that you publish can read what it shows.

{{where each provider keeps the data, and the safeguard when it is outside your country}}

## How long we keep it

- Your account and your notes stay until you remove them. A note in Trash stays until you delete it.
- A sign-up that nobody finishes goes after ${String(facts.pendingHours)} hours.
- The record of a device goes when the device signs out. It stops working when its session ends.
- An attempt count goes after its time window, which is one hour at most.
- When you remove your account, your notes, your devices and your settings go at once. Only an identifier and the time of the removal stay, so that the history of a shared note stays correct. Backups keep a copy for {{backup retention}} at most.
- The logs of NotesApp hold no note text, no password and no network address. We keep them for {{log retention}}.

## Cookies and storage on your device

NotesApp sets one cookie, which keeps you signed in. It is necessary for the service, so we do not ask for your consent to it. Your browser also keeps a copy of your notes on the device, so that you can read and write them offline. That copy stays on the device and goes nowhere else.

## Your rights

- **See and take your data.** Select Export all notes in Settings to download every note and picture as Markdown files. Write to us for a copy of the other data.
- **Correct your data.** Change your name in Settings. Write to us to change your address.
- **Remove your data.** Select Remove my account in Settings.
- **Object or restrict.** Write to us if you object to a use of your data, or want us to stop it for a time.
- **Complain.** You can complain to {{supervisory authority}}.

## What the operator can see

The notes are not end-to-end encrypted. The people who run the server can read your notes when they must, for example to repair the service or to answer a court order. An administrator of the service manages accounts and cannot open your notes in the application.

## Children

The service is not for a person under {{minimum age}} years old.

## Changes to this notice

When this notice changes, its version changes. The application then shows the new version before your notes open, and you accept it or remove your account.
`;
}

/** The template of the terms. */
function termsTemplate(facts: LegalTemplateFacts): string {
  return `# Terms

In effect from {{effective date}}.

These terms are the agreement between you and {{operator name}}, {{postal address}}, for the use of NotesApp at ${facts.serviceAddress}. Read them with the privacy notice, which the foot of this page links. When you make an account, you accept both.

## Your account

- You must be at least {{minimum age}} years old.
- Use an email address that is yours. We send the messages of your account to it.
- Keep your password secret. You are responsible for what your account does.
- One account is for one person.

## Your notes

Your notes are yours. You give us the right to store, copy, show and send them only as far as the service needs to work for you, for example to sync them to your devices and to show a link that you publish. This right ends when you delete the notes or remove your account, except for the copy in a backup until that backup expires.

Keep your own copy of notes that are important to you. Select Export all notes in Settings to download them at any time.

## What you must not do

Do not use the service to:

- store or publish content that is illegal, or that infringes the rights of another person
- publish a page that asks for a password, a payment or personal data under a false name
- publish or store a harmful file
- attack, threaten or harass a person
- send spam
- get into an account or a system that is not yours, or make the service slow or unavailable
- avoid a limit of the service, for example with many accounts

## Published links

A published link shows your notes to any person who has its address. You are responsible for what you publish. Any reader can report a published page. An administrator can take a link down when it breaks these terms, and you then see that the link was taken down.

## Storage and limits

Each account has a storage limit. When your account is full, you cannot save new content until you delete some.

## Changes to the service

We can change the service. We try to keep it available, but we do not promise that it is always available or free of faults. {{whether the service is free, or its price and how a person pays}}

## When an account stops

You can remove your account in Settings at any time. Your notes then go for good.

We can disable an account that breaks these terms, or remove it after we tell the owner and give a reasonable time to export the notes, except where the law or the safety of other people does not let us wait.

## Liability

We give the service as it is. As far as the law allows, we are not liable for an indirect loss or for lost data. Nothing in these terms limits a liability that the law does not let us limit, or a right that you have as a consumer.

## Changes to these terms

When these terms change, their version changes. The application then shows the new version before your notes open, and you accept it or remove your account.

## Law

The law of {{jurisdiction}} applies to these terms. Write to [{{contact address}}](mailto:{{contact address}}) with a question or a complaint.
`;
}

/** The template of one legal document, with the facts of the server. */
export function legalTemplate(
  name: LegalDocumentName,
  facts: LegalTemplateFacts,
): string {
  return name === 'terms' ? termsTemplate(facts) : privacyTemplate(facts);
}
