// Shared REST and WebSocket types (CLAUDE.md §10). The Python side mirrors these
// with pydantic models; a contract test keeps both in sync.

/** REST error body (CLAUDE.md §10.1). */
export interface ApiError {
  code: string;
  message_key: string;
  details: Record<string, unknown>;
}

export interface Paginated<T> {
  results: T[];
  next: string | null;
}

export type ClientMessageType =
  | "auth"
  | "queue.join"
  | "queue.leave"
  | "match.sync"
  | "turn.roll"
  | "turn.move"
  | "cube.offer"
  | "cube.take"
  | "cube.drop"
  | "react.send"
  | "match.resign"
  | "spectate.join"
  | "spectate.leave"
  | "spectate.react";

export type ServerMessageType =
  | "error"
  | "match.found"
  | "match.state"
  | "turn.rolled"
  | "react.recv"
  | "opponent.disconnected"
  | "opponent.back"
  | "match.ended"
  | "pool.update"
  | "spectate.state"
  | "spectators.count";

/** WebSocket envelope, both directions (CLAUDE.md §10.3). */
export interface Envelope<T extends string = string, P = unknown> {
  type: T;
  match_id?: string;
  seq: number;
  payload: P;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: Record<string, boolean>;
}
