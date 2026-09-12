import type { ErrorCode } from "../shared/protocol.js";
export class GameError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export function requireCondition(
  condition: unknown,
  code: ErrorCode,
  status = 400,
): asserts condition {
  if (!condition) throw new GameError(code, status);
}
