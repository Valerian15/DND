import type { Character } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { abilityModifier, formatModifier } from './pointBuy';
import { proficiencyBonus, initiative } from './rules';
import { isSubclassUnlocked } from './subclassUnlock';

interface Props {
  character: Character;
  onJumpToStep?: (key: string) => void;
}

export default function CharacterPreview({ character, onJumpToStep }: Props) {
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
          {classSummary(character)}
          {character.race_slug && ` · ${capitalize(character.subrace_slug ?? character.race_slug)}`}
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

      {character.feats && character.feats.length > 0 && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#666' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Feats</div>
          <div>{character.feats.map((f) => capitalize(f)).join(', ')}</div>
        </div>
      )}

      <ReadinessChecklist character={character} onJumpToStep={onJumpToStep} />
    </aside>
  );
}

function ReadinessChecklist({ character, onJumpToStep }: Props) {
  const classes = character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug ? [{ slug: character.class_slug, level: character.level || 1, subclass_slug: character.subclass_slug, hit_dice_used: 0 }] : []);

  const items: Array<{ ok: boolean; label: string; step?: string }> = [
    { ok: !!character.race_slug, label: 'Race picked', step: 'race' },
    { ok: classes.length > 0, label: 'Class picked', step: 'class' },
    {
      ok: classes.length > 0 && classes.every((c) => !isSubclassUnlocked(c.slug, c.level) || !!c.subclass_slug),
      label: 'Subclass(es) picked',
      step: 'subclass',
    },
    { ok: ABILITY_ORDER.every((k) => character.abilities[k] > 0), label: 'Abilities filled', step: 'abilities' },
    { ok: !!character.background_slug, label: 'Background picked', step: 'background' },
    { ok: (character.languages ?? []).length > 0, label: 'Languages chosen', step: 'details' },
    { ok: !!character.name && character.name.toLowerCase() !== 'unnamed hero', label: 'Name set', step: 'details' },
  ];
  const allOk = items.every((i) => i.ok);

  return (
    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '0.75rem' }}>
      <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: allOk ? '#2a7' : '#a60', marginBottom: '0.4rem' }}>
        {allOk ? '✓ Ready to play' : 'Ready to play?'}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.78rem' }}>
        {items.map((it, i) => (
          <li key={i}
            onClick={() => !it.ok && it.step && onJumpToStep?.(it.step)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.15rem 0',
              cursor: !it.ok && it.step && onJumpToStep ? 'pointer' : 'default',
              color: it.ok ? '#666' : '#a60',
            }}>
            <span style={{ width: 14 }}>{it.ok ? '✓' : '○'}</span>
            <span>{it.label}</span>
          </li>
        ))}
      </ul>
    </div>
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

/** "Fighter 3 / Wizard 2 (5)" or "Fighter 5" or "Level 1" if no class. */
function classSummary(character: Character): string {
  const classes = character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug ? [{ slug: character.class_slug, level: character.level || 1 }] : []);
  if (classes.length === 0) return `Level ${character.level}`;
  const parts = classes.map((c) => `${capitalize(c.slug)} ${c.level}`);
  if (classes.length === 1) return parts[0];
  return `${parts.join(' / ')} (${character.level})`;
}
