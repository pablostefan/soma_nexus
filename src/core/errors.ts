export type AppErrorCode =
  | "INVALID_INPUT"
  | "INVALID_URL"
  | "NODE_ID_MISSING"
  | "CONTRACT_NOT_FOUND"
  | "CONTRACT_INVALID"
  | "FIGMA_UNAUTHORIZED"
  | "FIGMA_NOT_FOUND"
  | "FIGMA_RATE_LIMIT"
  | "FIGMA_API_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  code: AppErrorCode;
  details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
