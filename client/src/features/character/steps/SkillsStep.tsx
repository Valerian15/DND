import { useEffect, useState } from 'react';
import type { Character } from '../types';
import { getLibraryItem } from '../api';
import { SKILLS, CLASS_SKILL_COUNT, MULTICLASS_SKILL_COUNT, parseClassSkillChoices, expertiseSlotsAtLevel } from '../skills';
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
  expertise?: boolean;
}

export default function SkillsStep({ character, onChange }: Props) {
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [maxChoices, setMaxChoices] = useState(0);
  const [classBreakdown, setClassBreakdown] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Source of truth: classes[] if populated, else legacy class_slug.
  const classes = character.classes && character.classes.length > 0
    ? character.classes
    : (character.class_slug ? [{ slug: character.class_slug, level: character.level || 1, subclass_slug: null, hit_dice_used: 0 }] : []);

  useEffect(() => {
    if (classes.length === 0) {
      setAllowedSkills([]);
      setMaxChoices(0);
      setClassBreakdown('');
      return;
    }
    setLoading(true);
    Promise.all(classes.map((c, idx) =>
      getLibraryItem<{ data: any; name: string }>('classes', c.slug)
        .then((r) => {
          const choices = parseClassSkillChoices(r.data?.prof_skills);
          // Primary class uses full skill count; secondary classes use the multiclass
          // grant (0 unless rogue/bard/ranger).
          const count = idx === 0
            ? (CLASS_SKILL_COUNT[c.slug] ?? 2)
            : (MULTICLASS_SKILL_COUNT[c.slug] ?? 0);
          return { name: r.name, choices, count };
        })
        .catch(() => ({ name: c.slug, choices: [] as string[], count: 0 })),
    )).then((results) => {
      const allowed = new Set<string>();
      for (const r of results) for (const k of r.choices) allowed.add(k);
      const total = results.reduce((sum, r) => sum + r.count, 0);
      const parts = results
        .filter((r) => r.count > 0)
        .map((r) => `${r.count} from ${r.name}`)
        .join(' + ');
      setAllowedSkills([...allowed]);
      setMaxChoices(total);
      setClassBreakdown(parts);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.map((c) => c.slug).join(',')]);

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

  if (classes.length === 0) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>Skills</h2>
        <p style={{ color: '#888' }}>Pick a class first (step 2) to see skill options.</p>
      </div>
    );
  }

  const profBonus = proficiencyBonus(character.level);
  const remaining = maxChoices - classPicked.size;

  // Expertise: sum slots across all classes (rogue 2 at L1 / +2 at L6, bard 2 at L3 / +2 at L10).
  const expertiseSlots = classes.reduce((sum, c) => sum + expertiseSlotsAtLevel(c.slug, c.level), 0);
  const expertiseSelected = new Set(
    Object.entries(skillsMap).filter(([_, v]) => v?.expertise).map(([k]) => k),
  );

  function toggleExpertise(skillKey: string) {
    const entry = skillsMap[skillKey];
    if (!entry?.proficient) return;
    const next = { ...skillsMap };
    if (entry.expertise) {
      next[skillKey] = { ...entry, expertise: false };
    } else {
      if (expertiseSelected.size >= expertiseSlots) return;
      next[skillKey] = { ...entry, expertise: true };
    }
    onChange({ skills: next });
  }

  // Orphans: class picks (non-background) that are not in the class's allowed list
  const hasOrphans = [...classPicked].some((k) => !allowedSkills.includes(k));

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Skill proficiencies</h2>
      <p style={{ color: '#666' }}>
        Pick {maxChoices} skill proficienc{maxChoices === 1 ? 'y' : 'ies'} from your class{classes.length > 1 ? 'es' : ''}' lists.
        {classes.length > 1 && classBreakdown && <span style={{ display: 'block', fontSize: '0.85rem', color: '#888', marginTop: '0.2rem' }}>({classBreakdown})</span>}
        Background- and race-granted skills are shown but don't count against your class budget.
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
                {expertiseSelected.has(skill.key) && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#a60' }}>expertise</span>}
              </span>
              <span style={{ fontSize: '0.9rem' }}>
                {formatModifier(total + (expertiseSelected.has(skill.key) ? profBonus : 0))}
                {isProf && (
                  <span style={{ color: isBg ? '#27a' : isOrphan ? '#a60' : '#2a7', marginLeft: '0.5rem' }}>{expertiseSelected.has(skill.key) ? '⬢' : '●'}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {expertiseSlots > 0 && (
        <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: '#fdf3e0', border: '1px solid #ecd87a', borderRadius: 6 }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '1rem' }}>Expertise ({expertiseSelected.size} / {expertiseSlots})</h3>
          <p style={{ fontSize: '0.82rem', color: '#666', margin: '0 0 0.6rem' }}>
            Pick {expertiseSlots} skill{expertiseSlots > 1 ? 's' : ''} you're proficient in to double your proficiency bonus on its checks.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SKILLS.filter((s) => proficient.has(s.key)).map((s) => {
              const isExp = expertiseSelected.has(s.key);
              const canPick = isExp || expertiseSelected.size < expertiseSlots;
              return (
                <button key={s.key} type="button" onClick={() => toggleExpertise(s.key)} disabled={!canPick}
                  style={{
                    padding: '0.25rem 0.55rem', fontSize: '0.8rem',
                    border: `1px solid ${isExp ? '#a60' : '#ddd'}`,
                    background: isExp ? '#a60' : '#fff',
                    color: isExp ? '#fff' : canPick ? '#666' : '#bbb',
                    borderRadius: 4, cursor: canPick ? 'pointer' : 'not-allowed', fontWeight: isExp ? 700 : 400,
                  }}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
