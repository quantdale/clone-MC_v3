import { describe, it, expect } from 'vitest';
import { BlockId } from '../../src/world/BlockRegistry';
import { detectWitherSummon, consumeSummonStructure, isValidSoulBlock, isValidSkullBlock } from '../../src/simulation/WitherSummon';

function makeWorld(blocks: Map<string, number>) {
  return {
    getBlock(x:number,y:number,z:number){ return blocks.get(`${x},${y},${z}`) ?? BlockId.Air; },
    setBlock(x:number,y:number,z:number,id:number){ blocks.set(`${x},${y},${z}`, id); },
  };
}

function key(x:number,y:number,z:number){ return `${x},${y},${z}`; }

describe('WitherSummon', () => {
  it('valid X-oriented summon activates', () => {
    const m=new Map<string,number>();
    // T center 0,0,0 soul, arms x±1, stem y-1, skulls y+1
    m.set(key(0,0,0), BlockId.SoulSand);
    m.set(key(1,0,0), BlockId.SoulSand);
    m.set(key(-1,0,0), BlockId.SoulSand);
    m.set(key(0,-1,0), BlockId.SoulSand);
    m.set(key(0,1,0), BlockId.WitherSkull);
    m.set(key(1,1,0), BlockId.WitherSkull);
    m.set(key(-1,1,0), BlockId.WitherSkull);
    const w=makeWorld(m);
    const res=detectWitherSummon(w, {x:1,y:1,z:0});
    expect(res).not.toBeNull();
    expect(res!.orientation).toBe('x');
    expect(res!.spawn).toEqual({x:0,y:1,z:0});
  });
  it('valid Z-oriented summon activates', () => {
    const m=new Map<string,number>();
    m.set(key(0,0,0), BlockId.SoulSand);
    m.set(key(0,0,1), BlockId.SoulSand);
    m.set(key(0,0,-1), BlockId.SoulSand);
    m.set(key(0,-1,0), BlockId.SoulSand);
    m.set(key(0,1,0), BlockId.WitherSkull);
    m.set(key(0,1,1), BlockId.WitherSkull);
    m.set(key(0,1,-1), BlockId.WitherSkull);
    const w=makeWorld(m);
    const res=detectWitherSummon(w, {x:0,y:1,z:1});
    expect(res).not.toBeNull();
    expect(res!.orientation).toBe('z');
  });
  it('soul soil variant accepted', () => {
    const m=new Map<string,number>();
    m.set(key(5,0,5), BlockId.SoulSoil);
    m.set(key(6,0,5), BlockId.SoulSoil);
    m.set(key(4,0,5), BlockId.SoulSoil);
    m.set(key(5,-1,5), BlockId.SoulSoil);
    m.set(key(5,1,5), BlockId.WitherSkull);
    m.set(key(6,1,5), BlockId.WitherSkull);
    m.set(key(4,1,5), BlockId.WitherSkull);
    const w=makeWorld(m);
    expect(detectWitherSummon(w,{x:5,y:1,z:5})).not.toBeNull();
  });
  it('incomplete pattern rejected', () => {
    const m=new Map<string,number>();
    m.set(key(0,0,0), BlockId.SoulSand);
    m.set(key(1,0,0), BlockId.SoulSand);
    // missing -1 arm
    m.set(key(0,-1,0), BlockId.SoulSand);
    m.set(key(0,1,0), BlockId.WitherSkull);
    m.set(key(1,1,0), BlockId.WitherSkull);
    m.set(key(-1,1,0), BlockId.WitherSkull);
    const w=makeWorld(m);
    expect(detectWitherSummon(w,{x:0,y:1,z:0})).toBeNull();
  });
  it('duplicate activation prevented after consumption', () => {
    const m=new Map<string,number>();
    m.set(key(0,0,0), BlockId.SoulSand);
    m.set(key(1,0,0), BlockId.SoulSand);
    m.set(key(-1,0,0), BlockId.SoulSand);
    m.set(key(0,-1,0), BlockId.SoulSand);
    m.set(key(0,1,0), BlockId.WitherSkull);
    m.set(key(1,1,0), BlockId.WitherSkull);
    m.set(key(-1,1,0), BlockId.WitherSkull);
    const w=makeWorld(m);
    const check=detectWitherSummon(w,{x:0,y:1,z:0})!;
    expect(check).not.toBeNull();
    consumeSummonStructure(w, check);
    expect(detectWitherSummon(w,{x:0,y:1,z:0})).toBeNull();
  });
  it('consume clears 7 blocks', () => {
    const m=new Map<string,number>();
    m.set(key(0,0,0), BlockId.SoulSand);
    m.set(key(1,0,0), BlockId.SoulSand);
    m.set(key(-1,0,0), BlockId.SoulSand);
    m.set(key(0,-1,0), BlockId.SoulSand);
    m.set(key(0,1,0), BlockId.WitherSkull);
    m.set(key(1,1,0), BlockId.WitherSkull);
    m.set(key(-1,1,0), BlockId.WitherSkull);
    const w=makeWorld(m);
    const check=detectWitherSummon(w,{x:0,y:1,z:0})!;
    consumeSummonStructure(w, check);
    for(const p of [...check.soulPositions, ...check.skullPositions]){
      expect(w.getBlock(p.x,p.y,p.z)).toBe(BlockId.Air);
    }
  });
  it('isValidSoulBlock helpers', () => {
    expect(isValidSoulBlock(BlockId.SoulSand)).toBe(true);
    expect(isValidSoulBlock(BlockId.SoulSoil)).toBe(true);
    expect(isValidSoulBlock(BlockId.Stone)).toBe(false);
  });
  it('isValidSkullBlock helpers', () => {
    expect(isValidSkullBlock(BlockId.WitherSkull)).toBe(true);
    expect(isValidSkullBlock(BlockId.SoulSand)).toBe(false);
  });
  it('malformed placed coord returns null', () => {
    const w=makeWorld(new Map());
    expect(detectWitherSummon(w, {x:NaN,y:0,z:0} as unknown as {x:number,y:number,z:number})).toBeNull();
  });
  it('localized check only reads nearby blocks', () => {
    let reads=0;
    const base=new Map<string,number>();
    base.set(key(0,0,0), BlockId.SoulSand);
    base.set(key(1,0,0), BlockId.SoulSand);
    base.set(key(-1,0,0), BlockId.SoulSand);
    base.set(key(0,-1,0), BlockId.SoulSand);
    base.set(key(0,1,0), BlockId.WitherSkull);
    base.set(key(1,1,0), BlockId.WitherSkull);
    base.set(key(-1,1,0), BlockId.WitherSkull);
    const w={
      getBlock(x:number,y:number,z:number){ reads++; return base.get(key(x,y,z)) ?? BlockId.Air; }
    };
    detectWitherSummon(w,{x:0,y:1,z:0});
    expect(reads).toBeLessThan(100); // bounded
  });
});
