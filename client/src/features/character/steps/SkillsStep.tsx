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

interface SkillEntry {
  proficient?: boolean;
  source?: string;
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

  const skillsMap = character.skills as Record<string, SkillEntry>;

  // All skills that are proficient
  const proficient = new Set(
    Object.entries(skillsMap)
      .filter(([_, v]) => v?.proficient)
      .map(([k]) => k),
  );

  // Class picks = proficient skills WITHOUT a tagged source (background/race feats grant them separately).
  const classPicked = new Set(
    Object.entries(skillsMap)
      .filter(([_, v]) => v?.proficient && v?.source !== 'background' && v?.source !== 'race')
      .map(([k]) => k),
  );

  const backgroundGranted = new Set(
    Object.entries(skillsMap)
      .filter(([_, v]) => v?.proficient && v?.source === 'background')
      .map(([k]) => k),
  );

  const raceGranted = new Set(
    Object.entries(skillsMap)
      .filter(([_, v]) => v?.proficient && v?.source === 'race')
      .map(([k]) => k),
  );

  function toggle(skillKey: string) {
    const entry = skillsMap[skillKey];
    const isProf = !!entry?.proficient;
    const isExternal = entry?.source === 'background' || entry?.source === 'race';

    // Background- and race-granted skills can't be toggled off here.
    if (isExternal) return;

    const next = { ...skillsMap };
    if (isProf) {
      delete next[skillKey];
      onChange({ skills: next });
    } else {
      if (classPicked.size >= maxChoices) return; // class budget hit
      next[skillKey] = { proficient: true };
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
  const remaining = maxChoices - classPicked.size;

  // Orphans: class picks (non-background) that are not in the class's allowed list
  const hasOrphans = [...classPicked].some((k) => !allowedSkills.includes(k));

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Skill proficiencies</h2>
      <p style={{ color: '#666' }}>
        Your class lets you pick {maxChoices} skill proficienc{maxChoices === 1 ? 'y' : 'ies'}.
        Background-granted skills are shown but don't count against your class budget.
      </p>

      {loading && <p>Loading class skill list…</p>}
      {!loading && allowedSkills.length === 0 && (
        <p style={{ color: '#888' }}>No skill choices listed for this class.</p>
      )}

      <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: remaining === 0 ? '#efe' : '#f0f0f0', borderRadius: 4, fontSize: '0.9rem' }}>
        <strong>Class picks:</strong> {classPicked.size} / {maxChoices}
        {backgroundGranted.size > 0 && (
          <span style={{ marginLeft: '1rem', color: '#666' }}>
            (+{backgroundGranted.size} from background)
          </span>
        )}
        {raceGranted.size > 0 && (
          <span style={{ marginLeft: '1rem', color: '#2a7' }}>
            (+{raceGranted.size} from race)
          </span>
        )}
        {hasOrphans && (
          <span style={{ marginLeft: '1rem', color: '#a60' }}>
            Some class picks are outside your current class's list — marked below, click to remove.
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {SKILLS.map((skill) => {
          const isAllowed = allowedSkills.includes(skill.key);
          const isProf = proficient.has(skill.key);
          const isBg = backgroundGranted.has(skill.key);
          const isRace = raceGranted.has(skill.key);
          const isClassPick = classPicked.has(skill.key);
          const isOrphan = isClassPick && !isAllowed;

          // Background- and race-granted skills are not clickable here.
          // Class picks already on can always be unselected.
          // Otherwise need to be in the allowed list.
          const clickable = !isBg && !isRace && (isClassPick || isAllowed);

          const abilityMod = abilityModifier(character.abilities[skill.ability]);
          const total = abilityMod + (isProf ? profBonus : 0);

          return (
            <button
              key={skill.key}
              onClick={() => clickable && toggle(skill.key)}
              disabled={!clickable}
              title={
                isBg ? 'Granted by background — change in the Background step'
                : isRace ? 'Granted by race — change in the Race step'
                : isOrphan ? 'Not offered by your current class — click to remove'
                : undefined
              }
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                borderRadius: 4,
                border: isBg
                  ? '2px solid #6cf'
                  : isRace
                  ? '2px solid #6c6'
                  : isOrphan
                  ? '2px dashed #a60'
                  : isClassPick
                  ? '2px solid #333'
                  : '1px solid #ddd',
                background: isProf ? '#fafafa' : !isAllowed && !isBg && !isRace ? '#f5f5f5' : '#fff',
                color: !clickable && !isBg && !isRace ? '#999' : '#333',
                cursor: clickable ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <span>
                <strong>{skill.name}</strong>{' '}
                <span style={{ fontSize: '0.8rem', color: '#888' }}>({ABILITY_NAMES[skill.ability].slice(0, 3)})</span>
                {isBg && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#27a' }}>background</span>}
                {isRace && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#2a7' }}>race</span>}
              </span>
              <span style={{ fontSize: '0.9rem' }}>
                {formatModifier(total)}
                {isProf && (
                  <span style={{ color: isBg ? '#27a' : isOrphan ? '#a60' : '#2a7', marginLeft: '0.5rem' }}>●</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
