import { describe, it, expect } from 'vitest';
import { createDefaultBossRegistry } from '../../src/simulation/BossFramework';
import { createWither, tickWither, damageWither, healWither, onWitherKill, serializeWither, deserializeWither, bossBarProgress, WITHER_CHARGE_TICKS } from '../../src/simulation/WitherBoss';

function witherDef(){
  const reg=createDefaultBossRegistry();
  return reg.getByKey('wither')!;
}

describe('WitherBoss core', () => {
  it('creates wither spawning at full health', () => {
    const def=witherDef();
    const w=createWither(1,0,64,0,def);
    expect(w.bossState.status).toBe('SPAWNING');
    expect(w.bossState.health).toBe(300);
    expect(w.invulnerableTicks).toBe(WITHER_CHARGE_TICKS);
  });
  it('invulnerable during charge', () => {
    const def=witherDef();
    let w=createWither(2,0,64,0,def);
    const res=damageWither(w,def,50,false);
    expect(res.state.bossState.health).toBe(300);
    expect(res.damageApplied).toBe(0);
    // tick a few times still invulnerable
    for(let i=0;i<5;i++) w=tickWither(w,def,i).state;
    const res2=damageWither(w,def,50,false);
    expect(res2.damageApplied).toBe(0);
  });
  it('spawn explosion exactly once at tick 220', () => {
    const def=witherDef();
    let w=createWither(3,10,64,10,def);
    let explodedAt:number|null=null;
    let count=0;
    for(let i=0;i<230;i++){
      const r=tickWither(w,def,i);
      if(r.spawnExplosion){ explodedAt=i+1; count++; }
      w=r.state;
    }
    expect(explodedAt).toBe(220);
    expect(count).toBe(1);
    expect(w.hasSpawnExploded).toBe(true);
    expect(w.bossState.status).toBe('ACTIVE');
  });
  it('save/load during charge resumes correctly', () => {
    const def=witherDef();
    let w=createWither(4,0,64,0,def);
    for(let i=0;i<100;i++) w=tickWither(w,def,i).state;
    expect(w.bossState.status).toBe('SPAWNING');
    const ser=serializeWither(w);
    const deser=deserializeWither(ser);
    expect(deser.bossState.ticks).toBe(100);
    let cur=deser;
    let exploded=false;
    for(let i=100;i<230;i++){
      const r=tickWither(cur,def,i);
      if(r.spawnExplosion) exploded=true;
      cur=r.state;
    }
    expect(exploded).toBe(true);
    expect(cur.bossState.status).toBe('ACTIVE');
  });
  it('armored transition at 150', () => {
    const def=witherDef();
    let w=createWither(5,0,64,0,def);
    // fast-forward to ACTIVE
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    expect(w.bossState.phaseIndex).toBe(0);
    const dmg=damageWither(w,def,150,false);
    expect(dmg.state.bossState.health).toBe(150);
    expect(dmg.state.bossState.phaseIndex).toBe(1);
  });
  it('heal above threshold restores ranged', () => {
    const def=witherDef();
    let w=createWither(6,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    w=damageWither(w,def,200,false).state; // 100 health armored
    expect(w.bossState.phaseIndex).toBe(1);
    w=healWither(w,def,150);
    expect(w.bossState.health).toBe(250);
    expect(w.bossState.phaseIndex).toBe(0);
  });
  it('projectile immunity in armored', () => {
    const def=witherDef();
    let w=createWither(7,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    w=damageWither(w,def,200,false).state; // 100 armored
    const res=damageWither(w,def,10,true);
    expect(res.damageApplied).toBe(0);
    expect(res.state.bossState.health).toBe(100);
    const res2=damageWither(w,def,10,false);
    expect(res2.damageApplied).toBe(10);
  });
  it('passive regen 1 per 20 ticks', () => {
    const def=witherDef();
    let w=createWither(8,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    w=damageWither(w,def,1,false).state; // 299
    for(let i=0;i<20;i++) w=tickWither(w,def,220+i).state;
    expect(w.bossState.health).toBeCloseTo(300, 1);
  });
  it('kill heal adds 5', () => {
    const def=witherDef();
    let w=createWither(9,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    w=damageWither(w,def,10,false).state; // 290
    w=onWitherKill(w,def,false);
    expect(w.bossState.health).toBe(295);
    const w2=onWitherKill(w,def,true);
    expect(w2.bossState.health).toBe(295); // undead no heal
  });
  it('three-head targeting picks nearest', () => {
    const def=witherDef();
    let w=createWither(10,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    const candidates=[
      {id:2,x:5,y:64,z:0,alive:true},
      {id:1,x:1,y:64,z:0,alive:true},
      {id:3,x:10,y:64,z:0,alive:true},
    ];
    // tick 20 times to reach next acquisition interval (240)
    let r={state:w} as ReturnType<typeof tickWither>;
    for(let i=0;i<20;i++) r=tickWither(r.state,def,220+i,{candidates});
    expect(r.state.targets[0]).toBe(1);
  });
  it('dead target released', () => {
    const def=witherDef();
    let w=createWither(11,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    let r={state:w} as ReturnType<typeof tickWither>;
    for(let i=0;i<20;i++) r=tickWither(r.state,def,220+i,{candidates:[{id:5,x:1,y:64,z:0,alive:true}]});
    expect(r.state.targets[0]).toBe(5);
    // next tick with dead candidate - should clear
    r=tickWither(r.state,def,241,{candidates:[{id:5,x:1,y:64,z:0,alive:false}]});
    expect(r.state.targets[0]).toBeNull();
  });
  it('undead not targeted', () => {
    const def=witherDef();
    let w=createWither(12,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    let r={state:w} as ReturnType<typeof tickWither>;
    for(let i=0;i<20;i++) r=tickWither(r.state,def,220+i,{candidates:[{id:1,x:1,y:64,z:0,alive:true,isUndead:true},{id:2,x:2,y:64,z:0,alive:true}]});
    expect(r.state.targets[0]).toBe(2);
  });
  it('scan bounded to 30', () => {
    const def=witherDef();
    let w=createWither(13,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    const cands=Array.from({length:100},(_,i)=>({id:i,x:1,y:64,z:0,alive:true}));
    let r={state:w} as ReturnType<typeof tickWither>;
    for(let i=0;i<20;i++) r=tickWither(r.state,def,220+i,{candidates:cands});
    // should pick lowest ids among first 30? Actually sorted by id then distance, so id 0 should be picked
    expect(r.state.targets[0]).toBe(0);
  });
  it('bossBarProgress during charge scales linearly', () => {
    const def=witherDef();
    let w=createWither(14,0,64,0,def);
    expect(bossBarProgress(w)).toBe(0);
    for(let i=0;i<110;i++) w=tickWither(w,def,i).state;
    expect(bossBarProgress(w)).toBeCloseTo(0.5,2);
  });
  it('serialization round-trip', () => {
    const def=witherDef();
    let w=createWither(15,0,64,0,def);
    for(let i=0;i<50;i++) w=tickWither(w,def,i).state;
    const ser=serializeWither(w);
    const deser=deserializeWither(ser);
    expect(deser.id).toBe(w.id);
    expect(deser.bossState.ticks).toBe(w.bossState.ticks);
    expect(deser.x).toBe(w.x);
  });
  it('deterministic replay two runs equal', () => {
    const def=witherDef();
    const run=()=>{
      let w=createWither(16,0,64,0,def);
      const cands=[{id:1,x:10,y:64,z:0,alive:true}];
      for(let i=0;i<100;i++) w=tickWither(w,def,i,{candidates:cands, rng:()=>0.5}).state;
      return w;
    };
    const a=run(), b=run();
    expect(a).toEqual(b);
  });
  it('death defeated and no revive', () => {
    const def=witherDef();
    let w=createWither(17,0,64,0,def);
    for(let i=0;i<220;i++) w=tickWither(w,def,i).state;
    const res=damageWither(w,def,300,false);
    expect(res.defeated).toBe(true);
    expect(res.state.bossState.status).toBe('DEFEATED');
    const res2=damageWither(res.state,def,10,false);
    expect(res2.defeated).toBe(false);
    const healed=healWither(res.state,def,100);
    expect(healed.bossState.status).toBe('DEFEATED');
  });
});
