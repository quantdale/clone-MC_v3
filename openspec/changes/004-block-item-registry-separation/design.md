# Design: 004-block-item-registry-separation

The current mixed block/item definition model will be separated into independent block and item registries backed by the generic registry core. Existing numeric save interpretation remains behind an explicit compatibility adapter. Placeable items reference blocks explicitly; block drops reference items explicitly; tool and food metadata belong to items. Runtime registry IDs are not persisted. Full normative behavior, migration constraints, edge cases, and validation requirements are defined in this change's proposal and capability spec.
