import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Character } from './types';
import { createCharacter, getCharacter, getLibraryItem, updateCharacter } from './api';
import CharacterPreview from './CharacterPreview';
import RaceStep from './steps/RaceStep';
import ClassStep from './steps/ClassStep';
import SubclassStep from './steps/SubclassStep';
import AbilitiesStep from './steps/AbilitiesStep';
import BackgroundStep from './steps/BackgroundStep';
import SkillsStep from './steps/SkillsStep';
import EquipmentStep from './steps/EquipmentStep';
import WeaponsStep from './steps/WeaponsStep';
import SpellsStep from './steps/SpellsStep';
import DetailsStep from './steps/DetailsStep';
import { parseHitDie, recomputeDerived } from './rules';

const STEPS = [
  { key: 'race', label: 'Race' },
  { key: 'class', label: 'Class' },
  { key: 'subclass', label: 'Subclass' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'background', label: 'Background' },
  { key: 'skills', label: 'Skills' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'weapons', label: 'Weapons' },
  { key: 'spells', label: 'Spells' },
  { key: 'details', label: 'Details' },
] as const;

export default function CharacterWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitDieSize, setHitDieSize] = useState<number>(8);

  useEffect(() => {
    async function load() {
      try {
        if (id && id !== 'new') {
          const c = await getCharacter(Number(id));
          setCharacter(c);
        } else {
          const c = await createCharacter('Unnamed Hero');
          setCharacter(c);
          navigate(`/characters/${c.id}/edit`, { replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load character');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate]);

  useEffect(() => {
    if (!character?.class_slug) {
      setHitDieSize(8);
      return;
    }
    getLibraryItem<{ data: any }>('classes', character.class_slug)
      .then((r) => setHitDieSize(parseHitDie(r.data?.hit_dice)))
      .catch(() => setHitDieSize(8));
  }, [character?.class_slug]);

  async function save(patch: Partial<Character>) {
    if (!character) return;
    setSaving(true);
    try {
      let updated = await updateCharacter(character.id, patch);
      const affectsDerived = 'abilities' in patch || 'class_slug' in patch || 'level' in patch;
      if (affectsDerived) {
        const derived = recomputeDerived(updated, hitDieSize);
        updated = await updateCharacter(character.id, derived);
      }
      setCharacter(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading character…</div>;
  if (error) return <div style={{ padding: '2rem', color: 'crimson' }}>{error}</div>;
  if (!character) return null;

  const currentStep = STEPS[stepIndex];
  const exitTarget = `/characters/${character.id}`;

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Edit character</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => navigate('/characters')} style={{ cursor: 'pointer' }}>← All characters</button>
          <button onClick={() => navigate(exitTarget)} style={{ cursor: 'pointer' }}>← Back to sheet</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const isCurrent = i === stepIndex;
          const isPast = i < stepIndex;
          return (
            <button
              key={s.key}
              onClick={() => setStepIndex(i)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 4,
                border: '1px solid #ccc',
                background: isCurrent ? '#333' : isPast ? '#e8e8e8' : '#fff',
                color: isCurrent ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: isCurrent ? 'bold' : 'normal',
              }}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {currentStep.key === 'race' && <RaceStep character={character} onChange={save} />}
          {currentStep.key === 'class' && <ClassStep character={character} onChange={save} />}
          {currentStep.key === 'subclass' && <SubclassStep character={character} onChange={save} />}
          {currentStep.key === 'abilities' && <AbilitiesStep character={character} onChange={save} />}
          {currentStep.key === 'background' && <BackgroundStep character={character} onChange={save} />}
          {currentStep.key === 'skills' && <SkillsStep character={character} onChange={save} />}
          {currentStep.key === 'equipment' && <EquipmentStep character={character} onChange={save} />}
          {currentStep.key === 'weapons' && <WeaponsStep character={character} onChange={save} />}
          {currentStep.key === 'spells' && <SpellsStep character={character} onChange={save} />}
          {currentStep.key === 'details' && <DetailsStep character={character} onChange={save} />}

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0}
              style={{ padding: '0.5rem 1rem', cursor: stepIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              ← Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
              {saving ? 'Saving…' : 'All changes saved'}
            </span>
            {stepIndex === STEPS.length - 1 ? (
              <button
                onClick={() => navigate(exitTarget)}
                style={{ padding: '0.5rem 1.25rem', cursor: 'pointer', background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}
              >
                Done →
              </button>
            ) : (
              <button
                onClick={() => setStepIndex(Math.min(STEPS.length - 1, stepIndex + 1))}
                style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
              >
                Next →
              </button>
            )}
          </div>
        </div>

        <CharacterPreview character={character} />
      </div>
    </div>
  );
}
