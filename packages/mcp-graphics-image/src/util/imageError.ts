import { ZodError } from 'zod';
import { ImageErrorCode } from '../types/image.js';

/**
 * The plain error shape tools return in `{ success: false, error }`
 */
export interface ImageToolError {
  code: ImageErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * Error thrown by ImageUtils that carries a structured ImageToolError, so
 * tools can return it to callers as-is instead of encoding it into the message
 */
export class ImageProcessingError extends Error {
  readonly code: ImageErrorCode;
  readonly details?: Record<string, unknown>;
  readonly suggestions?: string[];

  constructor({ code, message, details, suggestions }: ImageToolError) {
    super(message);
    this.name = 'ImageProcessingError';
    this.code = code;
    if (details !== undefined) this.details = details;
    if (suggestions !== undefined) this.suggestions = suggestions;
  }

  toImageError(): ImageToolError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
      ...(this.suggestions !== undefined && { suggestions: this.suggestions })
    };
  }
}

/**
 * One-line summary of zod issues, naming each failing field
 * (e.g. "Invalid input parameters: bounds > x: Too small: expected number to be >=0")
 */
export function describeValidationError(error: ZodError): string {
  const descriptions = error.issues.map(issue => {
    const field = issue.path.length > 0 ? issue.path.map(String).join(' > ') : 'input';
    return `${field}: ${issue.message}`;
  });
  return `Invalid input parameters: ${descriptions.join('; ')}`;
}

/**
 * Turn anything a tool caught into the error it returns. Validation failures
 * become INVALID_INPUT, ImageProcessingErrors pass through, and anything else
 * gets the tool's fallback code and message with the cause in details.
 */
export function toImageError(
  error: unknown,
  fallback: { code: ImageErrorCode; message: string; suggestions?: string[] },
  startTime: number
): ImageToolError {
  if (error instanceof ZodError) {
    return {
      code: ImageErrorCode.INVALID_INPUT,
      message: describeValidationError(error),
      details: { issues: error.issues }
    };
  }
  if (error instanceof ImageProcessingError) {
    return error.toImageError();
  }
  return {
    code: fallback.code,
    message: fallback.message,
    details: {
      error: error instanceof Error ? error.message : String(error),
      processingTime: Math.round((performance.now() - startTime) * 100) / 100
    },
    ...(fallback.suggestions !== undefined && { suggestions: fallback.suggestions })
  };
}
