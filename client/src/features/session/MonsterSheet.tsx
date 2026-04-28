import { useEffect, useState } from 'react';
import { getLibraryItem } from '../character/api';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { updateTokenHp } from './tokenApi';
import { socket } from '../../lib/socket';

interface MonsterData {
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armor_class: number;
  armor_desc?: string;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, number>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save: number | null;
  dexterity_save: number | null;
  constitution_save: number | null;
  intelligence_save: number | null;
  wisdom_save: number | null;
  charisma_save: number | null;
  skills: Record<string, number>;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  challenge_rating: string;
  actions: Array<{ name: string; desc: string; attack_bonus?: number; damage_dice?: string; damage_bonus?: number }>;
  special_abilities?: Array<{ name: string; desc: string }>;
  legendary_actions?: Array<{ name: string; desc: string; attack_bonus?: number; damage_dice?: string; damage_bonus?: number }>;
}

interface Props {
  slug: string;
  tokenId?: number;
  hpCurrent: number;
  hpMax: number;
  onHpChange?: (hp: number) => void;
  onClose: () => void;
}

const ABILITY_KEYS = [
  { dataKey: 'strength' as const, saveKey: 'strength_save' as const, short: 'STR' },
  { dataKey: 'dexterity' as const, saveKey: 'dexterity_save' as const, short: 'DEX' },
  { dataKey: 'constitution' as const, saveKey: 'constitution_save' as const, short: 'CON' },
  { dataKey: 'intelligence' as const, saveKey: 'intelligence_save' as const, short: 'INT' },
  { dataKey: 'wisdom' as const, saveKey: 'wisdom_save' as const, short: 'WIS' },
  { dataKey: 'charisma' as const, saveKey: 'charisma_save' as const, short: 'CHA' },
];

export function MonsterSheet({ slug, tokenId, hpCurrent, hpMax, onHpChange, onClose }: Props) {
  const [monster, setMonster] = useState<MonsterData | null>(null);
  const [hp, setHp] = useState(hpCurrent);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setHp(hpCurrent); }, [hpCurrent]);

  useEffect(() => {
    getLibraryItem<{ name: string; data: MonsterData }>('monsters', slug)
      .then((r) => setMonster(r.data ?? null))
      .catch(() => {});
  }, [slug]);

  async function commitHp(next: number) {
    const clamped = Math.max(0, Math.min(hpMax, next));
    setHp(clamped);
    setSaving(true);
    try {
      if (tokenId) await updateTokenHp(tokenId, clamped);
      onHpChange?.(clamped);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  function rollInChat(label: string, expression: string) {
    socket.emit('chat:send', { body: `/roll ${expression}`, label });
  }

  if (!monster) {
    return (
      <SheetOverlay onClose={onClose}>
        <div style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>Loading…</div>
      </SheetOverlay>
    );
  }

  const hpPct = hpMax > 0 ? hp / hpMax : 0;
  const hpBarColor = hpPct > 0.5 ? '#4a4' : hpPct > 0.25 ? '#aa4' : '#a44';
  const speedStr = Object.entries(monster.speed ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`)
    .join(', ') || '—';

  return (
    <SheetOverlay onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '0.9rem 1rem', borderBottom: '2px solid #8b0000', flexShrink: 0, background: '#fdf5f5' }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#5a0000' }}>{monster.name}</div>
        <div style={{ fontSize: '0.76rem', color: '#884', marginTop: 2, fontStyle: 'italic' }}>
          {monster.size} {monster.type}{monster.subtype ? ` (${monster.subtype})` : ''}{monster.alignment ? `, ${monster.alignment}` : ''}
          {monster.challenge_rating ? ` · CR ${monster.challenge_rating}` : ''}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>

        {/* Key stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
          {[
            { label: 'Armor Class', value: `${monster.armor_class}${monster.armor_desc ? '*' : ''}`, title: monster.armor_desc },
            { label: 'Hit Points', value: `${hp} / ${hpMax}` },
            { label: 'Speed', value: speedStr },
          ].map(({ label, value, title }) => (
            <div key={label} title={title} style={{ background: '#f9f0f0', borderRadius: 5, padding: '0.35rem 0.4rem', textAlign: 'center', border: '1px solid #e8d0d0' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#5a0000' }}>{value}</div>
              <div style={{ fontSize: '0.6rem', color: '#998', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* HP controls */}
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ height: 7, background: '#e8e0e0', borderRadius: 4, marginBottom: '0.4rem' }}>
            <div style={{ height: '100%', width: `${hpPct * 100}%`, background: hpBarColor, borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[-10, -5, -1].map((d) => (
              <button key={d} onClick={() => commitHp(hp + d)} disabled={saving || hp === 0}
                style={{ padding: '0.18rem 0.38rem', fontSize: '0.75rem', border: '1px solid #ccc', borderRadius: 3, cursor: hp === 0 || saving ? 'not-allowed' : 'pointer', background: '#fff', fontWeight: 600, color: hp === 0 ? '#ccc' : '#555' }}>{d}</button>
            ))}
            <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 44, textAlign: 'center', color: hp === 0 ? '#a44' : '#333' }}>{hp}/{hpMax}</span>
            {[1, 5, 10].map((d) => (
              <button key={d} onClick={() => commitHp(hp + d)} disabled={saving || hp >= hpMax}
                style={{ padding: '0.18rem 0.38rem', fontSize: '0.75rem', border: '1px solid #ccc', borderRadius: 3, cursor: hp >= hpMax || saving ? 'not-allowed' : 'pointer', background: '#fff', fontWeight: 600, color: hp >= hpMax ? '#ccc' : '#555' }}>+{d}</button>
            ))}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '2px solid #8b0000', margin: '0 0 0.75rem' }} />

        {/* Ability scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.3rem', textAlign: 'center', marginBottom: '0.85rem' }}>
          {ABILITY_KEYS.map(({ dataKey, short }) => {
            const score = monster[dataKey] as number;
            const mod = abilityModifier(score);
            return (
              <div key={short} onClick={() => rollInChat(`${monster.name} — ${short}`, `1d20${formatModifier(mod)}`)}
                title={`Roll ${short} check`}
                style={{ background: '#f9f0f0', borderRadius: 5, padding: '0.3rem 0.1rem', cursor: 'pointer', border: '1px solid #e8d0d0' }}>
                <div style={{ fontSize: '0.6rem', color: '#884', fontWeight: 600, marginBottom: 1 }}>{short}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#5a0000' }}>{formatModifier(mod)}</div>
                <div style={{ fontSize: '0.65rem', color: '#888' }}>{score}</div>
              </div>
            );
          })}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e8d0d0', margin: '0 0 0.75rem' }} />

        {/* Saving throws */}
        <Section title="Saving Throws">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.1rem 0.75rem' }}>
            {ABILITY_KEYS.map(({ dataKey, saveKey, short }) => {
              const baseMod = abilityModifier(monster[dataKey] as number);
              const profSave = monster[saveKey];
              const total = profSave !== null ? profSave : baseMod;
              const isProficient = profSave !== null;
              return (
                <div key={short} onClick={() => rollInChat(`${monster.name} — ${short} Save`, `1d20${formatModifier(total)}`)}
                  title={`Roll ${short} save`}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.1rem 0.3rem', borderRadius: 3, cursor: 'pointer' }}>
                  <span style={{ color: '#444', fontWeight: isProficient ? 700 : 400 }}>{isProficient ? '◆ ' : '◇ '}{short}</span>
                  <span style={{ fontWeight: 600 }}>{formatModifier(total)}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Skills */}
        {Object.keys(monster.skills ?? {}).length > 0 && (
          <Section title="Skills">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem' }}>
              {Object.entries(monster.skills).map(([skill, bonus]) => (
                <span key={skill} onClick={() => rollInChat(`${monster.name} — ${skill}`, `1d20${formatModifier(bonus)}`)}
                  title={`Roll ${skill}`}
                  style={{ fontSize: '0.75rem', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {skill} <strong>{formatModifier(bonus)}</strong>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Defenses */}
        {(monster.damage_resistances || monster.damage_immunities || monster.damage_vulnerabilities || monster.condition_immunities) && (
          <Section title="Defenses">
            <div style={{ fontSize: '0.73rem', color: '#555', display: 'grid', gap: '0.18rem' }}>
              {monster.damage_vulnerabilities && <div><strong>Vulnerabilities: </strong>{monster.damage_vulnerabilities}</div>}
              {monster.damage_resistances && <div><strong>Resistances: </strong>{monster.damage_resistances}</div>}
              {monster.damage_immunities && <div><strong>Dmg Immunities: </strong>{monster.damage_immunities}</div>}
              {monster.condition_immunities && <div><strong>Cond. Immunities: </strong>{monster.condition_immunities}</div>}
            </div>
          </Section>
        )}

        {/* Senses & Languages */}
        {(monster.senses || monster.languages) && (
          <Section title="Senses & Languages">
            <div style={{ fontSize: '0.73rem', color: '#555', display: 'grid', gap: '0.15rem' }}>
              {monster.senses && <div>{monster.senses}</div>}
              {monster.languages && <div>{monster.languages}</div>}
            </div>
          </Section>
        )}

        <hr style={{ border: 'none', borderTop: '2px solid #8b0000', margin: '0.5rem 0 0.75rem' }} />

        {/* Special Abilities / Traits */}
        {(monster.special_abilities ?? []).length > 0 && (
          <Section title="Traits">
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {monster.special_abilities!.map((ab) => (
                <div key={ab.name} style={{ fontSize: '0.76rem', lineHeight: 1.45 }}>
                  <em style={{ fontWeight: 700 }}>{ab.name}.</em>{' '}
                  <span style={{ color: '#555' }}>{ab.desc}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Actions */}
        {(monster.actions ?? []).length > 0 && (
          <Section title="Actions">
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {monster.actions.map((action) => {
                const hasRoll = action.attack_bonus !== undefined && action.attack_bonus !== null && action.damage_dice;
                return (
                  <div key={action.name} style={{ background: hasRoll ? '#f5f0f8' : '#f9f9f9', borderRadius: 4, padding: '0.4rem 0.5rem', border: `1px solid ${hasRoll ? '#d8c8e8' : '#eee'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 700, fontStyle: 'italic', fontSize: '0.8rem' }}>{action.name}</span>
                      {hasRoll && (
                        <button onClick={() => {
                          const atkExpr = `1d20${formatModifier(action.attack_bonus!)}`;
                          const dmgExpr = `${action.damage_dice}${action.damage_bonus ? formatModifier(action.damage_bonus) : ''}`;
                          rollInChat(`${monster.name} — ${action.name} Attack`, atkExpr);
                          setTimeout(() => rollInChat(`${monster.name} — ${action.name} Damage`, dmgExpr), 80);
                        }} style={{ padding: '0.15rem 0.35rem', fontSize: '0.78rem', border: '1px solid #b8a8d0', borderRadius: 3, background: '#fff', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>🎲</button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#666', lineHeight: 1.45 }}>{action.desc}</div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Legendary Actions */}
        {(monster.legendary_actions ?? []).length > 0 && (
          <Section title="Legendary Actions">
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              {monster.legendary_actions!.map((la) => {
                const hasRoll = la.attack_bonus !== undefined && la.attack_bonus !== null && la.damage_dice;
                return (
                  <div key={la.name} style={{ background: '#fdf8e8', borderRadius: 4, padding: '0.4rem 0.5rem', border: '1px solid #e8ddb8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 700, fontStyle: 'italic', fontSize: '0.8rem' }}>{la.name}</span>
                      {hasRoll && (
                        <button onClick={() => {
                          rollInChat(`${monster.name} — ${la.name}`, `1d20${formatModifier(la.attack_bonus!)}`);
                          if (la.damage_dice) setTimeout(() => rollInChat(`${monster.name} — ${la.name} Dmg`, `${la.damage_dice}${la.damage_bonus ? formatModifier(la.damage_bonus) : ''}`), 80);
                        }} style={{ padding: '0.15rem 0.35rem', fontSize: '0.78rem', border: '1px solid #c8b870', borderRadius: 3, background: '#fff', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>🎲</button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#666', lineHeight: 1.45 }}>{la.desc}</div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </SheetOverlay>
  );
}

function SheetOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.2)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 101, width: 380, background: '#fff', boxShadow: '-4px 0 16px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', borderBottom: '1px solid #e8d0d0', flexShrink: 0, background: '#fdf5f5' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#884', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monster Sheet</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#884', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8b0000', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem', borderBottom: '1px solid #e8d0d0', paddingBottom: '0.15rem' }}>{title}</div>
      {children}
    </div>
  );
}
