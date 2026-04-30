import { useEffect, useState } from 'react';
import { setTokenAura } from './tokenApi';

interface Props {
  tokenId: number;
  currentRadius: number | null;
  currentColor: string | null;
}

const PRESET_COLORS = ['#ffd86b', '#7ec4ff', '#9be36b', '#ff9b6b', '#d59bff', '#ff7b9c'];

// Compact "Aura" control row for a token: radius input (feet) + colour swatches + clear button.
// Saves to the server immediately on each change. The ring is drawn around the token on the map.
export function TokenAuraControl({ tokenId, currentRadius, currentColor }: Props) {
  const [radius, setRadius] = useState(currentRadius ?? 0);
  const [color, setColor] = useState(currentColor ?? PRESET_COLORS[0]);

  // Keep local state in sync if the token's aura is changed elsewhere (e.g. socket update).
  useEffect(() => { setRadius(currentRadius ?? 0); }, [currentRadius]);
  useEffect(() => { setColor(currentColor ?? PRESET_COLORS[0]); }, [currentColor]);

  async function commit(nextRadius: number, nextColor: string) {
    setRadius(nextRadius);
    setColor(nextColor);
    try {
      if (nextRadius > 0) await setTokenAura(tokenId, nextRadius, nextColor);
      else await setTokenAura(tokenId, null, null);
    } catch { /* ignore — server emit will reconcile if it succeeded */ }
  }

  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#806020', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
        Aura
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        <input type="number" min={0} max={120} step={5} value={radius}
          onChange={(e) => {
            const n = Math.max(0, Math.min(120, Number(e.target.value) || 0));
            commit(n, color);
          }}
          style={{ width: 50, padding: '0.2rem 0.3rem', border: '1px solid #ccc', borderRadius: 3, fontSize: '0.78rem', boxSizing: 'border-box' }} />
        <span style={{ fontSize: '0.7rem', color: '#888' }}>ft</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => commit(radius || 10, c)}
              title={c}
              style={{
                width: 18, height: 18, border: `2px solid ${c === color ? '#333' : 'transparent'}`,
                borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
              }} />
          ))}
        </div>
        {radius > 0 && (
          <button type="button" onClick={() => commit(0, color)}
            style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', border: '1px solid #ccc', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#888' }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
