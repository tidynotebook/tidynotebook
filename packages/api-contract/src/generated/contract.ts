/*
 * Generated from packages/api-contract/openapi.yaml by tools/sdk-codegen.
 * Do not edit by hand. Run `pnpm generate` after a contract change.
 */

import type { SchemaObject } from 'ajv';

/** Every operation id declared by the contract. */
export type OperationId =
  | 'commitChangeset'
  | 'createFile'
  | 'createOwner'
  | 'createPublishedLink'
  | 'createWorkspace'
  | 'deleteFile'
  | 'deleteWorkspace'
  | 'exportNote'
  | 'exportWorkspace'
  | 'finalizeAttachment'
  | 'getAccount'
  | 'getAttachmentRevision'
  | 'getAuthSession'
  | 'getChanges'
  | 'getFile'
  | 'getHealth'
  | 'getPublishedAttachment'
  | 'getPublishedPage'
  | 'getReadiness'
  | 'getRevision'
  | 'getRootHealth'
  | 'getRootReadiness'
  | 'getSetupStatus'
  | 'getSnapshotPage'
  | 'getSyncProtocol'
  | 'importWorkspace'
  | 'listBacklinks'
  | 'listDeletedFiles'
  | 'listFiles'
  | 'listHistory'
  | 'listPublishedLinks'
  | 'listWorkspaces'
  | 'openPublishedPage'
  | 'previewPurge'
  | 'purgeFiles'
  | 'requestPasswordReset'
  | 'resetPassword'
  | 'restoreFile'
  | 'restoreRevision'
  | 'revokePublishedLink'
  | 'searchFiles'
  | 'signInWithPassword'
  | 'signOut'
  | 'startSnapshot'
  | 'unlockPublishedLink'
  | 'updateFile'
  | 'updatePreferences'
  | 'updateWorkspace'
  | 'uploadAttachment';

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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared5"
        },
        "revisionIds": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared6"
        },
        "cursor": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared7"
        },
        "revisions": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared8"
        },
        "superseded": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared17"
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
        "message"
      ],
      "properties": {
        "revisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared9"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared10"
        },
        "parents": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared11"
        },
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared12"
        },
        "deleted": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for a tombstone, which is how a deletion is recorded."
        },
        "digest": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared13"
        },
        "size": {
          "type": "integer",
          "readOnly": true,
          "description": "Size of the content in bytes.",
          "minimum": 0
        },
        "actorAccountId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared14"
        },
        "serverTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared15"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared16"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared49"
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
    "ContentDigest": {
      "type": "string",
      "description": "The SHA-256 digest of the content, in lower case hexadecimal. Content is addressed by this value, so it is verified against the bytes before a revision is accepted.",
      "minLength": 64,
      "maxLength": 64,
      "pattern": "^[0-9a-f]{64}$"
    },
    "DeviceId": {
      "type": "string",
      "description": "The device that submitted the change. It is informational and appears in the history of the workspace.",
      "minLength": 1,
      "maxLength": 128
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared31"
        },
        "accepted": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared32"
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
        "attachmentObjectId",
        "message",
        "restoredFrom",
        "clientTime",
        "serverTime"
      ],
      "properties": {
        "revisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared54"
        },
        "fileId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared55"
        },
        "path": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared56"
        },
        "kind": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared57"
        },
        "deleted": {
          "type": "boolean",
          "readOnly": true,
          "description": "True for a tombstone, which is how a deletion is recorded."
        },
        "parents": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared58"
        },
        "digest": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared59"
        },
        "size": {
          "type": "integer",
          "readOnly": true,
          "description": "Size of the content in bytes.",
          "minimum": 0
        },
        "text": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared60"
        },
        "attachmentObjectId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared61"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared62"
        },
        "restoredFrom": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared63"
        },
        "clientTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared64"
        },
        "serverTime": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared15"
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
    "MarkdownText": {
      "type": "string",
      "description": "The Markdown source of one revision. It is stored and returned exactly as it was written, without normalization.",
      "maxLength": 1048576
    },
    "Preferences": {
      "type": "object",
      "description": "Settings that follow one account to every device.",
      "additionalProperties": false,
      "required": [
        "appearance",
        "themeFamily"
      ],
      "properties": {
        "appearance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared46"
        },
        "themeFamily": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared47"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared21"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared22"
        },
        "instance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared23"
        },
        "code": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared24"
        },
        "requestId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared25"
        },
        "issues": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared26"
        },
        "fileIds": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared29"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared35"
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
        "passwordProtected"
      ],
      "properties": {
        "publicationId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared36"
        },
        "scope": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared37"
        },
        "createdAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared38"
        },
        "expiresAt": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared39"
        },
        "passwordProtected": {
          "type": "boolean",
          "readOnly": true,
          "description": "Whether a reader gives a password before it reads the link."
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared34"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared65"
        },
        "title": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared66"
        },
        "status": {
          "type": "integer",
          "readOnly": true,
          "description": "Always 404, for each of the four causes.",
          "const": 404
        },
        "detail": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared67"
        },
        "instance": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared68"
        },
        "code": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared69"
        },
        "requestId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared25"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared73"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared74"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared71"
        },
        "checks": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared72"
        }
      }
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
    "Role": {
      "type": "string",
      "description": "Workspace access role. This product serves one person, so the only role is owner. The field stays, because stored rows and the permission matrix name it.",
      "enum": [
        "owner"
      ]
    },
    "Shared1": {
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
    "Shared10": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file that the revision belongs to."
    },
    "Shared11": {
      "type": "array",
      "readOnly": true,
      "description": "The parents of the revision, in submitted order.",
      "maxItems": 2,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared12": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The accepted path, in its normalized form."
    },
    "Shared13": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
        }
      ],
      "readOnly": true,
      "description": "Digest of the content of the revision."
    },
    "Shared14": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The account that the workspace recorded as the author. It comes from the verified request; a client cannot supply it."
    },
    "Shared15": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the workspace accepted the revision.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared16": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "readOnly": true,
      "description": "The checkpoint name of the revision, or null."
    },
    "Shared17": {
      "type": "array",
      "readOnly": true,
      "description": "Every file whose accepted head this changeset rebased, empty for the normal case. A client shows the person that a save from another device is now only in the history of the file.",
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/SupersededHead"
      }
    },
    "Shared18": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file whose accepted head moved."
    },
    "Shared19": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The accepted head that the client did not see. It is now a history entry of the file, and its text is not lost."
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
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The revision of this changeset that became the new accepted head of the file."
    },
    "Shared21": {
      "type": "string",
      "readOnly": true,
      "description": "Stable URI reference that identifies the problem type.",
      "format": "uri-reference",
      "maxLength": 256
    },
    "Shared22": {
      "type": "string",
      "readOnly": true,
      "description": "Explanation of this occurrence. The field never contains note content, a secret, or a stack trace.",
      "maxLength": 1024
    },
    "Shared23": {
      "type": "string",
      "readOnly": true,
      "description": "URI reference of the request that produced the problem.",
      "format": "uri-reference",
      "maxLength": 1024
    },
    "Shared24": {
      "type": "string",
      "readOnly": true,
      "description": "Stable application error code.",
      "pattern": "^[a-z][a-z0-9_]*$",
      "maxLength": 64
    },
    "Shared25": {
      "type": "string",
      "readOnly": true,
      "description": "Identifier of the request, repeated in the x-request-id header.",
      "minLength": 1,
      "maxLength": 128
    },
    "Shared26": {
      "type": "array",
      "readOnly": true,
      "description": "Values that a boundary check rejected. Each entry names the value by JSON Pointer and never repeats the value itself.",
      "maxItems": 64,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ValidationIssue"
      }
    },
    "Shared27": {
      "type": "string",
      "readOnly": true,
      "description": "JSON Pointer of the rejected value inside its request slot.",
      "maxLength": 256
    },
    "Shared28": {
      "type": "string",
      "readOnly": true,
      "description": "Reason the value was rejected. It never repeats the value.",
      "maxLength": 256
    },
    "Shared29": {
      "type": "array",
      "readOnly": true,
      "description": "The files that a content failure refers to, for example every file whose accepted head moved on. The list is absent when the failure names no file. It carries identifiers only, never a path or note content.",
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared3": {
      "oneOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        },
        {
          "type": "null"
        }
      ]
    },
    "Shared30": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/DeviceId"
        }
      ],
      "description": "The device that submitted the change."
    },
    "Shared31": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedRevision"
        }
      ],
      "readOnly": true,
      "description": "The accepted revision, as the workspace recorded it. Its identifier is the entity tag of the answer. It carries no text: the request that wrote it already holds the content."
    },
    "Shared32": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedChangeset"
        }
      ],
      "readOnly": true,
      "description": "The outcome of the changeset that carried the revision."
    },
    "Shared33": {
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
    },
    "Shared34": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "The note that the link opens. A rename keeps the link, because the identifier of a note does not move."
    },
    "Shared35": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "description": "The folder that the link opens. Every note below it is published, now and later."
    },
    "Shared36": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the link record. The owner names it to revoke the link. It is not the token and it opens nothing."
    },
    "Shared37": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/PublishedScope"
        }
      ],
      "readOnly": true,
      "description": "What the link opens."
    },
    "Shared38": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the owner made the link.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared39": {
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
    "Shared4": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "description": "Name of this checkpoint, or null."
    },
    "Shared40": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the workspace."
    },
    "Shared41": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Role"
        }
      ],
      "readOnly": true,
      "description": "The role of the reading account in this workspace."
    },
    "Shared42": {
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
    "Shared43": {
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
    "Shared44": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "Identity of this operation, which makes a retry safe."
    },
    "Shared45": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "description": "Identifier of the new revision."
    },
    "Shared46": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Appearance"
        }
      ],
      "readOnly": true,
      "description": "The stored appearance choice of the account."
    },
    "Shared47": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ThemeFamily"
        }
      ],
      "readOnly": true,
      "description": "The stored theme family of the account."
    },
    "Shared48": {
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
    "Shared49": {
      "type": "string",
      "readOnly": true,
      "description": "Identifier of the user inside the identity provider.",
      "minLength": 1,
      "maxLength": 128
    },
    "Shared5": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The mutation identity that the client submitted."
    },
    "Shared50": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The accepted path of the file."
    },
    "Shared51": {
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
    "Shared52": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the file was created.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared53": {
      "type": "string",
      "readOnly": true,
      "description": "Instant at which the workspace accepted the last change.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared54": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of this revision."
    },
    "Shared55": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "The file that this revision belongs to."
    },
    "Shared56": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true,
      "description": "The path of the file at this revision."
    },
    "Shared57": {
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
    "Shared58": {
      "type": "array",
      "readOnly": true,
      "description": "The parents of this revision, in submitted order. A first revision has none, a normal revision has one, and an explicit merge has two.",
      "maxItems": 2,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared59": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
        }
      ],
      "readOnly": true,
      "description": "Digest of the content of this revision."
    },
    "Shared6": {
      "type": "array",
      "readOnly": true,
      "description": "Every revision that this changeset accepted, in submitted order. A retry of the same mutation returns exactly these identifiers again.",
      "minItems": 1,
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared60": {
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
    "Shared61": {
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
    "Shared62": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/CheckpointMessage"
        }
      ],
      "readOnly": true,
      "description": "The checkpoint name of this revision, or null."
    },
    "Shared63": {
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
    "Shared64": {
      "type": "string",
      "readOnly": true,
      "description": "The clock of the device that wrote the revision. It stays informational, because a device clock cannot be trusted.",
      "format": "date-time",
      "maxLength": 64
    },
    "Shared65": {
      "type": "string",
      "readOnly": true,
      "description": "Stable URI reference that identifies the problem type.",
      "const": "https://notesapp.invalid/problems/published_link_unavailable",
      "format": "uri-reference",
      "maxLength": 256
    },
    "Shared66": {
      "type": "string",
      "readOnly": true,
      "description": "The one sentence of this refusal. It repeats the detail, because a difference between the two would be a place to hide a cause.",
      "const": "This link is not available.",
      "maxLength": 256
    },
    "Shared67": {
      "type": "string",
      "readOnly": true,
      "description": "The one sentence of this refusal.",
      "const": "This link is not available.",
      "maxLength": 1024
    },
    "Shared68": {
      "type": "string",
      "readOnly": true,
      "description": "Address of the request, without its query. It repeats what the caller sent and it adds nothing.",
      "format": "uri-reference",
      "maxLength": 1024
    },
    "Shared69": {
      "type": "string",
      "readOnly": true,
      "description": "The one code of every reader refusal.",
      "const": "published_link_unavailable",
      "maxLength": 64
    },
    "Shared7": {
      "type": "string",
      "readOnly": true,
      "description": "The commit ordered position of this change in the workspace. A sync client asks for changes after a cursor it already applied.",
      "minLength": 1,
      "maxLength": 32,
      "pattern": "^[0-9]+$"
    },
    "Shared70": {
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
    "Shared71": {
      "type": "string",
      "readOnly": true,
      "description": "Overall readiness. The value is degraded when at least one check is degraded.",
      "enum": [
        "ok",
        "degraded"
      ]
    },
    "Shared72": {
      "type": "array",
      "readOnly": true,
      "description": "One entry for every startup requirement that was checked.",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ReadinessCheck"
      }
    },
    "Shared73": {
      "type": "string",
      "readOnly": true,
      "description": "Stable name of the requirement, for example configuration.",
      "minLength": 1,
      "maxLength": 64
    },
    "Shared74": {
      "type": "string",
      "readOnly": true,
      "description": "Operator readable explanation. The field is absent in a summary report and it never contains note content or a secret.",
      "maxLength": 512
    },
    "Shared75": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true
    },
    "Shared76": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
        }
      ],
      "readOnly": true
    },
    "Shared77": {
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
    "Shared78": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Stable identifier of the file. A rename never changes it."
    },
    "Shared79": {
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
    "Shared8": {
      "type": "array",
      "readOnly": true,
      "description": "Every accepted revision with the values that the workspace assigned. A client applies these without reading the workspace again, and a retry of the same mutation repeats them.",
      "minItems": 1,
      "maxItems": 4000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/AcceptedRevision"
      }
    },
    "Shared80": {
      "type": "array",
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared81": {
      "type": "array",
      "minItems": 1,
      "maxItems": 1000,
      "items": {
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
      }
    },
    "Shared9": {
      "allOf": [
        {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
        }
      ],
      "readOnly": true,
      "description": "Identifier of the accepted revision."
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared18"
        },
        "previousHeadRevisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared19"
        },
        "acceptedRevisionId": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared20"
        }
      }
    },
    "ThemeFamily": {
      "type": "string",
      "description": "Identifier of a theme family in the client theme registry, for example tokyo-night. An identifier that the client does not know falls back to the default family, so a stored value never stops the page painting.",
      "minLength": 1,
      "maxLength": 40,
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared27"
        },
        "message": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared28"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared40"
        },
        "name": {
          "type": "string",
          "readOnly": true,
          "description": "Name of the workspace.",
          "minLength": 1,
          "maxLength": 200
        },
        "role": {
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared41"
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
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
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
                      "type": "object",
                      "description": "The immutable content of one submitted revision. Markdown carries its text; an attachment names a finalized object of the same workspace.",
                      "additionalProperties": false,
                      "required": [
                        "kind",
                        "digest"
                      ],
                      "properties": {
                        "kind": {
                          "type": "string",
                          "description": "Which of the two content forms this revision carries.",
                          "enum": [
                            "markdown",
                            "attachment"
                          ]
                        },
                        "digest": {
                          "allOf": [
                            {
                              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/ContentDigest"
                            }
                          ],
                          "description": "Digest of the content. The server recomputes it from the submitted bytes and refuses a revision that declares another value."
                        },
                        "text": {
                          "allOf": [
                            {
                              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MarkdownText"
                            }
                          ],
                          "description": "The Markdown of this revision. Absent for an attachment."
                        },
                        "attachmentObjectId": {
                          "allOf": [
                            {
                              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                            }
                          ],
                          "description": "The finalized attachment object of this revision. Absent for Markdown."
                        }
                      }
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
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared4"
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
          "text"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared30"
          },
          "path": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
              }
            ],
            "description": "Path of the new note, which must end in .md."
          },
          "text": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MarkdownText"
              }
            ],
            "description": "Markdown of the first revision."
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared4"
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
            "format": "email",
            "minLength": 3,
            "maxLength": 320
          },
          "password": {
            "type": "string",
            "minLength": 12,
            "maxLength": 512
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared33"
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
            "type": "string",
            "writeOnly": true,
            "description": "Password that a reader gives before it reads the link. Leave it out for a link that opens without one. The product keeps one password policy, so this bound is the bound of an account password.",
            "minLength": 12,
            "maxLength": 512
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared43"
      },
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "The identifiers of a tombstone revision.",
        "additionalProperties": false,
        "required": [
          "revisionId",
          "mutationId",
          "deviceId"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared44"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared43"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared45"
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared44"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared30"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared4"
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
            "preferences"
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
            "preferences": {
              "allOf": [
                {
                  "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Preferences"
                }
              ],
              "readOnly": true,
              "description": "The stored settings of the account."
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared48"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
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
              "description": "Ordered changes after the requested cursor, oldest first.",
              "maxItems": 500,
              "items": {
                "type": "object",
                "description": "One commit ordered incremental change record.",
                "additionalProperties": false,
                "required": [
                  "cursor",
                  "entityKind",
                  "entityId",
                  "revisionId",
                  "deleted"
                ],
                "properties": {
                  "cursor": {
                    "type": "string",
                    "readOnly": true,
                    "description": "The commit ordered position of this change.",
                    "minLength": 1,
                    "maxLength": 32,
                    "pattern": "^[0-9]+$"
                  },
                  "entityKind": {
                    "type": "string",
                    "readOnly": true,
                    "description": "The kind of entity that the record refers to.",
                    "enum": [
                      "file",
                      "membership"
                    ]
                  },
                  "entityId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                  },
                  "revisionId": {
                    "oneOf": [
                      {
                        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Uuid"
                      },
                      {
                        "type": "null"
                      }
                    ],
                    "readOnly": true,
                    "description": "The revision of a file change, or null otherwise."
                  },
                  "deleted": {
                    "type": "boolean",
                    "readOnly": true,
                    "description": "Whether the change deletes its entity."
                  }
                }
              }
            },
            "nextCursor": {
              "type": "string",
              "readOnly": true,
              "description": "The cursor the client sends to continue.",
              "minLength": 1,
              "maxLength": 32,
              "pattern": "^[0-9]+$"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared50"
            },
            "kind": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared51"
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
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared52"
            },
            "updatedAt": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared53"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared70"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared48"
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
          "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared33"
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
    "id": "importWorkspace",
    "method": "post",
    "path": "/api/workspaces/{workspaceId}/import",
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
      "body": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "description": "Multipart form upload payload that contains one zip archive.",
        "additionalProperties": false,
        "required": [
          "file"
        ],
        "properties": {
          "file": {
            "type": "string",
            "format": "binary",
            "description": "Portable workspace zip archive."
          }
        }
      },
      "bodyMediaType": "multipart/form-data"
    },
    "responses": [
      {
        "status": 200,
        "mediaType": "application/json",
        "schema": {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "type": "object",
          "description": "Counts of files imported without reference translation.",
          "additionalProperties": false,
          "required": [
            "notes",
            "attachments"
          ],
          "properties": {
            "notes": {
              "type": "integer",
              "minimum": 0
            },
            "attachments": {
              "type": "integer",
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared75"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared76"
                  },
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared75"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared77"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared78"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared51"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared52"
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
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared79"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared77"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared78"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared50"
                  },
                  "kind": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared51"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared52"
                  },
                  "updatedAt": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared53"
                  }
                }
              }
            },
            "nextCursor": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared79"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
                  "objectId"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
                  },
                  "text": {
                    "type": [
                      "string",
                      "null"
                    ]
                  },
                  "objectId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
                  }
                }
              }
            },
            "nextCursor": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared70"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared81"
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
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
            },
            "revisionIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
            },
            "contentDigests": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "attachmentObjectIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared81"
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
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
            },
            "purgedRevisionIds": {
              "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared80"
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
          },
          "redirectTo": {
            "type": "string",
            "description": "Address that the reset link opens.",
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
            "type": "string",
            "description": "New password of the account.",
            "minLength": 12,
            "maxLength": 512
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared3"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared1"
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
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared75"
                  },
                  "path": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared76"
                  },
                  "revisionId": {
                    "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared75"
                  },
                  "excerpt": {
                    "type": "array",
                    "readOnly": true,
                    "description": "The matching part of the note, in reading order.",
                    "maxItems": 128,
                    "items": {
                      "type": "object",
                      "description": "One part of a search excerpt. A part with `marked` true is a word that the query matched. The excerpt carries no markup, so a reader renders every part as text and decides itself how a marked part looks.",
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared70"
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
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared42"
      },
      "query": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "headers": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared43"
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
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared45"
          },
          "mutationId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared44"
          },
          "deviceId": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared30"
          },
          "path": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/FilePath"
              }
            ],
            "description": "New path of the file. The path of the expected head is kept when this member is absent."
          },
          "text": {
            "allOf": [
              {
                "$ref": "https://notesapp.invalid/contract-definitions#/$defs/MarkdownText"
              }
            ],
            "description": "New Markdown of the file. The content of the expected head is kept when this member is absent, which is how a plain rename is written."
          },
          "message": {
            "$ref": "https://notesapp.invalid/contract-definitions#/$defs/Shared4"
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
        "description": "Settings to store for the signed in account.",
        "additionalProperties": false,
        "required": [
          "appearance",
          "themeFamily"
        ],
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
  }
];
