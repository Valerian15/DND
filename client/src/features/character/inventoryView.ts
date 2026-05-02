// Read-side helpers for the structured inventory. These let the sheet / combat / preview
// code use inventory_v2 unconditionally even before the equipment migration has run.
//
// Behaviour:
//   - If inventory_v2 has any rows, use it as-is.
//   - Otherwise, lazy-convert legacy `inventory` (free-form) + `weapons` (slug list) into
//     a viewable v2 array on the fly. This view is NOT persisted — it's just for reads.
//   - The migration script (`pnpm migrate:equipment`) writes v2 permanently and idempotently;
//     after running it the lazy fallback is never needed again.

import type { Character, InventoryItem, InventoryCategory } from './types';

interface LegacyInventoryRow {
  id?: string;
  source?: string;
  name?: string;
  quantity?: number;
  description?: string;
}

let scratchCounter = 0;
function scratchId(): string {
  scratchCounter += 1;
  return `it-view-${scratchCounter}`;
}

/** Build a plain "weapon" v2 row from a legacy slug. No library lookup — just a placeholder. */
function legacyWeaponRow(slug: string): InventoryItem {
  return {
    id: scratchId(),
    library_slug: slug,
    name: slug,
    quantity: 1,
    category: 'weapon' as InventoryCategory,
    equipped: true,
  };
}

/** Convert a legacy free-form inventory row into a 'gear' v2 row. */
function legacyGearRow(row: LegacyInventoryRow): InventoryItem {
  return {
    id: row.id ?? scratchId(),
    name: row.name ?? 'Unnamed item',
    quantity: typeof row.quantity === 'number' ? row.quantity : 1,
    category: 'gear' as InventoryCategory,
    description: row.description,
    ...(row.source ? { source: row.source } : {}),
  };
}

/**
 * Returns the structured inventory rows for a character. Prefers `inventory_v2`; falls back
 * to a synthesised view of `inventory` + `weapons` if v2 is empty.
 *
 * NOTE: the synthesised rows have placeholder weapon stats (name = slug, no damage dice).
 * For full library-backed weapon stats, run `pnpm migrate:equipment`.
 */
export function viewInventory(character: Character): InventoryItem[] {
  const v2 = character.inventory_v2 ?? [];
  if (v2.length > 0) return v2;

  const out: InventoryItem[] = [];
  const weapons = (character.weapons ?? []) as string[];
  for (const slug of weapons) out.push(legacyWeaponRow(slug));
  const legacyInv = (character.inventory ?? []) as LegacyInventoryRow[];
  for (const row of legacyInv) out.push(legacyGearRow(row));
  return out;
}

/** All items currently equipped (weapons or armor). */
export function viewEquippedItems(character: Character): InventoryItem[] {
  return viewInventory(character).filter((i) => i.equipped === true);
}

/** Equipped weapons only — convenience for the Attacks section. */
export function viewEquippedWeapons(character: Character): InventoryItem[] {
  return viewInventory(character).filter((i) => i.category === 'weapon' && i.equipped === true);
}

/** Total carried weight in pounds (equipped + carried, magic ignored). */
export function viewTotalWeight(character: Character): number {
  return viewInventory(character).reduce((sum, i) => sum + (i.weight_lbs ?? 0) * (i.quantity ?? 1), 0);
}

/** STR × 15 by 5e RAW — basic carrying capacity. */
export function carryCapacity(character: Character): number {
  return character.abilities.str * 15;
}

/** True if v2 already has rows OR the migration timestamp is set. */
export function isMigrated(character: Character): boolean {
  if ((character.inventory_v2 ?? []).length > 0) return true;
  const desc = (character.description ?? {}) as { equipment_migrated_at?: number };
  return typeof desc.equipment_migrated_at === 'number';
}
