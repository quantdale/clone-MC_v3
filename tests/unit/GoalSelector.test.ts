import { describe, it, expect } from 'vitest';
import {
  GoalSelector,
  GoalFlag,
  SENSORY_CADENCE_INTERVAL_TICKS,
  isSensoryTick,
  type Goal,
} from '../../src/simulation/GoalSelector';

interface StubOptions {
  canUse?: () => boolean;
  canContinueToUse?: () => boolean;
  log?: string[];
  name?: string;
}

function makeGoal(flags: GoalFlag[], opts: StubOptions = {}): Goal {
  const log = opts.log;
  const name = opts.name ?? 'goal';
  const goal: Goal = {
    flags,
    canUse: opts.canUse ?? (() => true),
    start: () => log?.push(`start:${name}`),
    tick: () => log?.push(`tick:${name}`),
    stop: () => log?.push(`stop:${name}`),
  };
  if (opts.canContinueToUse) {
    goal.canContinueToUse = opts.canContinueToUse;
  }
  return goal;
}

describe('GoalSelector — single eligible goal', () => {
  it('starts and ticks a single eligible goal', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    const goal = makeGoal([GoalFlag.Move], { log, name: 'a' });
    selector.addGoal(0, goal);

    selector.tick();

    expect(log).toEqual(['start:a', 'tick:a']);
    expect(selector.getRunning()).toEqual([goal]);
  });
});

describe('GoalSelector — interruption', () => {
  it('a higher-priority goal interrupts a running lower-priority goal sharing a flag', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    let highCanUse = false;
    const low = makeGoal([GoalFlag.Move], { log, name: 'low' });
    const high = makeGoal([GoalFlag.Move], { log, name: 'high', canUse: () => highCanUse });
    selector.addGoal(5, low);
    selector.addGoal(0, high);

    selector.tick(); // low starts (high not yet eligible)
    expect(selector.getRunning()).toEqual([low]);

    log.length = 0;
    highCanUse = true;
    selector.tick(); // high becomes eligible and interrupts low

    expect(log.indexOf('stop:low')).toBeLessThan(log.indexOf('start:high'));
    expect(selector.getRunning()).toEqual([high]);
  });
});

describe('GoalSelector — disjoint flags', () => {
  it('runs two goals with disjoint flags simultaneously', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    const moveGoal = makeGoal([GoalFlag.Move], { log, name: 'move' });
    const lookGoal = makeGoal([GoalFlag.Look], { log, name: 'look' });
    selector.addGoal(0, moveGoal);
    selector.addGoal(1, lookGoal);

    selector.tick();

    expect(new Set(selector.getRunning())).toEqual(new Set([moveGoal, lookGoal]));
  });
});

describe('GoalSelector — continuation', () => {
  it('stops a running goal whose canContinueToUse turns false, with no competing goal', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    let keepRunning = true;
    const goal = makeGoal([GoalFlag.Move], { log, name: 'a', canContinueToUse: () => keepRunning });
    selector.addGoal(0, goal);

    selector.tick();
    expect(selector.getRunning()).toEqual([goal]);

    keepRunning = false;
    log.length = 0;
    selector.tick();

    expect(log).toEqual(['stop:a']);
    expect(selector.getRunning()).toEqual([]);
  });

  it('falls back to canUse when canContinueToUse is absent', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    let canUse = true;
    const goal = makeGoal([GoalFlag.Move], { log, name: 'a', canUse: () => canUse });
    selector.addGoal(0, goal);

    selector.tick();
    expect(selector.getRunning()).toEqual([goal]);

    canUse = false;
    selector.tick();

    expect(selector.getRunning()).toEqual([]);
  });
});

describe('GoalSelector — lifecycle ordering', () => {
  it('does not call tick() on a goal stopped this same tick', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    let highCanUse = false;
    const low = makeGoal([GoalFlag.Move], { log, name: 'low' });
    const high = makeGoal([GoalFlag.Move], { log, name: 'high', canUse: () => highCanUse });
    selector.addGoal(5, low);
    selector.addGoal(0, high);
    selector.tick();

    log.length = 0;
    highCanUse = true;
    selector.tick();

    expect(log).not.toContain('tick:low');
    expect(log).toContain('tick:high');
  });
});

describe('GoalSelector — removeGoal / clear', () => {
  it('removeGoal stops a running goal and prevents future selection', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    const goal = makeGoal([GoalFlag.Move], { log, name: 'a' });
    selector.addGoal(0, goal);
    selector.tick();
    expect(selector.getRunning()).toEqual([goal]);

    selector.removeGoal(goal);
    expect(log).toContain('stop:a');
    expect(selector.getRunning()).toEqual([]);

    log.length = 0;
    selector.tick();
    expect(log).toEqual([]);
  });

  it('removeGoal on a never-added goal is a no-op', () => {
    const selector = new GoalSelector();
    const goal = makeGoal([GoalFlag.Move]);
    expect(() => selector.removeGoal(goal)).not.toThrow();
  });

  it('clear stops every running goal with disjoint flags', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    const moveGoal = makeGoal([GoalFlag.Move], { log, name: 'move' });
    const lookGoal = makeGoal([GoalFlag.Look], { log, name: 'look' });
    selector.addGoal(0, moveGoal);
    selector.addGoal(1, lookGoal);
    selector.tick();

    log.length = 0;
    selector.clear();

    expect(log).toContain('stop:move');
    expect(log).toContain('stop:look');
    expect(selector.getRunning()).toEqual([]);
  });
});

describe('GoalSelector — tickClocked sensory cadence', () => {
  const ENTITY_ID = 1; // slot fires when (tick + 1) % 4 === 0, i.e. ticks 3, 7, ...
  const INTERVAL = SENSORY_CADENCE_INTERVAL_TICKS;

  it('isSensoryTick staggers slots per entity id', () => {
    expect(isSensoryTick(3, 1)).toBe(true);
    expect(isSensoryTick(4, 1)).toBe(false);
    expect(isSensoryTick(0, 4)).toBe(true);
    expect(isSensoryTick(0, 0)).toBe(true);
    // Negative global ticks still resolve to a well-defined phase.
    expect(isSensoryTick(-1, 1)).toBe(true);
  });

  it('runs Move goals every call regardless of the cadence slot', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    const move = makeGoal([GoalFlag.Move], { log, name: 'move' });
    selector.addGoal(0, move);

    for (let tick = 0; tick < INTERVAL * 2; tick++) {
      selector.tickClocked(tick, ENTITY_ID);
    }

    const moveTicks = log.filter((entry) => entry === 'tick:move').length;
    expect(moveTicks).toBe(INTERVAL * 2);
    expect(selector.getRunning()).toEqual([move]);
  });

  it('evaluates a sensory goal only on its cadence slot', () => {
    let canUseCalls = 0;
    const selector = new GoalSelector();
    const target: Goal = {
      flags: [GoalFlag.Target],
      canUse: () => {
        canUseCalls++;
        return true;
      },
      start: () => {},
      tick: () => {},
    };
    selector.addGoal(0, target);

    for (let tick = 0; tick < INTERVAL; tick++) {
      selector.tickClocked(tick, ENTITY_ID);
    }
    // Only the single in-phase tick evaluated it.
    expect(canUseCalls).toBe(1);
    expect(selector.getRunning()).toEqual([target]);
  });

  it('holds a running sensory goal on off-ticks without ticking or stopping it', () => {
    const log: string[] = [];
    const selector = new GoalSelector();
    let keepRunning = true;
    const look = makeGoal([GoalFlag.Look], { log, name: 'look', canContinueToUse: () => keepRunning });
    selector.addGoal(0, look);

    const dueTick = INTERVAL - (ENTITY_ID % INTERVAL); // (tick + id) % interval === 0
    selector.tickClocked(dueTick, ENTITY_ID); // cadence fires → goal starts
    expect(selector.getRunning()).toEqual([look]);
    expect(log).toContain('start:look');

    log.length = 0;
    keepRunning = false; // would drop it under plain tick(); off-cadence must not even ask
    selector.tickClocked(dueTick + 1, ENTITY_ID);
    selector.tickClocked(dueTick + 2, ENTITY_ID);
    expect(log).toEqual([]);
    expect(selector.getRunning()).toEqual([look]);

    log.length = 0;
    selector.tickClocked(dueTick + INTERVAL, ENTITY_ID); // next slot re-evaluates
    expect(log).toContain('stop:look');
    expect(selector.getRunning()).toEqual([]);
  });
});
