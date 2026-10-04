/*
 * Generated from packages/api-contract/openapi.yaml by tools/sdk-codegen.
 * Do not edit by hand. Run `pnpm generate` after a contract change.
 */

import type { SchemaObject } from 'ajv';

/** Every operation id declared by the contract. */
export type OperationId =
  | 'abortWorkspaceImport'
  | 'acceptLegalDocuments'
  | 'commitChangeset'
  | 'completeWorkspaceImport'
  | 'createFile'
  | 'createInvitation'
  | 'createOwner'
  | 'createPublishedLink'
  | 'createWorkspace'
  | 'deleteFile'
  | 'deleteTheme'
  | 'deleteWorkspace'
  | 'dismissReport'
  | 'exportNote'
  | 'exportWorkspace'
  | 'finalizeAttachment'
  | 'getAccount'
  | 'getAttachmentRevision'
  | 'getAuthSession'
  | 'getChanges'
  | 'getDailyNoteSettings'
  | 'getFile'
  | 'getHealth'
  | 'getInstallation'
  | 'getLegalDocument'
  | 'getLegalDocumentSettings'
  | 'getMutationReceipt'
  | 'getPublishedAttachment'
  | 'getPublishedPage'
  | 'getReadiness'
  | 'getReportPage'
  | 'getRevision'
  | 'getRootHealth'
  | 'getRootReadiness'
  | 'getSetupStatus'
  | 'getSignUpChallenge'
  | 'getSnapshotPage'
  | 'getSyncProtocol'
  | 'getTemplateSettings'
  | 'importTheme'
  | 'inspectWorkspaceExport'
  | 'listAccounts'
  | 'listBacklinks'
  | 'listDeletedFiles'
  | 'listFiles'
  | 'listHistory'
  | 'listInvitations'
  | 'listPublishedLinks'
  | 'listReports'
  | 'listSessions'
  | 'listWorkspaces'
  | 'openPublishedPage'
  | 'openSyncNotices'
  | 'previewPurge'
  | 'purgeFiles'
  | 'readInvitation'
  | 'registerAccount'
  | 'removeAccount'
  | 'removeLegalDocument'
  | 'removeMailSettings'
  | 'removeOwnAccount'
  | 'reportPublishedLink'
  | 'requestPasswordReset'
  | 'resetPassword'
  | 'restoreFile'
  | 'restoreRevision'
  | 'revokeInvitation'
  | 'revokeOtherSessions'
  | 'revokePublishedLink'
  | 'revokeSession'
  | 'searchFiles'
  | 'sendTestMessage'
  | 'sendWorkspaceImportPart'
  | 'signInWithPassword'
  | 'signOut'
  | 'signUpAccount'
  | 'startSnapshot'
  | 'startWorkspaceImport'
  | 'takeDownReportedLink'
  | 'unlockPublishedLink'
  | 'updateAccount'
  | 'updateDailyNoteSettings'
  | 'updateFile'
  | 'updateInstallation'
  | 'updateLegalDocument'
  | 'updateMailSettings'
  | 'updatePreferences'
  | 'updateProfile'
  | 'updateTemplateSettings'
  | 'updateWorkspace'
  | 'uploadAttachment'
  | 'verifyAddress';

export type HttpMethod =
  | 'get'
  | 'put'
  | 'post'
  | 'delete'
  | 'options'
  | 'head'
  | 'patch'
  | 'trace';

/** A JSON Schema 2020-12 object that Ajv can compile. */
export type JsonSchema = SchemaObject;

export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

/** Explicit serialization of one parameter, copied from the contract. */
export type ParameterSerialization = {
  readonly name: string;
  readonly location: ParameterLocation;
  readonly required: boolean;
  readonly style: string;
  readonly explode: boolean;
};

/**
 * One schema for each request slot. The path, query, and header schemas always
 * exist. A closed empty object schema means the operation accepts no member of
 * that kind, so an unknown one is rejected. A null body means the operation
 * accepts no request body at all.
 */
export type RequestSchemas = {
  readonly params: JsonSchema;
  readonly query: JsonSchema;
  readonly headers: JsonSchema;
  readonly body: JsonSchema | null;
  readonly bodyMediaType: string | null;
};

/** One security requirement: scheme name to the scopes it must carry. */
export type SecurityRequirement = Readonly<Record<string, readonly string[]>>;

export type ResponseSchema = {
  readonly status: number;
  readonly mediaType: string;
  readonly schema: JsonSchema;
};

export type OperationEntry = {
  readonly id: OperationId;
  readonly method: HttpMethod;
  readonly path: string;
  /**
   * The protocol library that serves this operation, or null.
   *
   * A protocol operation is implemented by a maintained library rather than by
   * a contract handler. The server registers it through that adapter's exact
   * path list and leaves it out of the one-handler-per-operation check.
   */
  readonly protocol: string | null;
  /** Alternative security requirements. An empty list means public. */
  readonly security: readonly SecurityRequirement[];
  readonly parameters: readonly ParameterSerialization[];
  readonly request: RequestSchemas;
  readonly responses: readonly ResponseSchema[];
  /**
   * Statuses that the operation declares without a response body, such as a
   * 304. The boundary permits an empty answer only for these.
   */
  readonly noContent: readonly number[];
};

/** Version of the contract document that produced this index. */
export const contractVersion = '0.1.0';

/**
 * The schemas that more than one operation slot states.
 *
 * Every schema below is written once here and pointed at from each slot that
 * uses it, so the contract is not copied per operation. A consumer that
 * compiles a slot schema must register this document first; see
 * `packages/api-contract/src/validators.ts`.
 */
export const sharedDefinitions: JsonSchema = {
  "$id": "https://notesapp.invalid/contract-definitions",
  "$defs": {
    "AcceptedChangeset": {
      "type": "object",
      "description": "The outcome of one accepted changeset.",
      "additionalProperties": false,
      "required": [
        "mutationId",
        "revisionIds",
        "cursor",
        "revisions",
        "superseded"
      ],
      "properties": {
        "mutationId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared19"
        },
        "revisionIds": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared20"
        },
        "cursor": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared21"
        },
        "revisions": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared22"
        },
        "superseded": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared34"
        }
      }
    },
    "AcceptedRevision": {
      "type": "object",
      "description": "One revision as the workspace accepted it. The record carries the values that the workspace assigned, and no note text: the client that wrote the revision already holds its content, and an actor that may write but not read must not receive content through a write answer.",
      "additionalProperties": false,
      "required": [
        "revisionId",
        "fileId",
        "parents",
        "path",
        "deleted",
        "digest",
        "size",
        "actorAccountId",
        "serverTime",
        "message",
        "epoch",
        "acceptedState",
        "merged"
      ],
      "properties": {
        "revisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared23"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared24"
        },
        "parents": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared25"
        },
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared26"
        },
        "deleted": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for a tombstone, which is how a deletion is recorded."
        },
        "digest": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared27"
        },
        "size": {
          "type": "integer",
          "readOnly": true,
          "description": "Size of the content in bytes.",
          "minimum": 0
        },
        "actorAccountId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared28"
        },
        "serverTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared29"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared30"
        },
        "epoch": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared31"
        },
        "acceptedState": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared32"
        },
        "merged": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared33"
        }
      }
    },
    "AccountState": {
      "type": "string",
      "description": "Whether an account can sign in. A disabled account keeps its notes and gets no session.",
      "enum": [
        "enabled",
        "disabled"
      ]
    },
    "AccountStorage": {
      "type": "object",
      "description": "The bytes that the workspaces of one account use, and the limit of that account. The owner of a workspace pays for every byte in it.",
      "additionalProperties": false,
      "required": [
        "usedBytes",
        "limitBytes"
      ],
      "properties": {
        "usedBytes": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared69"
        },
        "limitBytes": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared70"
        }
      }
    },
    "AccountSummary": {
      "type": "object",
      "description": "One account as an administrator sees it. It holds no note and no workspace of the account.",
      "additionalProperties": false,
      "required": [
        "accountId",
        "email",
        "name",
        "installationRole",
        "state",
        "createdAt",
        "lastActiveAt",
        "storage",
        "self"
      ],
      "properties": {
        "accountId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared119"
        },
        "email": {
          "type": [
            "string",
            "null"
          ],
          "readOnly": true,
          "description": "Sign-in address of the account.",
          "maxLength": 320
        },
        "name": {
          "type": [
            "string",
            "null"
          ],
          "readOnly": true,
          "description": "Display name of the account.",
          "maxLength": 256
        },
        "installationRole": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared67"
        },
        "state": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared120"
        },
        "createdAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared121"
        },
        "lastActiveAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared122"
        },
        "storage": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared68"
        },
        "self": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for the account that reads the list."
        }
      }
    },
    "Appearance": {
      "type": "string",
      "description": "Appearance choice. The value system follows the device preference between the light and the dark variant of the chosen theme family.",
      "enum": [
        "system",
        "light",
        "dark"
      ]
    },
    "AuthOutcome": {
      "type": "object",
      "description": "Whether the protocol endpoint completed its work.",
      "additionalProperties": true,
      "required": [
        "status"
      ],
      "properties": {
        "status": {
          "type": "boolean",
          "readOnly": true,
          "description": "True when the endpoint completed its work."
        }
      }
    },
    "AuthUser": {
      "type": "object",
      "description": "The signed in user as the identity provider reports it.",
      "additionalProperties": true,
      "required": [
        "id",
        "email"
      ],
      "properties": {
        "id": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared72"
        },
        "email": {
          "type": "string",
          "readOnly": true,
          "description": "Sign-in address of the user.",
          "maxLength": 320
        },
        "name": {
          "type": "string",
          "readOnly": true,
          "description": "Display name of the user.",
          "maxLength": 256
        },
        "emailVerified": {
          "type": "boolean",
          "readOnly": true,
          "description": "Whether the provider reported the address as verified."
        }
      }
    },
    "CheckpointMessage": {
      "type": [
        "string",
        "null"
      ],
      "description": "Name of a checkpoint, or null for an ordinary revision. It is written by the author and is not interpreted by the server.",
      "maxLength": 512
    },
    "ConsentInput": {
      "type": "object",
      "description": "The versions of the two legal documents that a person accepts.",
      "additionalProperties": false,
      "required": [
        "termsVersion",
        "privacyVersion"
      ],
      "properties": {
        "termsVersion": {
          "type": "string",
          "description": "The version of the terms that the person read.",
          "minLength": 1,
          "maxLength": 64
        },
        "privacyVersion": {
          "type": "string",
          "description": "The version of the privacy notice that the person read.",
          "minLength": 1,
          "maxLength": 64
        }
      }
    },
    "ContentDigest": {
      "type": "string",
      "description": "The SHA-256 digest of the content, in lower case hexadecimal. Content is addressed by this value, so it is verified against the bytes before a revision is accepted.",
      "minLength": 64,
      "maxLength": 64,
      "pattern": "^[0-9a-f]{64}$"
    },
    "DailyNoteSettings": {
      "type": "object",
      "description": "The settings of daily notes that one member keeps in one workspace.",
      "additionalProperties": false,
      "required": [
        "templateFileId",
        "openOnStart",
        "folder",
        "format"
      ],
      "properties": {
        "templateFileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared74"
        },
        "openOnStart": {
          "type": "boolean",
          "readOnly": true,
          "description": "True when the note of today opens when the application starts."
        },
        "folder": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared75"
        },
        "format": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared76"
        }
      }
    },
    "DeviceId": {
      "type": "string",
      "description": "The device that submitted the change. It is informational and appears in the history of the workspace.",
      "minLength": 1,
      "maxLength": 128
    },
    "DocumentEpoch": {
      "type": "integer",
      "description": "The generation of the document of one note. Identities of one epoch say nothing about another, so two states are compared inside one epoch only. Routine compaction keeps the epoch; a migration or an explicit repair starts a new one.",
      "minimum": 1
    },
    "DocumentObservedState": {
      "type": "string",
      "description": "The complete observed state of a document, as base64. It holds the state vector and the deletion set, so it states every insertion and every deletion that the device has seen. A state vector alone serves a delta and never decides whether work is unseen.",
      "contentEncoding": "base64",
      "pattern": "^[A-Za-z0-9+/]*={0,2}$",
      "maxLength": 1398104
    },
    "DocumentSave": {
      "type": "object",
      "description": "The text work of one saved note: the update, the generation it belongs to, and the complete state that the device had seen when it saved. The server derives the Markdown and its digest from the accepted document, so a save carries no text.",
      "additionalProperties": false,
      "required": [
        "update",
        "epoch",
        "observed"
      ],
      "properties": {
        "update": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared15"
        },
        "epoch": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared16"
        },
        "observed": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared17"
        }
      }
    },
    "DocumentUpdate": {
      "type": "string",
      "description": "One document update, as base64. It carries the text work of a note and nothing else. The server applies it to a trial document and refuses it when it is malformed, when it names work that the document lacks, when it writes anything other than the text of the note, or when the result passes a bound.",
      "contentEncoding": "base64",
      "pattern": "^[A-Za-z0-9+/]*={0,2}$",
      "maxLength": 2796204
    },
    "EntityTagCondition": {
      "type": "string",
      "description": "A conditional request header value: either the literal *, or one or more entity tags separated by commas. A tag is quoted, and a weak tag carries the W/ prefix. A write compares strongly, as RFC 9110 requires, so it accepts a strong tag only.",
      "minLength": 1,
      "maxLength": 1024,
      "pattern": "^(?:\\*|(?:W/)?\"[^\"]*\"(?:[ \\t]*,[ \\t]*(?:W/)?\"[^\"]*\")*)$"
    },
    "FileChange": {
      "type": "object",
      "description": "The revision that one single file operation accepted.",
      "additionalProperties": false,
      "required": [
        "revision",
        "accepted"
      ],
      "properties": {
        "revision": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared39"
        },
        "accepted": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared40"
        }
      }
    },
    "FilePageToken": {
      "type": "string",
      "description": "Opaque position inside one file listing. It belongs to the sort that produced it and carries no meaning for a client.",
      "minLength": 1,
      "maxLength": 2048,
      "pattern": "^(updated|path)\\.[0-9a-fA-F-]{36}\\.[A-Za-z0-9\\-._~!*'()%]*$"
    },
    "FilePath": {
      "type": "string",
      "description": "Relative POSIX path of the file inside its workspace. A note path ends in .md. The stored path is the Unicode NFC form of this value, and it is compared case sensitively.",
      "minLength": 1,
      "maxLength": 1024
    },
    "FileRevision": {
      "type": "object",
      "description": "One immutable revision. Its identity, its parents, and its content never change after acceptance.",
      "additionalProperties": false,
      "required": [
        "revisionId",
        "fileId",
        "path",
        "kind",
        "deleted",
        "parents",
        "digest",
        "size",
        "text",
        "document",
        "epoch",
        "merged",
        "attachmentObjectId",
        "message",
        "restoredFrom",
        "clientTime",
        "serverTime"
      ],
      "properties": {
        "revisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared81"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared82"
        },
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared83"
        },
        "kind": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared84"
        },
        "deleted": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for a tombstone, which is how a deletion is recorded."
        },
        "parents": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared85"
        },
        "digest": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared86"
        },
        "size": {
          "type": "integer",
          "readOnly": true,
          "description": "Size of the content in bytes.",
          "minimum": 0
        },
        "text": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared87"
        },
        "attachmentObjectId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared88"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared89"
        },
        "restoredFrom": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared90"
        },
        "clientTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared91"
        },
        "serverTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared29"
        },
        "document": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared92"
        },
        "epoch": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared93"
        },
        "merged": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared94"
        }
      }
    },
    "FileSortOrder": {
      "type": "string",
      "description": "Order of a file listing. `updated` is the newest accepted change first. `path` is the stored path in ascending order.",
      "enum": [
        "updated",
        "path"
      ]
    },
    "HealthReport": {
      "type": "object",
      "description": "Liveness report of the service process.",
      "additionalProperties": false,
      "required": [
        "status"
      ],
      "properties": {
        "status": {
          "type": "string",
          "readOnly": true,
          "description": "Always the literal value ok while the process answers.",
          "enum": [
            "ok"
          ]
        }
      }
    },
    "ImportedTheme": {
      "type": "object",
      "description": "One theme that the account imported. The client checks its contrast before it offers or paints it, and its family is custom- and the identifier.",
      "additionalProperties": false,
      "required": [
        "themeId",
        "name"
      ],
      "properties": {
        "themeId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared62"
        },
        "name": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared63"
        },
        "light": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared64"
        },
        "dark": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared64"
        }
      }
    },
    "Installation": {
      "type": "object",
      "description": "The settings of the installation that an administrator reads.",
      "additionalProperties": false,
      "required": [
        "registrationPolicy",
        "mailConfigured",
        "invitationLifetimeHours",
        "defaultLimitBytes",
        "mail",
        "legalDocuments"
      ],
      "properties": {
        "registrationPolicy": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared95"
        },
        "mailConfigured": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared96"
        },
        "invitationLifetimeHours": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared97"
        },
        "defaultLimitBytes": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared98"
        },
        "mail": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared99"
        },
        "legalDocuments": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared103"
        }
      }
    },
    "InstallationRole": {
      "type": "string",
      "description": "The role of an account in the installation. An administrator manages accounts and invitations. The role grants no access to a workspace of another account.",
      "enum": [
        "administrator",
        "member"
      ]
    },
    "Invitation": {
      "type": "object",
      "description": "One invitation that waits. This shape holds no token, so a read of the list cannot open an invitation.",
      "additionalProperties": false,
      "required": [
        "invitationId",
        "email",
        "createdAt",
        "expiresAt",
        "state",
        "mailed"
      ],
      "properties": {
        "invitationId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared41"
        },
        "email": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
        },
        "createdAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared43"
        },
        "expiresAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared44"
        },
        "state": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared45"
        },
        "mailed": {
          "type": "boolean",
          "readOnly": true,
          "description": "Whether the link went to the address by mail."
        }
      }
    },
    "InvitationToken": {
      "type": "string",
      "description": "The secret of one invitation, as the link carries it. The server keeps only its digest.",
      "minLength": 43,
      "maxLength": 43,
      "pattern": "^[A-Za-z0-9_-]{43}$",
      "writeOnly": true
    },
    "LegalDocument": {
      "type": "object",
      "description": "One legal document of the installation and its current version.",
      "additionalProperties": false,
      "required": [
        "url",
        "version"
      ],
      "properties": {
        "url": {
          "type": "string",
          "readOnly": true,
          "description": "Where a person reads the document.",
          "format": "uri",
          "maxLength": 2048
        },
        "version": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared106"
        }
      }
    },
    "LegalDocumentKind": {
      "type": "string",
      "description": "The source of a legal document. text is Markdown that this server serves, and address is a page on another site.",
      "enum": [
        "text",
        "address"
      ]
    },
    "LegalDocumentSummary": {
      "type": "object",
      "description": "One legal document that the installation holds.",
      "additionalProperties": false,
      "required": [
        "kind",
        "url",
        "version"
      ],
      "properties": {
        "kind": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared105"
        },
        "url": {
          "type": "string",
          "readOnly": true,
          "description": "Where a person reads the document.",
          "format": "uri",
          "maxLength": 2048
        },
        "version": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared106"
        }
      }
    },
    "LegalSettings": {
      "type": "object",
      "description": "The legal documents that the installation holds. They apply when both exist (record 0148).",
      "additionalProperties": false,
      "required": [
        "source",
        "terms",
        "privacy"
      ],
      "properties": {
        "source": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared100"
        },
        "terms": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared104"
        },
        "privacy": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared104"
        }
      }
    },
    "MailSecurity": {
      "type": "string",
      "description": "How the connection to the mail server is protected. tls opens a TLS connection at once, starttls upgrades a plain connection, and none sends with no protection.",
      "enum": [
        "tls",
        "starttls",
        "none"
      ]
    },
    "MailSettings": {
      "type": "object",
      "description": "The mail transport that applies now. No member holds a password.",
      "additionalProperties": false,
      "required": [
        "source",
        "host",
        "port",
        "security",
        "username",
        "sender",
        "passwordStored"
      ],
      "properties": {
        "source": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared100"
        },
        "host": {
          "type": [
            "string",
            "null"
          ],
          "readOnly": true,
          "description": "The host name of the mail server.",
          "maxLength": 253
        },
        "port": {
          "type": [
            "integer",
            "null"
          ],
          "readOnly": true,
          "description": "The port of the mail server.",
          "minimum": 1,
          "maximum": 65535
        },
        "security": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared101"
        },
        "username": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared102"
        },
        "sender": {
          "type": [
            "string",
            "null"
          ],
          "readOnly": true,
          "description": "The sender of every message.",
          "maxLength": 320
        },
        "passwordStored": {
          "type": "boolean",
          "readOnly": true,
          "description": "Whether the application holds a password for the mail server."
        }
      }
    },
    "MarkdownText": {
      "type": "string",
      "description": "The Markdown source of one revision. It is stored and returned exactly as it was written, without normalization.",
      "maxLength": 1048576
    },
    "Password": {
      "type": "string",
      "description": "A new password. The bounds are the ones of NIST SP 800-63B revision 4 for a password that is the only factor, and passwordBounds of the core states the same bounds. The server also refuses a password that a list of leaked passwords holds.",
      "minLength": 15,
      "maxLength": 512,
      "writeOnly": true
    },
    "Preferences": {
      "type": "object",
      "description": "Settings that follow one account to every device.",
      "additionalProperties": false,
      "required": [
        "appearance",
        "themeFamily",
        "spellCheck",
        "themes"
      ],
      "properties": {
        "appearance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared58"
        },
        "themeFamily": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared59"
        },
        "spellCheck": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared60"
        },
        "themes": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared61"
        }
      }
    },
    "ProblemDetails": {
      "type": "object",
      "description": "RFC 9457 problem details. The code field carries the stable application error code that a client can branch on.",
      "additionalProperties": true,
      "required": [
        "type",
        "title",
        "status",
        "code",
        "requestId"
      ],
      "properties": {
        "type": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
        },
        "title": {
          "type": "string",
          "readOnly": true,
          "description": "Short human readable summary of the problem type.",
          "maxLength": 256
        },
        "status": {
          "type": "integer",
          "readOnly": true,
          "description": "HTTP status code of this response.",
          "minimum": 100,
          "maximum": 599
        },
        "detail": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared4"
        },
        "instance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared5"
        },
        "code": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared6"
        },
        "requestId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared7"
        },
        "issues": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared8"
        },
        "fileIds": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared11"
        },
        "noteRefusal": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared12"
        }
      }
    },
    "PublishedDocument": {
      "type": "string",
      "description": "The published page, as one HTML document. The server builds it from the stored Markdown with the one sanitized renderer, and it holds no script. Its only style sheet is the built style sheet of the application.",
      "maxLength": 8388608
    },
    "PublishedFolderScope": {
      "type": "object",
      "description": "A link that opens one folder and every note below it. A folder is a part of a note path, so the scope is a path prefix inside one workspace. A note in the Trash stays outside it.",
      "additionalProperties": false,
      "required": [
        "kind",
        "path"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "description": "Names this scope as one folder.",
          "const": "folder"
        },
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared47"
        }
      }
    },
    "PublishedLink": {
      "type": "object",
      "description": "One published link of a workspace, as its owner sees it. This shape holds no token, so a read of the list cannot open a link.",
      "additionalProperties": false,
      "required": [
        "publicationId",
        "scope",
        "createdAt",
        "expiresAt",
        "passwordProtected",
        "takenDown"
      ],
      "properties": {
        "publicationId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared48"
        },
        "scope": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared49"
        },
        "createdAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared50"
        },
        "expiresAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared51"
        },
        "passwordProtected": {
          "type": "boolean",
          "readOnly": true,
          "description": "Whether a reader gives a password before it reads the link."
        },
        "takenDown": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared52"
        }
      }
    },
    "PublishedNoteReference": {
      "type": "string",
      "description": "Names one note of a folder link. The page of a folder link lists the notes that it opens, and each entry of that list carries this value. Any short text is accepted, because a value that names no note inside the scope of the link answers the same page as a value that names nothing at all.",
      "minLength": 1,
      "maxLength": 200
    },
    "PublishedNoteScope": {
      "type": "object",
      "description": "A link that opens one note.",
      "additionalProperties": false,
      "required": [
        "kind",
        "fileId"
      ],
      "properties": {
        "kind": {
          "type": "string",
          "description": "Names this scope as one note.",
          "const": "note"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared46"
        }
      }
    },
    "PublishedRefusal": {
      "type": "object",
      "description": "The one refusal of the reader path. A link that never existed, a revoked link, an expired link and a wrong password all take this body, so the answer states nothing about the link. The shape is closed and every member that could carry a difference is fixed, so a later change cannot add a word that tells the four causes apart. The body names no note, no folder, no account and no identifier of the product.",
      "additionalProperties": false,
      "required": [
        "type",
        "title",
        "status",
        "detail",
        "instance",
        "code",
        "requestId"
      ],
      "properties": {
        "type": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared108"
        },
        "title": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared109"
        },
        "status": {
          "type": "integer",
          "readOnly": true,
          "description": "Always 404, for each of the four causes.",
          "const": 404
        },
        "detail": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared110"
        },
        "instance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared111"
        },
        "code": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared112"
        },
        "requestId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared7"
        }
      }
    },
    "PublishedScope": {
      "description": "What one published link opens.",
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedNoteScope"
        },
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedFolderScope"
        }
      ]
    },
    "PublishedSecret": {
      "type": "string",
      "description": "One secret of a reader, as it travels in the address of a published link. The token is a path segment and the reading ticket is a query value, and the server compares a digest of what it received with a digest at rest. A value of any other shape therefore opens nothing, exactly as an unknown value opens nothing, so this shape stays wide on purpose: a reader that mistypes an address must read the one answer of the reader path and never a refusal that tells it that the shape was wrong. The shape of the value that the server draws is in PublishedTokenValue. The length is not bounded here, because the server digests the value and never stores it, and the whole address is already bounded by the header byte limit of the deployment. A second bound would answer a long address with a refusal instead of the one page of decision 0047.",
      "minLength": 1,
      "pattern": "^[^/?#]+$"
    },
    "ReadinessCheck": {
      "type": "object",
      "description": "State of one startup requirement.",
      "additionalProperties": false,
      "required": [
        "name",
        "status"
      ],
      "properties": {
        "name": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared116"
        },
        "status": {
          "type": "string",
          "readOnly": true,
          "description": "State of this requirement.",
          "enum": [
            "ok",
            "degraded"
          ]
        },
        "detail": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared117"
        }
      }
    },
    "ReadinessReport": {
      "type": "object",
      "description": "Readiness report of every startup requirement.",
      "additionalProperties": false,
      "required": [
        "status",
        "checks"
      ],
      "properties": {
        "status": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared114"
        },
        "checks": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared115"
        }
      }
    },
    "RegistrationPolicy": {
      "type": "string",
      "description": "Who can make an account. With invitation, only a person with a valid invitation can. With open, a person who proves their address can.",
      "enum": [
        "invitation",
        "open"
      ]
    },
    "Removed": {
      "type": "object",
      "description": "Confirmation that the named record no longer exists.",
      "additionalProperties": false,
      "required": [
        "removed"
      ],
      "properties": {
        "removed": {
          "type": "boolean",
          "readOnly": true,
          "description": "Always true. The record no longer exists."
        }
      }
    },
    "ReportReason": {
      "type": "string",
      "description": "Why a reader reports a published link. The list is fixed, so an administrator can sort the reports.",
      "enum": [
        "phishing",
        "malware",
        "illegal",
        "harassment",
        "spam",
        "other"
      ]
    },
    "Role": {
      "type": "string",
      "description": "The role of an account in one workspace. Every workspace has one member, its owner, so the only role is owner. The installation role of an account is a separate fact and grants no workspace access.",
      "enum": [
        "owner"
      ]
    },
    "SettingSource": {
      "type": "string",
      "description": "Where a group of settings comes from (record 0148). environment is the server environment, which wins and cannot change in the application. application is what an administrator set. none is no setting.",
      "enum": [
        "environment",
        "application",
        "none"
      ]
    },
    "Shared1": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        "importId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "importId",
        "workspaceId"
      ],
      "additionalProperties": false
    },
    "Shared10": {
      "type": "string",
      "readOnly": true,
      "description": "Reason the value was rejected. It never repeats the value.",
      "maxLength": 256
    },
    "Shared100": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SettingSource"
        }
      ],
      "readOnly": true
    },
    "Shared101": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MailSecurity"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true
    },
    "Shared102": {
      "type": [
        "string",
        "null"
      ],
      "readOnly": true,
      "description": "The user name that signs in to the mail server, or null.",
      "maxLength": 320
    },
    "Shared103": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalSettings"
        }
      ],
      "readOnly": true
    },
    "Shared104": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalDocumentSummary"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true
    },
    "Shared105": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalDocumentKind"
        }
      ],
      "readOnly": true
    },
    "Shared106": {
      "type": "string",
      "readOnly": true,
      "description": "The current version, which a consent names.",
      "minLength": 1,
      "maxLength": 64
    },
    "Shared107": {
      "type": "object",
      "properties": {
        "document": {
          "type": "string",
          "enum": [
            "terms",
            "privacy"
          ]
        }
      },
      "required": [
        "document"
      ],
      "additionalProperties": false
    },
    "Shared108": {
      "type": "string",
      "readOnly": true,
      "description": "Stable URI reference that identifies the problem type.",
      "const": "https://notesapp.invalid/problems/published_link_unavailable",
      "format": "uri-reference",
      "maxLength": 256
    },
    "Shared109": {
      "type": "string",
      "readOnly": true,
      "description": "The one sentence of this refusal. It repeats the detail, because a difference between the two would be a place to hide a cause.",
      "const": "This link is not available.",
      "maxLength": 256
    },
    "Shared11": {
      "type": "array",
      "readOnly": true,
      "description": "The files that a content failure refers to, for example every file whose accepted head moved on. The list is absent when the failure names no file. It carries identifiers only, never a path or note content.",
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared110": {
      "type": "string",
      "readOnly": true,
      "description": "The one sentence of this refusal.",
      "const": "This link is not available.",
      "maxLength": 1024
    },
    "Shared111": {
      "type": "string",
      "readOnly": true,
      "description": "Address of the request, without its query. It repeats what the caller sent and it adds nothing.",
      "format": "uri-reference",
      "maxLength": 1024
    },
    "Shared112": {
      "type": "string",
      "readOnly": true,
      "description": "The one code of every reader refusal.",
      "const": "published_link_unavailable",
      "maxLength": 64
    },
    "Shared113": {
      "type": "object",
      "properties": {
        "token": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedSecret"
        }
      },
      "required": [
        "token"
      ],
      "additionalProperties": false
    },
    "Shared114": {
      "type": "string",
      "readOnly": true,
      "description": "Overall readiness. The value is degraded when at least one check is degraded.",
      "enum": [
        "ok",
        "degraded"
      ]
    },
    "Shared115": {
      "type": "array",
      "readOnly": true,
      "description": "One entry for every startup requirement that was checked.",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReadinessCheck"
      }
    },
    "Shared116": {
      "type": "string",
      "readOnly": true,
      "description": "Stable name of the requirement, for example configuration.",
      "minLength": 1,
      "maxLength": 64
    },
    "Shared117": {
      "type": "string",
      "readOnly": true,
      "description": "Operator readable explanation. The field is absent in a summary report and it never contains note content or a secret.",
      "maxLength": 512
    },
    "Shared118": {
      "type": "string",
      "readOnly": true,
      "description": "The folder whose notes are the templates, for example Templates or Work/Templates. A note in a subfolder is a template as well.",
      "minLength": 1,
      "maxLength": 1024
    },
    "Shared119": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the account."
    },
    "Shared12": {
      "type": "string",
      "readOnly": true,
      "description": "The limit of the Markdown grammar that a refused note is over, on the code unrenderable_note only (record 0182). A client names the cause and the next step in words, and never shows this value.",
      "enum": [
        "note_too_large",
        "note_too_deep",
        "note_too_many_marks",
        "note_too_many_cells"
      ]
    },
    "Shared120": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AccountState"
        }
      ],
      "readOnly": true,
      "description": "Whether the account can sign in."
    },
    "Shared121": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the account was made.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared122": {
      "oneOf": [
        {
          "type": "string",
          "format": "date-time",
          "maxLength": 64
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The last instant at which a session of the account was used, or null when the account has no session."
    },
    "Shared123": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true
    },
    "Shared124": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true
    },
    "Shared125": {
      "type": "object",
      "properties": {
        "cursor": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePageToken"
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 500
        },
        "sort": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileSortOrder"
        }
      },
      "additionalProperties": false
    },
    "Shared126": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Stable identifier of the file. A rename never changes it."
    },
    "Shared127": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePageToken"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "Cursor of the next page, or null when this page is the last one. It continues the sort that produced it."
    },
    "Shared128": {
      "type": "array",
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared129": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared13": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "workspaceId"
      ],
      "additionalProperties": false
    },
    "Shared130": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/InvitationToken"
        }
      ],
      "description": "The token from the invitation link."
    },
    "Shared131": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Password"
        }
      ],
      "description": "The password of the new account."
    },
    "Shared132": {
      "type": "object",
      "properties": {
        "accountId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "accountId"
      ],
      "additionalProperties": false
    },
    "Shared14": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "Shared15": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentUpdate"
        },
        {
          "type": "null"
        }
      ],
      "description": "The work of this save, from the last state the device sent, or null when the save carries no text work. A deletion states what the device had seen and nothing else."
    },
    "Shared16": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentEpoch"
        }
      ],
      "description": "The generation that this update belongs to."
    },
    "Shared17": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentObservedState"
        }
      ],
      "description": "The complete state that the device had seen at the save. The workspace reads it to decide whether the save joins unseen work, and whether a deletion would hide an edit that the device never saw."
    },
    "Shared18": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "description": "Name of this checkpoint, or null."
    },
    "Shared19": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The mutation identity that the client submitted."
    },
    "Shared2": {
      "type": "object",
      "properties": {
        "x-request-id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9._-]+$"
        }
      }
    },
    "Shared20": {
      "type": "array",
      "readOnly": true,
      "description": "Every revision that this changeset accepted, in submitted order. A retry of the same mutation returns exactly these identifiers again.",
      "minItems": 1,
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared21": {
      "type": "string",
      "readOnly": true,
      "description": "The commit ordered position of this change in the workspace. A sync client asks for changes after a cursor it already applied.",
      "minLength": 1,
      "maxLength": 32,
      "pattern": "^[0-9]+$"
    },
    "Shared22": {
      "type": "array",
      "readOnly": true,
      "description": "Every accepted revision with the values that the workspace assigned. A client applies these without reading the workspace again, and a retry of the same mutation repeats them.",
      "minItems": 1,
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedRevision"
      }
    },
    "Shared23": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the accepted revision."
    },
    "Shared24": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file that the revision belongs to."
    },
    "Shared25": {
      "type": "array",
      "readOnly": true,
      "description": "The parents of the revision, in submitted order.",
      "maxItems": 2,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared26": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The accepted path, in its normalized form."
    },
    "Shared27": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
        }
      ],
      "readOnly": true,
      "description": "Digest of the content of the revision."
    },
    "Shared28": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The account that the workspace recorded as the author. It comes from the verified request; a client cannot supply it."
    },
    "Shared29": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the workspace accepted the revision.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared3": {
      "type": "string",
      "readOnly": true,
      "description": "Stable URI reference that identifies the problem type.",
      "format": "uri-reference",
      "maxLength": 256
    },
    "Shared30": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "readOnly": true,
      "description": "The checkpoint name of the revision, or null."
    },
    "Shared31": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentEpoch"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The generation of the document that this revision holds, or null for an attachment revision."
    },
    "Shared32": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentObservedState"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The complete state of the document after acceptance. It states identities and deletions, and it holds no note text, so an actor that may write and not read learns nothing from it. Absent for an attachment revision, where it is null."
    },
    "Shared33": {
      "type": "boolean",
      "readOnly": true,
      "description": "True when this save joined work that the device had not seen. The device that saved keeps the checkpoint of that save for Review, and every device marks the revision in History."
    },
    "Shared34": {
      "type": "array",
      "readOnly": true,
      "description": "Every file whose accepted head this changeset rebased, empty for the normal case. A client shows the person that a save from another device is now only in the history of the file.",
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SupersededHead"
      }
    },
    "Shared35": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file whose accepted head moved."
    },
    "Shared36": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The accepted head that the client did not see. It is now a history entry of the file, and its text is not lost."
    },
    "Shared37": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The revision of this changeset that became the new accepted head of the file."
    },
    "Shared38": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
        }
      ],
      "description": "The device that submitted the change."
    },
    "Shared39": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedRevision"
        }
      ],
      "readOnly": true,
      "description": "The accepted revision, as the workspace recorded it. Its identifier is the entity tag of the answer. It carries no text: the request that wrote it already holds the content."
    },
    "Shared4": {
      "type": "string",
      "readOnly": true,
      "description": "Explanation of this occurrence. The field never contains note content, a secret, or a stack trace.",
      "maxLength": 1024
    },
    "Shared40": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedChangeset"
        }
      ],
      "readOnly": true,
      "description": "The outcome of the changeset that carried the revision."
    },
    "Shared41": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the invitation record. An administrator names it to revoke the invitation. It is not the token."
    },
    "Shared42": {
      "allOf": [
        {
          "type": "string",
          "description": "A sign-in address.",
          "format": "email",
          "minLength": 3,
          "maxLength": 320
        }
      ],
      "readOnly": true,
      "description": "The address that the invitation binds."
    },
    "Shared43": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the invitation was made.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared44": {
      "type": "string",
      "readOnly": true,
      "description": "Instant after which the invitation opens nothing.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared45": {
      "type": "string",
      "readOnly": true,
      "description": "pending while the invitation can be used, expired after.",
      "enum": [
        "pending",
        "expired"
      ]
    },
    "Shared46": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "The note that the link opens. A rename keeps the link, because the identifier of a note does not move."
    },
    "Shared47": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "description": "The folder that the link opens. Every note below it is published, now and later."
    },
    "Shared48": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the link record. The owner names it to revoke the link. It is not the token and it opens nothing."
    },
    "Shared49": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedScope"
        }
      ],
      "readOnly": true,
      "description": "What the link opens."
    },
    "Shared5": {
      "type": "string",
      "readOnly": true,
      "description": "URI reference of the request that produced the problem.",
      "format": "uri-reference",
      "maxLength": 1024
    },
    "Shared50": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the owner made the link.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared51": {
      "oneOf": [
        {
          "type": "string",
          "format": "date-time",
          "maxLength": 64
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "Instant after which the link opens nothing, or null for a link that lasts until the owner revokes it."
    },
    "Shared52": {
      "type": "boolean",
      "readOnly": true,
      "description": "Whether an administrator took the link down after a report. A taken down link opens nothing, and its owner cannot make it live again. It stays in the list for 30 days."
    },
    "Shared53": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the workspace."
    },
    "Shared54": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Role"
        }
      ],
      "readOnly": true,
      "description": "The role of the reading account in this workspace."
    },
    "Shared55": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "fileId",
        "workspaceId"
      ],
      "additionalProperties": false
    },
    "Shared56": {
      "type": "object",
      "properties": {
        "x-request-id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9._-]+$"
        },
        "if-match": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/EntityTagCondition"
        }
      }
    },
    "Shared57": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "Identity of this operation, which makes a retry safe."
    },
    "Shared58": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Appearance"
        }
      ],
      "readOnly": true,
      "description": "The stored appearance choice of the account."
    },
    "Shared59": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeFamily"
        }
      ],
      "readOnly": true,
      "description": "The stored theme family of the account."
    },
    "Shared6": {
      "type": "string",
      "readOnly": true,
      "description": "Stable application error code.",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 64
    },
    "Shared60": {
      "type": "boolean",
      "readOnly": true,
      "description": "True when the editor asks the browser to check the spelling of a note."
    },
    "Shared61": {
      "type": "array",
      "readOnly": true,
      "description": "The themes that the account imported, oldest first.",
      "maxItems": 20,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ImportedTheme"
      }
    },
    "Shared62": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the imported theme."
    },
    "Shared63": {
      "allOf": [
        {
          "type": "string",
          "description": "The name of an imported theme, as a person reads it.",
          "minLength": 1,
          "maxLength": 60
        }
      ],
      "readOnly": true
    },
    "Shared64": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemePalette"
        }
      ],
      "readOnly": true
    },
    "Shared65": {
      "type": "object",
      "properties": {
        "reportId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "reportId"
      ],
      "additionalProperties": false
    },
    "Shared66": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "Identifier of the new revision."
    },
    "Shared67": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/InstallationRole"
        }
      ],
      "readOnly": true,
      "description": "The role of the account in the installation."
    },
    "Shared68": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AccountStorage"
        }
      ],
      "readOnly": true,
      "description": "The usage and the limit of the account."
    },
    "Shared69": {
      "allOf": [
        {
          "type": "integer",
          "description": "A number of bytes.",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      ],
      "readOnly": true,
      "description": "The bytes that the workspaces of the account use."
    },
    "Shared7": {
      "type": "string",
      "readOnly": true,
      "description": "Identifier of the request, repeated in the x-request-id header.",
      "minLength": 1,
      "maxLength": 128
    },
    "Shared70": {
      "allOf": [
        {
          "type": "integer",
          "description": "A number of bytes.",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      ],
      "readOnly": true,
      "description": "The most bytes that the workspaces of the account can use."
    },
    "Shared71": {
      "type": "object",
      "properties": {
        "workspaceId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        "revisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      },
      "required": [
        "revisionId",
        "workspaceId"
      ],
      "additionalProperties": false
    },
    "Shared72": {
      "type": "string",
      "readOnly": true,
      "description": "Identifier of the user inside the identity provider.",
      "minLength": 1,
      "maxLength": 128
    },
    "Shared73": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncCursorValue"
        }
      ],
      "readOnly": true,
      "description": "The position of this record in the ordered feed."
    },
    "Shared74": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The note whose text a new daily note starts with, or null for a daily note that starts empty."
    },
    "Shared75": {
      "type": "string",
      "readOnly": true,
      "description": "The folder that holds every daily note, or an empty text for the top of the workspace.",
      "maxLength": 1024
    },
    "Shared76": {
      "type": "string",
      "readOnly": true,
      "description": "The name of a daily note as date tokens, where a slash makes folders, for example YYYY/MM/YYYY-MM-DD dddd.",
      "minLength": 1,
      "maxLength": 255
    },
    "Shared77": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The accepted path of the file."
    },
    "Shared78": {
      "allOf": [
        {
          "type": "string",
          "description": "Whether a file holds Markdown or an attachment.",
          "enum": [
            "note",
            "attachment"
          ]
        }
      ],
      "readOnly": true,
      "description": "Whether the file holds Markdown or an attachment."
    },
    "Shared79": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the file was created.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared8": {
      "type": "array",
      "readOnly": true,
      "description": "Values that a boundary check rejected. Each entry names the value by JSON Pointer and never repeats the value itself.",
      "maxItems": 64,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ValidationIssue"
      }
    },
    "Shared80": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the workspace accepted the last change.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared81": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of this revision."
    },
    "Shared82": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file that this revision belongs to."
    },
    "Shared83": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The path of the file at this revision."
    },
    "Shared84": {
      "allOf": [
        {
          "type": "string",
          "description": "Whether a file holds Markdown or an attachment.",
          "enum": [
            "note",
            "attachment"
          ]
        }
      ],
      "readOnly": true,
      "description": "Whether this revision holds Markdown or an attachment."
    },
    "Shared85": {
      "type": "array",
      "readOnly": true,
      "description": "The parents of this revision, in submitted order. A first revision has none, a normal revision has one, and an explicit merge has two.",
      "maxItems": 2,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared86": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
        }
      ],
      "readOnly": true,
      "description": "Digest of the content of this revision."
    },
    "Shared87": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MarkdownText"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The Markdown of this revision, or null for an attachment revision."
    },
    "Shared88": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The immutable attachment object of this revision, or null for a Markdown revision. Its bytes are transferred separately."
    },
    "Shared89": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "readOnly": true,
      "description": "The checkpoint name of this revision, or null."
    },
    "Shared9": {
      "type": "string",
      "readOnly": true,
      "description": "JSON Pointer of the rejected value inside its request slot.",
      "maxLength": 256
    },
    "Shared90": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The historic revision that this one restored, or null. A restore never rewinds history; it adds a revision."
    },
    "Shared91": {
      "type": "string",
      "readOnly": true,
      "description": "The clock of the device that wrote the revision. It stays informational, because a device clock cannot be trusted.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared92": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentUpdate"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The whole document of the note at this revision, so a reader can start from it and stay able to merge later work. Null for an attachment revision, and for a file read that asked for the text alone."
    },
    "Shared93": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentEpoch"
        },
        {
          "type": "null"
        }
      ],
      "readOnly": true,
      "description": "The generation of that document, or null for an attachment revision."
    },
    "Shared94": {
      "type": "boolean",
      "readOnly": true,
      "description": "True when the save that made this revision joined work that its device had not seen. Every device reads the mark in History, and the device that saved keeps its own checkpoint for Review."
    },
    "Shared95": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/RegistrationPolicy"
        }
      ],
      "readOnly": true,
      "description": "Who can make an account."
    },
    "Shared96": {
      "type": "boolean",
      "readOnly": true,
      "description": "Whether the installation has a mail transport. Without one, an invitation link appears once for the administrator to copy."
    },
    "Shared97": {
      "type": "integer",
      "readOnly": true,
      "description": "How long a new invitation stays valid, in hours.",
      "minimum": 1,
      "maximum": 8760
    },
    "Shared98": {
      "allOf": [
        {
          "type": "integer",
          "description": "A number of bytes.",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      ],
      "readOnly": true,
      "description": "The limit that a new account starts with."
    },
    "Shared99": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MailSettings"
        }
      ],
      "readOnly": true
    },
    "SupersededHead": {
      "type": "object",
      "description": "One file whose accepted head moved between the read of the client and this changeset. The workspace rebased the save on the current head, so the later save still wins and the head that it passed stays in history. The record carries no text and no path: the accepted revision of the same answer already names the path.",
      "additionalProperties": false,
      "required": [
        "fileId",
        "previousHeadRevisionId",
        "acceptedRevisionId"
      ],
      "properties": {
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared35"
        },
        "previousHeadRevisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared36"
        },
        "acceptedRevisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared37"
        }
      }
    },
    "SyncCursorValue": {
      "type": "string",
      "description": "One commit ordered position in the feed of a workspace. It is the decimal text of the position, and a reader sends the last one it applied to continue.",
      "minLength": 1,
      "maxLength": 32,
      "pattern": "^[0-9]+$"
    },
    "SyncNoticeGeneration": {
      "type": "integer",
      "description": "The number of one subscription set on one connection. The client raises it for each new set, starting at 1. The server echoes it on every answer and notice for that set, so a late message of an older set cannot act on a newer one.",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "SyncNoticeProtocol": {
      "type": "string",
      "description": "The WebSocket subprotocol of the sync notice stream. The browser names it when it opens the stream, and the server accepts no other value. A later version gets a new name, so an old client and a new server never read each other's messages.",
      "const": "notesapp.sync.1"
    },
    "TemplateSettings": {
      "type": "object",
      "description": "The template settings that one member keeps in one workspace.",
      "additionalProperties": false,
      "required": [
        "folder"
      ],
      "properties": {
        "folder": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared118"
        }
      }
    },
    "ThemeColour": {
      "type": "string",
      "description": "One colour of an imported theme, as a hash and six hexadecimal digits.",
      "minLength": 7,
      "maxLength": 7,
      "pattern": "^#[0-9a-fA-F]{6}$"
    },
    "ThemeFamily": {
      "type": "string",
      "description": "Identifier of a theme family in the client theme registry, for example tokyo-night, or custom- and the identifier of a theme that the account imported. An identifier that the client does not know falls back to the default family, so a stored value never stops the page painting.",
      "minLength": 1,
      "maxLength": 64,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
    },
    "ThemePalette": {
      "type": "object",
      "description": "The light or the dark palette of one imported theme.",
      "additionalProperties": false,
      "required": [
        "tokens",
        "syntax"
      ],
      "properties": {
        "tokens": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemePaletteTokens"
        },
        "syntax": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemePaletteSyntax"
        }
      }
    },
    "ThemePaletteSyntax": {
      "type": "object",
      "description": "The colours of code inside a fenced block of one palette.",
      "additionalProperties": false,
      "required": [
        "keyword",
        "string",
        "comment",
        "number",
        "tag",
        "attribute",
        "heading",
        "link",
        "punctuation"
      ],
      "properties": {
        "keyword": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "string": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "comment": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "number": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "tag": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "attribute": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "heading": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "link": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "punctuation": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        }
      }
    },
    "ThemePaletteTokens": {
      "type": "object",
      "description": "The interface colours of one palette. Each member is a token of the theme registry of the client.",
      "additionalProperties": false,
      "required": [
        "background",
        "surface",
        "surfaceCard",
        "surfaceHover",
        "surfaceActive",
        "text",
        "textStrong",
        "textMuted",
        "accentText",
        "accentFill",
        "accentOnFill",
        "successText",
        "dangerText",
        "dangerFill",
        "onDanger",
        "border",
        "borderSubtle",
        "focus",
        "scrim"
      ],
      "properties": {
        "background": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "surface": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "surfaceCard": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "surfaceHover": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "surfaceActive": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "text": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "textStrong": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "textMuted": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "accentText": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "accentFill": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "accentOnFill": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "successText": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "dangerText": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "dangerFill": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "onDanger": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "border": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "borderSubtle": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "focus": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        },
        "scrim": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeColour"
        }
      }
    },
    "Uuid": {
      "type": "string",
      "description": "A UUID that names one record.",
      "format": "uuid",
      "minLength": 36,
      "maxLength": 36,
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    },
    "ValidationIssue": {
      "type": "object",
      "description": "One value that a boundary check rejected.",
      "additionalProperties": false,
      "required": [
        "path",
        "message"
      ],
      "properties": {
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared9"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared10"
        }
      }
    },
    "Workspace": {
      "type": "object",
      "description": "One workspace as its member sees it.",
      "additionalProperties": false,
      "required": [
        "workspaceId",
        "name",
        "role",
        "personal"
      ],
      "properties": {
        "workspaceId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared53"
        },
        "name": {
          "type": "string",
          "readOnly": true,
          "description": "Name of the workspace.",
          "minLength": 1,
          "maxLength": 200
        },
        "role": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared54"
        },
        "personal": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for the workspace that was created with the account."
        }
      }
    },
    "WorkspaceNameInput": {
      "type": "object",
      "description": "The name to give a workspace.",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string",
          "description": "Name of the workspace.",
          "minLength": 1,
          "maxLength": 200
        }
      }
    }
  }
};

export const operations: readonly OperationEntry[] = [
  {
    "id": "abortWorkspaceImport",
    "method": "delete",
    "path": "/api/workspaces/{workspaceId}/imports/{importId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "importId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "acceptLegalDocuments",
    "method": "post",
    "path": "/api/account/consent",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ConsentInput"
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The account accepted the current legal documents.",
          "additionalProperties": false,
          "required": [
            "accepted"
          ],
          "properties": {
            "accepted": {
              "type": "boolean",
              "const": true,
              "readOnly": true,
              "description": "The consent is stored with its time."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "commitChangeset",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/changesets",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "One atomic change of one or more files.",
        "additionalProperties": false,
        "required": [
          "mutationId",
          "deviceId",
          "expectedHeads",
          "revisions"
        ],
        "properties": {
          "mutationId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identity of this operation. A retry with the same identity and the same body returns the first outcome."
          },
          "deviceId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
              }
            ],
            "description": "The device that submitted the changeset."
          },
          "expectedHeads": {
            "allOf": [
              {
                "type": "object",
                "description": "The accepted head that the client saw for each file of the changeset, keyed by file identifier. The value null states that the file must not exist in accepted state, which is the precondition of a new file. Every file that the changeset changes needs an entry, and an entry for a file that it does not change is refused. The limit below is a coarse bound that protects the parser; the rule that a changeset may change at most 1000 files is applied by the workspace and answers 422.",
                "maxProperties": 4000,
                "propertyNames": {
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
                },
                "additionalProperties": {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
                }
              }
            ],
            "description": "The precondition of every file that the changeset changes."
          },
          "revisions": {
            "type": "array",
            "description": "The revisions to accept, in submission order. The revisions of one file form one chain, and the last one becomes its head. One changeset may change at most 1000 files, and a file may carry several revisions, so the limit below is above the file limit.",
            "minItems": 1,
            "maxItems": 4000,
            "items": {
              "type": "object",
              "description": "One revision that a client submits inside a changeset.",
              "additionalProperties": false,
              "required": [
                "revisionId",
                "fileId",
                "parents",
                "path",
                "deleted",
                "content",
                "clientTime"
              ],
              "properties": {
                "revisionId": {
                  "allOf": [
                    {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                    }
                  ],
                  "description": "Identifier that the client assigned to this revision."
                },
                "fileId": {
                  "allOf": [
                    {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                    }
                  ],
                  "description": "The file that this revision belongs to."
                },
                "parents": {
                  "type": "array",
                  "description": "The parents of this revision. A parent is either an earlier revision of the same file in this submission or an accepted revision of that file.",
                  "maxItems": 2,
                  "items": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  }
                },
                "path": {
                  "allOf": [
                    {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                    }
                  ],
                  "description": "The path that the file has after this revision."
                },
                "deleted": {
                  "type": "boolean",
                  "description": "True for a tombstone, which records a deletion."
                },
                "content": {
                  "allOf": [
                    {
                      "description": "The content of one submitted revision. A note carries document work; an attachment names finalized bytes. The kind states which form applies.",
                      "oneOf": [
                        {
                          "type": "object",
                          "description": "The content of one saved note. It carries document work, never text: the accepted text is what the workspace derives from the accepted document.",
                          "additionalProperties": false,
                          "required": [
                            "kind",
                            "document"
                          ],
                          "properties": {
                            "kind": {
                              "type": "string",
                              "description": "Names this content form.",
                              "enum": [
                                "markdown"
                              ]
                            },
                            "document": {
                              "allOf": [
                                {
                                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentSave"
                                }
                              ],
                              "description": "The text work of this save."
                            }
                          }
                        },
                        {
                          "type": "object",
                          "description": "The content of one attachment revision. It names a finalized object of the same workspace and the digest of its bytes.",
                          "additionalProperties": false,
                          "required": [
                            "kind",
                            "digest",
                            "attachmentObjectId"
                          ],
                          "properties": {
                            "kind": {
                              "type": "string",
                              "description": "Names this content form.",
                              "enum": [
                                "attachment"
                              ]
                            },
                            "digest": {
                              "allOf": [
                                {
                                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                                }
                              ],
                              "description": "Digest of the bytes. The server recomputes it and refuses a revision that declares another value."
                            },
                            "attachmentObjectId": {
                              "allOf": [
                                {
                                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                                }
                              ],
                              "description": "The finalized attachment object of this revision."
                            }
                          }
                        }
                      ]
                    }
                  ],
                  "description": "The content of this revision."
                },
                "clientTime": {
                  "type": "string",
                  "description": "The device clock at the moment of the change.",
                  "format": "date-time",
                  "minLength": 20,
                  "maxLength": 64
                },
                "message": {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared18"
                },
                "restoredFrom": {
                  "oneOf": [
                    {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "description": "The historic revision that this one restores, or null."
                }
              }
            }
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedChangeset"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "completeWorkspaceImport",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/imports/{importId}/complete",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "importId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Counts of the files that one import wrote, and of the files of the archive that it left out: the settings of a tool, such as the .obsidian folder, and every file that is neither a note nor an image (record 0172).",
          "additionalProperties": false,
          "required": [
            "notes",
            "attachments",
            "skipped"
          ],
          "properties": {
            "notes": {
              "type": "integer",
              "minimum": 0
            },
            "attachments": {
              "type": "integer",
              "minimum": 0
            },
            "skipped": {
              "type": "object",
              "description": "The files of the archive that the import left out.",
              "additionalProperties": false,
              "required": [
                "files",
                "kinds"
              ],
              "properties": {
                "files": {
                  "type": "integer",
                  "minimum": 0
                },
                "kinds": {
                  "type": "array",
                  "description": "The kinds of the files left out, in name order: the file extension in lower case, `settings` for the settings of a tool, and `file` for a file with no extension.",
                  "maxItems": 50,
                  "items": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 40
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 507,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "createFile",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/files",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The identifiers, the path, and the first content of a new file.",
        "additionalProperties": false,
        "required": [
          "fileId",
          "revisionId",
          "mutationId",
          "deviceId",
          "path",
          "document"
        ],
        "properties": {
          "fileId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identifier of the new file. The client assigns it, so a file that was written offline keeps one identity everywhere."
          },
          "revisionId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identifier of the first revision."
          },
          "mutationId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identity of this operation. A retry that repeats it returns the first outcome instead of writing a second time."
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared38"
          },
          "path": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
              }
            ],
            "description": "Path of the new note, which must end in .md."
          },
          "document": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentSave"
              }
            ],
            "description": "The document work of the first revision. A new note starts on the device that creates it, so the save carries the whole document."
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared18"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileChange"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "createInvitation",
    "method": "post",
    "path": "/api/invitations",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The address that a new invitation binds.",
        "additionalProperties": false,
        "required": [
          "email"
        ],
        "properties": {
          "email": {
            "allOf": [
              {
                "type": "string",
                "description": "A sign-in address.",
                "format": "email",
                "minLength": 3,
                "maxLength": 320
              }
            ],
            "description": "The address of the invited person. The person cannot change it while they accept."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "A new invitation, and its link when no mail transport sent it. The link appears in this answer only, once.",
          "additionalProperties": false,
          "required": [
            "invitation",
            "link"
          ],
          "properties": {
            "invitation": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Invitation"
                }
              ],
              "readOnly": true,
              "description": "The new invitation."
            },
            "link": {
              "oneOf": [
                {
                  "type": "string",
                  "format": "uri",
                  "maxLength": 2048
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "The link that opens the invitation, for the administrator to copy, or null when the link went by mail."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "createOwner",
    "method": "post",
    "path": "/api/setup",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "required": [
          "email",
          "password"
        ],
        "properties": {
          "email": {
            "type": "string",
            "description": "A sign-in address.",
            "format": "email",
            "minLength": 3,
            "maxLength": 320
          },
          "password": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Password"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "additionalProperties": false,
          "required": [
            "initialized"
          ],
          "properties": {
            "initialized": {
              "type": "boolean",
              "readOnly": true
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "createPublishedLink",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/publications",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "What to publish, and how a reader reaches it.",
        "additionalProperties": false,
        "required": [
          "scope"
        ],
        "properties": {
          "scope": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedScope"
              }
            ],
            "description": "The one note, or the one folder, that the link opens."
          },
          "password": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Password"
              }
            ],
            "description": "Password that a reader gives before it reads the link. Leave it out for a link that opens without one. The product keeps one password policy, so this bound is the bound of an account password."
          },
          "expiresAt": {
            "type": "string",
            "writeOnly": true,
            "description": "Instant after which the link opens nothing. Leave it out for a link that lasts until the owner revokes it.",
            "format": "date-time",
            "maxLength": 64
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The new link and its token. This is the one answer of the whole interface that holds a token. The server keeps only a digest of the token, so it cannot show the value again.",
          "additionalProperties": false,
          "required": [
            "link",
            "token"
          ],
          "properties": {
            "link": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedLink"
                }
              ],
              "readOnly": true,
              "description": "The new link, as the list reports it from now on."
            },
            "token": {
              "allOf": [
                {
                  "type": "string",
                  "description": "The opaque value that opens one published link. The server draws it at random, so it names no note, no folder and no account. The server keeps only a digest of it, and it appears once, in the address that the owner copies.",
                  "pattern": "^[A-Za-z0-9_-]{22,64}$",
                  "minLength": 22,
                  "maxLength": 64
                }
              ],
              "readOnly": true,
              "description": "The token of the new link. The owner puts it in the address that it shares. No other answer holds it, and no answer holds a part of it."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "createWorkspace",
    "method": "post",
    "path": "/api/workspaces",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/WorkspaceNameInput"
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Workspace"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "deleteFile",
    "method": "delete",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "if-match",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared56"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The identifiers of a tombstone revision.",
        "additionalProperties": false,
        "required": [
          "revisionId",
          "mutationId",
          "deviceId",
          "document"
        ],
        "properties": {
          "revisionId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identifier of the tombstone revision."
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared57"
          },
          "deviceId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
              }
            ],
            "description": "The device that submitted the deletion."
          },
          "message": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
              }
            ],
            "description": "Reason for the deletion, or null."
          },
          "document": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentSave"
              }
            ],
            "description": "What the device had seen of the document when it deleted the note. The save carries no update. The workspace refuses the deletion when the state does not cover the text work that the note holds, so a deletion never hides an edit that the device never saw."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileChange"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 428,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "deleteTheme",
    "method": "delete",
    "path": "/api/account/themes/{themeId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "themeId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "themeId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "themeId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Preferences"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "deleteWorkspace",
    "method": "delete",
    "path": "/api/workspaces/{workspaceId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "dismissReport",
    "method": "delete",
    "path": "/api/reports/{reportId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "reportId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared65"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "exportNote",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}/export",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/markdown",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "exportWorkspace",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/export",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/zip",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "finalizeAttachment",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/attachments/{objectId}/finalize",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "objectId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "if-match",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspaceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "objectId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "objectId",
          "workspaceId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared56"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Payload to finalize an attachment and create an immutable revision.",
        "additionalProperties": false,
        "required": [
          "fileId",
          "revisionId",
          "mutationId",
          "deviceId",
          "path",
          "digest"
        ],
        "properties": {
          "fileId": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            ],
            "description": "Identifier of the file that holds this attachment revision."
          },
          "revisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared66"
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared57"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared38"
          },
          "path": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
              }
            ],
            "description": "Path of the attachment file in the workspace."
          },
          "digest": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
              }
            ],
            "description": "The verified SHA-256 digest of the attachment object."
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared18"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileChange"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 428,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getAccount",
    "method": "get",
    "path": "/api/account",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The signed in account and its settings.",
          "additionalProperties": false,
          "required": [
            "accountId",
            "installationRole",
            "storage",
            "preferences",
            "consentRequired"
          ],
          "properties": {
            "accountId": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                }
              ],
              "readOnly": true,
              "description": "Stable identifier of the account inside this deployment."
            },
            "email": {
              "type": [
                "string",
                "null"
              ],
              "readOnly": true,
              "description": "Sign-in address, or null when no address is linked.",
              "maxLength": 320
            },
            "name": {
              "type": [
                "string",
                "null"
              ],
              "readOnly": true,
              "description": "Display name, or null when no name is stored.",
              "maxLength": 256
            },
            "installationRole": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared67"
            },
            "storage": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared68"
            },
            "preferences": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Preferences"
                }
              ],
              "readOnly": true,
              "description": "The stored settings of the account."
            },
            "consentRequired": {
              "type": "boolean",
              "readOnly": true,
              "description": "Whether the account must accept the current legal documents before the application opens (record 0120)."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getAttachmentRevision",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/attachments/{revisionId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "revisionId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared71"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "image/png",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/jpeg",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/gif",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/webp",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getAuthSession",
    "method": "get",
    "path": "/api/auth/get-session",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": [
            "object",
            "null"
          ],
          "description": "The current session, or null when there is none.",
          "additionalProperties": true,
          "properties": {
            "user": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AuthUser"
            },
            "session": {
              "type": "object",
              "description": "The stored session of the signed in user. It never carries the session token: the browser already holds that value in an HttpOnly cookie, and the protocol adapter removes it from this answer.",
              "additionalProperties": true,
              "required": [
                "id",
                "expiresAt"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "readOnly": true,
                  "description": "Identifier of the session record.",
                  "minLength": 1,
                  "maxLength": 128
                },
                "expiresAt": {
                  "type": "string",
                  "readOnly": true,
                  "description": "Instant after which the session is refused.",
                  "maxLength": 64
                },
                "token": {
                  "not": {},
                  "description": "Never present. The adapter removes the session token from this answer."
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getChanges",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/sync/changes",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "cursor",
        "location": "query",
        "required": true,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "cursor": {
            "type": "string",
            "minLength": 1,
            "maxLength": 32,
            "pattern": "^[0-9]+$"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 500
          }
        },
        "required": [
          "cursor"
        ],
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Ordered incremental changes after a cursor.",
          "additionalProperties": false,
          "required": [
            "changes",
            "nextCursor"
          ],
          "properties": {
            "changes": {
              "type": "array",
              "readOnly": true,
              "description": "Ordered changes after the requested cursor, oldest first. The page holds whole commits only. One commit larger than the requested limit comes as one whole page, and a commit holds at most 1000 records.",
              "maxItems": 1000,
              "items": {
                "description": "One record of the ordered feed. The kind states which form applies: the work of one save, a whole document at a new generation, a note that the workspace removed for good, or a change of the membership.",
                "oneOf": [
                  {
                    "type": "object",
                    "description": "One accepted change of a note, as the work that follows the state the reader already holds. The record binds the update, the derived text digest, the revision, and the generation to one committed state.",
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "cursor",
                      "fileId",
                      "revisionId",
                      "path",
                      "deleted",
                      "digest",
                      "kindOfFile",
                      "epoch",
                      "update",
                      "stateVector"
                    ],
                    "properties": {
                      "kind": {
                        "type": "string",
                        "description": "Names this record form.",
                        "enum": [
                          "update"
                        ]
                      },
                      "cursor": {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared73"
                      },
                      "fileId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The note that this record changes."
                      },
                      "revisionId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The accepted revision that this record carries."
                      },
                      "path": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                          }
                        ],
                        "readOnly": true,
                        "description": "The accepted path of the note after this record."
                      },
                      "deleted": {
                        "type": "boolean",
                        "readOnly": true,
                        "description": "True when the note is in Trash after this record."
                      },
                      "kindOfFile": {
                        "type": "string",
                        "readOnly": true,
                        "description": "Whether the record states a note or an attachment.",
                        "enum": [
                          "note",
                          "attachment"
                        ]
                      },
                      "digest": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                          }
                        ],
                        "readOnly": true,
                        "description": "Digest of the text that the accepted document derives, or of the bytes of an attachment."
                      },
                      "epoch": {
                        "oneOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentEpoch"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true,
                        "description": "The generation that this update belongs to, or null for an attachment revision, which holds no document."
                      },
                      "update": {
                        "oneOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentUpdate"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true,
                        "description": "The work that this record adds to the document, or null for an attachment revision."
                      },
                      "stateVector": {
                        "oneOf": [
                          {
                            "type": "string",
                            "description": "The state vector of a document, as base64. A reader sends it to ask for the work that it lacks. It names insertions only, so it never answers whether a deletion is unseen.",
                            "contentEncoding": "base64",
                            "pattern": "^[A-Za-z0-9+/]*={0,2}$",
                            "maxLength": 1398104
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true,
                        "description": "The state vector of the document at this revision, so a reader can ask for exactly the work that it lacks. Null for an attachment."
                      }
                    }
                  },
                  {
                    "type": "object",
                    "description": "One whole document of a note. The feed emits it when the generation of the note changes, because identities of one generation say nothing about another, and a reader cannot join the two by an update.",
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "cursor",
                      "fileId",
                      "revisionId",
                      "path",
                      "deleted",
                      "digest",
                      "epoch",
                      "document"
                    ],
                    "properties": {
                      "kind": {
                        "type": "string",
                        "description": "Names this record form.",
                        "enum": [
                          "document"
                        ]
                      },
                      "cursor": {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared73"
                      },
                      "fileId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The note that this record states."
                      },
                      "revisionId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The accepted revision that this document holds."
                      },
                      "path": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                          }
                        ],
                        "readOnly": true,
                        "description": "The accepted path of the note at this record."
                      },
                      "deleted": {
                        "type": "boolean",
                        "readOnly": true,
                        "description": "True when the note is in Trash at this record."
                      },
                      "digest": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                          }
                        ],
                        "readOnly": true,
                        "description": "Digest of the text that this document derives."
                      },
                      "epoch": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentEpoch"
                          }
                        ],
                        "readOnly": true,
                        "description": "The generation that this document starts for the reader."
                      },
                      "document": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentUpdate"
                          }
                        ],
                        "readOnly": true,
                        "description": "The whole document of the note at this record."
                      }
                    }
                  },
                  {
                    "type": "object",
                    "description": "One note that the workspace removed for good. Its revisions no longer exist, so the record names the note itself and carries no revision.",
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "cursor",
                      "fileId"
                    ],
                    "properties": {
                      "kind": {
                        "type": "string",
                        "description": "Names this record form.",
                        "enum": [
                          "purge"
                        ]
                      },
                      "cursor": {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared73"
                      },
                      "fileId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The note that the workspace removed for good."
                      }
                    }
                  },
                  {
                    "type": "object",
                    "description": "One change of the membership of the workspace. A reader reads its own access again when it meets one.",
                    "additionalProperties": false,
                    "required": [
                      "kind",
                      "cursor",
                      "accountId",
                      "removed"
                    ],
                    "properties": {
                      "kind": {
                        "type": "string",
                        "description": "Names this record form.",
                        "enum": [
                          "membership"
                        ]
                      },
                      "cursor": {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared73"
                      },
                      "accountId": {
                        "allOf": [
                          {
                            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                          }
                        ],
                        "readOnly": true,
                        "description": "The account whose membership changed."
                      },
                      "removed": {
                        "type": "boolean",
                        "readOnly": true,
                        "description": "True when the account no longer belongs to the workspace."
                      }
                    }
                  }
                ]
              }
            },
            "nextCursor": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncCursorValue"
                }
              ],
              "readOnly": true,
              "description": "The cursor the client sends to continue."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getDailyNoteSettings",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/daily-note-settings",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DailyNoteSettings"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getFile",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "content",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "if-none-match",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "content": {
            "type": "string",
            "description": "The parts of the head that a file read carries. `text` is the Markdown alone, for a reader that shows the text. `full` is the Markdown and the whole document of the note, for an editor that merges later work.",
            "enum": [
              "text",
              "full"
            ],
            "default": "full"
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "x-request-id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[A-Za-z0-9._-]+$"
          },
          "if-none-match": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/EntityTagCondition"
          }
        }
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One live file and the content of its accepted head.",
          "additionalProperties": false,
          "required": [
            "fileId",
            "path",
            "kind",
            "headRevisionId",
            "createdAt",
            "updatedAt",
            "head"
          ],
          "properties": {
            "fileId": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                }
              ],
              "readOnly": true,
              "description": "Stable identifier of the file."
            },
            "path": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared77"
            },
            "kind": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared78"
            },
            "headRevisionId": {
              "oneOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "The accepted head, which is also the entity tag."
            },
            "createdAt": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared79"
            },
            "updatedAt": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
            },
            "head": {
              "oneOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileRevision"
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "The head revision with its content, or null for a file that has no accepted revision yet."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": [
      304
    ]
  },
  {
    "id": "getHealth",
    "method": "get",
    "path": "/api/health",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/HealthReport"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getInstallation",
    "method": "get",
    "path": "/api/installation",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getLegalDocument",
    "method": "get",
    "path": "/legal/{document}",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "document",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared107"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/html",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "description": "One legal document of the installation, as one HTML document. The server builds it from the Markdown file of the operator with the one sanitized renderer, and it holds no script.",
          "maxLength": 8388608
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getLegalDocumentSettings",
    "method": "get",
    "path": "/api/installation/legal/{document}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "document",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared107"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One legal document of the installation and its template, as the administrator changes them.",
          "additionalProperties": false,
          "required": [
            "source",
            "document",
            "template"
          ],
          "properties": {
            "source": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared100"
            },
            "document": {
              "oneOf": [
                {
                  "type": "object",
                  "description": "One stored legal document, as the administrator changes it.",
                  "additionalProperties": false,
                  "required": [
                    "kind",
                    "text",
                    "url",
                    "version"
                  ],
                  "properties": {
                    "kind": {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared105"
                    },
                    "text": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "readOnly": true,
                      "description": "The Markdown text, for the kind text.",
                      "maxLength": 262144
                    },
                    "url": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "readOnly": true,
                      "description": "The address, for the kind address.",
                      "maxLength": 2048
                    },
                    "version": {
                      "type": "string",
                      "readOnly": true,
                      "minLength": 1,
                      "maxLength": 64
                    }
                  }
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "The stored document, or null when the application holds none."
            },
            "template": {
              "type": "string",
              "readOnly": true,
              "description": "The template of the document in Markdown. The server fills the facts that it knows, and each other blank is a marker in double braces.",
              "maxLength": 262144
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getMutationReceipt",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/mutations/{mutationId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "mutationId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "digest",
        "location": "query",
        "required": true,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspaceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "mutationId",
          "workspaceId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "digest": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
          }
        },
        "required": [
          "digest"
        ],
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "What the workspace knows about one mutation identity. A device reads it when it does not know whether a save reached the server, before it transforms work that may already have committed. The answer states the outcome and never the text of a note.",
          "additionalProperties": false,
          "required": [
            "mutationId",
            "status",
            "accepted"
          ],
          "properties": {
            "mutationId": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                }
              ],
              "readOnly": true,
              "description": "The mutation identity that the device asked about."
            },
            "status": {
              "type": "string",
              "readOnly": true,
              "description": "accepted means this workspace committed exactly this request. absent means it holds no receipt for the identity, which is definitive only while no other writer of this account is running. other_request means the identity belongs to a different request, so the device must not send this one under it.",
              "enum": [
                "accepted",
                "absent",
                "other_request"
              ]
            },
            "accepted": {
              "oneOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedChangeset"
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "The stored outcome of the accepted request, or null. It repeats what the first answer stated, so a device that lost the answer can settle its queue without sending again."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getPublishedAttachment",
    "method": "get",
    "path": "/published/{token}/attachments/{fileId}/{revisionId}",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "revisionId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "ticket",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "token": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedSecret"
          },
          "fileId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "revisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "fileId",
          "revisionId",
          "token"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "ticket": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedSecret"
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "image/png",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/jpeg",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/gif",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 200,
        "mediaType": "image/webp",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "string",
          "format": "binary"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedRefusal"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getPublishedPage",
    "method": "get",
    "path": "/published/{token}",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "note",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "ticket",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared113"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "note": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedNoteReference"
          },
          "ticket": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedSecret"
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/html",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedDocument"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getReadiness",
    "method": "get",
    "path": "/api/ready",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "detail",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "detail": {
            "type": "string",
            "enum": [
              "summary",
              "full"
            ]
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReadinessReport"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getReportPage",
    "method": "get",
    "path": "/published/{token}/report",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared113"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/html",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedDocument"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getRevision",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/revisions/{revisionId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "revisionId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared71"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileRevision"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getRootHealth",
    "method": "get",
    "path": "/health",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/HealthReport"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getRootReadiness",
    "method": "get",
    "path": "/ready",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "detail",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "detail": {
            "type": "string",
            "enum": [
              "summary",
              "full"
            ]
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReadinessReport"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getSetupStatus",
    "method": "get",
    "path": "/api/setup",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "additionalProperties": false,
          "required": [
            "initialized",
            "openRegistration",
            "passwordReset",
            "legalDocuments"
          ],
          "properties": {
            "initialized": {
              "type": "boolean",
              "readOnly": true
            },
            "openRegistration": {
              "type": "boolean",
              "readOnly": true,
              "description": "Whether a person can ask for an account without an invitation (record 0114)."
            },
            "passwordReset": {
              "type": "boolean",
              "readOnly": true,
              "description": "Whether a person can reset a forgotten password by mail (record 0141). It is false when the installation has no mail transport."
            },
            "legalDocuments": {
              "oneOf": [
                {
                  "type": "object",
                  "description": "The terms and the privacy notice of the installation (record 0120). The operator writes both and names their versions.",
                  "additionalProperties": false,
                  "required": [
                    "terms",
                    "privacy"
                  ],
                  "properties": {
                    "terms": {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalDocument"
                    },
                    "privacy": {
                      "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalDocument"
                    }
                  }
                },
                {
                  "type": "null"
                }
              ],
              "description": "The terms and the privacy notice, or null when the installation names none (record 0120)."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getSignUpChallenge",
    "method": "get",
    "path": "/api/registrations/challenge",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "A challenge of the proof of work of a sign-up. The digest of the value, a colon and the solution must start with `difficulty` zero bits.",
          "additionalProperties": false,
          "required": [
            "challenge",
            "value",
            "difficulty",
            "expiresAt"
          ],
          "properties": {
            "challenge": {
              "type": "string",
              "readOnly": true,
              "description": "The signed challenge, which the sign-up sends back unchanged.",
              "minLength": 1,
              "maxLength": 512,
              "pattern": "^[A-Za-z0-9_.-]+$"
            },
            "value": {
              "type": "string",
              "readOnly": true,
              "description": "The random value whose digest a solution reduces.",
              "minLength": 1,
              "maxLength": 128
            },
            "difficulty": {
              "type": "integer",
              "readOnly": true,
              "description": "How many leading zero bits the digest of a solution needs.",
              "minimum": 8,
              "maximum": 28
            },
            "expiresAt": {
              "type": "string",
              "readOnly": true,
              "description": "Instant after which the challenge counts for nothing.",
              "format": "date-time",
              "maxLength": 64
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getSnapshotPage",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/sync/snapshots/{token}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "position",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspaceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "token": {
            "type": "string",
            "minLength": 43,
            "maxLength": 43,
            "pattern": "^[A-Za-z0-9_-]{43}$"
          }
        },
        "required": [
          "token",
          "workspaceId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "position": {
            "type": "integer",
            "minimum": 0
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 500
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One page of the items that a snapshot captured.",
          "additionalProperties": false,
          "required": [
            "token",
            "cursor",
            "expiresAt",
            "position",
            "nextPosition",
            "totalItems",
            "items"
          ],
          "properties": {
            "token": {
              "type": "string",
              "readOnly": true,
              "description": "The token of the snapshot, echoed for the client.",
              "minLength": 43,
              "maxLength": 43,
              "pattern": "^[A-Za-z0-9_-]{43}$"
            },
            "cursor": {
              "type": "string",
              "readOnly": true,
              "description": "The captured high-water cursor.",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[0-9]+$"
            },
            "expiresAt": {
              "type": "string",
              "readOnly": true,
              "description": "Instant at which the snapshot expires.",
              "format": "date-time"
            },
            "position": {
              "type": "integer",
              "readOnly": true,
              "description": "Ordinal of the first item of this page.",
              "minimum": 0
            },
            "nextPosition": {
              "oneOf": [
                {
                  "type": "integer",
                  "minimum": 0
                },
                {
                  "type": "null"
                }
              ],
              "readOnly": true,
              "description": "Ordinal of the next page, or null on the last page."
            },
            "totalItems": {
              "type": "integer",
              "readOnly": true,
              "description": "How many items the snapshot holds now.",
              "minimum": 0
            },
            "items": {
              "type": "array",
              "readOnly": true,
              "description": "The captured items of this page, ordered by file.",
              "maxItems": 500,
              "items": {
                "type": "object",
                "description": "One pinned file of a snapshot. The revision identifier is immutable, so a later commit cannot change what a page shows.",
                "additionalProperties": false,
                "required": [
                  "fileId",
                  "revisionId",
                  "path",
                  "kind",
                  "deleted"
                ],
                "properties": {
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                  },
                  "kind": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Whether the file holds Markdown or an attachment.",
                    "enum": [
                      "note",
                      "attachment"
                    ]
                  },
                  "deleted": {
                    "type": "boolean",
                    "readOnly": true,
                    "description": "Whether the file was deleted when captured. Always false."
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getSyncProtocol",
    "method": "get",
    "path": "/api/sync/protocol",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The sync protocol versions that push and pull accept.",
          "additionalProperties": false,
          "required": [
            "versions"
          ],
          "properties": {
            "versions": {
              "type": "array",
              "readOnly": true,
              "description": "Every served sync protocol version, oldest first. The list is never empty.",
              "minItems": 1,
              "uniqueItems": true,
              "items": {
                "type": "integer",
                "minimum": 1
              }
            },
            "notificationProtocols": {
              "type": "array",
              "readOnly": true,
              "description": "The notice stream subprotocols that this deployment opens now. The list is empty while this process cannot send notices. A server that omits the member predates the notice stream, so the client reads the feed on its own schedule.",
              "maxItems": 1,
              "uniqueItems": true,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeProtocol"
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "getTemplateSettings",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/template-settings",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/TemplateSettings"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "importTheme",
    "method": "post",
    "path": "/api/account/themes",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "A theme to keep for the signed in account: a name and a light palette, a dark palette or both.",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "minProperties": 2,
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of an imported theme, as a person reads it.",
            "minLength": 1,
            "maxLength": 60
          },
          "light": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemePalette"
          },
          "dark": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemePalette"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Preferences"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "inspectWorkspaceExport",
    "method": "head",
    "path": "/api/workspaces/{workspaceId}/export",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": [
      200
    ]
  },
  {
    "id": "listAccounts",
    "method": "get",
    "path": "/api/accounts",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Every account of the installation.",
          "additionalProperties": false,
          "required": [
            "accounts"
          ],
          "properties": {
            "accounts": {
              "type": "array",
              "readOnly": true,
              "description": "The accounts, in the order in which they were made.",
              "maxItems": 10000,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AccountSummary"
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listBacklinks",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}/backlinks",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Live notes that link to one current file path.",
          "additionalProperties": false,
          "required": [
            "backlinks"
          ],
          "properties": {
            "backlinks": {
              "type": "array",
              "readOnly": true,
              "maxItems": 100,
              "items": {
                "type": "object",
                "description": "One live note that links to the requested file path.",
                "additionalProperties": false,
                "required": [
                  "fileId",
                  "path",
                  "revisionId"
                ],
                "properties": {
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared123"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared124"
                  },
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared123"
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listDeletedFiles",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/trash",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "cursor",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "sort",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared125"
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One page of the deleted files of a workspace.",
          "additionalProperties": false,
          "required": [
            "files",
            "nextCursor"
          ],
          "properties": {
            "files": {
              "type": "array",
              "readOnly": true,
              "description": "The deleted files of this page, in the requested order.",
              "maxItems": 500,
              "items": {
                "type": "object",
                "description": "One deleted file of a workspace, without its content.",
                "additionalProperties": false,
                "required": [
                  "fileId",
                  "path",
                  "kind",
                  "headRevisionId",
                  "createdAt",
                  "deletedAt"
                ],
                "properties": {
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared126"
                  },
                  "path": {
                    "allOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                      }
                    ],
                    "readOnly": true,
                    "description": "The path that the file held when it was deleted."
                  },
                  "kind": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared78"
                  },
                  "headRevisionId": {
                    "allOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                      }
                    ],
                    "readOnly": true,
                    "description": "The tombstone revision that deleted the file, which is its accepted head and its entity tag. A restore states it as the expected head."
                  },
                  "createdAt": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared79"
                  },
                  "deletedAt": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Instant at which the workspace accepted the deletion.",
                    "format": "date-time",
                    "maxLength": 64
                  }
                }
              }
            },
            "nextCursor": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared127"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listFiles",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/files",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "cursor",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "sort",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared125"
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One page of the live files of a workspace.",
          "additionalProperties": false,
          "required": [
            "files",
            "nextCursor"
          ],
          "properties": {
            "files": {
              "type": "array",
              "readOnly": true,
              "description": "The files of this page, in the requested order.",
              "maxItems": 500,
              "items": {
                "type": "object",
                "description": "One live file of a workspace, without its content.",
                "additionalProperties": false,
                "required": [
                  "fileId",
                  "path",
                  "kind",
                  "headRevisionId",
                  "createdAt",
                  "updatedAt"
                ],
                "properties": {
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared126"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared77"
                  },
                  "kind": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared78"
                  },
                  "headRevisionId": {
                    "oneOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                      },
                      {
                        "type": "null"
                      }
                    ],
                    "readOnly": true,
                    "description": "The accepted head of the file, which is also its entity tag, or null for a file that has no accepted revision yet."
                  },
                  "createdAt": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared79"
                  },
                  "updatedAt": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
                  }
                }
              }
            },
            "nextCursor": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared127"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listHistory",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}/history",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "cursor",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "cursor": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One page of file history revisions.",
          "additionalProperties": false,
          "required": [
            "revisions",
            "nextCursor"
          ],
          "properties": {
            "revisions": {
              "type": "array",
              "items": {
                "type": "object",
                "description": "One historic revision of a file.",
                "additionalProperties": false,
                "required": [
                  "revisionId",
                  "fileId",
                  "path",
                  "deleted",
                  "parents",
                  "digest",
                  "size",
                  "actorAccountId",
                  "clientTime",
                  "serverTime",
                  "message",
                  "isCheckpoint",
                  "checkpointName",
                  "restoredFrom",
                  "text",
                  "objectId",
                  "merged"
                ],
                "properties": {
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
                  },
                  "deleted": {
                    "type": "boolean"
                  },
                  "parents": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
                  },
                  "digest": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                  },
                  "size": {
                    "type": "integer"
                  },
                  "actorAccountId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "clientTime": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "serverTime": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "message": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
                  },
                  "isCheckpoint": {
                    "type": "boolean"
                  },
                  "checkpointName": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
                  },
                  "restoredFrom": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
                  },
                  "text": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "objectId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
                  },
                  "merged": {
                    "type": "boolean",
                    "description": "True when the save that made this revision joined work that its device had not seen. History marks the revision on every device."
                  }
                }
              }
            },
            "nextCursor": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listInvitations",
    "method": "get",
    "path": "/api/invitations",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The invitations that nobody used or revoked.",
          "additionalProperties": false,
          "required": [
            "invitations"
          ],
          "properties": {
            "invitations": {
              "type": "array",
              "readOnly": true,
              "description": "The invitations, newest first.",
              "maxItems": 10000,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Invitation"
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listPublishedLinks",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/publications",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Every published link of one workspace. No entry holds a token.",
          "additionalProperties": false,
          "required": [
            "links"
          ],
          "properties": {
            "links": {
              "type": "array",
              "readOnly": true,
              "description": "One entry for each link that the workspace holds.",
              "maxItems": 200,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedLink"
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listReports",
    "method": "get",
    "path": "/api/reports",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The open reports of published links.",
          "additionalProperties": false,
          "required": [
            "reports"
          ],
          "properties": {
            "reports": {
              "type": "array",
              "readOnly": true,
              "description": "The open reports, newest first.",
              "maxItems": 10000,
              "items": {
                "type": "object",
                "description": "One open report of a published link, as an administrator reads it. It holds no fact of a note and no fact of the workspace.",
                "additionalProperties": false,
                "required": [
                  "reportId",
                  "publicationId",
                  "reason",
                  "note",
                  "address",
                  "linkState",
                  "createdAt"
                ],
                "properties": {
                  "reportId": {
                    "allOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                      }
                    ],
                    "readOnly": true,
                    "description": "Identifier of the report."
                  },
                  "publicationId": {
                    "allOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                      }
                    ],
                    "readOnly": true,
                    "description": "Identifier of the reported link. Two reports of one link name the same value. It opens nothing."
                  },
                  "reason": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReportReason"
                  },
                  "note": {
                    "oneOf": [
                      {
                        "type": "string",
                        "maxLength": 2000
                      },
                      {
                        "type": "null"
                      }
                    ],
                    "readOnly": true,
                    "description": "What the reader added, or null."
                  },
                  "address": {
                    "oneOf": [
                      {
                        "type": "string",
                        "maxLength": 2048
                      },
                      {
                        "type": "null"
                      }
                    ],
                    "readOnly": true,
                    "description": "The address of the reported link, which the administrator opens as any reader does. It is null when the server cannot open the sealed address, for example after a change of its secret."
                  },
                  "linkState": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Whether the link opens now, an administrator took it down, or it stopped for another cause.",
                    "enum": [
                      "live",
                      "taken-down",
                      "stopped"
                    ]
                  },
                  "createdAt": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Instant of the report.",
                    "format": "date-time",
                    "maxLength": 64
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listSessions",
    "method": "get",
    "path": "/api/account/sessions",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Every session of the signed in account.",
          "additionalProperties": false,
          "required": [
            "sessions"
          ],
          "properties": {
            "sessions": {
              "type": "array",
              "readOnly": true,
              "description": "The sessions, the current one first, then newest first.",
              "maxItems": 1000,
              "items": {
                "type": "object",
                "description": "One session of the signed in account, on one device. It holds no token, so a read of the list opens no session.",
                "additionalProperties": false,
                "required": [
                  "sessionId",
                  "current",
                  "userAgent",
                  "createdAt",
                  "lastActiveAt",
                  "expiresAt"
                ],
                "properties": {
                  "sessionId": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Identifier of the session. It is not the token.",
                    "minLength": 1,
                    "maxLength": 128
                  },
                  "current": {
                    "type": "boolean",
                    "readOnly": true,
                    "description": "True for the session of the device that reads the list."
                  },
                  "userAgent": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "readOnly": true,
                    "description": "What the browser of the session said it is, or null when it said nothing.",
                    "maxLength": 512
                  },
                  "createdAt": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Instant at which the session started.",
                    "format": "date-time",
                    "maxLength": 64
                  },
                  "lastActiveAt": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Instant at which the session was last used.",
                    "format": "date-time",
                    "maxLength": 64
                  },
                  "expiresAt": {
                    "type": "string",
                    "readOnly": true,
                    "description": "Instant at which the session ends if nobody uses it.",
                    "format": "date-time",
                    "maxLength": 64
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "listWorkspaces",
    "method": "get",
    "path": "/api/workspaces",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Every workspace of the signed in account.",
          "additionalProperties": false,
          "required": [
            "workspaces"
          ],
          "properties": {
            "workspaces": {
              "type": "array",
              "readOnly": true,
              "description": "One entry for each workspace the account belongs to.",
              "maxItems": 1000,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Workspace"
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "openPublishedPage",
    "method": "post",
    "path": "/published/{token}",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "note",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared113"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "note": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedNoteReference"
          }
        },
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The one field of the password form of a published page. A served page holds no script, so the browser sends the field in the form encoding of HTML and the server reads one name from it.",
        "additionalProperties": false,
        "required": [
          "password"
        ],
        "properties": {
          "password": {
            "type": "string",
            "writeOnly": true,
            "description": "The password that the owner gave the link. Any value is accepted here and a wrong value answers the same page, so the answer states nothing about the link or about the password policy. An empty value is accepted as well, because a form that a person sends empty is a wrong password and answers the same page.",
            "maxLength": 512
          }
        }
      },
      "bodyMediaType": "application/x-www-form-urlencoded"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/html",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedDocument"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "openSyncNotices",
    "method": "get",
    "path": "/api/sync/notices",
    "protocol": "sync-notices",
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "sec-websocket-protocol",
        "location": "header",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "x-request-id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[A-Za-z0-9._-]+$"
          },
          "sec-websocket-protocol": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeProtocol"
          }
        },
        "required": [
          "sec-websocket-protocol"
        ]
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": [
      101
    ]
  },
  {
    "id": "previewPurge",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/purge/preview",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Payload to preview permanent deletion of files.",
        "additionalProperties": false,
        "required": [
          "fileIds"
        ],
        "properties": {
          "fileIds": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared129"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Summary preview of an intended permanent file purge.",
          "additionalProperties": false,
          "required": [
            "fileIds",
            "revisionIds",
            "contentDigests",
            "attachmentObjectIds",
            "blockingReferences",
            "dependentRevisionCount",
            "reclaimableBytes",
            "canPurge"
          ],
          "properties": {
            "fileIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
            },
            "revisionIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
            },
            "contentDigests": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "attachmentObjectIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
            },
            "blockingReferences": {
              "type": "array",
              "items": {
                "type": "object",
                "description": "A reference that blocks permanent deletion.",
                "additionalProperties": false,
                "required": [
                  "kind",
                  "targetId",
                  "referrerId",
                  "description"
                ],
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "revision"
                    ]
                  },
                  "targetId": {
                    "type": "string"
                  },
                  "referrerId": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  }
                }
              }
            },
            "dependentRevisionCount": {
              "type": "integer"
            },
            "reclaimableBytes": {
              "type": "integer"
            },
            "canPurge": {
              "type": "boolean"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "purgeFiles",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/purge",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Payload to permanently purge files.",
        "additionalProperties": false,
        "required": [
          "mutationId",
          "fileIds"
        ],
        "properties": {
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "fileIds": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared129"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Outcome of executed permanent file purge.",
          "additionalProperties": false,
          "required": [
            "mutationId",
            "purgedFileIds",
            "purgedRevisionIds",
            "reclaimedBytes"
          ],
          "properties": {
            "mutationId": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
            },
            "purgedFileIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
            },
            "purgedRevisionIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared128"
            },
            "reclaimedBytes": {
              "type": "integer"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "readInvitation",
    "method": "post",
    "path": "/api/registrations/invitation",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The token of the invitation to read.",
        "additionalProperties": false,
        "required": [
          "invitation"
        ],
        "properties": {
          "invitation": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared130"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The address that a valid invitation binds.",
          "additionalProperties": false,
          "required": [
            "email"
          ],
          "properties": {
            "email": {
              "allOf": [
                {
                  "type": "string",
                  "description": "A sign-in address.",
                  "format": "email",
                  "minLength": 3,
                  "maxLength": 320
                }
              ],
              "readOnly": true,
              "description": "The address of the new account."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "registerAccount",
    "method": "post",
    "path": "/api/registrations",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "What a person gives to make an account. The address comes from the invitation.",
        "additionalProperties": false,
        "required": [
          "invitation",
          "password"
        ],
        "properties": {
          "invitation": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared130"
          },
          "password": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared131"
          },
          "name": {
            "type": "string",
            "description": "The display name of the new account.",
            "minLength": 1,
            "maxLength": 256
          },
          "consent": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ConsentInput"
              }
            ],
            "description": "The versions of the terms and of the privacy notice that the person accepted. It is required when the installation names both documents (record 0120)."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Confirmation that the account exists and that its session started.",
          "additionalProperties": false,
          "required": [
            "registered"
          ],
          "properties": {
            "registered": {
              "type": "boolean",
              "readOnly": true,
              "description": "Always true."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "removeAccount",
    "method": "delete",
    "path": "/api/accounts/{accountId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "accountId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared132"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "removeLegalDocument",
    "method": "delete",
    "path": "/api/installation/legal/{document}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "document",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared107"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "removeMailSettings",
    "method": "delete",
    "path": "/api/installation/mail",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "removeOwnAccount",
    "method": "post",
    "path": "/api/account/removal",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The password of the account that removes itself.",
        "additionalProperties": false,
        "required": [
          "password"
        ],
        "properties": {
          "password": {
            "type": "string",
            "description": "The current password of the account.",
            "minLength": 1,
            "maxLength": 512,
            "writeOnly": true
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "reportPublishedLink",
    "method": "post",
    "path": "/published/{token}/report",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared113"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The fields of the report form of a published page. The page holds no script, so the browser sends the fields in the form encoding of HTML.",
        "additionalProperties": false,
        "required": [
          "reason"
        ],
        "properties": {
          "reason": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReportReason"
          },
          "note": {
            "type": "string",
            "writeOnly": true,
            "description": "What the reader adds for the administrator. An empty value is the same as no note.",
            "maxLength": 2000
          }
        }
      },
      "bodyMediaType": "application/x-www-form-urlencoded"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "text/html",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedDocument"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "requestPasswordReset",
    "method": "post",
    "path": "/api/auth/request-password-reset",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The address that asks for a password reset message.",
        "additionalProperties": false,
        "required": [
          "email"
        ],
        "properties": {
          "email": {
            "type": "string",
            "description": "Sign-in address of the account.",
            "format": "email",
            "minLength": 3,
            "maxLength": 320
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AuthOutcome"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "resetPassword",
    "method": "post",
    "path": "/api/auth/reset-password",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The new password and the token from the reset message.",
        "additionalProperties": false,
        "required": [
          "newPassword"
        ],
        "properties": {
          "newPassword": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Password"
              }
            ],
            "description": "New password of the account."
          },
          "token": {
            "type": "string",
            "description": "Token from the reset message.",
            "minLength": 1,
            "maxLength": 512
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AuthOutcome"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "restoreFile",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/trash/{fileId}/restore",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Payload to bring one deleted file back into the file tree.",
        "additionalProperties": false,
        "required": [
          "mutationId",
          "deviceId",
          "clientTime",
          "revisionId"
        ],
        "properties": {
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
          },
          "clientTime": {
            "type": "string",
            "format": "date-time",
            "minLength": 20,
            "maxLength": 64
          },
          "revisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileChange"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "restoreRevision",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}/restore",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Payload to restore a file to an earlier historic revision.",
        "additionalProperties": false,
        "required": [
          "mutationId",
          "deviceId",
          "clientTime",
          "targetRevisionId",
          "revisionId"
        ],
        "properties": {
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
          },
          "clientTime": {
            "type": "string",
            "format": "date-time",
            "minLength": 20,
            "maxLength": 64
          },
          "targetRevisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "expectedHead": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
          },
          "revisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "path": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedChangeset"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "revokeInvitation",
    "method": "delete",
    "path": "/api/invitations/{invitationId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "invitationId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "invitationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "invitationId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "revokeOtherSessions",
    "method": "delete",
    "path": "/api/account/sessions/others",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "How many sessions ended.",
          "additionalProperties": false,
          "required": [
            "revoked"
          ],
          "properties": {
            "revoked": {
              "type": "integer",
              "readOnly": true,
              "description": "The number of sessions that ended.",
              "minimum": 0
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "revokePublishedLink",
    "method": "delete",
    "path": "/api/workspaces/{workspaceId}/publications/{publicationId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "publicationId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspaceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "publicationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          }
        },
        "required": [
          "publicationId",
          "workspaceId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "revokeSession",
    "method": "delete",
    "path": "/api/account/sessions/{sessionId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "sessionId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "sessionId": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128,
            "pattern": "^[A-Za-z0-9_-]+$"
          }
        },
        "required": [
          "sessionId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "searchFiles",
    "method": "get",
    "path": "/api/workspaces/{workspaceId}/search",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "query",
        "location": "query",
        "required": true,
        "style": "form",
        "explode": true
      },
      {
        "name": "limit",
        "location": "query",
        "required": false,
        "style": "form",
        "explode": true
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "minLength": 1,
            "maxLength": 256
          },
          "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 100
          }
        },
        "required": [
          "query"
        ],
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Search results from current accepted note revisions.",
          "additionalProperties": false,
          "required": [
            "hits"
          ],
          "properties": {
            "hits": {
              "type": "array",
              "readOnly": true,
              "maxItems": 100,
              "items": {
                "type": "object",
                "description": "One accepted live note that matched a search.",
                "additionalProperties": false,
                "required": [
                  "fileId",
                  "path",
                  "revisionId",
                  "excerpt"
                ],
                "properties": {
                  "fileId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared123"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared124"
                  },
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared123"
                  },
                  "excerpt": {
                    "type": "array",
                    "readOnly": true,
                    "description": "The matching part of the note, in reading order, as the plain text that a reader sees: no Markdown mark and no link address.",
                    "maxItems": 128,
                    "items": {
                      "type": "object",
                      "description": "One part of a search excerpt. A part with `marked` true is a word that the query matched. The excerpt quotes the text that a reader sees, with no Markdown mark and no link address, and it carries no markup, so a reader renders every part as text and decides itself how a marked part looks.",
                      "additionalProperties": false,
                      "required": [
                        "text",
                        "marked"
                      ],
                      "properties": {
                        "text": {
                          "type": "string",
                          "readOnly": true,
                          "maxLength": 1024
                        },
                        "marked": {
                          "type": "boolean",
                          "readOnly": true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "sendTestMessage",
    "method": "post",
    "path": "/api/installation/mail/test",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Where the test message went.",
          "additionalProperties": false,
          "required": [
            "to"
          ],
          "properties": {
            "to": {
              "allOf": [
                {
                  "type": "string",
                  "description": "A sign-in address.",
                  "format": "email",
                  "minLength": 3,
                  "maxLength": 320
                }
              ],
              "readOnly": true
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "sendWorkspaceImportPart",
    "method": "put",
    "path": "/api/workspaces/{workspaceId}/imports/{importId}/parts/{partNumber}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "importId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "partNumber",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspaceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "importId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
          },
          "partNumber": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          }
        },
        "required": [
          "importId",
          "partNumber",
          "workspaceId"
        ],
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "string",
        "format": "binary",
        "description": "The bytes of one part of a portable workspace zip archive."
      },
      "bodyMediaType": "application/octet-stream"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "One part of an import that the server stored.",
          "additionalProperties": false,
          "required": [
            "partNumber",
            "size"
          ],
          "properties": {
            "partNumber": {
              "type": "integer",
              "minimum": 1,
              "description": "The place of the part in the archive, from 1."
            },
            "size": {
              "type": "integer",
              "minimum": 1,
              "description": "The bytes of the part that the server stored."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 408,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 507,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "signInWithPassword",
    "method": "post",
    "path": "/api/auth/sign-in/email",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Address and password of a local account.",
        "additionalProperties": false,
        "required": [
          "email",
          "password"
        ],
        "properties": {
          "email": {
            "type": "string",
            "description": "Sign-in address of the account.",
            "format": "email",
            "minLength": 3,
            "maxLength": 320
          },
          "password": {
            "type": "string",
            "description": "Password of the account.",
            "minLength": 1,
            "maxLength": 512
          },
          "rememberMe": {
            "type": "boolean",
            "description": "Whether the session survives a browser restart."
          },
          "callbackURL": {
            "type": "string",
            "description": "Address to open after a completed sign-in.",
            "maxLength": 2048
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The result of a completed sign-in. It never carries the session token: the browser already holds that value in an HttpOnly cookie, and the protocol adapter removes it from this answer.",
          "additionalProperties": true,
          "required": [
            "redirect"
          ],
          "properties": {
            "redirect": {
              "type": "boolean",
              "readOnly": true,
              "description": "Whether the caller should follow a redirect."
            },
            "token": {
              "not": {},
              "description": "Never present. The adapter removes the session token from this answer."
            },
            "url": {
              "type": "string",
              "readOnly": true,
              "description": "Address to open, when the answer asks for a redirect.",
              "maxLength": 2048
            },
            "user": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AuthUser"
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "signOut",
    "method": "post",
    "path": "/api/auth/sign-out",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Sign-out carries no data. The session cookie names it.",
        "additionalProperties": false,
        "properties": {}
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Whether the session was ended.",
          "additionalProperties": true,
          "required": [
            "success"
          ],
          "properties": {
            "success": {
              "type": "boolean",
              "readOnly": true,
              "description": "True when the session no longer exists."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "signUpAccount",
    "method": "post",
    "path": "/api/registrations/open",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "What a person gives to ask for an account under open registration.",
        "additionalProperties": false,
        "required": [
          "email",
          "password",
          "proof"
        ],
        "properties": {
          "email": {
            "allOf": [
              {
                "type": "string",
                "description": "A sign-in address.",
                "format": "email",
                "minLength": 3,
                "maxLength": 320
              }
            ],
            "description": "The address of the new account. A link goes to it."
          },
          "password": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared131"
          },
          "name": {
            "type": "string",
            "description": "The display name of the new account.",
            "minLength": 1,
            "maxLength": 256
          },
          "proof": {
            "allOf": [
              {
                "type": "object",
                "description": "The solution of one challenge of the proof of work.",
                "additionalProperties": false,
                "required": [
                  "challenge",
                  "solution"
                ],
                "properties": {
                  "challenge": {
                    "type": "string",
                    "description": "The signed challenge, as the server answered it.",
                    "minLength": 1,
                    "maxLength": 512,
                    "pattern": "^[A-Za-z0-9_.-]+$"
                  },
                  "solution": {
                    "type": "string",
                    "description": "The solution that the browser found.",
                    "minLength": 1,
                    "maxLength": 32,
                    "pattern": "^[0-9a-z]+$"
                  }
                }
              }
            ],
            "description": "The proof of work of this sign-up (record 0115)."
          },
          "consent": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ConsentInput"
              }
            ],
            "description": "The versions of the legal documents that the person accepts. It is required when the installation names its documents (record 0120)."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 202,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The one answer of a sign-up. It is the same for every address, so it states nothing about the address.",
          "additionalProperties": false,
          "required": [
            "accepted"
          ],
          "properties": {
            "accepted": {
              "type": "boolean",
              "const": true,
              "readOnly": true,
              "description": "The server took the request and sent a message if it could."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "startSnapshot",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/sync/snapshots",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Snapshot start payload.",
        "additionalProperties": false,
        "required": [
          "syncVersion"
        ],
        "properties": {
          "syncVersion": {
            "type": "integer",
            "description": "Sync protocol version of the client. Only version 1 is served; any other value is rejected without changing data.",
            "enum": [
              1
            ]
          },
          "pageSize": {
            "type": "integer",
            "description": "Largest number of snapshot items in one page. The server uses 100 when the value is absent and never stores more than 500.",
            "minimum": 1,
            "maximum": 500
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The captured snapshot and its opaque page token.",
          "additionalProperties": false,
          "required": [
            "token",
            "expiresAt",
            "cursor",
            "itemCount",
            "pageSize"
          ],
          "properties": {
            "token": {
              "type": "string",
              "readOnly": true,
              "description": "Opaque token that addresses the materialized pages for 15 minutes.",
              "minLength": 43,
              "maxLength": 43,
              "pattern": "^[A-Za-z0-9_-]{43}$"
            },
            "expiresAt": {
              "type": "string",
              "readOnly": true,
              "description": "Instant at which the snapshot expires.",
              "format": "date-time"
            },
            "cursor": {
              "type": "string",
              "readOnly": true,
              "description": "The captured high-water cursor. A sync client asks for changes after this position.",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[0-9]+$"
            },
            "itemCount": {
              "type": "integer",
              "readOnly": true,
              "description": "How many items the snapshot captured.",
              "minimum": 0
            },
            "pageSize": {
              "type": "integer",
              "readOnly": true,
              "description": "The page size stored with the snapshot.",
              "minimum": 1,
              "maximum": 500
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 503,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "startWorkspaceImport",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/imports",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The size of the zip archive that one import sends.",
        "additionalProperties": false,
        "required": [
          "size"
        ],
        "properties": {
          "size": {
            "type": "integer",
            "minimum": 1,
            "maximum": 9007199254740991,
            "description": "The bytes of the whole archive. An archive above the bound of one import answers payload_too_large before a part is sent."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "An import upload that waits for its parts.",
          "additionalProperties": false,
          "required": [
            "importId",
            "partBytes"
          ],
          "properties": {
            "importId": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                }
              ],
              "description": "The identifier that each part and the completion name."
            },
            "partBytes": {
              "type": "integer",
              "minimum": 1,
              "description": "The bytes of each part but the last. The last part holds the rest of the archive."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 507,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "takeDownReportedLink",
    "method": "post",
    "path": "/api/reports/{reportId}/takedown",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "reportId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared65"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": null,
      "bodyMediaType": null
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Removed"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "unlockPublishedLink",
    "method": "post",
    "path": "/published/{token}/unlock",
    "protocol": null,
    "security": [],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "token",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared113"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The password of one published link.",
        "additionalProperties": false,
        "required": [
          "password"
        ],
        "properties": {
          "password": {
            "type": "string",
            "writeOnly": true,
            "description": "The password that the owner gave the link. Any value is accepted here and a wrong value takes the one refusal, so the answer states nothing about the link or about the password policy.",
            "minLength": 1,
            "maxLength": 512
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The reading ticket of one link. The reader carries it in the address of every later call to that link. No cookie is set.",
          "additionalProperties": false,
          "required": [
            "ticket",
            "expiresAt"
          ],
          "properties": {
            "ticket": {
              "allOf": [
                {
                  "type": "string",
                  "description": "The value that a reader carries after it gives the password of a link. It is bound to that one link, it lives 12 hours, and a read does not move its expiry. The server keeps only a digest of it.",
                  "pattern": "^[A-Za-z0-9_-]{22,64}$",
                  "minLength": 22,
                  "maxLength": 64
                }
              ],
              "readOnly": true,
              "description": "The ticket. It opens this one link and nothing else."
            },
            "expiresAt": {
              "type": "string",
              "readOnly": true,
              "description": "Instant at which the ticket stops. A read does not move it, so a reader that returns later gives the password again.",
              "format": "date-time",
              "maxLength": 64
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedRefusal"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateAccount",
    "method": "patch",
    "path": "/api/accounts/{accountId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "accountId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared132"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The facts of an account that an administrator changes. A member that is absent keeps its stored value.",
        "additionalProperties": false,
        "minProperties": 1,
        "properties": {
          "installationRole": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/InstallationRole"
              }
            ],
            "description": "The new role of the account in the installation."
          },
          "state": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AccountState"
              }
            ],
            "description": "The new state. A disabled account loses every session and gets no new one."
          },
          "limitBytes": {
            "type": "integer",
            "description": "The new limit of the account, in bytes.",
            "minimum": 1,
            "maximum": 9007199254740991
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AccountSummary"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateDailyNoteSettings",
    "method": "put",
    "path": "/api/workspaces/{workspaceId}/daily-note-settings",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The settings of daily notes to store for the signed in member.",
        "additionalProperties": false,
        "required": [
          "templateFileId",
          "openOnStart",
          "folder",
          "format"
        ],
        "properties": {
          "templateFileId": {
            "oneOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              },
              {
                "type": "null"
              }
            ],
            "description": "A live note of this workspace whose text a new daily note starts with, or null for a daily note that starts empty."
          },
          "openOnStart": {
            "type": "boolean",
            "description": "True to open the note of today when the application starts."
          },
          "folder": {
            "type": "string",
            "description": "The folder that holds every daily note, or an empty text for the top of the workspace.",
            "maxLength": 1024
          },
          "format": {
            "type": "string",
            "description": "The name of a daily note as date tokens, where a slash makes folders, for example YYYY/MM/YYYY-MM-DD dddd.",
            "minLength": 1,
            "maxLength": 255
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DailyNoteSettings"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateFile",
    "method": "put",
    "path": "/api/workspaces/{workspaceId}/files/{fileId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "fileId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      },
      {
        "name": "if-match",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared56"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The identifiers and the new content or path of a file.",
        "additionalProperties": false,
        "required": [
          "revisionId",
          "mutationId",
          "deviceId"
        ],
        "properties": {
          "revisionId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared66"
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared57"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared38"
          },
          "path": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
              }
            ],
            "description": "New path of the file. The path of the expected head is kept when this member is absent."
          },
          "document": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DocumentSave"
              }
            ],
            "description": "The document work of this save. The text of the expected head is kept when this member is absent, which is how a plain rename is written."
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared18"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FileChange"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 410,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 412,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 428,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateInstallation",
    "method": "put",
    "path": "/api/installation",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The settings of the installation that an administrator changes.",
        "additionalProperties": false,
        "required": [
          "registrationPolicy"
        ],
        "properties": {
          "registrationPolicy": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/RegistrationPolicy"
              }
            ],
            "description": "Who can make an account. The server refuses open until the installation has every part that open registration needs."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateLegalDocument",
    "method": "put",
    "path": "/api/installation/legal/{document}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "document",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared107"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "One legal document that an administrator sets: a text with the kind text, or an address with the kind address, and its version.",
        "additionalProperties": false,
        "required": [
          "kind",
          "version"
        ],
        "properties": {
          "kind": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/LegalDocumentKind"
          },
          "text": {
            "type": "string",
            "description": "The Markdown text of the document, for the kind text.",
            "minLength": 1,
            "maxLength": 262144
          },
          "url": {
            "type": "string",
            "description": "The address of the document, for the kind address.",
            "format": "uri",
            "maxLength": 2048
          },
          "version": {
            "type": "string",
            "description": "The version of the document. A new version asks every account to accept again.",
            "minLength": 1,
            "maxLength": 64
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateMailSettings",
    "method": "put",
    "path": "/api/installation/mail",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The mail transport that an administrator sets.",
        "additionalProperties": false,
        "required": [
          "host",
          "port",
          "security",
          "sender"
        ],
        "properties": {
          "host": {
            "type": "string",
            "description": "The host name of the mail server.",
            "minLength": 1,
            "maxLength": 253
          },
          "port": {
            "type": "integer",
            "description": "The port of the mail server.",
            "minimum": 1,
            "maximum": 65535
          },
          "security": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MailSecurity"
          },
          "username": {
            "type": "string",
            "description": "The user name that signs in to the mail server. Leave it out for a server that takes mail with no sign-in.",
            "minLength": 1,
            "maxLength": 320
          },
          "password": {
            "type": "string",
            "writeOnly": true,
            "description": "The password of the user name. Leave it out to keep the stored one.",
            "minLength": 1,
            "maxLength": 1024
          },
          "sender": {
            "type": "string",
            "description": "The sender of every message, an address or a name and an address, for example tidy notebook <no-reply@notes.example.com>.",
            "minLength": 3,
            "maxLength": 320
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Installation"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 409,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updatePreferences",
    "method": "put",
    "path": "/api/account/preferences",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Settings to store for the signed in account. A member that the body leaves out keeps its stored value, so a client changes one setting without the others.",
        "additionalProperties": false,
        "minProperties": 1,
        "properties": {
          "appearance": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Appearance"
              }
            ],
            "description": "The appearance choice to store."
          },
          "themeFamily": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeFamily"
              }
            ],
            "description": "The theme family to store."
          },
          "spellCheck": {
            "type": "boolean",
            "description": "Whether the editor checks the spelling of a note."
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Preferences"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateProfile",
    "method": "post",
    "path": "/api/auth/update-user",
    "protocol": "better-auth",
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The display name of the signed in account.",
        "additionalProperties": false,
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "type": "string",
            "description": "Display name of the account.",
            "minLength": 1,
            "maxLength": 256,
            "pattern": "^\\S(?:[\\s\\S]*\\S)?$"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AuthOutcome"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateTemplateSettings",
    "method": "put",
    "path": "/api/workspaces/{workspaceId}/template-settings",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The template settings to store for the signed in member.",
        "additionalProperties": false,
        "required": [
          "folder"
        ],
        "properties": {
          "folder": {
            "type": "string",
            "description": "The folder whose notes are the templates, as a folder path with no slash at either end.",
            "minLength": 1,
            "maxLength": 1024
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/TemplateSettings"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "updateWorkspace",
    "method": "put",
    "path": "/api/workspaces/{workspaceId}",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/WorkspaceNameInput"
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Workspace"
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "uploadAttachment",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/attachments",
    "protocol": null,
    "security": [
      {
        "sessionCookie": []
      }
    ],
    "parameters": [
      {
        "name": "x-request-id",
        "location": "header",
        "required": false,
        "style": "simple",
        "explode": false
      },
      {
        "name": "workspaceId",
        "location": "path",
        "required": true,
        "style": "simple",
        "explode": false
      }
    ],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared2"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Multipart form upload payload that contains the binary attachment file.",
        "additionalProperties": false,
        "required": [
          "file"
        ],
        "properties": {
          "file": {
            "type": "string",
            "format": "binary",
            "description": "Binary bytes of the image attachment."
          }
        }
      },
      "bodyMediaType": "multipart/form-data"
    },
    "responses": [
      {
        "status": 201,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The uploaded temporary attachment object and its verified digest.",
          "additionalProperties": false,
          "required": [
            "objectId",
            "digest",
            "size",
            "mediaType",
            "width",
            "height"
          ],
          "properties": {
            "objectId": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                }
              ],
              "description": "Unique identifier of the uploaded attachment object."
            },
            "digest": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                }
              ],
              "description": "SHA-256 digest of the validated image bytes."
            },
            "size": {
              "type": "integer",
              "minimum": 1,
              "description": "Size of the attachment in bytes."
            },
            "mediaType": {
              "type": "string",
              "description": "Validated MIME type of the uploaded image.",
              "enum": [
                "image/png",
                "image/jpeg",
                "image/gif",
                "image/webp"
              ]
            },
            "width": {
              "type": "integer",
              "minimum": 1,
              "description": "Width of the image in pixels."
            },
            "height": {
              "type": "integer",
              "minimum": 1,
              "description": "Height of the image in pixels."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 401,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 404,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 408,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 422,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  },
  {
    "id": "verifyAddress",
    "method": "post",
    "path": "/api/registrations/verification",
    "protocol": null,
    "security": [],
    "parameters": [],
    "request": {
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {}
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The token that a verification link carries in its fragment.",
        "additionalProperties": false,
        "required": [
          "token"
        ],
        "properties": {
          "token": {
            "type": "string",
            "description": "The token of the verification link.",
            "minLength": 1,
            "maxLength": 512,
            "pattern": "^[A-Za-z0-9_.-]+$"
          }
        }
      },
      "bodyMediaType": "application/json"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The address that the verification proved. Its account now exists.",
          "additionalProperties": false,
          "required": [
            "email"
          ],
          "properties": {
            "email": {
              "allOf": [
                {
                  "type": "string",
                  "description": "A sign-in address.",
                  "format": "email",
                  "minLength": 3,
                  "maxLength": 320
                }
              ],
              "readOnly": true,
              "description": "The address of the new account, which signs in now."
            }
          }
        }
      },
      {
        "status": 400,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 403,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 413,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 415,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 429,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      },
      {
        "status": 500,
        "mediaType": "application/problem+json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ProblemDetails"
        }
      }
    ],
    "noContent": []
  }
];

/** Every channel of `packages/api-contract/asyncapi.yaml`. */
export type ChannelId = 'syncNotices';

/** Who sends a message: the browser or the server. */
export type MessageDirection = 'client' | 'server';

/** The kind of every message that a client sends. */
export type ClientMessageKind = 'subscribe';

/** The kind of every message that the server sends. */
export type ServerMessageKind = 'changed' | 'ready' | 'reconcile' | 'refused' | 'stop' | 'subscribed';

/** One message of a channel and the schema of its payload. */
export type MessageEntry = {
  /** The value of the `kind` member, which names the message. */
  readonly kind: ClientMessageKind | ServerMessageKind;
  readonly direction: MessageDirection;
  readonly schema: JsonSchema;
};

/** One WebSocket channel and the HTTP upgrade operation that opens it. */
export type ChannelEntry = {
  readonly id: ChannelId;
  readonly address: string;
  readonly operationId: OperationId;
  /** The one WebSocket subprotocol of the channel. */
  readonly subprotocol: string;
  readonly messages: readonly MessageEntry[];
};

export const channels: readonly ChannelEntry[] = [
  {
    "id": "syncNotices",
    "address": "/api/sync/notices",
    "operationId": "openSyncNotices",
    "subprotocol": "notesapp.sync.1",
    "messages": [
      {
        "kind": "changed",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "A commit changed the feed of one subscribed workspace. The client reads the feed of that workspace through the HTTP operations. The notice carries no cursor and no content, and only an applied feed page moves the stored cursor. A missed or repeated notice changes no result.",
          "additionalProperties": false,
          "required": [
            "kind",
            "generation",
            "workspaceId"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "changed"
            },
            "generation": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeGeneration"
            },
            "workspaceId": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
            }
          }
        }
      },
      {
        "kind": "ready",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The first message of the server on a new connection. It names the account of the session that opened the stream. The connection holds no subscription until the client sends a set.",
          "additionalProperties": false,
          "required": [
            "kind",
            "accountId"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "ready"
            },
            "accountId": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
            }
          }
        }
      },
      {
        "kind": "reconcile",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The server could have missed a commit, for example after its database listener reconnected. The client reads the feed of every workspace of the set.",
          "additionalProperties": false,
          "required": [
            "kind",
            "generation"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "reconcile"
            },
            "generation": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeGeneration"
            }
          }
        }
      },
      {
        "kind": "refused",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The server refused a subscription set as a whole. The set before it stays in force. `forbidden` means that the account cannot read one workspace of the set, so the client asks the HTTP operations which access it holds. `stale_generation` means that the generation is not above the last one.",
          "additionalProperties": false,
          "required": [
            "kind",
            "generation",
            "reason"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "refused"
            },
            "generation": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeGeneration"
            },
            "reason": {
              "type": "string",
              "enum": [
                "forbidden",
                "stale_generation"
              ]
            }
          }
        }
      },
      {
        "kind": "stop",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The last message before the server closes the stream. The client keeps its local work in every case. `session_ended` means that the session or the account is no longer valid, so the client checks the session through the HTTP operations and does not reconnect. `malformed` means that the client sent a message outside this contract, so it does not reconnect with the same build. `draining` and `overloaded` ask the client to reconnect after a delay. `unavailable` means that the server cannot send notices now, so the client reads the feed on its own schedule and tries the stream again later.",
          "additionalProperties": false,
          "required": [
            "kind",
            "reason"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "stop"
            },
            "reason": {
              "type": "string",
              "enum": [
                "session_ended",
                "malformed",
                "draining",
                "overloaded",
                "unavailable"
              ]
            }
          }
        }
      },
      {
        "kind": "subscribe",
        "direction": "client",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The complete set of workspaces that the client wants notices for. It replaces the set before it as a whole. The server checks the access of the account to every workspace before it accepts the set, and refuses the whole set when one check fails. An empty set stops every notice.",
          "additionalProperties": false,
          "required": [
            "kind",
            "generation",
            "workspaceIds"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "subscribe"
            },
            "generation": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeGeneration"
            },
            "workspaceIds": {
              "type": "array",
              "description": "Every workspace of the set, at most as many as one workspace list holds.",
              "maxItems": 1000,
              "uniqueItems": true,
              "items": {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
              }
            }
          }
        }
      },
      {
        "kind": "subscribed",
        "direction": "server",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "The server accepted a subscription set and registered it. A commit after this message sends a notice. The client reads each workspace of the set from its stored cursor after this message, so a commit before it is not lost.",
          "additionalProperties": false,
          "required": [
            "kind",
            "generation"
          ],
          "properties": {
            "kind": {
              "type": "string",
              "const": "subscribed"
            },
            "generation": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SyncNoticeGeneration"
            }
          }
        }
      }
    ]
  }
];
