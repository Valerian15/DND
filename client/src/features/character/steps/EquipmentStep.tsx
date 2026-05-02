import { useEffect, useState } from 'react';
import type { Character, InventoryItem } from '../types';
import { getLibraryItem } from '../api';
import { MD } from '../../library/Statblock';
import { viewInventory } from '../inventoryView';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

export default function EquipmentStep({ character, onChange }: Props) {
  const [classEquipment, setClassEquipment] = useState<string>('');
  const [backgroundEquipment, setBackgroundEquipment] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const promises: Promise<void>[] = [];

    if (character.class_slug) {
      promises.push(
        getLibraryItem<{ data: any }>('classes', character.class_slug)
          .then((r) => setClassEquipment(r.data?.equipment ?? ''))
          .catch(() => {}),
      );
    }
    if (character.background_slug) {
      promises.push(
        getLibraryItem<{ data: any }>('backgrounds', character.background_slug)
          .then((r) => setBackgroundEquipment(r.data?.equipment ?? ''))
          .catch(() => {}),
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [character.class_slug, character.background_slug]);

  // Read via the structured view so the wizard works whether the character is migrated or not.
  // Writes always go to inventory_v2; the first write effectively migrates the character.
  const inventory: InventoryItem[] = viewInventory(character);
  const hasStarterPack = inventory.some((i) => i.source === 'class-starter' || i.source === 'background-starter');

  function acceptStarterEquipment() {
    const additions: InventoryItem[] = [];
    if (classEquipment) {
      additions.push({
        id: `class-starter-${character.class_slug}`,
        source: 'class-starter',
        name: `Starting kit (${character.class_slug})`,
        description: classEquipment,
        quantity: 1,
        category: 'gear',
      });
    }
    if (backgroundEquipment) {
      additions.push({
        id: `background-starter-${character.background_slug}`,
        source: 'background-starter',
        name: `Background items (${character.background_slug})`,
        description: backgroundEquipment,
        quantity: 1,
        category: 'gear',
      });
    }

    const filtered = inventory.filter(
      (i) => i.source !== 'class-starter' && i.source !== 'background-starter',
    );

    onChange({ inventory_v2: [...filtered, ...additions] });
  }

  function clearStarter() {
    const filtered = inventory.filter(
      (i) => i.source !== 'class-starter' && i.source !== 'background-starter',
    );
    onChange({ inventory_v2: filtered });
  }

  if (!character.class_slug && !character.background_slug) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Equipment</h2>
        <p style={{ color: '#888' }}>Pick a class and background first to see starting equipment.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Starting equipment</h2>
      <p style={{ color: '#666' }}>
        Review your starting kit below. Click "Accept starting kit" to add it to your inventory as a text entry. The detailed item picker lives on the character sheet.
      </p>

      {loading && <p>Loading equipment…</p>}

      {classEquipment && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h3>Class equipment</h3>
          <div style={{ background: '#f9f9f9', padding: '0.75rem', borderRadius: 6, fontSize: '0.9rem' }}>
            <MD text={classEquipment} />
          </div>
        </section>
      )}

      {backgroundEquipment && (
        <section style={{ marginBottom: '1.25rem' }}>
          <h3>Background equipment</h3>
          <div style={{ background: '#f9f9f9', padding: '0.75rem', borderRadius: 6, fontSize: '0.9rem' }}>
            <MD text={backgroundEquipment} />
          </div>
        </section>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={acceptStarterEquipment} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          {hasStarterPack ? 'Re-apply starter kit' : 'Accept starting kit'}
        </button>
        {hasStarterPack && (
          <button onClick={clearStarter} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Clear starter kit
          </button>
        )}
      </div>

      {hasStarterPack && (
        <p style={{ color: '#2a7', marginTop: '1rem', fontSize: '0.9rem' }}>
          ✓ Starter kit added to your inventory.
        </p>
      )}
    </div>
  );
}
