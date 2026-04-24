import { useEffect, useMemo, useState } from 'react';
import type { Abilities, Character } from '../types';
import { ABILITY_NAMES, ABILITY_ORDER } from '../types';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  abilityModifier,
  formatModifier,
  pointCost,
  remaining,
} from '../pointBuy';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

const DEFAULT_BUY: Abilities = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
const ARRAY_VALUES = [15, 14, 13, 12, 10, 8] as const;

type Mode = 'point-buy' | 'standard-array';

function looksLikeStandardArray(a: Abilities): boolean {
  const values = ABILITY_ORDER.map((k) => a[k]).sort((x, y) => y - x);
  return JSON.stringify(values) === JSON.stringify([...ARRAY_VALUES]);
}

export default function AbilitiesStep({ character, onChange }: Props) {
  // Pick starting mode based on what the character currently has
  const initialMode: Mode = looksLikeStandardArray(character.abilities) ? 'standard-array' : 'point-buy';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [scores, setScores] = useState<Abilities>(character.abilities);

  useEffect(() => {
    setScores(character.abilities);
    setMode(looksLikeStandardArray(character.abilities) ? 'standard-array' : 'point-buy');
  }, [character.id]);

  const scoreValues = ABILITY_ORDER.map((k) => scores[k]);
  const pointsLeft = remaining(scoreValues);
  const invalid = pointsLeft < 0;

  // ---------- POINT BUY ----------
  function applyMode(next: Mode) {
    setMode(next);
    if (next === 'point-buy') {
      setScores(DEFAULT_BUY);
      onChange({ abilities: DEFAULT_BUY });
    } else {
      // Reset to all-zero slots; player will assign array values themselves
      const blank: Abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
      setScores(blank);
      onChange({ abilities: blank });
    }
  }

  function pbChange(key: keyof Abilities, delta: number) {
    const current = scores[key];
    const next = current + delta;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return;
    const testScores = { ...scores, [key]: next };
    const testValues = ABILITY_ORDER.map((k) => testScores[k]);
    if (remaining(testValues) < 0) return;
    setScores(testScores);
    onChange({ abilities: testScores });
  }

  // ---------- STANDARD ARRAY ----------
  // Each ARRAY_VALUES slot is "used" if it's currently assigned to some ability
  const assignedPerAbility = scores; // direct mapping
  const usedArrayPositions = useMemo(() => {
    // For each value in ARRAY_VALUES (by index), figure out which ability got it.
    // We consume values in order so duplicates (14, 8, etc.) are handled.
    const used: (keyof Abilities | null)[] = ARRAY_VALUES.map(() => null);
    const remainingByAbility: Abilities = { ...assignedPerAbility };
    for (let i = 0; i < ARRAY_VALUES.length; i++) {
      const v = ARRAY_VALUES[i];
      // find an ability that still holds this value
      const match = (ABILITY_ORDER as (keyof Abilities)[]).find((k) => remainingByAbility[k] === v);
      if (match) {
        used[i] = match;
        remainingByAbility[match] = -1; // consume this ability slot
      }
    }
    return used;
  }, [assignedPerAbility]);

  const [pickedValueIndex, setPickedValueIndex] = useState<number | null>(null);

  function handlePickValue(idx: number) {
    if (usedArrayPositions[idx] !== null) return; // already placed
    setPickedValueIndex(idx === pickedValueIndex ? null : idx);
  }

  function handleAssignToAbility(ability: keyof Abilities) {
    if (pickedValueIndex === null) {
      // clicking a slot that already has a value clears it back to unassigned
      if (scores[ability] > 0) {
        const next = { ...scores, [ability]: 0 };
        setScores(next);
        onChange({ abilities: next });
      }
      return;
    }
    const value = ARRAY_VALUES[pickedValueIndex];
    // If the ability already has a value, return that value to the pool by clearing it
    const next = { ...scores, [ability]: value };
    setScores(next);
    onChange({ abilities: next });
    setPickedValueIndex(null);
  }

  function resetArray() {
    const blank: Abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    setScores(blank);
    onChange({ abilities: blank });
    setPickedValueIndex(null);
  }

  const allAssigned =
    mode === 'standard-array' && ABILITY_ORDER.every((k) => scores[k] > 0);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Ability scores</h2>
      <p style={{ color: '#666' }}>
        Your raw ability scores before racial bonuses (applied separately).
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => applyMode('point-buy')}
          style={modeButton(mode === 'point-buy')}
        >
          Point Buy
        </button>
        <button
          onClick={() => applyMode('standard-array')}
          style={modeButton(mode === 'standard-array')}
        >
          Standard Array
        </button>
      </div>

      {mode === 'point-buy' && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: invalid ? '#fee' : '#f0f0f0', borderRadius: 4 }}>
          <strong>Points remaining:</strong> {pointsLeft} / {POINT_BUY_BUDGET}
          {invalid && <span style={{ color: 'crimson', marginLeft: '1rem' }}>Over budget!</span>}
        </div>
      )}

      {mode === 'standard-array' && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
            Click a value, then click an ability to assign it. Click a filled ability to clear it.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {ARRAY_VALUES.map((v, i) => {
              const used = usedArrayPositions[i] !== null;
              const isPicked = pickedValueIndex === i;
              return (
                <button
                  key={i}
                  onClick={() => handlePickValue(i)}
                  disabled={used}
                  style={{
                    width: 48, height: 48,
                    fontSize: '1.1rem', fontWeight: 'bold',
                    borderRadius: 6,
                    border: isPicked ? '2px solid #2a7' : '1px solid #333',
                    background: used ? '#eee' : isPicked ? '#e0f5e0' : '#fff',
                    color: used ? '#bbb' : '#333',
                    cursor: used ? 'not-allowed' : 'pointer',
                    textDecoration: used ? 'line-through' : 'none',
                  }}
                  title={used ? `Assigned to ${ABILITY_NAMES[usedArrayPositions[i]!]}` : 'Click to pick'}
                >
                  {v}
                </button>
              );
            })}
            <button onClick={resetArray} style={{ marginLeft: '1rem', padding: '0.5rem 0.75rem', cursor: 'pointer' }}>
              Reset
            </button>
            {allAssigned && <span style={{ color: '#2a7', marginLeft: '0.5rem' }}>✓ All values assigned</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {ABILITY_ORDER.map((key) => {
          const score = scores[key];
          const cost = pointCost(score);
          const mod = abilityModifier(score);
          const showMod = score > 0;
          const empty = mode === 'standard-array' && score === 0;
          return (
            <div
              key={key}
              onClick={() => mode === 'standard-array' && handleAssignToAbility(key)}
              style={{
                border: empty && pickedValueIndex !== null ? '2px dashed #2a7' : '1px solid #ddd',
                borderRadius: 8,
                padding: '1rem',
                textAlign: 'center',
                background: empty ? '#fafafa' : '#fff',
                cursor: mode === 'standard-array' ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#666', textTransform: 'uppercase' }}>
                {ABILITY_NAMES[key]}
              </div>

              {mode === 'point-buy' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); pbChange(key, -1); }}
                    disabled={score <= POINT_BUY_MIN}
                    style={adjButton(score <= POINT_BUY_MIN)}
                  >
                    −
                  </button>
                  <span style={{ fontSize: '1.75rem', fontWeight: 'bold', minWidth: 40 }}>{score}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); pbChange(key, +1); }}
                    disabled={score >= POINT_BUY_MAX}
                    style={adjButton(score >= POINT_BUY_MAX)}
                  >
                    +
                  </button>
                </div>
              )}

              {mode === 'standard-array' && (
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: '0.5rem 0', color: empty ? '#ccc' : '#333' }}>
                  {empty ? '—' : score}
                </div>
              )}

              {showMod && <div style={{ color: '#666' }}>{formatModifier(mod)} modifier</div>}

              {mode === 'point-buy' && (
                <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Cost: {cost}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function modeButton(active: boolean): React.CSSProperties {
  return {
    padding: '0.5rem 1rem',
    background: active ? '#333' : '#fff',
    color: active ? '#fff' : '#333',
    border: '1px solid #333',
    borderRadius: 4,
    cursor: 'pointer',
  };
}

function adjButton(disabled: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    fontSize: '1.2rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
