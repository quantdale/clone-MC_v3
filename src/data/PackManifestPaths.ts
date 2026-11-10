/**
 * Shared relative-path validator for the internal pack formats (211/212).
 *
 * Both the resource-pack manifest and the data-pack manifest require entry paths to
 * be non-empty relative POSIX-style paths with no leading `/` and no `.`/`..`
 * segments. The rule was duplicated verbatim in both modules, so a hardening fix to
 * path traversal handling had to be applied twice; it lives here once.
 *
 * Pure and headless-safe: no IO, no throws, no input mutation.
 */
export function isValidRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/')) return false;
  const segments = path.split('/');
  return segments.every((s) => s.length > 0 && s !== '..' && s !== '.');
}
