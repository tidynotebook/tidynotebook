/** Bounds that keep live work separate from durable sync notices. */
export const liveBounds = {
  roomsPerConnection: 16,
  connectionsPerRoom: 32,
  roomsPerProcess: 512,
  syncBytes: 64 * 1024,
  awarenessBytes: 4 * 1024,
  frameBytes: 128 * 1024,
  pendingPerConnection: 40,
  messagesPerSecond: 20,
  messageBurst: 40,
  presenceNotes: 256,
  roomMemory: 64 * 1024 * 1024,
  relayChunkBytes: 6800,
  relayAssemblies: 128,
  relayTtlMs: 10_000,
} as const;
