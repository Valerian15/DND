import { useEffect, useMemo, useState } from 'react';
import type { Abilities, AbilityKey, Character, ClassEntry } from './types';
import { ABILITY_NAMES, ABILITY_ORDER } from './types';
import { abilityModifier, formatModifier } from './pointBuy';
import { applyAsi, isAsiLevel, previewLevelUp, type AsiChoice } from './levelUp';
import { hitDieFor } from './rules';

interface Props {
  character: Character;
  /** Legacy: hit die for the primary class. Used as fallback when picking that class to level. */
  hitDieSize: number;
  /**
   * Confirm callback. Receives the updated classes[] (with the chosen class's level bumped),
   * abilities (post-ASI), new total level, and HP totals.
   */
  onConfirm: (updatedClasses: ClassEntry[], updatedAbilities: Abilities, newLevel: number, newHpMax: number, newHpCurrent: number) => Promise<void>;
  onCancel: () => void;
}

export default function LevelUpDialog({ character, hitDieSize, onConfirm, onCancel }: Props) {
  // Source of truth: classes[] if populated, else legacy single-class.
  const classes: ClassEntry[] = useMemo(() => character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug
      ? [{ slug: character.class_slug, subclass_slug: character.subclass_slug, level: character.level || 1, hit_dice_used: 0 }]
      : []), [character.classes, character.class_slug, character.subclass_slug, character.level]);

  const [targetClass, setTargetClass] = useState<string>(classes[0]?.slug ?? '');
  useEffect(() => {
    // If the dialog opens after a class change, keep target valid.
    if (!classes.some((c) => c.slug === targetClass)) {
      setTargetClass(classes[0]?.slug ?? '');
    }
  }, [classes, targetClass]);

  // Compute hit die for the target class (uses the rules.ts map; falls back to prop for legacy single-class).
  const effectiveHitDie = targetClass ? hitDieFor(targetClass) : hitDieSize;
  const preview = previewLevelUp(character, effectiveHitDie, targetClass);
  const requiresAsi = preview.asiRequired;

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
    if (!targetClass) {
      setError('Pick a class to level up.');
      return;
    }
    setSubmitting(true);
    try {
      const finalAbilities = projectedAbilities ?? character.abilities;
      const newConMod = abilityModifier(finalAbilities.con);
      const conDelta = newConMod - abilityModifier(character.abilities.con);
      // Retroactive Con bump: +conDelta per existing level (× character.level), plus +conDelta
      // for the new level on top of preview.newHpMax (which used the old Con mod).
      // Net: preview.newHpMax + conDelta × newLevel.
      const newHpMax = preview.newHpMax + conDelta * character.level + conDelta;
      const newHpCurrent = Math.min(character.hp_current + preview.hpGain + conDelta, newHpMax);

      // Bump the target class's level (or append it if somehow missing).
      let updatedClasses: ClassEntry[];
      if (classes.some((c) => c.slug === targetClass)) {
        updatedClasses = classes.map((c) => c.slug === targetClass ? { ...c, level: c.level + 1 } : c);
      } else {
        updatedClasses = [...classes, { slug: targetClass, subclass_slug: null, level: 1, hit_dice_used: 0 }];
      }

      await onConfirm(updatedClasses, finalAbilities, preview.newLevel, newHpMax, newHpCurrent);
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

        {classes.length > 1 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.4rem' }}>Which class are you levelling?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {classes.map((c) => {
                const isActive = c.slug === targetClass;
                return (
                  <button key={c.slug} onClick={() => setTargetClass(c.slug)}
                    style={{
                      padding: '0.4rem 0.75rem', borderRadius: 4,
                      border: isActive ? '2px solid #333' : '1px solid #ccc',
                      background: isActive ? '#fafafa' : '#fff', cursor: 'pointer',
                      fontWeight: isActive ? 700 : 400, fontSize: '0.85rem',
                    }}>
                    {capitalize(c.slug)} <span style={{ color: '#888', fontWeight: 400 }}>L{c.level} → L{c.level + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.95rem' }}>
          <div><strong>Class:</strong> {capitalize(targetClass)} L{preview.newClassLevel}</div>
          <div><strong>HP gain:</strong> +{preview.hpGain} (fixed average d{effectiveHitDie})</div>
          <div><strong>New HP max:</strong> {preview.newHpMax}</div>
          {requiresAsi && <div style={{ color: '#a60', marginTop: '0.5rem' }}>⚡ This {capitalize(targetClass)} level grants an Ability Score Improvement.</div>}
          {(preview.cantripsGained > 0 || preview.spellsKnownGained > 0) && (
            <div style={{ color: '#27a', marginTop: '0.5rem' }}>
              ✨ {[
                preview.cantripsGained > 0 ? `+${preview.cantripsGained} cantrip${preview.cantripsGained > 1 ? 's' : ''} known` : null,
                preview.spellsKnownGained > 0 ? `+${preview.spellsKnownGained} spell${preview.spellsKnownGained > 1 ? 's' : ''} known` : null,
              ].filter(Boolean).join(', ')} — pick them in the Spells step after levelling.
            </div>
          )}
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
              <p style={{ color: '#888', fontSize: '0.9rem' }}>No ability scores will change. Add the feat you took instead in the Feats step of the character editor.</p>
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
