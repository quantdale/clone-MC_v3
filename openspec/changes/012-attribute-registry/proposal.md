# Proposal: 012-attribute-registry

## Problem

Future movement, combat, equipment, effects, and entities need shared numeric attributes instead of independent hard-coded constants. Without one modifier model, stacking rules would diverge across systems.

## Goals

- Define ResourceId-identified numeric attribute types with default/min/max values.
- Define per-instance base values.
- Define uniquely identified modifiers with three explicit operations: additive value, additive fraction of base, and multiplicative-total.
- Define deterministic modifier evaluation and clamping.
- Reject invalid finite ranges/amounts and duplicate modifier identities.
- Keep the primitive additive; do not migrate Player constants yet.

## Non-goals

No equipment, effects, combat, entity framework, save persistence, or UI integration.

## Preconditions

011 is VERIFIED.

## Compatibility

Current gameplay constants remain unchanged in 012.

## Definition of Done

Attribute registration, instance values, modifier operations/order, clamping, duplicate/invalid handling, and deterministic evaluation are fully tested and full regressions pass.

## Advancement gate

013 starts only after 012 is 100% complete and VERIFIED.
