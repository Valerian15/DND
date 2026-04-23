import { useEffect, useState } from 'react';
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
const STANDARD_ARRAY: Abilities = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };

type Mode = 'point-buy' | 'standard-array';

export default function AbilitiesStep({ character, onChange }: Props) {
  const [mode, setMode] = useState<Mode>('point-buy');
  const [scores, setScores] = useState<Abilities>(character.abilities);

  useEffect(() => {
    setScores(character.abilities);
  }, [character.id]);

  const scoreValues = ABILITY_ORDER.map((k) => scores[k]);
  const pointsLeft = remaining(scoreValues);
  const invalid = pointsLeft < 0;

  function applyMode(next: Mode) {
    setMode(next);
    if (next === 'point-buy') {
      setScores(DEFAULT_BUY);
      onChange({ abilities: DEFAULT_BUY });
    } else {
      setScores(STANDARD_ARRAY);
      onChange({ abilities: STANDARD_ARRAY });
    }
  }

  function change(key: keyof Abilities, delta: number) {
    const current = scores[key];
    const next = current + delta;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return;

    const testScores = { ...scores, [key]: next };
    const testValues = ABILITY_ORDER.map((k) => testScores[k]);
    if (remaining(testValues) < 0) return;

    setScores(testScores);
    onChange({ abilities: testScores });
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Ability scores</h2>
      <p style={{ color: '#666' }}>
        Your raw ability scores before racial bonuses (applied separately).
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => applyMode('point-buy')}
          style={{
            padding: '0.5rem 1rem',
            background: mode === 'point-buy' ? '#333' : '#fff',
            color: mode === 'point-buy' ? '#fff' : '#333',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Point Buy
        </button>
        <button
          onClick={() => applyMode('standard-array')}
          style={{
            padding: '0.5rem 1rem',
            background: mode === 'standard-array' ? '#333' : '#fff',
            color: mode === 'standard-array' ? '#fff' : '#333',
            border: '1px solid #333',
            borderRadius: 4,
            cursor: 'pointer',
          }}
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
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
          Standard array (15, 14, 13, 12, 10, 8). Drag-and-drop reassignment coming in Phase 1f — for now, you can
          manually adjust above or switch to Point Buy.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {ABILITY_ORDER.map((key) => {
          const score = scores[key];
          const cost = pointCost(score);
          const mod = abilityModifier(score);
          return (
            <div
              key={key}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#666', textTransform: 'uppercase' }}>
                {ABILITY_NAMES[key]}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <button
                  onClick={() => change(key, -1)}
                  disabled={mode !== 'point-buy' || score <= POINT_BUY_MIN}
                  style={{
                    width: 32,
                    height: 32,
                    fontSize: '1.2rem',
                    cursor: mode !== 'point-buy' || score <= POINT_BUY_MIN ? 'not-allowed' : 'pointer',
                  }}
                >
                  −
                </button>
                <span style={{ fontSize: '1.75rem', fontWeight: 'bold', minWidth: 40 }}>{score}</span>
                <button
                  onClick={() => change(key, +1)}
                  disabled={mode !== 'point-buy' || score >= POINT_BUY_MAX}
                  style={{
                    width: 32,
                    height: 32,
                    fontSize: '1.2rem',
                    cursor: mode !== 'point-buy' || score >= POINT_BUY_MAX ? 'not-allowed' : 'pointer',
                  }}
                >
                  +
                </button>
              </div>
              <div style={{ color: '#666' }}>{formatModifier(mod)} modifier</div>
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
