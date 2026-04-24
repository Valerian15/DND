import { useState } from 'react';
import type { Abilities, AbilityKey, Character } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { abilityModifier, formatModifier } from './pointBuy';
import { applyAsi, isAsiLevel, previewLevelUp, type AsiChoice } from './levelUp';

interface Props {
  character: Character;
  hitDieSize: number;
  onConfirm: (updatedAbilities: Abilities, newLevel: number, newHpMax: number, newHpCurrent: number) => Promise<void>;
  onCancel: () => void;
}

export default function LevelUpDialog({ character, hitDieSize, onConfirm, onCancel }: Props) {
  const preview = previewLevelUp(character, hitDieSize);
  const requiresAsi = isAsiLevel(character.class_slug, preview.newLevel);

  const [asiMode, setAsiMode] = useState<AsiChoice['mode']>('plus-two');
  const [firstAbility, setFirstAbility] = useState<AbilityKey>('str');
  const [secondAbility, setSecondAbility] = useState<AbilityKey>('dex');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choice: AsiChoice = { mode: asiMode, firstAbility, secondAbility };
  const projectedAbilities = requiresAsi ? applyAsi(character.abilities, choice) : { ...character.abilities };

  async function handleConfirm() {
    if (requiresAsi && !projectedAbilities) {
      setError('Invalid ASI choice. Pick two different abilities if using +1/+1.');
      return;
    }
    setSubmitting(true);
    try {
      const finalAbilities = projectedAbilities ?? character.abilities;
      // Recompute HP max from scratch to account for potential CON bump from ASI.
      const newConMod = abilityModifier(finalAbilities.con);
      const conDelta = newConMod - abilityModifier(character.abilities.con);
      // Every existing level also benefits retroactively from a CON bump.
      const newHpMax = preview.newHpMax + conDelta * character.level + conDelta;
      const newHpCurrent = Math.min(character.hp_current + preview.hpGain + conDelta, newHpMax);

      await onConfirm(finalAbilities, preview.newLevel, newHpMax, newHpCurrent);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Level up failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={dialogStyle}>
        <h2 style={{ marginTop: 0 }}>Level up to {preview.newLevel}</h2>

        <div style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.95rem' }}>
          <div><strong>HP gain:</strong> +{preview.hpGain} (fixed average)</div>
          <div><strong>New HP max:</strong> {preview.newHpMax}</div>
          <div><strong>Hit die:</strong> d{hitDieSize}</div>
          {requiresAsi && <div style={{ color: '#a60', marginTop: '0.5rem' }}>⚡ This level grants an Ability Score Improvement.</div>}
        </div>

        {requiresAsi && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>Ability Score Improvement</h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <ModeButton active={asiMode === 'plus-two'} onClick={() => setAsiMode('plus-two')}>+2 to one ability</ModeButton>
              <ModeButton active={asiMode === 'plus-one-one'} onClick={() => setAsiMode('plus-one-one')}>+1 to two abilities</ModeButton>
              <ModeButton active={asiMode === 'skip'} onClick={() => setAsiMode('skip')}>Skip (feat later)</ModeButton>
            </div>

            {asiMode === 'plus-two' && (
              <AbilitySelect label="Ability to increase" value={firstAbility} onChange={setFirstAbility} current={character.abilities} />
            )}

            {asiMode === 'plus-one-one' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <AbilitySelect label="First ability" value={firstAbility} onChange={setFirstAbility} current={character.abilities} />
                <AbilitySelect label="Second ability" value={secondAbility} onChange={setSecondAbility} current={character.abilities} />
              </div>
            )}

            {asiMode === 'skip' && (
              <p style={{ color: '#888', fontSize: '0.9rem' }}>No ability scores will change. Feat selection will be added in a later phase.</p>
            )}

            {projectedAbilities && (
              <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#eef', borderRadius: 4, fontSize: '0.9rem' }}>
                <strong>Projected abilities:</strong>{' '}
                {ABILITY_ORDER.map((key) => {
                  const changed = projectedAbilities[key] !== character.abilities[key];
                  return (
                    <span key={key} style={{ marginRight: '0.75rem', color: changed ? '#2a7' : '#333', fontWeight: changed ? 'bold' : 'normal' }}>
                      {ABILITY_NAMES[key].slice(0, 3)} {projectedAbilities[key]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={submitting} style={btnStyle(false)}>Cancel</button>
          <button onClick={handleConfirm} disabled={submitting} style={btnStyle(true)}>
            {submitting ? 'Applying…' : `Level up to ${preview.newLevel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AbilitySelect({
  label,
  value,
  onChange,
  current,
}: {
  label: string;
  value: AbilityKey;
  onChange: (v: AbilityKey) => void;
  current: Abilities;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AbilityKey)}
        style={{ width: '100%', padding: '0.4rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: 4 }}
      >
        {ABILITY_ORDER.map((key) => (
          <option key={key} value={key} disabled={current[key] >= 20}>
            {ABILITY_NAMES[key]} ({current[key]}{current[key] >= 20 ? ', capped' : ''}) {formatModifier(abilityModifier(current[key]))}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.4rem 0.8rem',
        background: active ? '#333' : '#fff',
        color: active ? '#fff' : '#333',
        border: '1px solid #333',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: '1.5rem',
  maxWidth: 520,
  width: '100%',
  boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
};

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: '0.5rem 1.25rem',
    background: primary ? '#333' : '#fff',
    color: primary ? '#fff' : '#333',
    border: '1px solid #333',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.95rem',
  };
}
