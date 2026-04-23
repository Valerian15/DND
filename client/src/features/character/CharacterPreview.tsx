import type { Character } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { abilityModifier, formatModifier } from './pointBuy';

export default function CharacterPreview({ character }: { character: Character }) {
  return (
    <aside
      style={{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        position: 'sticky',
        top: '1rem',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Preview</h2>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: '#eee',
          margin: '0 auto 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#aaa',
          fontSize: '0.9rem',
        }}
      >
        (portrait)
      </div>

      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{character.name}</div>
        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          Level {character.level}
          {character.race_slug && ` · ${capitalize(character.race_slug)}`}
          {character.class_slug && ` · ${capitalize(character.class_slug)}`}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        {ABILITY_ORDER.map((key) => {
          const score = character.abilities[key];
          const mod = abilityModifier(score);
          return (
            <div
              key={key}
              style={{
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '0.5rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>
                {ABILITY_NAMES[key].slice(0, 3)}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{score}</div>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>{formatModifier(mod)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: '0.9rem', color: '#666' }}>
        <div>HP: {character.hp_current} / {character.hp_max}</div>
        <div>AC: {character.ac}</div>
      </div>
    </aside>
  );
}

function capitalize(s: string): string {
  return s
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
