import { describe, it, expect } from 'vitest';
import { createWitherSkull, stepWitherSkull, skullVelocityTowards, skullExplosionStrength, skullDamage, scaledWitherDuration, WITHER_SKULL_LIFETIME } from '../../src/simulation/WitherSkull';
import { CollisionResolver } from '../../src/world/CollisionResolver';
import { BlockId } from '../../src/world/BlockRegistry';

function fakeWorld(){
  return {
    getBlock: ()=>BlockId.Air,
    isOpaque: ()=>false,
    getSkyLight: ()=>15,
    getBlockLight: ()=>15,
    inBounds: ()=>true,
  } as unknown as import('../../src/world/CollisionResolver').ShapeWorld;
}

describe('WitherSkull', () => {
  it('creates normal skull', () => {
    const s=createWitherSkull(0,0,0,1,0,0,'normal',1);
    expect(s.kind).toBe('normal');
    expect(s.ownerWitherId).toBe(1);
  });
  it('velocity towards target normalized', () => {
    const v=skullVelocityTowards(0,0,0,3,0,0,'normal');
    expect(v[0]).toBeCloseTo(1.5);
    expect(v[1]).toBe(0);
  });
  it('normal vs blue strengths', () => {
    expect(skullExplosionStrength('normal')).toBe(1);
    expect(skullExplosionStrength('blue')).toBe(2.5);
    expect(skullDamage('normal')).toBe(8);
    expect(skullDamage('blue')).toBe(12);
  });
  it('scaled durations', () => {
    expect(scaledWitherDuration('normal','peaceful')).toBe(0);
    expect(scaledWitherDuration('normal','easy')).toBe(100);
    expect(scaledWitherDuration('normal','normal')).toBe(200);
    expect(scaledWitherDuration('blue','normal')).toBe(800);
    expect(scaledWitherDuration('normal','hard')).toBe(300);
  });
  it('lifetime expiry after 120', () => {
    const resolver=new CollisionResolver();
    const world=fakeWorld();
    let s=createWitherSkull(0,10,0,0,0,0,'normal',null);
    for(let i=0;i<WITHER_SKULL_LIFETIME;i++){
      const r=stepWitherSkull(world,resolver,s,[],{maxAgeTicks:WITHER_SKULL_LIFETIME});
      expect(r.expired).toBe(false);
      s=r.state;
    }
    const r=stepWitherSkull(world,resolver,s,[],{maxAgeTicks:WITHER_SKULL_LIFETIME});
    expect(r.expired).toBe(true);
  });
  it('hits entity within radius', () => {
    const resolver=new CollisionResolver();
    const world=fakeWorld();
    const s=createWitherSkull(0,0,0,1,0,0,'normal',null);
    const targets=[{id:2,x:1,y:0,z:0,radius:0.5}];
    const r=stepWitherSkull(world,resolver,s,targets);
    expect(r.hitEntityId).toBe(2);
  });
  it('owner immunity for 5 ticks', () => {
    const resolver=new CollisionResolver();
    const world=fakeWorld();
    const s=createWitherSkull(0,0,0,0,0,0,'normal',10);
    // target is owner at same pos, should be immune
    const targets=[{id:10,x:0,y:0,z:0,radius:0.5}];
    const r=stepWitherSkull(world,resolver,s,targets);
    expect(r.hitEntityId).toBeNull();
  });
});
