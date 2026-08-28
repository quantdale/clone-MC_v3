/**
 * Network protocol (223): the versioned wire contract — a validated message registry, typed
 * encode/decode codecs over a plain-JS envelope, and bidirectional compatibility rules. Pure
 * and headless-safe: no transport (the wiring ships envelopes), no mutation of inputs, no IO.
 *
 * Determinism rules:
 * - `version` is a positive integer; message ids are unique non-negative integers; message and
 *   field names are unique and non-empty; field types are int|float|string|bool.
 * - Codecs are total: `encodeMessage`/`decodeMessage` return null on any failure (unknown
 *   name/id, wrong field count, type mismatch) — never throw. Type rules: int = safe integer,
 *   float = finite number, string = string, bool = boolean.
 * - `protocolCompatibility(a, b)`: compatible iff versions match AND every message id in each
 *   protocol exists in the other with the same name.
 */
export type WireValue = boolean | number | string;
export type ProtocolFieldType = 'int' | 'float' | 'string' | 'bool';

const FIELD_TYPES: readonly string[] = ['int', 'float', 'string', 'bool'];

/** One typed protocol field. */
export interface ProtocolField {
  readonly name: string;
  readonly type: ProtocolFieldType;
}

/** One protocol message. */
export interface ProtocolMessage {
  readonly id: number;
  readonly name: string;
  readonly fields: readonly ProtocolField[];
}

/** The validated protocol registry. */
export interface NetworkProtocol {
  readonly version: number;
  readonly messages: readonly ProtocolMessage[];
}

function validateField(value: unknown, messageIndex: number, fieldIndex: number): ProtocolField {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`NetworkProtocol: messages ${messageIndex}.fields ${fieldIndex} must be an object`);
  }
  const f = value as Record<string, unknown>;
  if (typeof f.name !== 'string' || f.name.length === 0) {
    throw new Error(
      `NetworkProtocol: messages ${messageIndex}.fields ${fieldIndex}.name must be a non-empty string`,
    );
  }
  if (typeof f.type !== 'string' || !FIELD_TYPES.includes(f.type)) {
    throw new Error(
      `NetworkProtocol: messages ${messageIndex}.fields ${fieldIndex}.type must be int, float, string, or bool`,
    );
  }
  return { name: f.name, type: f.type as ProtocolFieldType };
}

function validateMessage(value: unknown, index: number): ProtocolMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`NetworkProtocol: messages ${index} must be an object`);
  }
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'number' || !Number.isInteger(m.id) || m.id < 0) {
    throw new Error(`NetworkProtocol: messages ${index}.id must be a non-negative integer`);
  }
  if (typeof m.name !== 'string' || m.name.length === 0) {
    throw new Error(`NetworkProtocol: messages ${index}.name must be a non-empty string`);
  }
  if (!Array.isArray(m.fields)) {
    throw new Error(`NetworkProtocol: messages ${index}.fields must be an array`);
  }
  const fields: ProtocolField[] = [];
  const seenFields = new Set<string>();
  for (let j = 0; j < m.fields.length; j += 1) {
    const field = validateField(m.fields[j], index, j);
    if (seenFields.has(field.name)) {
      throw new Error(`NetworkProtocol: messages ${index} has duplicate field ${field.name}`);
    }
    seenFields.add(field.name);
    fields.push(field);
  }
  return { id: m.id, name: m.name, fields };
}

/** Build a validated protocol. */
export function createNetworkProtocol(
  version: number,
  messages: readonly ProtocolMessage[],
): NetworkProtocol {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('NetworkProtocol: version must be a positive integer');
  }
  if (!Array.isArray(messages)) {
    throw new Error('NetworkProtocol: messages must be an array');
  }
  const out: ProtocolMessage[] = [];
  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  for (let i = 0; i < messages.length; i += 1) {
    const message = validateMessage(messages[i], i);
    if (seenIds.has(message.id)) {
      throw new Error(`NetworkProtocol: duplicate message id ${message.id}`);
    }
    seenIds.add(message.id);
    if (seenNames.has(message.name)) {
      throw new Error(`NetworkProtocol: duplicate message name ${message.name}`);
    }
    seenNames.add(message.name);
    out.push(message);
  }
  return { version, messages: out };
}

/** The wire envelope: message id + field values in field order. */
export interface WireEnvelope {
  readonly messageId: number;
  readonly values: readonly WireValue[];
}

function matchesType(type: ProtocolFieldType, value: WireValue): boolean {
  switch (type) {
    case 'int':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'float':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'bool':
      return typeof value === 'boolean';
  }
}

/** Encode a typed record into the wire envelope; null on unknown name, count, or type issues. */
export function encodeMessage(
  protocol: NetworkProtocol,
  name: string,
  values: Readonly<Record<string, WireValue>>,
): WireEnvelope | null {
  const message = protocol.messages.find((m) => m.name === name);
  if (message === undefined) return null;
  const keys = Object.keys(values);
  if (keys.length !== message.fields.length) return null;
  const out: WireValue[] = [];
  for (const field of message.fields) {
    if (!(field.name in values)) return null;
    const value = values[field.name];
    if (value === undefined || !matchesType(field.type, value)) return null;
    out.push(value);
  }
  return { messageId: message.id, values: out };
}

/** Decode a wire envelope into a typed record; null on unknown id, count, or type issues. */
export function decodeMessage(
  protocol: NetworkProtocol,
  wire: WireEnvelope,
): { name: string; values: Readonly<Record<string, WireValue>> } | null {
  const message = protocol.messages.find((m) => m.id === wire.messageId);
  if (message === undefined) return null;
  if (wire.values.length !== message.fields.length) return null;
  const out: Record<string, WireValue> = {};
  for (let i = 0; i < message.fields.length; i += 1) {
    const field = message.fields[i]!;
    const value = wire.values[i]!;
    if (!matchesType(field.type, value)) return null;
    out[field.name] = value;
  }
  return { name: message.name, values: out };
}

export type CompatibilityResult = { compatible: true } | { compatible: false; reason: string };

/** Bidirectional protocol compatibility. */
export function protocolCompatibility(
  a: NetworkProtocol,
  b: NetworkProtocol,
): CompatibilityResult {
  if (a.version !== b.version) {
    return { compatible: false, reason: `version mismatch (${a.version} != ${b.version})` };
  }
  for (const direction of [
    { from: a, to: b },
    { from: b, to: a },
  ] as const) {
    for (const message of direction.from.messages) {
      const other = direction.to.messages.find((m) => m.id === message.id);
      if (other === undefined) {
        return { compatible: false, reason: `missing message id ${message.id}` };
      }
      if (other.name !== message.name) {
        return {
          compatible: false,
          reason: `message id ${message.id} name mismatch (${message.name} != ${other.name})`,
        };
      }
    }
  }
  return { compatible: true };
}
