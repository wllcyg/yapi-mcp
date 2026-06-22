import type { ApiErrorShape, ErrorCode } from "./types.js";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly suggestion?: string;
  readonly context?: Record<string, unknown>;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.code = shape.code;
    this.suggestion = shape.suggestion;
    this.context = shape.context;
  }

  toShape(): ApiErrorShape {
    return {
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      context: this.context,
    };
  }
}

export function ensure(condition: unknown, shape: ApiErrorShape): asserts condition {
  if (!condition) {
    throw new AppError(shape);
  }
}
