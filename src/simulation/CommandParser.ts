/**
 * Command parser (190): headless-safe command syntax — a spec-driven parser for 191's core
 * commands, plus the permission-context check. Pure and deterministic: no world access, no
 * mutation; input is text, output is a typed parse result.
 *
 * Grammar (documented):
 * - Input may start with an optional `/`; the command name is the first token, matched
 *   case-insensitively against the spec's name.
 * - Arguments are whitespace-separated tokens; `"double"` and `'single'` quotes group a token
 *   (quotes stripped for string args).
 * - Typed argument parsing: `string` (bare or quoted), `integer` (`-?\d+`), `float`
 *   (`-?\d+(\.\d+)?`; integers are valid floats), `boolean` (true/false case-insensitively),
 *   `target` (any bare token — `@p`-style selectors or names).
 * - Arity and types are checked against the spec; every failure yields a descriptive error.
 *
 * Permissions: `hasCommandPermission(level, required)` is `level >= required` (vanilla-style
 * operator levels 0..4); each `CommandSpec` declares its required level.
 */
export type CommandArgumentType = 'string' | 'integer' | 'float' | 'boolean' | 'target';

export interface CommandArgumentSpec {
  readonly name: string;
  readonly type: CommandArgumentType;
  readonly required?: boolean;
}

export interface CommandSpec {
  readonly name: string;
  /** Vanilla-style operator level required to run the command (0..4). */
  readonly permissionLevel: number;
  readonly args: readonly CommandArgumentSpec[];
}

export type CommandArgumentValue = string | number | boolean;

/** A successfully parsed command. */
export interface ParsedCommand {
  readonly name: string;
  readonly args: readonly CommandArgumentValue[];
}

export type CommandParseResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; error: string };

/** Whether a permission level satisfies a command's required level. */
export function hasCommandPermission(level: number, required: number): boolean {
  return level >= required;
}

/** Split input into a command name (lowercased) and raw argument tokens; `null` when empty. */
export function splitCommand(input: string): { name: string; tokens: string[] } | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const withoutSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const tokens = tokenize(withoutSlash);
  if (tokens.length === 0) return null;
  return { name: tokens[0]!.toLowerCase(), tokens: tokens.slice(1) };
}

/** Whitespace tokenizer honoring single/double quotes (quotes are kept for the caller to strip). */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of input) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function stripQuotes(token: string): string {
  if (token.length >= 2) {
    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1);
    }
  }
  return token;
}

function parseTyped(
  spec: CommandArgumentSpec,
  token: string,
): { value: CommandArgumentValue } | { error: string } {
  switch (spec.type) {
    case 'string':
      return { value: stripQuotes(token) };
    case 'integer': {
      if (!/^-?\d+$/.test(token)) {
        return { error: `expected integer for '${spec.name}', got '${token}'` };
      }
      const value = Number(token);
      return Number.isSafeInteger(value) ? { value } : { error: `integer out of range for '${spec.name}'` };
    }
    case 'float': {
      if (!/^-?\d+(\.\d+)?$/.test(token)) {
        return { error: `expected float for '${spec.name}', got '${token}'` };
      }
      const value = Number(token);
      return Number.isFinite(value) ? { value } : { error: `float out of range for '${spec.name}'` };
    }
    case 'boolean': {
      const normalized = token.toLowerCase();
      if (normalized === 'true') return { value: true };
      if (normalized === 'false') return { value: false };
      return { error: `expected boolean for '${spec.name}', got '${token}'` };
    }
    case 'target':
      return { value: stripQuotes(token) };
  }
}

/**
 * Parse `input` against a command spec. `null` is returned for empty input; every other failure
 * yields `{ ok: false, error }`; success yields the name and typed args.
 */
export function parseCommand(input: string, spec: CommandSpec): CommandParseResult | null {
  const split = splitCommand(input);
  if (split === null) return null;
  if (split.name !== spec.name.toLowerCase()) {
    return { ok: false, error: `unknown command '${split.name}'` };
  }

  const args: CommandArgumentValue[] = [];
  const requiredCount = spec.args.filter((a) => a.required !== false).length;
  if (split.tokens.length < requiredCount) {
    const missing = spec.args[split.tokens.length];
    return {
      ok: false,
      error: missing ? `missing argument '${missing.name}'` : 'missing arguments',
    };
  }
  if (split.tokens.length > spec.args.length) {
    return { ok: false, error: `unexpected argument '${split.tokens[spec.args.length]}'` };
  }

  for (let i = 0; i < split.tokens.length; i++) {
    const argSpec = spec.args[i]!;
    const parsed = parseTyped(argSpec, split.tokens[i]!);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    args.push(parsed.value);
  }

  return { ok: true, command: { name: split.name, args } };
}
