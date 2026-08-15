import { describe, it, expect } from 'vitest';
import { GoalSelector, GoalFlag, type Goal } from '../../src/simulation/GoalSelector';

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
