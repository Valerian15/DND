import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { isWeaponProficientForClasses } from '../weaponProficiency';
import { getLibraryItem } from '../api';
import { viewInventory, parseWeight, parseCostGp } from '../inventoryView';
import type { Character, InventoryItem } from '../types';

interface WeaponListItem {
  slug: string;
  name: string;
  category: string;
  weapon_type: string;
  source: string;
}

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

type GroupKey = string; // e.g. "Simple Melee"

export default function WeaponsStep({ character, onChange }: Props) {
  const [allWeapons, setAllWeapons] = useState<WeaponListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: WeaponListItem[] }>('/library/weapons')
      .then((res) => setAllWeapons(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Selected = library_slugs already in the character's inventory_v2 (or legacy fallback view).
  const inventory: InventoryItem[] = viewInventory(character);
  const selected = new Set(
    inventory.filter((i) => i.category === 'weapon' && i.library_slug)
      .map((i) => i.library_slug!),
  );

  async function toggle(weapon: WeaponListItem) {
    const wasIn = selected.has(weapon.slug);
    if (wasIn) {
      const next = inventory.filter((i) => !(i.category === 'weapon' && i.library_slug === weapon.slug));
      onChange({ inventory_v2: next });
      return;
    }
    // Fetch full weapon data from library to bake metadata into the inventory row.
    try {
      const lib = await getLibraryItem<{ name: string; category: string; weapon_type: string; data: any }>('weapons', weapon.slug);
      const props = Array.isArray(lib.data?.properties)
        ? lib.data.properties
        : typeof lib.data?.properties === 'string'
          ? lib.data.properties.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
      const newRow: InventoryItem = {
        id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        library_slug: weapon.slug,
        name: lib.name,
        quantity: 1,
        category: 'weapon',
        equipped: true,
        weight_lbs: parseWeight(lib.data?.weight_lbs ?? lib.data?.weight),
        cost_gp: parseCostGp(lib.data?.cost_gp ?? lib.data?.cost),
        damage_dice: lib.data?.damage_dice,
        damage_type: lib.data?.damage_type,
        weapon_type: lib.weapon_type === 'Ranged' ? 'Ranged' : 'Melee',
        weapon_category: lib.category === 'Martial' ? 'Martial' : 'Simple',
        properties: props,
        range_normal: lib.data?.range_normal,
        range_long: lib.data?.range_long,
        versatile_dice: lib.data?.versatile_dice,
      };
      onChange({ inventory_v2: [...inventory, newRow] });
    } catch {
      /* ignore */
    }
  }

  // Group by "Simple Melee", "Simple Ranged", "Martial Melee", "Martial Ranged"
  const groups = new Map<GroupKey, WeaponListItem[]>();
  for (const w of allWeapons) {
    const key = [w.category, w.weapon_type].filter(Boolean).join(' ') || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }
  const groupOrder = ['Simple Melee', 'Simple Ranged', 'Martial Melee', 'Martial Ranged', 'Other'];
  const sortedGroups = [...groups.entries()].sort(
    ([a], [b]) => (groupOrder.indexOf(a) ?? 99) - (groupOrder.indexOf(b) ?? 99),
  );

  if (loading) return <p style={{ color: '#666' }}>Loading weapons…</p>;

  if (allWeapons.length === 0) {
    return (
      <div style={{ color: '#555', padding: '1rem', background: '#f9f9f9', borderRadius: 6 }}>
        <p style={{ margin: '0 0 0.5rem' }}>No weapons in the library yet.</p>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          Ask your admin to add weapons via Library → Weapons, then come back to this step.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>
        Select the weapons your character starts with.
        <span style={{ color: '#2a7', fontWeight: 600 }}> Green = proficient</span>,
        {' '}<span style={{ color: '#999' }}>grey = not proficient</span>.
      </p>

      {sortedGroups.map(([group, weapons]) => (
        <div key={group}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            {group}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {weapons.map((w) => {
              const classSlugs = (character.classes && character.classes.length > 0)
                ? character.classes.map((c) => c.slug)
                : (character.class_slug ? [character.class_slug] : []);
              const proficient = isWeaponProficientForClasses(classSlugs, w.slug, w.category);
              const isSelected = selected.has(w.slug);
              return (
                <button
                  key={w.slug}
                  type="button"
                  onClick={() => toggle(w)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    textAlign: 'left',
                    borderRadius: 6,
                    border: isSelected
                      ? `2px solid ${proficient ? '#2a7' : '#888'}`
                      : '2px solid #ddd',
                    background: isSelected
                      ? (proficient ? '#e8f8ed' : '#f0f0f0')
                      : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: proficient ? '#1a5' : '#666',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {w.name}
                  {!proficient && (
                    <span style={{ fontSize: '0.75rem', color: '#bbb', marginLeft: '0.4rem' }}>
                      (not proficient)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected.size > 0 && (
        <div style={{ padding: '0.75rem', background: '#f5f5f5', borderRadius: 6, fontSize: '0.9rem', color: '#444' }}>
          <strong>Selected ({selected.size}):</strong>{' '}
          {allWeapons.filter((w) => selected.has(w.slug)).map((w) => w.name).join(', ')}
        </div>
      )}
    </div>
  );
}
