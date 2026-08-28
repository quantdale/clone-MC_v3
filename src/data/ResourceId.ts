export interface ResourceId {
  readonly namespace: string;
  readonly path: string;
}

export type ResourceIdErrorReason =
  | 'EMPTY_INPUT'
  | 'MISSING_NAMESPACE'
  | 'EMPTY_NAMESPACE'
  | 'EMPTY_PATH'
  | 'INVALID_NAMESPACE'
  | 'INVALID_PATH';

export class ResourceIdError extends Error {
  readonly input: string;
  readonly reason: ResourceIdErrorReason;

  constructor(input: string, reason: ResourceIdErrorReason) {
    super(`Invalid resource id (${reason}): ${JSON.stringify(input)}`);
    this.name = 'ResourceIdError';
    this.input = input;
    this.reason = reason;
  }
}

function isLowercaseAsciiLetter(code: number): boolean {
  return code >= 97 && code <= 122;
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isNamespaceCharacter(code: number): boolean {
  return (
    isLowercaseAsciiLetter(code)
    || isAsciiDigit(code)
    || code === 95 // _
    || code === 45 // -
    || code === 46 // .
  );
}

function isPathCharacter(code: number): boolean {
  return isNamespaceCharacter(code) || code === 47; // /
}

function hasOnlyCharacters(value: string, predicate: (code: number) => boolean): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (!predicate(code)) {
      return false;
    }
  }
  return true;
}

export function isValidResourceNamespace(namespace: string): boolean {
  return namespace.length > 0 && hasOnlyCharacters(namespace, isNamespaceCharacter);
}

export function isValidResourcePath(path: string): boolean {
  return path.length > 0 && hasOnlyCharacters(path, isPathCharacter);
}

function assertNamespace(namespace: string, input: string): void {
  if (namespace.length === 0) {
    throw new ResourceIdError(input, 'EMPTY_NAMESPACE');
  }
  if (!isValidResourceNamespace(namespace)) {
    throw new ResourceIdError(input, 'INVALID_NAMESPACE');
  }
}

function assertPath(path: string, input: string): void {
  if (path.length === 0) {
    throw new ResourceIdError(input, 'EMPTY_PATH');
  }
  if (!isValidResourcePath(path)) {
    throw new ResourceIdError(input, 'INVALID_PATH');
  }
}

export function createResourceId(namespace: string, path: string): ResourceId {
  const input = `${namespace}:${path}`;
  assertNamespace(namespace, input);
  assertPath(path, input);
  return Object.freeze({ namespace, path });
}

export function parseResourceId(input: string, defaultNamespace?: string): ResourceId {
  if (input.length === 0) {
    throw new ResourceIdError(input, 'EMPTY_INPUT');
  }

  const separator = input.indexOf(':');
  if (separator === -1) {
    if (defaultNamespace === undefined) {
      throw new ResourceIdError(input, 'MISSING_NAMESPACE');
    }
    assertNamespace(defaultNamespace, input);
    assertPath(input, input);
    return Object.freeze({ namespace: defaultNamespace, path: input });
  }

  const namespace = input.slice(0, separator);
  const path = input.slice(separator + 1);
  assertNamespace(namespace, input);
  assertPath(path, input);
  return Object.freeze({ namespace, path });
}

export function tryParseResourceId(input: string, defaultNamespace?: string): ResourceId | null {
  try {
    return parseResourceId(input, defaultNamespace);
  } catch (error) {
    if (error instanceof ResourceIdError) {
      return null;
    }
    throw error;
  }
}

export function resourceIdToString(id: ResourceId): string {
  return `${id.namespace}:${id.path}`;
}

export function resourceIdEquals(a: ResourceId, b: ResourceId): boolean {
  return a.namespace === b.namespace && a.path === b.path;
}

function compareOrdinal(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function compareResourceIds(a: ResourceId, b: ResourceId): number {
  const namespaceOrder = compareOrdinal(a.namespace, b.namespace);
  if (namespaceOrder !== 0) {
    return namespaceOrder;
  }
  return compareOrdinal(a.path, b.path);
}
