import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';

export interface ReactionOffer {
  offer_id: string;
  deadline: number;
  kind: 'shield' | 'counterspell' | 'gwm-bonus' | 'lucky';
  prompt: string;
  detail?: string;
}

const KIND_META: Record<ReactionOffer['kind'], { label: string; colour: string; verb: string }> = {
  'shield': { label: '🛡 Shield reaction', colour: '#3a76d6', verb: 'cast Shield' },
  'counterspell': { label: '🌀 Counterspell reaction', colour: '#a04d8c', verb: 'cast Counterspell' },
  'gwm-bonus': { label: '⚔ Great Weapon Master', colour: '#c84e2c', verb: 'take bonus attack' },
  'lucky': { label: '🍀 Lucky', colour: '#3a8a3a', verb: 'spend luck point' },
};

interface Props {
  offers: ReactionOffer[];
  onResolved: (offer_id: string) => void;
}

// Floating chip overlay rendered when the player has one or more pending Shield / Counterspell
// prompts. Fixed top-center so it doesn't compete with the hotbar at the bottom.
export function ReactionPrompt({ offers, onResolved }: Props) {
  if (offers.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {offers.map((o) => <ReactionChip key={o.offer_id} offer={o} onResolved={() => onResolved(o.offer_id)} />)}
    </div>
  );
}

function ReactionChip({ offer, onResolved }: { offer: ReactionOffer; onResolved: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const remainMs = Math.max(0, offer.deadline - now);
  const totalMs = 8000;
  const pct = Math.min(100, Math.max(0, (remainMs / totalMs) * 100));

  function respond(accept: boolean) {
    socket.emit('reaction:respond', { offer_id: offer.offer_id, accept });
    onResolved();
  }

  const meta = KIND_META[offer.kind];
  const colour = meta.colour;

  return (
    <div style={{
      pointerEvents: 'auto', minWidth: 320, maxWidth: 460,
      background: '#fff', border: `2px solid ${colour}`, borderRadius: 8,
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)', overflow: 'hidden',
    }}>
      <div style={{ padding: '0.5rem 0.75rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: colour, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
          {meta.label}
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#222', marginBottom: 2 }}>{offer.prompt}</div>
        {offer.detail && (
          <div style={{ fontSize: '0.72rem', color: '#666', lineHeight: 1.35 }}>{offer.detail}</div>
        )}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
          <button onClick={() => respond(true)}
            style={{ flex: 1, padding: '0.4rem', background: colour, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}>
            Yes — {meta.verb}
          </button>
          <button onClick={() => respond(false)}
            style={{ padding: '0.4rem 0.8rem', background: '#fff', color: '#666', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' }}>
            No
          </button>
        </div>
        <div style={{ fontSize: '0.65rem', color: '#999', textAlign: 'right', marginTop: 3 }}>
          {Math.ceil(remainMs / 1000)}s remaining
        </div>
      </div>
      {/* Depleting bar */}
      <div style={{ height: 4, width: '100%', background: '#eee' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colour, transition: 'width 0.1s linear' }} />
      </div>
    </div>
  );
}
