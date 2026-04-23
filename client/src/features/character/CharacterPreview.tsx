import type { Character } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { abilityModifier, formatModifier } from './pointBuy';
import { proficiencyBonus, initiative } from './rules';

export default function CharacterPreview({ character }: { character: Character }) {
  const prof = proficiencyBonus(character.level);
  const init = initiative(character.abilities);
  const hasPortrait = !!character.portrait_url;

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
      <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Preview</h2>

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
          fontSize: '0.85rem',
          overflow: 'hidden',
        }}
      >
        {hasPortrait ? (
          <img
            src={character.portrait_url!}
            alt={character.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          '(portrait)'
        )}
      </div>

      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{character.name}</div>
        <div style={{ fontSize: '0.85rem', color: '#666' }}>
          Level {character.level}
          {character.race_slug && ` · ${capitalize(character.race_slug)}`}
          {character.class_slug && ` · ${capitalize(character.class_slug)}`}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: '1rem' }}>
        {ABILITY_ORDER.map((key) => {
          const score = character.abilities[key];
          const mod = abilityModifier(score);
          return (
            <div
              key={key}
              style={{
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '0.4rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase' }}>
                {ABILITY_NAMES[key].slice(0, 3)}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 'bold' }}>{score}</div>
              <div style={{ fontSize: '0.8rem', color: '#666' }}>{formatModifier(mod)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
        <Stat label="HP" value={`${character.hp_current || 0} / ${character.hp_max || 0}`} />
        <Stat label="AC" value={character.ac} />
        <Stat label="Initiative" value={formatModifier(init)} />
        <Stat label="Proficiency" value={formatModifier(prof)} />
      </div>

      {character.spell_slots && Object.keys(character.spell_slots).length > 0 && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#666' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Spell slots</div>
          <div>
            {Object.entries(character.spell_slots).map(([lvl, count]) => (
              <span key={lvl} style={{ marginRight: '0.5rem' }}>
                L{lvl}: {count as number}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 4, padding: '0.4rem', textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}

function capitalize(s: string): string {
  return s
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
