import { useEffect, useState } from 'react';
import { getCharacter } from '../character/api';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { proficiencyBonus, initiative, passivePerception } from '../character/rules';
import { SKILLS } from '../character/skills';
import { ABILITY_ORDER, ABILITY_NAMES } from '../character/types';
import type { Character } from '../character/types';
import { updateTokenHp } from './tokenApi';

interface Props {
  characterId: number;
  tokenId: number;
  canEditHp: boolean;
  onClose: () => void;
}

const ABILITY_SHORT: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

export function InGameSheet({ characterId, tokenId, canEditHp, onClose }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [hpCurrent, setHpCurrent] = useState(0);
  const [hpInput, setHpInput] = useState('');
  const [hpInputMode, setHpInputMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCharacter(characterId)
      .then((c) => { setCharacter(c); setHpCurrent(c.hp_current); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [characterId]);

  async function adjustHp(delta: number) {
    if (!character || saving) return;
    const next = Math.max(0, Math.min(character.hp_max, hpCurrent + delta));
    await commitHp(next);
  }

  async function commitHpInput() {
    if (!character) return;
    const val = parseInt(hpInput, 10);
    if (!isNaN(val)) await commitHp(Math.max(0, Math.min(character.hp_max, val)));
    setHpInputMode(false);
  }

  async function commitHp(next: number) {
    setSaving(true);
    try {
      const result = await updateTokenHp(tokenId, next);
      setHpCurrent(result.hp_current);
      setCharacter((c) => c ? { ...c, hp_current: result.hp_current } : c);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  if (loading) return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: '2rem', color: '#888' }}>Loading…</div>
    </SheetOverlay>
  );
  if (!character) return null;

  const prof = proficiencyBonus(character.level);
  const init = initiative(character.abilities);
  const profSkills = character.skills as Record<string, { proficient?: boolean }>;
  const profSaves = character.saves as Record<string, { proficient?: boolean }>;
  const perceptionProf = !!profSkills['perception']?.proficient;
  const passive = passivePerception(character.abilities, perceptionProf, prof);
  const hpPct = character.hp_max > 0 ? Math.max(0, Math.min(1, hpCurrent / character.hp_max)) : 0;
  const hpBarColor = hpPct > 0.5 ? '#4a4' : hpPct > 0.25 ? '#aa4' : '#a44';

  return (
    <SheetOverlay onClose={onClose}>
      {/* Header */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #eee' }}>
        {character.portrait_url ? (
          <img src={character.portrait_url} alt={character.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #ddd' }} />
        ) : (
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#4a8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem', fontWeight: 700, flexShrink: 0 }}>
            {character.name[0]}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{character.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Level {character.level}{character.class_slug ? ` · ${character.class_slug}` : ''}{character.race_slug ? ` · ${character.race_slug}` : ''}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>

        {/* HP Section */}
        <Section title="Hit Points">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            {canEditHp ? (
              <>
                <HpBtn label="−10" onClick={() => adjustHp(-10)} disabled={saving || hpCurrent === 0} />
                <HpBtn label="−5" onClick={() => adjustHp(-5)} disabled={saving || hpCurrent === 0} />
                <HpBtn label="−1" onClick={() => adjustHp(-1)} disabled={saving || hpCurrent === 0} />
                {hpInputMode ? (
                  <input
                    type="number"
                    value={hpInput}
                    onChange={(e) => setHpInput(e.target.value)}
                    onBlur={commitHpInput}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitHpInput(); if (e.key === 'Escape') setHpInputMode(false); }}
                    autoFocus
                    style={{ width: 52, textAlign: 'center', padding: '0.25rem', border: '1px solid #aaa', borderRadius: 4, fontSize: '1.1rem', fontWeight: 700 }}
                  />
                ) : (
                  <div
                    onClick={() => { setHpInput(String(hpCurrent)); setHpInputMode(true); }}
                    style={{ minWidth: 52, textAlign: 'center', fontSize: '1.3rem', fontWeight: 700, cursor: 'text', padding: '0.1rem 0.3rem', borderRadius: 4, border: '1px solid transparent' }}
                    title="Click to set HP directly"
                  >
                    {hpCurrent}
                  </div>
                )}
                <HpBtn label="+1" onClick={() => adjustHp(1)} disabled={saving || hpCurrent >= character.hp_max} />
                <HpBtn label="+5" onClick={() => adjustHp(5)} disabled={saving || hpCurrent >= character.hp_max} />
                <HpBtn label="+10" onClick={() => adjustHp(10)} disabled={saving || hpCurrent >= character.hp_max} />
              </>
            ) : (
              <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{hpCurrent}</div>
            )}
            <span style={{ color: '#888', fontSize: '0.9rem' }}>/ {character.hp_max}</span>
            {character.hp_temp > 0 && <span style={{ fontSize: '0.82rem', color: '#55a', marginLeft: '0.25rem' }}>+{character.hp_temp} temp</span>}
          </div>
          {/* HP bar */}
          <div style={{ height: 8, background: '#ddd', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpBarColor, borderRadius: 4, transition: 'width 0.3s' }} />
          </div>
        </Section>

        {/* Combat stats */}
        <Section title="Combat">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
            {[
              { label: 'AC', value: character.ac },
              { label: 'Initiative', value: formatModifier(init) },
              { label: 'Prof', value: formatModifier(prof) },
              { label: 'Passive Perc', value: passive },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f5f5f5', borderRadius: 6, padding: '0.4rem 0.25rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{value}</div>
                <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Ability scores */}
        <Section title="Abilities">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
            {ABILITY_ORDER.map((key) => {
              const score = character.abilities[key];
              const mod = abilityModifier(score);
              return (
                <div key={key} style={{ background: '#f5f5f5', borderRadius: 6, padding: '0.4rem 0.2rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{formatModifier(mod)}</div>
                  <div style={{ fontSize: '0.75rem', color: '#555' }}>{score}</div>
                  <div style={{ fontSize: '0.6rem', color: '#999', marginTop: 1 }}>{ABILITY_SHORT[key]}</div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Saving throws */}
        <Section title="Saving Throws">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem 1rem' }}>
            {ABILITY_ORDER.map((key) => {
              const mod = abilityModifier(character.abilities[key]);
              const isProficient = !!(profSaves[key] as any)?.proficient;
              const total = mod + (isProficient ? prof : 0);
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.15rem 0' }}>
                  <span style={{ color: '#444', fontWeight: isProficient ? 600 : 400 }}>
                    {isProficient ? '◆ ' : '◇ '}{ABILITY_NAMES[key].slice(0, 3)}
                  </span>
                  <span style={{ fontWeight: 600 }}>{formatModifier(total)}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Skills */}
        <Section title="Skills">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.15rem 1rem' }}>
            {SKILLS.map((sk) => {
              const mod = abilityModifier(character.abilities[sk.ability]);
              const isProficient = !!(profSkills[sk.key] as any)?.proficient;
              const total = mod + (isProficient ? prof : 0);
              return (
                <div key={sk.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.1rem 0' }}>
                  <span style={{ color: '#444', fontWeight: isProficient ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isProficient ? '◆ ' : '◇ '}{sk.name}
                  </span>
                  <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>{formatModifier(total)}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {character.notes && (
          <Section title="Notes">
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#555', whiteSpace: 'pre-wrap' }}>{character.notes}</p>
          </Section>
        )}
      </div>
    </SheetOverlay>
  );
}

function SheetOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.2)' }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101,
        width: 380, background: '#fff', boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', fontFamily: 'system-ui',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid #eee', flexShrink: 0, background: '#fafafa' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Character Sheet</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#888', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem', borderBottom: '1px solid #eee', paddingBottom: '0.2rem' }}>{title}</div>
      {children}
    </div>
  );
}

function HpBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: '0.25rem 0.4rem', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#bbb' : '#333', fontWeight: 600, lineHeight: 1 }}
    >
      {label}
    </button>
  );
}
