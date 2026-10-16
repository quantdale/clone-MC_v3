import { readFileSync } from 'node:fs';

/**
 * Read a source file as UTF-8 text with CRLF normalised to LF.
 *
 * The repository declares LF checkout endings in `.gitattributes`, but a
 * working tree may still contain CRLF (for example a checkout produced before
 * the declaration existed, or a contributor whose local Git ignores it).
 * Source-guard suites must observe the *logical* source, never the checkout's
 * byte-level line-ending convention, so every read goes through this helper.
 *
 * The helper performs exactly one normalisation (`\r\n` -> `\n`) and preserves
 * every other byte. It never trims, collapses whitespace, or returns an empty
 * string: filesystem errors propagate unchanged.
 */
export function readSource(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Extract the brace-balanced body of the symbol whose declaration contains
 * `signature`.
 *
 * `signature` is matched literally with `String.prototype.indexOf`; the body is
 * located by scanning forward from the end of the signature for the first `{`
 * and then matching braces until depth returns to zero. The scan skips single
 * quotes, double quotes, template literals and both comment forms so that
 * braces inside strings and comments do not corrupt the depth count.
 *
 * Returns the body including its outer braces. Throws a named error when the
 * signature is absent or when the braces never balance, so a renamed or
 * malformed symbol fails loudly instead of silently yielding nonsense.
 */
export function methodBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) {
    throw new Error(`methodBody: signature not found: ${signature}`);
  }

  let i = start + signature.length - 1;
  if (i < 0) i = 0;

  // Locate the opening brace of the body, ignoring braces inside strings and
  // comments (for example a default parameter value).
  let open = -1;
  for (; i < src.length; i++) {
    const skipped = skipSpan(src, i);
    if (skipped > i) {
      i = skipped - 1;
      continue;
    }
    if (src[i] === '{') {
      open = i;
      break;
    }
  }
  if (open < 0) {
    throw new Error(`methodBody: unmatched braces for ${signature}`);
  }

  let depth = 0;
  for (i = open; i < src.length; i++) {
    const skipped = skipSpan(src, i);
    if (skipped > i) {
      i = skipped - 1;
      continue;
    }
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`methodBody: unmatched braces for ${signature}`);
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 * Returns 0 for an empty needle (there is nothing meaningful to count).
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/**
 * If `index` starts a string literal, template literal or comment, return the
 * index just past that span; otherwise return `index` unchanged.
 */
function skipSpan(src: string, index: number): number {
  const ch = src[index];
  const next = src[index + 1];

  if (ch === '/' && next === '/') {
    const end = src.indexOf('\n', index + 2);
    return end === -1 ? src.length : end;
  }
  if (ch === '/' && next === '*') {
    const end = src.indexOf('*/', index + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    let i = index + 1;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === ch) return i + 1;
      i++;
    }
    return src.length;
  }
  return index;
}
