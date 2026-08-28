/**
 * Core commands (191): the first command implementations over 190's parser — a small registry of
 * specs plus handlers whose effects are PURE result descriptors the wiring applies. No world
 * access, no mutation; every command is headless-safe and deterministic.
 *
 * Commands (vanilla-inspired; all operator level 2):
 *   time set <value:int> | time add <amount:int>      -> set_time / add_time
 *   weather clear|rain|thunder                        -> set_weather
 *   gamemode survival|creative|adventure|spectator    -> set_gamemode
 *   give <target> <item> [count:int]                  -> give_item (count defaults 1, must be > 0)
 *   tp <target> <x:float> <y:float> <z:float>         -> teleport
 *
 * `executeCoreCommand(input, permissionLevel)` runs the full pipeline: split -> spec lookup ->
 * permission check -> typed parse -> semantic validation -> effect. Failures are structured:
 * `error` (parse/semantic) or `denied` (permission).
 */
import {
  hasCommandPermission,
  parseCommand,
  splitCommand,
  type CommandSpec,
} from './CommandParser';

export const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
export type GameMode = (typeof GAMEMODES)[number];

export const WEATHERS = ['clear', 'rain', 'thunder'] as const;
export type WeatherKind = (typeof WEATHERS)[number];

/** The pure effect a core command produces (the wiring applies it). */
export type CommandEffect =
  | { kind: 'set_time'; value: number }
  | { kind: 'add_time'; amount: number }
  | { kind: 'set_weather'; weather: WeatherKind }
  | { kind: 'set_gamemode'; mode: GameMode }
  | { kind: 'give_item'; target: string; item: string; count: number }
  | { kind: 'teleport'; target: string; x: number; y: number; z: number };

export type CoreCommandResult =
  | { status: 'ok'; effect: CommandEffect }
  | { status: 'error'; error: string }
  | { status: 'denied'; command: string };

/** The core command specs (190's typed grammar). */
const CORE_COMMAND_SPECS: readonly CommandSpec[] = [
  {
    name: 'time',
    permissionLevel: 2,
    args: [
      { name: 'action', type: 'string', required: true },
      { name: 'value', type: 'integer', required: true },
    ],
  },
  {
    name: 'weather',
    permissionLevel: 2,
    args: [{ name: 'weather', type: 'string', required: true }],
  },
  {
    name: 'gamemode',
    permissionLevel: 2,
    args: [{ name: 'mode', type: 'string', required: true }],
  },
  {
    name: 'give',
    permissionLevel: 2,
    args: [
      { name: 'target', type: 'target', required: true },
      { name: 'item', type: 'string', required: true },
      { name: 'count', type: 'integer', required: false },
    ],
  },
  {
    name: 'tp',
    permissionLevel: 2,
    args: [
      { name: 'target', type: 'target', required: true },
      { name: 'x', type: 'float', required: true },
      { name: 'y', type: 'float', required: true },
      { name: 'z', type: 'float', required: true },
    ],
  },
];

/** The registered core command specs. */
export function coreCommandSpecs(): readonly CommandSpec[] {
  return CORE_COMMAND_SPECS;
}

function asString(args: readonly (string | number | boolean)[], index: number): string {
  return args[index] as string;
}

function asNumber(args: readonly (string | number | boolean)[], index: number): number {
  return args[index] as number;
}

function runHandler(
  name: string,
  args: readonly (string | number | boolean)[],
): { effect: CommandEffect } | { error: string } {
  switch (name) {
    case 'time': {
      const action = asString(args, 0);
      const value = asNumber(args, 1);
      if (action === 'set') return { effect: { kind: 'set_time', value } };
      if (action === 'add') return { effect: { kind: 'add_time', amount: value } };
      return { error: `unknown time action '${action}'` };
    }
    case 'weather': {
      const weather = asString(args, 0);
      if ((WEATHERS as readonly string[]).includes(weather)) {
        return { effect: { kind: 'set_weather', weather: weather as WeatherKind } };
      }
      return { error: `unknown weather '${weather}'` };
    }
    case 'gamemode': {
      const mode = asString(args, 0);
      if ((GAMEMODES as readonly string[]).includes(mode)) {
        return { effect: { kind: 'set_gamemode', mode: mode as GameMode } };
      }
      return { error: `unknown gamemode '${mode}'` };
    }
    case 'give': {
      const target = asString(args, 0);
      const item = asString(args, 1);
      const count = args.length > 2 ? asNumber(args, 2) : 1;
      if (count <= 0) return { error: 'count must be positive' };
      return { effect: { kind: 'give_item', target, item, count } };
    }
    case 'tp':
      return {
        effect: {
          kind: 'teleport',
          target: asString(args, 0),
          x: asNumber(args, 1),
          y: asNumber(args, 2),
          z: asNumber(args, 3),
        },
      };
  }
  return { error: `unhandled command '${name}'` };
}

/**
 * Execute a core command: split -> spec lookup -> permission check -> typed parse -> semantic
 * validation -> effect. Pure and headless-safe.
 */
export function executeCoreCommand(input: string, permissionLevel: number): CoreCommandResult {
  const split = splitCommand(input);
  if (split === null) return { status: 'error', error: 'empty command' };
  const spec = CORE_COMMAND_SPECS.find((s) => s.name === split.name);
  if (spec === undefined) return { status: 'error', error: `unknown command '${split.name}'` };
  if (!hasCommandPermission(permissionLevel, spec.permissionLevel)) {
    return { status: 'denied', command: spec.name };
  }
  const parsed = parseCommand(input, spec);
  if (parsed === null) return { status: 'error', error: 'empty command' };
  if (!parsed.ok) return { status: 'error', error: parsed.error };
  const handled = runHandler(parsed.command.name, parsed.command.args);
  if ('error' in handled) return { status: 'error', error: handled.error };
  return { status: 'ok', effect: handled.effect };
}
