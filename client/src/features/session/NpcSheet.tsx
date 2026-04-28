import { useState } from 'react';
import { abilityModifier, formatModifier } from '../character/pointBuy';
import { updateTokenHp } from './tokenApi';
import { socket } from '../../lib/socket';
import type { CampaignNpc } from './types';

interface Props {
  npc: CampaignNpc;
  tokenId?: number;
  hpCurrent: number;
  hpMax: number;
  onHpChange?: (hp: number) => void;
  onClose: () => void;
}

const ABILITY_KEYS = [
  { key: 'str' as const, label: 'STR' },
  { key: 'dex' as const, label: 'DEX' },
  { key: 'con' as const, label: 'CON' },
  { key: 'int' as const, label: 'INT' },
  { key: 'wis' as const, label: 'WIS' },
  { key: 'cha' as const, label: 'CHA' },
];

function SheetOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      <div onClick={onClose} style={{ flex: 1, pointerEvents: 'auto' }} />
      <div style={{ width: 320, background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', pointerEvents: 'auto', overflow: 'hidden' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#888', zIndex: 1 }}>✕</button>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8b0000', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{title}</div>
      {children}
    </div>
  );
}

export function NpcSheet({ npc, tokenId, hpCurrent, hpMax, onHpChange, onClose }: Props) {
  const [hp, setHp] = useState(hpCurrent);
  const [saving, setSaving] = useState(false);

  function rollInChat(label: string, expression: string) {
    socket.emit('chat:send', { body: `/roll ${expression}`, label });
  }

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

  const hpPct = hpMax > 0 ? hp / hpMax : 0;
  const hpBarColor = hpPct > 0.5 ? '#4a4' : hpPct > 0.25 ? '#aa4' : '#a44';
  const abs = npc.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

  return (
    <SheetOverlay onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '0.9rem 1rem', borderBottom: '2px solid #8b0000', flexShrink: 0, background: '#fdf5f5' }}>
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#5a0000' }}>{npc.label}</div>
        <div style={{ fontSize: '0.76rem', color: '#884', marginTop: 2, fontStyle: 'italic' }}>
          {npc.size} NPC
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>

        {/* Key stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
          {[
            { label: 'Armor Class', value: String(npc.ac ?? 10) },
            { label: 'Hit Points', value: `${hp} / ${hpMax}` },
            { label: 'Speed', value: npc.speed || '30 ft.' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#f9f0f0', borderRadius: 5, padding: '0.35rem 0.4rem', textAlign: 'center', border: '1px solid #e8d0d0' }}>
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
          {ABILITY_KEYS.map(({ key, label }) => {
            const score = abs[key] ?? 10;
            const mod = abilityModifier(score);
            return (
              <div key={key} onClick={() => rollInChat(`${npc.label} — ${label}`, `1d20${formatModifier(mod)}`)}
                title={`Roll ${label} check`}
                style={{ background: '#f9f0f0', borderRadius: 5, padding: '0.3rem 0.1rem', cursor: 'pointer', border: '1px solid #e8d0d0' }}>
                <div style={{ fontSize: '0.6rem', color: '#884', fontWeight: 600, marginBottom: 1 }}>{label}</div>
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
            {ABILITY_KEYS.map(({ key, label }) => {
              const baseMod = abilityModifier(abs[key] ?? 10);
              const isProficient = (npc.saving_throws ?? []).includes(key);
              const total = isProficient ? baseMod + 2 : baseMod;
              return (
                <div key={key} onClick={() => rollInChat(`${npc.label} — ${label} Save`, `1d20${formatModifier(total)}`)}
                  title={`Roll ${label} save`}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.1rem 0.3rem', borderRadius: 3, cursor: 'pointer' }}>
                  <span style={{ color: '#444', fontWeight: isProficient ? 700 : 400 }}>{isProficient ? '◆ ' : '◇ '}{label}</span>
                  <span style={{ fontWeight: 600 }}>{formatModifier(total)}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Attacks */}
        {(npc.attacks ?? []).length > 0 && (
          <Section title="Attacks">
            {npc.attacks.map((atk, i) => (
              <div key={i} style={{ padding: '0.35rem 0.5rem', background: '#f9f0f0', borderRadius: 5, border: '1px solid #e8d0d0', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: atk.description ? '0.2rem' : 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#5a0000' }}>{atk.name}</span>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button onClick={() => rollInChat(`${npc.label} — ${atk.name} (Attack)`, `1d20${formatModifier(atk.to_hit)}`)}
                      title="Roll attack"
                      style={{ padding: '0.1rem 0.35rem', fontSize: '0.72rem', border: '1px solid #c88', borderRadius: 3, background: '#fff8f8', cursor: 'pointer', color: '#8b0000' }}>
                      🎲 {formatModifier(atk.to_hit)}
                    </button>
                    <button onClick={() => rollInChat(`${npc.label} — ${atk.name} (Damage)`, atk.damage)}
                      title="Roll damage"
                      style={{ padding: '0.1rem 0.35rem', fontSize: '0.72rem', border: '1px solid #c88', borderRadius: 3, background: '#fff8f8', cursor: 'pointer', color: '#8b0000' }}>
                      {atk.damage} {atk.damage_type}
                    </button>
                  </div>
                </div>
                {atk.description && (
                  <div style={{ fontSize: '0.72rem', color: '#666', marginTop: '0.1rem' }}>{atk.description}</div>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Traits */}
        {(npc.traits ?? []).length > 0 && (
          <Section title="Traits">
            {npc.traits.map((t, i) => (
              <div key={i} style={{ marginBottom: '0.4rem', fontSize: '0.79rem' }}>
                <strong style={{ color: '#5a0000' }}>{t.name}. </strong>
                <span style={{ color: '#333' }}>{t.description}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Notes */}
        {npc.notes && (
          <Section title="Notes">
            <div style={{ fontSize: '0.79rem', color: '#555', whiteSpace: 'pre-wrap' }}>{npc.notes}</div>
          </Section>
        )}

      </div>
    </SheetOverlay>
  );
}
