import { useEffect, useState } from 'react';
import type { Character } from '../types';
import { getLibraryItem } from '../api';
import { SKILLS, CLASS_SKILL_COUNT, parseClassSkillChoices } from '../skills';
import { ABILITY_NAMES } from '../types';
import { abilityModifier, formatModifier } from '../pointBuy';
import { proficiencyBonus } from '../rules';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

export default function SkillsStep({ character, onChange }: Props) {
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [maxChoices, setMaxChoices] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!character.class_slug) {
      setAllowedSkills([]);
      setMaxChoices(0);
      return;
    }
    setLoading(true);
    getLibraryItem<{ data: any }>('classes', character.class_slug)
      .then((r) => {
        const choices = parseClassSkillChoices(r.data?.prof_skills);
        setAllowedSkills(choices);
        setMaxChoices(CLASS_SKILL_COUNT[character.class_slug!] ?? 2);
      })
      .finally(() => setLoading(false));
  }, [character.class_slug]);

  const selected = new Set(
    Object.keys(character.skills).filter((k) => (character.skills as any)[k]?.proficient),
  );

  function toggle(skillKey: string) {
    const isOn = selected.has(skillKey);
    if (isOn) {
      const next = { ...(character.skills as any) };
      delete next[skillKey];
      onChange({ skills: next });
    } else {
      if (selected.size >= maxChoices) return; // over limit
      const next = { ...(character.skills as any), [skillKey]: { proficient: true } };
      onChange({ skills: next });
    }
  }

  if (!character.class_slug) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Skills</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see skill options.</p>
      </div>
    );
  }

  const profBonus = proficiencyBonus(character.level);
  const remaining = maxChoices - selected.size;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Skill proficiencies</h2>
      <p style={{ color: '#666' }}>
        Your class lets you pick {maxChoices} skill proficienc{maxChoices === 1 ? 'y' : 'ies'} from the list below.
        Background skills are granted separately and will be merged on the final sheet.
      </p>

      {loading && <p>Loading class skill list…</p>}

      {!loading && allowedSkills.length === 0 && (
        <p style={{ color: '#888' }}>No skill choices listed for this class.</p>
      )}

      <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: remaining === 0 ? '#efe' : '#f0f0f0', borderRadius: 4, fontSize: '0.9rem' }}>
        Selected {selected.size} / {maxChoices}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {SKILLS.map((skill) => {
          const isAllowed = allowedSkills.includes(skill.key);
          const isSelected = selected.has(skill.key);
          const abilityMod = abilityModifier(character.abilities[skill.ability]);
          const total = abilityMod + (isSelected ? profBonus : 0);
          return (
            <button
              key={skill.key}
              onClick={() => isAllowed && toggle(skill.key)}
              disabled={!isAllowed}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: isSelected ? '2px solid #333' : '1px solid #ddd',
                background: isSelected ? '#fafafa' : !isAllowed ? '#f5f5f5' : '#fff',
                color: !isAllowed ? '#999' : '#333',
                cursor: isAllowed ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <span>
                <strong>{skill.name}</strong>{' '}
                <span style={{ fontSize: '0.8rem', color: '#888' }}>({ABILITY_NAMES[skill.ability].slice(0, 3)})</span>
              </span>
              <span style={{ fontSize: '0.9rem' }}>
                {formatModifier(total)}{isSelected && <span style={{ color: '#2a7', marginLeft: '0.5rem' }}>●</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
