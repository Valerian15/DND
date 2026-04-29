import { useEffect, useState } from 'react';
import type { Character } from '../types';

interface Props {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
}

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
  'Unaligned',
];

export default function DetailsStep({ character, onChange }: Props) {
  const desc = (character.description ?? {}) as Record<string, any>;
  const initialPersonality = character.personality ?? { traits: '', ideals: '', bonds: '', flaws: '' };

  const [name, setName] = useState(character.name);
  const [alignment, setAlignment] = useState<string>(desc.alignment ?? '');
  const [age, setAge] = useState<string>(desc.age ?? '');
  const [height, setHeight] = useState<string>(desc.height ?? '');
  const [weight, setWeight] = useState<string>(desc.weight ?? '');
  const [eyes, setEyes] = useState<string>(desc.eyes ?? '');
  const [hair, setHair] = useState<string>(desc.hair ?? '');
  const [skin, setSkin] = useState<string>(desc.skin ?? '');
  const [backstory, setBackstory] = useState<string>(desc.backstory ?? '');
  const [portraitUrl, setPortraitUrl] = useState<string>(character.portrait_url ?? '');
  const [traits, setTraits] = useState(initialPersonality.traits ?? '');
  const [ideals, setIdeals] = useState(initialPersonality.ideals ?? '');
  const [bonds, setBonds] = useState(initialPersonality.bonds ?? '');
  const [flaws, setFlaws] = useState(initialPersonality.flaws ?? '');

  // Reload when switching characters
  useEffect(() => {
    const d = (character.description ?? {}) as Record<string, any>;
    const p = character.personality ?? { traits: '', ideals: '', bonds: '', flaws: '' };
    setName(character.name);
    setAlignment(d.alignment ?? '');
    setAge(d.age ?? '');
    setHeight(d.height ?? '');
    setWeight(d.weight ?? '');
    setEyes(d.eyes ?? '');
    setHair(d.hair ?? '');
    setSkin(d.skin ?? '');
    setBackstory(d.backstory ?? '');
    setPortraitUrl(character.portrait_url ?? '');
    setTraits(p.traits ?? '');
    setIdeals(p.ideals ?? '');
    setBonds(p.bonds ?? '');
    setFlaws(p.flaws ?? '');
  }, [character.id]);

  function saveAll() {
    onChange({
      name: name.trim() || 'Unnamed Hero',
      portrait_url: portraitUrl.trim() || null,
      description: { alignment, age, height, weight, eyes, hair, skin, backstory },
      personality: { traits, ideals, bonds, flaws },
    });
  }

  // Save name immediately on blur so the list page reflects it
  function onNameBlur() {
    if (name.trim() !== character.name) {
      onChange({ name: name.trim() || 'Unnamed Hero' });
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Details</h2>
      <p style={{ color: '#666' }}>
        Give your character a name, a look, and a story. Everything here is optional except the name.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onNameBlur}
            style={inputStyle}
          />
        </Field>
        <Field label="Alignment">
          <select value={alignment} onChange={(e) => setAlignment(e.target.value)} style={inputStyle}>
            <option value="">— select —</option>
            {ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Field label="Age"><input type="text" value={age} onChange={(e) => setAge(e.target.value)} style={inputStyle} /></Field>
        <Field label="Height"><input type="text" value={height} onChange={(e) => setHeight(e.target.value)} style={inputStyle} /></Field>
        <Field label="Weight"><input type="text" value={weight} onChange={(e) => setWeight(e.target.value)} style={inputStyle} /></Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <Field label="Eyes"><input type="text" value={eyes} onChange={(e) => setEyes(e.target.value)} style={inputStyle} /></Field>
        <Field label="Hair"><input type="text" value={hair} onChange={(e) => setHair(e.target.value)} style={inputStyle} /></Field>
        <Field label="Skin"><input type="text" value={skin} onChange={(e) => setSkin(e.target.value)} style={inputStyle} /></Field>
      </div>

      <Field label="Portrait image URL (optional)">
        <input
          type="text"
          value={portraitUrl}
          onChange={(e) => setPortraitUrl(e.target.value)}
          placeholder="https://..."
          style={inputStyle}
        />
      </Field>

      <div style={{ marginTop: '1rem' }}>
        <Field label="Backstory">
          <textarea
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1rem' }}>Personality</h3>
      <p style={{ color: '#666', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        Roleplay anchors — your character's habits, beliefs, attachments, and weaknesses.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <Field label="Personality Traits">
          <textarea value={traits} onChange={(e) => setTraits(e.target.value)} rows={3}
            placeholder="How you act and present yourself…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
        <Field label="Ideals">
          <textarea value={ideals} onChange={(e) => setIdeals(e.target.value)} rows={3}
            placeholder="What drives you, your principles…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
        <Field label="Bonds">
          <textarea value={bonds} onChange={(e) => setBonds(e.target.value)} rows={3}
            placeholder="Connections to people, places, things…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
        <Field label="Flaws">
          <textarea value={flaws} onChange={(e) => setFlaws(e.target.value)} rows={3}
            placeholder="Weaknesses, vices, fears…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
      </div>

      <button onClick={saveAll} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', cursor: 'pointer' }}>
        Save details
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  fontSize: '1rem',
  border: '1px solid #ddd',
  borderRadius: 4,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>{label}</div>
      {children}
    </label>
  );
}
