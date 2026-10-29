import { Worker } from 'node:worker_threads';
import { TemplateError, TemplateErrorCode, ValidationRule } from '../types/template.js';

/**
 * Variable validation rules (min / max / pattern / enum), shared by the
 * template engine and TemplateValidator.
 *
 * `pattern` rules carry caller-supplied regular expressions, which can
 * backtrack catastrophically (ReDoS). They are handled in two layers, with no
 * native dependency:
 *  1. A static check rejects long patterns, backreferences, lookarounds, and
 *     repeated groups that contain a quantifier or alternation (`(a+)+`,
 *     `(a|aa)*`), the classic exponential shapes.
 *  2. Patterns that pass are compiled and run in a short-lived worker thread
 *     against input capped at MAX_PATTERN_INPUT_LENGTH, with a hard timeout.
 *     This bounds the polynomial cases the static check cannot see
 *     (e.g. `\d*\d*\d*x`). Caller regexes never run on the main thread.
 */

export const MAX_PATTERN_LENGTH = 200;
export const MAX_PATTERN_INPUT_LENGTH = 1000;
export const PATTERN_TIMEOUT_MS = 500;

/**
 * Return a reason the pattern is unsafe to run, or null if it passes the static check.
 */
export function checkPatternSafety(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern is too long (max ${MAX_PATTERN_LENGTH} characters)`;
  }

  interface GroupFrame { hasQuantifier: boolean; hasAlternation: boolean }
  const stack: GroupFrame[] = [{ hasQuantifier: false, hasAlternation: false }];
  const current = () => stack[stack.length - 1];

  // Length of the quantifier starting at i (0 if none) and whether it repeats (allows >1 match)
  const readQuantifier = (i: number): { length: number; repeats: boolean } => {
    const ch = pattern[i];
    if (ch === '*' || ch === '+') return { length: 1, repeats: true };
    if (ch === '?') return { length: 1, repeats: false };
    if (ch === '{') {
      const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (match) {
        const upper = match[2] === undefined ? Number(match[1]) : match[3] === '' ? Infinity : Number(match[3]);
        return { length: match[0].length, repeats: upper > 1 };
      }
    }
    return { length: 0, repeats: false };
  };

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next !== undefined && /[1-9]/.test(next)) return 'Backreferences are not allowed in patterns';
      if (next === 'k' && pattern[i + 2] === '<') return 'Backreferences are not allowed in patterns';
      i++;
      continue;
    }

    if (ch === '[') {
      // Skip the character class; its contents are a single atom
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      continue;
    }

    if (ch === '(') {
      if (/^\(\?(=|!|<=|<!)/.test(pattern.slice(i))) {
        return 'Lookaround assertions are not allowed in patterns';
      }
      stack.push({ hasQuantifier: false, hasAlternation: false });
      // Skip a non-capturing or named-group prefix so its '?' isn't read as a quantifier
      const prefix = /^\(\?(:|<[A-Za-z_$][\w$]*>)/.exec(pattern.slice(i));
      if (prefix) i += prefix[0].length - 1;
      continue;
    }

    if (ch === ')') {
      const group = stack.length > 1 ? stack.pop() as GroupFrame : current();
      const quantifier = readQuantifier(i + 1);
      if (quantifier.repeats) {
        if (group.hasQuantifier) return 'Nested quantifiers are not allowed in patterns';
        if (group.hasAlternation) return 'Alternation inside a repeated group is not allowed in patterns';
      }
      if (group.hasQuantifier || quantifier.length > 0) {
        current().hasQuantifier = true;
      }
      i += quantifier.length;
      continue;
    }

    if (ch === '|') {
      current().hasAlternation = true;
      continue;
    }

    if (readQuantifier(i).length > 0) {
      current().hasQuantifier = true;
    }
  }

  return null;
}

const PATTERN_WORKER_SOURCE = `
const { workerData } = require('node:worker_threads');
const state = new Int32Array(workerData.state);
let result = 3;
try {
  result = new RegExp(workerData.pattern).test(workerData.value) ? 1 : 2;
} catch {
  result = 3;
}
Atomics.store(state, 0, result);
Atomics.notify(state, 0);
`;

export type PatternTestResult = 'match' | 'nomatch' | 'invalid' | 'timeout';

/**
 * Run a (statically checked) pattern against a value in a worker thread with a
 * hard timeout. Synchronous: the caller blocks on Atomics.wait, never on the regex.
 */
export function testPatternIsolated(
  pattern: string,
  value: string,
  timeoutMs: number = PATTERN_TIMEOUT_MS
): PatternTestResult {
  const state = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(PATTERN_WORKER_SOURCE, {
    eval: true,
    workerData: { state: state.buffer, pattern, value }
  });
  worker.unref();

  try {
    Atomics.wait(state, 0, 0, timeoutMs);
  } finally {
    void worker.terminate();
  }

  switch (Atomics.load(state, 0)) {
    case 1: return 'match';
    case 2: return 'nomatch';
    case 3: return 'invalid';
    default: return 'timeout';
  }
}

/**
 * Evaluate a pattern rule; returns an error message or null when the value matches.
 */
function evaluatePatternRule(name: string, value: string, rule: ValidationRule): string | null {
  const pattern = String(rule.value ?? '');

  const unsafeReason = checkPatternSafety(pattern);
  if (unsafeReason) {
    return `Unsafe validation pattern for '${name}': ${unsafeReason}`;
  }

  if (value.length > MAX_PATTERN_INPUT_LENGTH) {
    return `Variable '${name}' is too long for pattern validation (max ${MAX_PATTERN_INPUT_LENGTH} characters)`;
  }

  switch (testPatternIsolated(pattern, value)) {
    case 'match':
      return null;
    case 'nomatch':
      return rule.message || `Variable '${name}' does not match required pattern`;
    case 'invalid':
      return `Invalid validation pattern for '${name}'`;
    case 'timeout':
      return `Unsafe validation pattern for '${name}': matching exceeded ${PATTERN_TIMEOUT_MS}ms`;
  }
}

/**
 * Validate a variable value against its custom rules
 */
export function evaluateValidationRules(
  name: string,
  value: unknown,
  rules: ValidationRule[]
): TemplateError[] {
  const errors: TemplateError[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'min':
        if (typeof value === 'number' && value < Number(rule.value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: rule.message || `Variable '${name}' must be at least ${rule.value}`,
            variableName: name
          });
        } else if (typeof value === 'string' && value.length < Number(rule.value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: rule.message || `Variable '${name}' must be at least ${rule.value} characters long`,
            variableName: name
          });
        }
        break;

      case 'max':
        if (typeof value === 'number' && value > Number(rule.value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: rule.message || `Variable '${name}' must be at most ${rule.value}`,
            variableName: name
          });
        } else if (typeof value === 'string' && value.length > Number(rule.value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: rule.message || `Variable '${name}' must be at most ${rule.value} characters long`,
            variableName: name
          });
        }
        break;

      case 'pattern':
        if (typeof value === 'string') {
          const message = evaluatePatternRule(name, value, rule);
          if (message) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message,
              variableName: name
            });
          }
        }
        break;

      case 'enum':
        if (Array.isArray(rule.value) && !rule.value.includes(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: rule.message || `Variable '${name}' must be one of: ${rule.value.join(', ')}`,
            variableName: name,
            suggestions: rule.value.map(v => `Use "${v}"`)
          });
        }
        break;
    }
  }

  return errors;
}
