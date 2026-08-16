import { describe, it, expect } from 'vitest';
import {
  GAMEMODES,
  WEATHERS,
  coreCommandSpecs,
  executeCoreCommand,
} from '../../src/simulation/CoreCommands';

describe('core command registry', () => {
  it('registers the five commands at operator level 2', () => {
    const specs = coreCommandSpecs();
    expect(specs.map((s) => s.name)).toEqual(['time', 'weather', 'gamemode', 'give', 'tp']);
    for (const spec of specs) {
      expect(spec.permissionLevel).toBe(2);
    }
    expect(GAMEMODES).toEqual(['survival', 'creative', 'adventure', 'spectator']);
    expect(WEATHERS).toEqual(['clear', 'rain', 'thunder']);
  });
});

describe('time command', () => {
  it('sets and adds time', () => {
    expect(executeCoreCommand('/time set 1000', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_time', value: 1000 },
    });
    expect(executeCoreCommand('/time add 100', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'add_time', amount: 100 },
    });
  });

  it('rejects unknown actions and parse failures', () => {
    expect(executeCoreCommand('/time reset 100', 2)).toEqual({
      status: 'error',
      error: "unknown time action 'reset'",
    });
    expect(executeCoreCommand('/time set abc', 2)).toEqual({
      status: 'error',
      error: "expected integer for 'value', got 'abc'",
    });
  });
});

describe('weather command', () => {
  it('sets each weather', () => {
    expect(executeCoreCommand('/weather clear', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_weather', weather: 'clear' },
    });
    expect(executeCoreCommand('/weather rain', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_weather', weather: 'rain' },
    });
    expect(executeCoreCommand('/weather thunder', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_weather', weather: 'thunder' },
    });
  });

  it('rejects unknown weather', () => {
    expect(executeCoreCommand('/weather sunny', 2)).toEqual({
      status: 'error',
      error: "unknown weather 'sunny'",
    });
  });
});

describe('gamemode command', () => {
  it('sets each gamemode', () => {
    expect(executeCoreCommand('/gamemode creative', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_gamemode', mode: 'creative' },
    });
    expect(executeCoreCommand('/gamemode survival', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'set_gamemode', mode: 'survival' },
    });
  });

  it('rejects unknown gamemodes', () => {
    expect(executeCoreCommand('/gamemode hard', 2)).toEqual({
      status: 'error',
      error: "unknown gamemode 'hard'",
    });
  });
});

describe('give command', () => {
  it('gives with an explicit count and with the default count', () => {
    expect(executeCoreCommand('/give @p diamond 5', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'give_item', target: '@p', item: 'diamond', count: 5 },
    });
    expect(executeCoreCommand('/give @p diamond', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'give_item', target: '@p', item: 'diamond', count: 1 },
    });
  });

  it('rejects a non-positive count', () => {
    expect(executeCoreCommand('/give @p diamond 0', 2)).toEqual({
      status: 'error',
      error: 'count must be positive',
    });
  });
});

describe('tp command', () => {
  it('teleports with float coordinates', () => {
    expect(executeCoreCommand('/tp @p 1.5 64 2.5', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'teleport', target: '@p', x: 1.5, y: 64, z: 2.5 },
    });
  });

  it('rejects missing coordinates', () => {
    expect(executeCoreCommand('/tp @p 1 2', 2)).toEqual({
      status: 'error',
      error: "missing argument 'z'",
    });
  });
});

describe('permissions and dispatch', () => {
  it('denies insufficient permission before parsing', () => {
    expect(executeCoreCommand('/gamemode creative', 1)).toEqual({
      status: 'denied',
      command: 'gamemode',
    });
    expect(executeCoreCommand('/give @p diamond', 2)).toEqual({
      status: 'ok',
      effect: { kind: 'give_item', target: '@p', item: 'diamond', count: 1 },
    });
  });

  it('rejects unknown commands and empty input', () => {
    expect(executeCoreCommand('/gimme diamond', 2)).toEqual({
      status: 'error',
      error: "unknown command 'gimme'",
    });
    expect(executeCoreCommand('', 2)).toEqual({ status: 'error', error: 'empty command' });
  });
});
