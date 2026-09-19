# Design: 279-shield-live-wiring

## Context/current state

`src/simulation/ShieldBlocking.ts` is a pure, tested contract for a 90-degree
shield arc, one durability point minimum per blocked hit, and axe-triggered
100-tick disable state. `PlayerEquipment` already owns an Offhand slot and
`Inventory.snapshot()` already serializes equipment/components. `Game` routes
hostile-mob, wither explosion, wither melee, and wither-skull damage through
`hurtPlayer`, but those calls currently go directly to `SurvivalSystem.damage`.
`InputManager` exposes right-button `useHeld` and discrete keyboard toggles;
`PlayerInteraction` consumes right-click placement/use input.

## Target state

The live Game owns only transient shield presentation/cooldown state. An item
with stable id 71 can be placed in Offhand by pressing `V` to swap with the
selected hotbar stack. Holding right-click while pointer-locked raises it.
The Game converts the player's `-Z`-forward radian yaw into the framework's
`+Z`-zero bearing convention as `180 + degrees(player.yaw)`, normalized to
`[-180,180)`. Source XZ positions from real hostile/wither callers are passed
to `resolveShieldBlock`; a blocked hit deals zero health damage and wears the
offhand shield. An axe hit disables the shield for 100 simulation ticks.

## Invariants

- Item id 71 is stable, has key `shield`, stack size 1, and max durability 336.
- Only an offhand item whose registry key is `shield` can raise a shield.
- A raised shield blocks only damage with an explicit hostile source position
  and only inside the existing arc. Damage with no source remains unchanged.
- A blocked hit is atomic: health is unchanged, exactly one durability wear
  operation occurs, and the shield is cleared if durability reaches zero.
- A disabled shield cannot block until the framework cooldown expires; a stale
  `V` or mouse-release cannot keep it raised.
- Inventory snapshot/restore remains the sole persistence path for offhand data.

## API and data model

`ItemTypeDefinition` gains no new field; the shield uses the existing
`maxDurability`. `PlayerEquipment` gains a component-preserving
`damageEquipment(slot, amount, maxDurability)` result and `Inventory` delegates
that adapter. `InputManager` gains `consumeOffhandSwap()`.

Game-facing read seams are:

```ts
getShieldState(): {
  equipped: boolean;
  raised: boolean;
  disabled: boolean;
  durability: number;
  maxDurability: number;
}
debugEquipShield(): boolean;
debugDamageFrom(amount: number, sourceX?: number, sourceZ?: number, axe?: boolean): void;
```

The debug methods are test-only deterministic seams, matching existing
`debugKillPlayer`/withers seams; normal play uses `V`, right-click, and real
damage sources.

## Control/data flow

1. `InputManager` queues `V`; Game swaps selected/offhand stacks before the
   fixed tick and re-renders the hotbar.
2. Each fixed tick computes `shieldRaised` from pointer lock, game mode,
   open-container state, right-button hold, and the offhand registry key.
3. `PlayerInteraction` drains placement input while the raised shield owns the
   right button.
4. Hostile and wither chokes call `hurtPlayer(amount, reason, sourceX, sourceZ,
   isAxeAttack)`. The adapter invokes `resolveShieldBlock`; on a block it
   damages Offhand and updates the indicator, otherwise it calls Survival.
5. `Inventory.snapshot()` carries the offhand stack and damage component at the
   existing autosave/pagehide/dispose cadence.

## Detailed behavior

Hostile zombie damage supplies the zombie's current XZ and `isAxeAttack=false`.
Wither melee supplies the wither's XZ and `false`; wither skull impact supplies
the skull position and `false`; wither explosion supplies its center and
`false`. Existing source-less wither status damage, fall, lava, drowning,
starvation, and direct debug-kill behavior do not enter shield resolution.

The HUD indicator is hidden when unequipped, reads `Shield: raised` while
raised, `Shield: disabled` during cooldown, and `Shield: ready (<remaining>)`
when equipped but lowered. A broken shield clears Offhand and reports
`Shield: broken` for the normal toast duration.

## Failure modes

Unknown item ids, malformed components, invalid counts, and invalid equipment
snapshots continue to fail closed through the existing Inventory validator.
Invalid source coordinates bypass the shield and preserve the original damage
call; they never create a partial cooldown or durability mutation. An invalid
swap keypress is a no-op. A full or unrelated hotbar stack can still be moved
to Offhand because the existing equipment slot is intentionally generic; only
the shield key activates blocking.

## Compatibility/migration

No schema or record version changes. The additive id is accepted by new builds;
pre-279 builds use their existing unknown-item restore rejection if a 279 shield
is present, which is the documented fail-closed behavior. Existing equipment
component maps are copied before wear so enchantment/other components survive.

## Performance/resource constraints

Shield state evaluation is O(1) per fixed tick. Damage resolution adds one
bounded pure calculation only on an existing damage event. No render loop,
world-generation, worker, or storage namespace is added; the HUD writes only
when its derived signature changes.

## Testing seams

`ShieldBlocking.test.ts` remains the framework oracle. New unit tests cover item
catalog, equipment wear/break, yaw conversion, input/use blocking, Game damage
composition, and snapshot round-trip. A browser E2E uses the real `V` and
right-button path, then the deterministic debug source seam to prove front
blocking, behind damage, axe cooldown, break, HUD feedback, and reload durability.

## Observability/debugging

`getShieldState()` is read-only and deterministic. The HUD indicator and one
toast on break/disable expose player-visible state. The existing debug overlay
does not gain a new high-frequency line.

## Affected files/symbols

- `src/inventory/ItemRegistry.ts`, `Equipment.ts`, `Inventory.ts` — item and wear.
- `src/engine/InputManager.ts`, `InputTypes.ts` — `V` action.
- `src/player/PlayerInteraction.ts` — raised-shield right-click drain.
- `src/simulation/HostileMobBaseline.ts` — source-position callback.
- `src/engine/Game.ts`, `index.html`, `src/styles.css` — live composition/HUD.
- `tests/unit/*Shield*`, `tests/unit/LiveShieldWiring.test.ts`,
  `tests/e2e/shield.spec.ts`, and 279 OpenSpec/state/matrix artifacts.

## Rejected alternatives

- A new `__shield__` record was rejected because Inventory already persists
  equipment, durability, and components atomically.
- Applying the shield to every damage event was rejected because environmental
  and status damage has no attacker direction and must retain current behavior.
- A second combat validator was rejected; the verified pure `ShieldBlocking`
  resolver is the single rule authority.

## Downstream dependencies

Change 280 may reuse `getShieldState()` for death/respawn presentation but must
not alter the shield rules. Later workstation/raid changes must not add new
shield persistence or duplicate damage resolution.
