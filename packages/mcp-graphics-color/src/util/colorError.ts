import { ColorError, ColorErrorCode } from '../types/color.js';

/**
 * Error thrown by ColorUtils that carries a structured ColorError, so tools
 * can return it to callers as-is instead of encoding it into the message
 */
export class ColorProcessingError extends Error {
  readonly code: ColorErrorCode;
  readonly details?: Record<string, unknown>;
  readonly suggestions?: string[];

  constructor({ code, message, details, suggestions }: ColorError) {
    super(message);
    this.name = 'ColorProcessingError';
    this.code = code;
    if (details !== undefined) this.details = details;
    if (suggestions !== undefined) this.suggestions = suggestions;
  }

  /**
   * The plain ColorError shape tools return in `{ success: false, error }`
   */
  toColorError(): ColorError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
      ...(this.suggestions !== undefined && { suggestions: this.suggestions })
    };
  }
}
