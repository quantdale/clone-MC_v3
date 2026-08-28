import { describe, it, expect } from 'vitest';
import {
  createNetworkProtocol,
  decodeMessage,
  encodeMessage,
  protocolCompatibility,
  type NetworkProtocol,
  type ProtocolMessage,
} from '../../src/simulation/NetworkProtocol';

const MOVE: ProtocolMessage = {
  id: 1,
  name: 'move',
  fields: [
    { name: 'x', type: 'int' },
    { name: 'y', type: 'float' },
    { name: 'name', type: 'string' },
  ],
};
const JUMP: ProtocolMessage = {
  id: 2,
  name: 'jump',
  fields: [{ name: 'active', type: 'bool' }],
};

const protocol = (): NetworkProtocol => createNetworkProtocol(1, [MOVE, JUMP]);

describe('creation', () => {
  it('builds a validated protocol', () => {
    const p = protocol();
    expect(p.version).toBe(1);
    expect(p.messages.map((m) => m.name)).toEqual(['move', 'jump']);
  });
});

describe('rejections', () => {
  it('rejects bad versions and payloads', () => {
    expect(() => createNetworkProtocol(0, [])).toThrow(
      'NetworkProtocol: version must be a positive integer',
    );
    expect(() => createNetworkProtocol(1.5, [])).toThrow(
      'NetworkProtocol: version must be a positive integer',
    );
    expect(() => createNetworkProtocol(1, 'x' as never)).toThrow(
      'NetworkProtocol: messages must be an array',
    );
  });

  it('rejects bad message ids and names', () => {
    expect(() => createNetworkProtocol(1, [{ ...MOVE, id: -1 }])).toThrow(
      'NetworkProtocol: messages 0.id must be a non-negative integer',
    );
    expect(() => createNetworkProtocol(1, [MOVE, MOVE])).toThrow(
      'NetworkProtocol: duplicate message id 1',
    );
    expect(() => createNetworkProtocol(1, [{ ...MOVE, name: '' }])).toThrow(
      'NetworkProtocol: messages 0.name must be a non-empty string',
    );
    expect(() => createNetworkProtocol(1, [MOVE, { ...JUMP, name: 'move' }])).toThrow(
      'NetworkProtocol: duplicate message name move',
    );
  });

  it('rejects bad fields', () => {
    expect(() => createNetworkProtocol(1, [{ ...MOVE, fields: 'x' as never }])).toThrow(
      'NetworkProtocol: messages 0.fields must be an array',
    );
    expect(() =>
      createNetworkProtocol(1, [{ ...MOVE, fields: [{ name: '', type: 'int' }] }]),
    ).toThrow('NetworkProtocol: messages 0.fields 0.name must be a non-empty string');
    expect(() =>
      createNetworkProtocol(1, [{ ...MOVE, fields: [{ name: 'x', type: 'int' }, { name: 'x', type: 'bool' }] }]),
    ).toThrow('NetworkProtocol: messages 0 has duplicate field x');
    expect(() =>
      createNetworkProtocol(1, [{ ...MOVE, fields: [{ name: 'x', type: 'byte' as never }] }]),
    ).toThrow('NetworkProtocol: messages 0.fields 0.type must be int, float, string, or bool');
  });
});

describe('encoding', () => {
  it('encodes a typed record in field order', () => {
    expect(encodeMessage(protocol(), 'move', { x: 1, y: 2.5, name: 'alex' })).toEqual({
      messageId: 1,
      values: [1, 2.5, 'alex'],
    });
  });

  it('returns null for unknown names, wrong counts, and type mismatches', () => {
    const p = protocol();
    expect(encodeMessage(p, 'nope', {})).toBeNull();
    expect(encodeMessage(p, 'move', { x: 1, y: 2.5 })).toBeNull();
    expect(encodeMessage(p, 'move', { x: 1, y: 2.5, name: 'a', z: 0 })).toBeNull();
    expect(encodeMessage(p, 'move', { x: 1.5, y: 2.5, name: 'a' })).toBeNull();
    expect(encodeMessage(p, 'move', { x: 1, y: NaN, name: 'a' })).toBeNull();
    expect(encodeMessage(p, 'move', { x: 1, y: 2.5, name: 5 })).toBeNull();
    expect(encodeMessage(p, 'jump', { active: 'yes' })).toBeNull();
  });
});

describe('decoding', () => {
  it('round-trips envelopes into typed records', () => {
    expect(decodeMessage(protocol(), { messageId: 1, values: [1, 2.5, 'alex'] })).toEqual({
      name: 'move',
      values: { x: 1, y: 2.5, name: 'alex' },
    });
    expect(decodeMessage(protocol(), { messageId: 2, values: [true] })).toEqual({
      name: 'jump',
      values: { active: true },
    });
  });

  it('returns null for unknown ids, count mismatches, and type mismatches', () => {
    const p = protocol();
    expect(decodeMessage(p, { messageId: 9, values: [] })).toBeNull();
    expect(decodeMessage(p, { messageId: 1, values: [1, 2.5] })).toBeNull();
    expect(decodeMessage(p, { messageId: 1, values: [1, 2.5, 'a', true] })).toBeNull();
    expect(decodeMessage(p, { messageId: 1, values: [1.5, 2.5, 'a'] })).toBeNull();
    expect(decodeMessage(p, { messageId: 1, values: [1, 2.5, 3] })).toBeNull();
  });
});

describe('compatibility', () => {
  const p = protocol();

  it('accepts identical and empty protocols', () => {
    expect(protocolCompatibility(p, protocol())).toEqual({ compatible: true });
    expect(protocolCompatibility(createNetworkProtocol(1, []), createNetworkProtocol(1, []))).toEqual({
      compatible: true,
    });
  });

  it('rejects version mismatches', () => {
    expect(protocolCompatibility(p, createNetworkProtocol(2, [MOVE, JUMP]))).toEqual({
      compatible: false,
      reason: 'version mismatch (1 != 2)',
    });
  });

  it('rejects missing message ids and name mismatches', () => {
    expect(protocolCompatibility(p, createNetworkProtocol(1, [MOVE]))).toEqual({
      compatible: false,
      reason: 'missing message id 2',
    });
    expect(protocolCompatibility(p, createNetworkProtocol(1, [MOVE, { ...JUMP, name: 'leap' }]))).toEqual({
      compatible: false,
      reason: 'message id 2 name mismatch (jump != leap)',
    });
  });
});
