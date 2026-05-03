import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { getLibraryItem } from '../api';
import { viewInventory, viewEquippedArmor, viewEquippedShield, parseWeight, parseCostGp } from '../inventoryView';
import type { Character, InventoryItem } from '../types';

interface ArmorListItem {
  slug: string;
  name: string;
  category: string | null;
  base_ac: number | null;
  source: string;
}

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

const ARMOR_CATEGORY_ORDER: Record<string, number> = {
  'Light Armor': 1,
  'Medium Armor': 2,
  'Heavy Armor': 3,
  'Shield': 4,
};

const ARMOR_TYPE_FROM_CATEGORY: Record<string, 'light' | 'medium' | 'heavy' | 'shield'> = {
  'Light Armor': 'light',
  'Medium Armor': 'medium',
  'Heavy Armor': 'heavy',
  'Shield': 'shield',
};

export default function ArmorStep({ character, onChange }: Props) {
  const [allArmor, setAllArmor] = useState<ArmorListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ items: ArmorListItem[] }>('/library/items')
      .then((res) => {
        // Keep only armor / shield rows: slug starts with 'armor-' AND has a base_ac AND
        // the category is one of Light / Medium / Heavy / Shield (skips magic-only entries
        // like Mage Armor, class features, etc.).
        const filtered = res.items.filter((it) =>
          it.slug.startsWith('armor-')
          && typeof it.base_ac === 'number'
          && it.category != null
          && it.category in ARMOR_CATEGORY_ORDER,
        );
        setAllArmor(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const inventory = viewInventory(character);
  const equippedArmor = viewEquippedArmor(character);
  const equippedShield = viewEquippedShield(character);

  async function equipArmor(item: ArmorListItem) {
    const armorType = ARMOR_TYPE_FROM_CATEGORY[item.category ?? ''];
    if (!armorType) return;

    // Fetch full data for stat baking.
    const lib = await getLibraryItem<{ name: string; data: any }>('items', item.slug).catch(() => null);
    const data = lib?.data ?? {};

    // Drop the previously-equipped slot (body armor or shield) — only one of each at a time.
    const slotKey = armorType === 'shield' ? 'shield' : 'body';
    const filtered = inventory.filter((i) => {
      if (i.category !== 'armor') return true;
      if (slotKey === 'shield' && i.armor_type === 'shield') return false;
      if (slotKey === 'body' && i.armor_type !== 'shield') return false;
      return true;
    });

    const newRow: InventoryItem = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      library_slug: item.slug,
      name: item.name,
      quantity: 1,
      category: 'armor',
      equipped: true,
      weight_lbs: parseWeight(data.weight_lbs ?? data.weight),
      cost_gp: parseCostGp(data.cost_gp ?? data.cost),
      armor_class: typeof data.base_ac === 'number'
        ? data.base_ac + (typeof data.plus_flat_mod === 'number' ? data.plus_flat_mod : 0)
        : item.base_ac ?? undefined,
      armor_type: armorType,
      max_dex_bonus: data.plus_dex_mod
        ? (typeof data.plus_max === 'number' && data.plus_max > 0 ? data.plus_max : undefined)
        : 0,
      stealth_disadvantage: !!data.stealth_disadvantage,
      str_requirement: typeof data.strength_requirement === 'number' && data.strength_requirement > 0
        ? data.strength_requirement
        : undefined,
    };
    onChange({ inventory_v2: [...filtered, newRow] });
  }

  function unequip(slot: 'body' | 'shield') {
    const filtered = inventory.filter((i) => {
      if (i.category !== 'armor') return true;
      if (slot === 'shield' && i.armor_type === 'shield') return false;
      if (slot === 'body' && i.armor_type !== 'shield') return false;
      return true;
    });
    onChange({ inventory_v2: filtered });
  }

  if (loading) return <p style={{ color: '#666' }}>Loading armor…</p>;

  if (allArmor.length === 0) {
    return (
      <div style={{ color: '#555', padding: '1rem', background: '#f9f9f9', borderRadius: 6 }}>
        <p style={{ margin: '0 0 0.5rem' }}>No armor in the library yet.</p>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Ask your admin to seed SRD items, then come back.</p>
      </div>
    );
  }

  // Group by category
  const groups = new Map<string, ArmorListItem[]>();
  for (const a of allArmor) {
    const cat = a.category ?? 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(a);
  }
  const sortedGroups = [...groups.entries()].sort(
    ([a], [b]) => (ARMOR_CATEGORY_ORDER[a] ?? 99) - (ARMOR_CATEGORY_ORDER[b] ?? 99),
  );

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div>
        <h2 style={{ marginTop: 0 }}>Armor</h2>
        <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
          One body armor and one shield slot. Click to equip; clicking again on the same row unequips. AC, weight,
          stealth disadvantage, and STR requirement come straight from the library and feed into your sheet's AC card.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0f5ff', border: '1px solid #cdd8ee', borderRadius: 6, fontSize: '0.85rem' }}>
        <div style={{ flex: 1 }}>
          <strong>Body:</strong> {equippedArmor ? equippedArmor.name : <span style={{ color: '#888' }}>(none)</span>}
          {equippedArmor && (
            <button onClick={() => unequip('body')} style={{ marginLeft: '0.4rem', padding: '0.1rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', background: '#fff', color: 'crimson', borderRadius: 3 }}>×</button>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <strong>Shield:</strong> {equippedShield ? equippedShield.name : <span style={{ color: '#888' }}>(none)</span>}
          {equippedShield && (
            <button onClick={() => unequip('shield')} style={{ marginLeft: '0.4rem', padding: '0.1rem 0.4rem', fontSize: '0.7rem', cursor: 'pointer', border: '1px solid #fcc', background: '#fff', color: 'crimson', borderRadius: 3 }}>×</button>
          )}
        </div>
      </div>

      {sortedGroups.map(([category, list]) => (
        <div key={category}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            {category}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
            {list.map((a) => {
              const isEquipped = a.slug === equippedArmor?.library_slug || a.slug === equippedShield?.library_slug;
              return (
                <button key={a.slug} type="button"
                  onClick={() => isEquipped ? unequip(category === 'Shield' ? 'shield' : 'body') : equipArmor(a)}
                  style={{
                    padding: '0.5rem 0.75rem', textAlign: 'left',
                    borderRadius: 6,
                    border: isEquipped ? '2px solid #2a7' : '2px solid #ddd',
                    background: isEquipped ? '#e8f8ed' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.88rem', color: '#333', fontWeight: isEquipped ? 600 : 400,
                  }}>
                  <div>{a.name} {isEquipped && <span style={{ color: '#2a7', fontSize: '0.7rem' }}>✓ equipped</span>}</div>
                  <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 2 }}>
                    AC {a.base_ac}{category === 'Shield' ? ' (shield bonus)' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
