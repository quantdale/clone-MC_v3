import { describe, it, expect } from 'vitest';
import {
  hasCommandPermission,
  parseCommand,
  splitCommand,
  type CommandSpec,
} from '../../src/simulation/CommandParser';

const GAMEMODE: CommandSpec = {
  name: 'gamemode',
  permissionLevel: 2,
  args: [{ name: 'mode', type: 'string', required: true }],
};

const GAMERULE: CommandSpec = {
  name: 'gamerule',
  permissionLevel: 2,
  args: [
    { name: 'rule', type: 'string', required: true },
    { name: 'value', type: 'boolean', required: false },
  ],
};

const TP: CommandSpec = {
  name: 'tp',
  permissionLevel: 2,
  args: [
    { name: 'target', type: 'target', required: true },
    { name: 'x', type: 'float', required: true },
    { name: 'y', type: 'float', required: true },
    { name: 'z', type: 'float', required: true },
  ],
};

const SAY: CommandSpec = {
  name: 'say',
  permissionLevel: 2,
  args: [{ name: 'message', type: 'string', required: true }],
};

function ok(
  result: ReturnType<typeof parseCommand>,
): { ok: true; command: { name: string; args: readonly (string | number | boolean)[] } } {
  if (result === null) throw new Error('expected a parse result');
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe('splitCommand', () => {
  it('splits name and tokens with or without a leading slash', () => {
    expect(splitCommand('/time set day')).toEqual({ name: 'time', tokens: ['set', 'day'] });
    expect(splitCommand('time set day')).toEqual({ name: 'time', tokens: ['set', 'day'] });
    expect(splitCommand('  /GAMEMODE survival ')).toEqual({ name: 'gamemode', tokens: ['survival'] });
  });

  it('returns null for empty/whitespace input', () => {
    expect(splitCommand('')).toBeNull();
    expect(splitCommand('   ')).toBeNull();
    expect(splitCommand('/')).toBeNull();
  });
});

describe('parseCommand', () => {
  it('parses a string argument', () => {
    const r = ok(parseCommand('/gamemode survival', GAMEMODE));
    expect(r.command).toEqual({ name: 'gamemode', args: ['survival'] });
  });

  it('parses optional boolean arguments', () => {
    const r = ok(parseCommand('/gamerule keepInventory true', GAMERULE));
    expect(r.command.args).toEqual(['keepInventory', true]);
    const r2 = ok(parseCommand('/gamerule keepInventory', GAMERULE));
    expect(r2.command.args).toEqual(['keepInventory']);
  });

  it('parses target + numeric arguments (ints and floats)', () => {
    const r = ok(parseCommand('/tp @p 10 64 -20', TP));
    expect(r.command.args).toEqual(['@p', 10, 64, -20]);
    const r2 = ok(parseCommand('/tp @s 1.5 64 2.5', TP));
    expect(r2.command.args).toEqual(['@s', 1.5, 64, 2.5]);
  });

  it('handles quoted string arguments', () => {
    const r = ok(parseCommand('/say "hello world"', SAY));
    expect(r.command.args).toEqual(['hello world']);
    const r2 = ok(parseCommand("/say 'single quoted'", SAY));
    expect(r2.command.args).toEqual(['single quoted']);
  });

  it('matches command names case-insensitively', () => {
    const r = ok(parseCommand('GAMEMODE creative', GAMEMODE));
    expect(r.command.name).toBe('gamemode');
  });
});

describe('parse errors', () => {
  it('rejects unknown commands', () => {
    const r = parseCommand('/gimme diamond', GAMEMODE);
    expect(r).toEqual({ ok: false, error: "unknown command 'gimme'" });
  });

  it('rejects missing required arguments', () => {
    expect(parseCommand('/gamemode', GAMEMODE)).toEqual({
      ok: false,
      error: "missing argument 'mode'",
    });
    expect(parseCommand('/tp @p 1 2', TP)).toEqual({ ok: false, error: "missing argument 'z'" });
  });

  it('rejects unexpected arguments', () => {
    expect(parseCommand('/gamemode survival extra', GAMEMODE)).toEqual({
      ok: false,
      error: "unexpected argument 'extra'",
    });
  });

  it('rejects type mismatches', () => {
    expect(parseCommand('/gamerule keepInventory yes', GAMERULE)).toEqual({
      ok: false,
      error: "expected boolean for 'value', got 'yes'",
    });
    expect(parseCommand('/tp @p abc 64 0', TP)).toEqual({
      ok: false,
      error: "expected float for 'x', got 'abc'",
    });
  });

  it('returns null for empty input', () => {
    expect(parseCommand('', GAMEMODE)).toBeNull();
  });
});

describe('permission context', () => {
  it('requires the declared operator level', () => {
    expect(GAMEMODE.permissionLevel).toBe(2);
    expect(hasCommandPermission(2, 2)).toBe(true);
    expect(hasCommandPermission(4, 2)).toBe(true);
    expect(hasCommandPermission(1, 2)).toBe(false);
    expect(hasCommandPermission(0, 0)).toBe(true);
  });
});
