// Read-only "statblock" renderers for library detail views. Each ContentType picks the most
// appropriate one — monsters get the classic 5e parchment statblock, spells get a spell card,
// items get an item card, everything else falls back to a tidy key-value list.
//
// Data shape follows Open5e for monsters/spells (since that's what the SRD seed populates).

import type { ContentType } from './types';

interface Props {
  type: ContentType;
  name: string;
  data: Record<string, unknown>;
}

export function Statblock({ type, name, data }: Props) {
  if (type === 'monsters') return <MonsterStatblock name={name} data={data} />;
  if (type === 'spells') return <SpellStatblock name={name} data={data} />;
  if (type === 'items') return <ItemStatblock name={name} data={data} />;
  if (type === 'feats') return <FeatStatblock name={name} data={data} />;
  if (type === 'conditions') return <ConditionStatblock name={name} data={data} />;
  if (type === 'classes' || type === 'subclasses' || type === 'backgrounds' || type === 'races') {
    return <DescriptiveStatblock name={name} data={data} />;
  }
  if (type === 'weapons') return <WeaponStatblock name={name} data={data} />;
  return <RawFallback data={data} />;
}

// ───────────────────── Monster ─────────────────────
function MonsterStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const m = data as MonsterFields;
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
  const speedStr = formatSpeed(m.speed);

  const saves = abilities
    .map((a) => ({ key: a.slice(0, 3).toUpperCase(), val: m[`${a}_save` as keyof MonsterFields] as number | null }))
    .filter((s) => s.val != null && s.val !== 0)
    .map((s) => `${s.key} ${formatModifier(s.val!)}`)
    .join(', ');

  const skills = m.skills && typeof m.skills === 'object'
    ? Object.entries(m.skills as Record<string, number>).map(([k, v]) => `${capitalize(k)} ${formatModifier(v)}`).join(', ')
    : '';

  return (
    <div style={statblockShell}>
      {/* Image / placeholder */}
      <ImagePlaceholder src={m.img_main} alt={name} aspect="3 / 2" />

      {/* Header */}
      <div style={{ padding: '0.85rem 1rem 0.5rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.45rem', fontWeight: 700, color: '#722', lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontStyle: 'italic', fontSize: '0.85rem', color: '#776', marginTop: 2 }}>
          {capitalize(m.size ?? '')} {m.type ?? ''}
          {m.subtype ? ` (${m.subtype})` : ''}
          {m.alignment ? `, ${m.alignment}` : ''}
        </div>
      </div>

      <RedBar />

      <div style={{ padding: '0.5rem 1rem 0' }}>
        <KvLine label="Armor Class">{m.armor_class}{m.armor_desc ? ` (${m.armor_desc})` : ''}</KvLine>
        <KvLine label="Hit Points">{m.hit_points}{m.hit_dice ? ` (${m.hit_dice})` : ''}</KvLine>
        <KvLine label="Speed">{speedStr}</KvLine>
      </div>

      <RedBar />

      {/* Ability score table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', textAlign: 'center', padding: '0.6rem 1rem 0.4rem', columnGap: 4 }}>
        {abilities.map((a) => {
          const score = m[a] as number ?? 10;
          return (
            <div key={a}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#722', textTransform: 'uppercase' }}>{a.slice(0, 3)}</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#333' }}>{score} ({formatModifier(abilityMod(score))})</div>
            </div>
          );
        })}
      </div>

      <RedBar />

      <div style={{ padding: '0.5rem 1rem 0' }}>
        {saves && <KvLine label="Saving Throws">{saves}</KvLine>}
        {skills && <KvLine label="Skills">{skills}</KvLine>}
        {m.damage_vulnerabilities && <KvLine label="Damage Vulnerabilities">{m.damage_vulnerabilities}</KvLine>}
        {m.damage_resistances && <KvLine label="Damage Resistances">{m.damage_resistances}</KvLine>}
        {m.damage_immunities && <KvLine label="Damage Immunities">{m.damage_immunities}</KvLine>}
        {m.condition_immunities && <KvLine label="Condition Immunities">{m.condition_immunities}</KvLine>}
        {m.senses && <KvLine label="Senses">{m.senses}</KvLine>}
        {m.languages && <KvLine label="Languages">{m.languages}</KvLine>}
        {m.challenge_rating != null && (
          <KvLine label="Challenge">{m.challenge_rating}{xpFor(m.challenge_rating) ? ` (${xpFor(m.challenge_rating)} XP)` : ''}</KvLine>
        )}
      </div>

      <RedBar />

      {/* Special abilities */}
      {(m.special_abilities ?? []).length > 0 && (
        <Section>
          {m.special_abilities!.map((sa, i) => (
            <NamedDesc key={i} name={sa.name} desc={sa.desc} />
          ))}
        </Section>
      )}

      {/* Actions */}
      {(m.actions ?? []).length > 0 && (
        <Section title="Actions">
          {m.actions!.map((a, i) => (
            <NamedDesc key={i} name={a.name} desc={a.desc} />
          ))}
        </Section>
      )}

      {/* Reactions (some monsters have these on a separate field) */}
      {(m.reactions ?? []).length > 0 && (
        <Section title="Reactions">
          {m.reactions!.map((a, i) => (
            <NamedDesc key={i} name={a.name} desc={a.desc} />
          ))}
        </Section>
      )}

      {/* Legendary actions */}
      {(m.legendary_actions ?? []).length > 0 && (
        <Section title="Legendary Actions">
          {m.legendary_desc && <MD text={m.legendary_desc} />}
          {m.legendary_actions!.map((a, i) => (
            <NamedDesc key={i} name={a.name} desc={a.desc} />
          ))}
        </Section>
      )}

      {m.desc && (
        <Section title="Description">
          <MD text={m.desc} />
        </Section>
      )}
    </div>
  );
}

interface MonsterFields {
  name: string;
  size?: string; type?: string; subtype?: string; alignment?: string;
  armor_class?: number; armor_desc?: string;
  hit_points?: number; hit_dice?: string;
  speed?: Record<string, number> | string;
  strength?: number; dexterity?: number; constitution?: number; intelligence?: number; wisdom?: number; charisma?: number;
  strength_save?: number | null; dexterity_save?: number | null; constitution_save?: number | null;
  intelligence_save?: number | null; wisdom_save?: number | null; charisma_save?: number | null;
  skills?: Record<string, number> | unknown;
  damage_vulnerabilities?: string; damage_resistances?: string; damage_immunities?: string; condition_immunities?: string;
  senses?: string; languages?: string;
  challenge_rating?: string;
  special_abilities?: Array<{ name: string; desc: string }>;
  actions?: Array<{ name: string; desc: string }>;
  reactions?: Array<{ name: string; desc: string }>;
  legendary_actions?: Array<{ name: string; desc: string }>;
  legendary_desc?: string;
  img_main?: string;
  desc?: string;
}

// ───────────────────── Spell ─────────────────────
function SpellStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const s = data as SpellFields;
  const lvlText = s.level === 0 ? 'Cantrip' : `${ordinal(s.level ?? 1)}-level`;
  const schoolText = s.school ? capitalize(s.school) : '';
  const subline = `${lvlText}${schoolText ? ` ${schoolText.toLowerCase()}` : ''}${s.ritual ? ' (ritual)' : ''}`;

  const components = [
    s.requires_verbal_components ? 'V' : null,
    s.requires_somatic_components ? 'S' : null,
    s.requires_material_components ? `M${s.material ? ` (${s.material})` : ''}` : null,
  ].filter(Boolean).join(', ');

  return (
    <div style={statblockShell}>
      <ImagePlaceholder src={undefined} alt={name} aspect="4 / 1" placeholderKind="spell" placeholderText={schoolText} />
      <div style={{ padding: '0.75rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 700, color: '#446', lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontStyle: 'italic', fontSize: '0.85rem', color: '#778', marginTop: 2 }}>{subline}</div>
      </div>
      <RedBar color="#446" />
      <div style={{ padding: '0.5rem 1rem 0' }}>
        {s.casting_time && <KvLine label="Casting Time">{s.casting_time}</KvLine>}
        {s.range && <KvLine label="Range">{s.range}</KvLine>}
        {components && <KvLine label="Components">{components}</KvLine>}
        {s.duration && <KvLine label="Duration">{s.concentration ? `Concentration, ${s.duration.toLowerCase()}` : s.duration}</KvLine>}
        {s.dnd_class && <KvLine label="Classes">{String(s.dnd_class).split('|').join(', ')}</KvLine>}
      </div>
      <RedBar color="#446" />
      {s.desc && <Section><MD text={s.desc} /></Section>}
      {s.higher_level && <Section title="At Higher Levels"><MD text={s.higher_level} /></Section>}
    </div>
  );
}

interface SpellFields {
  level?: number; school?: string;
  desc?: string; higher_level?: string;
  casting_time?: string; range?: string; duration?: string;
  concentration?: boolean | string; ritual?: boolean | string;
  components?: string;
  requires_verbal_components?: boolean;
  requires_somatic_components?: boolean;
  requires_material_components?: boolean;
  material?: string;
  dnd_class?: string;
}

// ───────────────────── Item ─────────────────────
function ItemStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const i = data as ItemFields;
  const subline = [i.rarity, i.item_type ?? i.type, i.requires_attunement ? `requires attunement${i.requires_attunement.startsWith('requires') ? '' : ` ${i.requires_attunement}`}` : null]
    .filter(Boolean).join(', ');
  return (
    <div style={statblockShell}>
      <ImagePlaceholder src={undefined} alt={name} aspect="4 / 1" placeholderKind="item" placeholderText={i.rarity} />
      <div style={{ padding: '0.75rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 700, color: '#553', lineHeight: 1.1 }}>{name}</div>
        {subline && <div style={{ fontStyle: 'italic', fontSize: '0.85rem', color: '#776', marginTop: 2 }}>{subline}</div>}
      </div>
      <RedBar color="#a86" />
      {i.desc && <Section><MD text={i.desc} /></Section>}
    </div>
  );
}

interface ItemFields {
  rarity?: string; item_type?: string; type?: string;
  requires_attunement?: string; desc?: string;
}

// ───────────────────── Feat / Condition / Weapon / Descriptive ─────────────────────
function FeatStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const f = data as { prerequisite?: string; desc?: string };
  return (
    <div style={statblockShell}>
      <div style={{ padding: '0.85rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 700, color: '#345' }}>{name}</div>
        {f.prerequisite && <div style={{ fontStyle: 'italic', fontSize: '0.85rem', color: '#776', marginTop: 2 }}>Prerequisite: {f.prerequisite}</div>}
      </div>
      <RedBar color="#446" />
      {f.desc && <Section><MD text={f.desc} /></Section>}
    </div>
  );
}

function ConditionStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const c = data as { desc?: string };
  return (
    <div style={statblockShell}>
      <div style={{ padding: '0.85rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 700, color: '#a44' }}>{name}</div>
      </div>
      <RedBar />
      {c.desc && <Section><MD text={c.desc} /></Section>}
    </div>
  );
}

function WeaponStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  const w = data as { damage_dice?: string; damage_type?: string; properties?: string[]; cost?: string; weight?: string; range_normal?: number; range_long?: number; versatile_dice?: string };
  return (
    <div style={statblockShell}>
      <div style={{ padding: '0.85rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 700, color: '#553' }}>{name}</div>
      </div>
      <RedBar color="#a86" />
      <div style={{ padding: '0.55rem 1rem' }}>
        {w.damage_dice && <KvLine label="Damage">{w.damage_dice} {w.damage_type}</KvLine>}
        {w.versatile_dice && <KvLine label="Versatile">{w.versatile_dice}</KvLine>}
        {(w.range_normal != null || w.range_long != null) && (
          <KvLine label="Range">{w.range_normal ?? '—'}/{w.range_long ?? '—'} ft</KvLine>
        )}
        {w.properties && w.properties.length > 0 && <KvLine label="Properties">{w.properties.join(', ')}</KvLine>}
        {w.cost && <KvLine label="Cost">{w.cost}</KvLine>}
        {w.weight && <KvLine label="Weight">{w.weight}</KvLine>}
      </div>
    </div>
  );
}

function DescriptiveStatblock({ name, data }: { name: string; data: Record<string, unknown> }) {
  // Open5e race / class / background / subclass payloads are loosely structured: a top-level
  // `desc`, a `size_raw` enum, and many *_desc fields that hold the actual flavour text. We
  // surface the size/speed in the subline, render the main desc, then print every `*_desc`
  // field as a NamedDesc block. Document metadata is hidden.
  const d = data as Record<string, unknown>;
  const desc = (d.desc ?? d.description) as string | undefined;
  const sizeEnum = (d.size_raw ?? d.size) as string | undefined;
  // `speed` may be either a number or an object like { walk: 30 }.
  const rawSpeed = d.speed as number | string | Record<string, number> | undefined;
  const speedStr = typeof rawSpeed === 'number'
    ? `${rawSpeed} ft.`
    : typeof rawSpeed === 'string'
    ? rawSpeed
    : rawSpeed && typeof rawSpeed === 'object'
    ? Object.entries(rawSpeed as Record<string, number>).map(([k, v]) => k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`).join(', ')
    : null;

  // Open5e race / class / background payloads scatter "trait-style" content across many keys
  // (`age`, `alignment`, `vision`, `languages`, `traits`, plus *_desc variants). Each body starts
  // with its own bold-italic header (`**_Age._** Although elves...`) or a `## Heading`, which IS
  // the visual label. So we collect all of them and render them as plain MD under a single
  // "Traits" section — synthesising a separate per-field header on top would duplicate the label.
  const explicitTraits = Array.isArray(d.traits) ? d.traits as Array<{ name: string; desc: string }> : [];
  const inlineDescBodies: string[] = [];
  const traitKeysUsed = new Set<string>();
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string') continue;
    if (k === 'desc' || k === 'description' || k === 'name' || k === 'slug') continue;
    if (looksLikeTraitBody(v)) {
      // Strip a redundant leading `## Heading` line — the bold-italic prefix following it
      // already labels the trait, so two labels in a row reads as a duplicate to users.
      const stripped = v.replace(/^\s*#{1,6}\s+.+?\n+/, '');
      inlineDescBodies.push(stripped);
      traitKeysUsed.add(k);
    }
  }

  // Hide document metadata + already-rendered fields when listing leftover scalars.
  const HIDDEN_KEYS = new Set([
    'desc', 'description', 'traits', 'size', 'size_raw', 'speed', 'name', 'slug',
    'document__slug', 'document__title', 'document__license_url', 'document__url',
    'document_slug', 'document_title', 'document_license_url', 'document_url',
  ]);
  // Block-level fields get their own MD-rendered section (markdown tables, multi-paragraph
  // equipment lists, etc.). Inline scalars get a labelled key-value row with inline markdown.
  const BLOCK_KEYS = new Set(['table', 'equipment', 'feature_desc', 'profession_desc', 'spellcasting']);
  const leftoverEntries = Object.entries(d).filter(([k, v]) =>
    !HIDDEN_KEYS.has(k)
    && !traitKeysUsed.has(k)
    && (typeof v === 'string' || typeof v === 'number')
  );
  const blockEntries = leftoverEntries.filter(([k, v]) =>
    BLOCK_KEYS.has(k) || (typeof v === 'string' && (v.includes('\n') || v.length > 200))
  );
  const inlineEntries = leftoverEntries.filter(([k, v]) =>
    !BLOCK_KEYS.has(k) && (typeof v === 'number' || (typeof v === 'string' && !v.includes('\n') && v.length <= 200))
  );

  return (
    <div style={statblockShell}>
      <div style={{ padding: '0.85rem 1rem 0.4rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 700, color: '#345' }}>{name}</div>
        {(sizeEnum || speedStr) && (
          <div style={{ fontStyle: 'italic', fontSize: '0.85rem', color: '#776', marginTop: 2 }}>
            {[sizeEnum, speedStr].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <RedBar color="#446" />
      {desc && <Section><MD text={desc} /></Section>}
      {explicitTraits.length > 0 && (
        <Section title="Traits">
          {explicitTraits.map((t, i) => <NamedDesc key={i} name={t.name} desc={t.desc} />)}
        </Section>
      )}
      {inlineDescBodies.length > 0 && (
        <Section title={explicitTraits.length === 0 ? 'Traits' : undefined}>
          {inlineDescBodies.map((body, i) => <TraitBlock key={i} body={body} />)}
        </Section>
      )}
      {/* Block fields (tables, multi-paragraph equipment lists, etc.) get their own labelled MD blocks. */}
      {blockEntries.map(([k, v]) => (
        <Section key={k} title={prettyKey(k)}>
          <MD text={String(v)} />
        </Section>
      ))}
      {/* Short inline scalars are still useful (proficiencies, hit_die etc.). Render with inline markdown. */}
      {inlineEntries.length > 0 && (
        <Section>
          {inlineEntries.map(([k, v]) => (
            <div key={k} style={{ fontSize: '0.86rem', color: '#222', marginBottom: 2, lineHeight: 1.4 }}>
              <strong style={{ color: '#553' }}>{prettyKey(k)}.</strong> {typeof v === 'number' ? v : renderInline(String(v))}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function RawFallback({ data }: { data: Record<string, unknown> }) {
  return (
    <pre style={{
      background: '#f7f7f7', padding: '1rem', borderRadius: 6,
      overflow: 'auto', maxHeight: '55vh', fontSize: '0.78rem',
      fontFamily: 'ui-monospace, Menlo, monospace', margin: 0,
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ───────────────────── Building blocks ─────────────────────
const statblockShell: React.CSSProperties = {
  background: '#fdf6e3',
  border: '1px solid #c8b88c',
  borderRadius: 6,
  boxShadow: '0 2px 8px rgba(80,60,30,0.12)',
  overflow: 'hidden',
};

function RedBar({ color = '#722' }: { color?: string }) {
  return <div style={{ height: 3, background: color, margin: '0 1rem', borderRadius: 1 }} />;
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0.5rem 1rem 0.6rem' }}>
      {title && <div style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', fontWeight: 700, color: '#722', borderBottom: '1px solid #d4c89c', paddingBottom: 2, marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}

// One trait body — extracts the leading label (`**_Age._**`, `**Age.**`, or `## Age`) and
// renders it as a red-with-underline heading above the body. The label that was inside the
// markdown is stripped so it doesn't show twice.
function TraitBlock({ body }: { body: string }) {
  let name: string | null = null;
  let rest = body;

  // Try `## Heading` first
  const hMatch = body.match(/^\s*#{1,6}\s+(.+?)\s*\n+([\s\S]*)$/);
  if (hMatch) {
    name = hMatch[1].trim().replace(/\.$/, '');
    rest = hMatch[2];
  } else {
    // Try `**_Name._**` (bold-italic, with or without internal period)
    const biMatch = body.match(/^\s*\*\*_([^_]+?)_\*\*\.?\s*([\s\S]*)$/);
    if (biMatch) {
      name = biMatch[1].trim().replace(/\.$/, '');
      rest = biMatch[2];
    } else {
      // Try `**Name.**` (plain bold)
      const bMatch = body.match(/^\s*\*\*([^*]+?)\*\*\.?\s*([\s\S]*)$/);
      if (bMatch) {
        name = bMatch[1].trim().replace(/\.$/, '');
        rest = bMatch[2];
      }
    }
  }

  if (!name) return <MD text={body} />;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{
        fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '0.95rem', color: '#722',
        borderBottom: '1px solid #d4c89c', paddingBottom: 2, marginBottom: 4,
      }}>
        {name}
      </div>
      <MD text={rest.trim()} />
    </div>
  );
}

function NamedDesc({ name, desc }: { name: string; desc: string }) {
  // Open5e desc strings often start with a duplicated bold-italic name like "**_Name._**"
  // followed by the actual description — strip it so we don't render the name twice.
  const cleaned = desc.replace(/^\s*\*\*_[^_]+_\*\*\s*\.?\s*/, '').replace(/^\s*\*\*[^*]+\*\*\s*\.?\s*/, '');
  // Use renderInline (no block wrapping) so the description sits next to the name on the same line.
  return (
    <div style={{ marginBottom: '0.4rem', fontSize: '0.84rem', color: '#222', lineHeight: 1.45 }}>
      <strong style={{ fontStyle: 'italic', color: '#553' }}>{name}.</strong>{' '}
      {renderInline(cleaned)}
    </div>
  );
}

function KvLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.86rem', color: '#222', marginBottom: 2, lineHeight: 1.4 }}>
      <strong style={{ color: '#553' }}>{label}.</strong> {children}
    </div>
  );
}

// Image area — uses the source URL when present, otherwise a tasteful placeholder so the layout
// still feels card-like.
function ImagePlaceholder({ src, alt, aspect, placeholderKind, placeholderText }: {
  src?: string; alt: string; aspect: string;
  placeholderKind?: 'monster' | 'spell' | 'item';
  placeholderText?: string;
}) {
  if (src) {
    return (
      <div style={{ width: '100%', aspectRatio: aspect, background: '#222', overflow: 'hidden' }}>
        <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  const bg = placeholderKind === 'spell' ? 'linear-gradient(135deg,#3d4666,#5a6390)'
    : placeholderKind === 'item' ? 'linear-gradient(135deg,#7a6534,#a88c4e)'
    : 'linear-gradient(135deg,#5a3030,#8a4f4f)';
  const icon = placeholderKind === 'spell' ? '✨'
    : placeholderKind === 'item' ? '⚜'
    : '🐉';
  return (
    <div style={{ width: '100%', aspectRatio: aspect, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Georgia, serif' }}>
      <div style={{ textAlign: 'center', opacity: 0.85 }}>
        <div style={{ fontSize: aspect === '3 / 2' ? '3rem' : '1.6rem', lineHeight: 1 }}>{icon}</div>
        {placeholderText && <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>{placeholderText}</div>}
      </div>
    </div>
  );
}

// ───────────────────── markdown ─────────────────────
// Tiny markdown→React renderer. Open5e descriptions use ** for bold, _ for italic, **_..._** for
// bold-italic, ## for headings, bullet lines starting with * or -, and pipe-style tables for
// class progression and damage scaling. We don't aim to be a full markdown parser — we just want
// pretty text instead of raw `**_Size._**` showing up on screen.
export function MD({ text }: { text: string }) {
  if (!text) return null;
  // Walk line-by-line and group consecutive lines into block elements (paragraphs, tables,
  // bullet lists, headings). Headings always become their own block, even if the next line
  // immediately follows without a blank gap (Open5e content frequently does this).
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines.
    if (!trimmed) { i++; continue; }

    // Markdown heading. Mirror the Section title look — red Georgia serif with a tan underline —
    // so a `## Foo` heading reads as a section label, matching the rest of the parchment design.
    // Supports h1-h6 (Open5e uses up to ##### for sub-features inside class / subclass descs).
    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      const sizes = ['1.1rem', '1.05rem', '1rem', '0.95rem', '0.9rem', '0.85rem'];
      blocks.push(
        <div key={key++} style={{
          fontFamily: 'Georgia, serif', fontWeight: 700,
          fontSize: sizes[Math.min(lvl - 1, 5)], color: '#722',
          borderBottom: '1px solid #d4c89c', paddingBottom: 2,
          margin: '0.6rem 0 0.4rem',
        }}>
          {renderInline(hMatch[2])}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote — group consecutive `> ` lines, strip the prefix, and recursively render the
    // inner content (which often contains its own headings / paragraphs / lists). Render with a
    // tan left border so it visually reads as a sidebar / aside.
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <div key={key++} style={{ borderLeft: '3px solid #c8b88c', background: '#f7efd9', padding: '0.4rem 0.7rem', margin: '0.4rem 0', borderRadius: 3 }}>
          <MD text={quoted.join('\n')} />
        </div>
      );
      continue;
    }

    // Markdown table — current line and next form a header + separator.
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1])) {
      const header = parseMdRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(parseMdRow(lines[j]));
        j++;
      }
      blocks.push(
        <div key={key++} style={{ overflowX: 'auto', margin: '0.4rem 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem', width: '100%' }}>
            <thead>
              <tr style={{ background: '#efe7d2' }}>
                {header.map((h, hi) => (
                  <th key={hi} style={{ padding: '0.3rem 0.5rem', textAlign: 'left', borderBottom: '2px solid #c8b88c', color: '#553', fontFamily: 'Georgia, serif' }}>
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? '#fdf6e3' : '#fff8e0' }}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{ padding: '0.25rem 0.5rem', borderBottom: '1px solid #ece5c8', color: '#222' }}>
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j;
      continue;
    }

    // Bullet list — group consecutive lines that look like list items.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} style={{ margin: '0.25rem 0 0.4rem', paddingLeft: '1.25rem', fontSize: '0.86rem', lineHeight: 1.45 }}>
          {items.map((it, ii) => <li key={ii} style={{ marginBottom: 2 }}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    }

    // Paragraph — group consecutive non-empty, non-special lines.
    const para: string[] = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,6})\s+/.test(lines[i].trim())
      && !lines[i].trim().startsWith('|')
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*>/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} style={{ margin: '0 0 0.45rem', fontSize: '0.86rem', color: '#222', lineHeight: 1.5 }}>
        {para.map((l, li) => (
          <span key={li}>{renderInline(l)}{li < para.length - 1 && <br />}</span>
        ))}
      </p>
    );
  }

  return <div>{blocks}</div>;
}

function parseMdRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

// Inline pass: bold (`**...**`), italic (`_..._` or `*...*`), bold-italic (`**_..._**` / `***...***`).
// We tokenise by walking the string and tracking nested style state.
function renderInline(s: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < s.length) {
    // Escaped char: `\*` renders the literal `*`. Pop the backslash and emit the next char raw.
    if (s[i] === '\\' && i + 1 < s.length) {
      out.push(s[i + 1]);
      i += 2; continue;
    }
    // **_text_** — bold italic
    if (s.startsWith('**_', i)) {
      const end = s.indexOf('_**', i + 3);
      if (end !== -1) {
        out.push(<strong key={key++} style={{ fontStyle: 'italic' }}>{s.slice(i + 3, end)}</strong>);
        i = end + 3; continue;
      }
    }
    // ***text*** — bold italic
    if (s.startsWith('***', i)) {
      const end = s.indexOf('***', i + 3);
      if (end !== -1) {
        out.push(<strong key={key++} style={{ fontStyle: 'italic' }}>{s.slice(i + 3, end)}</strong>);
        i = end + 3; continue;
      }
    }
    // **text** — bold
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end !== -1) {
        out.push(<strong key={key++}>{s.slice(i + 2, end)}</strong>);
        i = end + 2; continue;
      }
    }
    // *text* — italic (single-asterisk variant). Only when not part of `**` and the next char is
    // not whitespace (otherwise loose * runs in lists / lone * chars get matched).
    if (s[i] === '*' && s[i + 1] !== '*' && s[i + 1] !== ' ' && s[i + 1] !== undefined) {
      // Find a matching closing *, skipping any **'s.
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '*' && s[j + 1] !== '*' && s[j - 1] !== '*') break;
        j++;
      }
      if (j < s.length) {
        out.push(<em key={key++}>{s.slice(i + 1, j)}</em>);
        i = j + 1; continue;
      }
    }
    // _text_ — italic (only if surrounded by non-word boundaries to avoid eating snake_case)
    if (s[i] === '_' && /\W|^/.test(s[i - 1] ?? '\n')) {
      const end = s.indexOf('_', i + 1);
      if (end !== -1 && /\W|$/.test(s[end + 1] ?? '\n')) {
        out.push(<em key={key++}>{s.slice(i + 1, end)}</em>);
        i = end + 1; continue;
      }
    }
    // Plain char — accumulate runs until we hit a marker.
    let j = i;
    while (j < s.length
      && s[j] !== '\\'
      && !s.startsWith('**', j)
      && !(s[j] === '_' && /\W|^/.test(s[j - 1] ?? '\n'))
      && !(s[j] === '*' && s[j + 1] !== '*' && s[j + 1] !== ' ' && s[j + 1] !== undefined && j > i)
    ) j++;
    if (j === i) j = i + 1; // Always make progress to avoid infinite loop on lone markers.
    out.push(s.slice(i, j));
    i = j;
  }
  return <>{out}</>;
}

// ───────────────────── helpers ─────────────────────
// Heuristic: does this string look like a 5e "trait" — a body whose markdown opens with a
// bold-italic name (`**_Age._**`) or a level-1/2 heading (`## Age`)? Used to pull "trait-style"
// content out of misc-named fields (age, alignment, languages, vision, ...) so we can render
// them under a single "Traits" section without producing a duplicate label.
function looksLikeTraitBody(s: string): boolean {
  return /^\s*\*\*_[^_]+_\*\*/.test(s) || /^\s*\*\*[^*]+\*\*/.test(s) || /^\s*#{1,6}\s+/.test(s);
}

function abilityMod(score: number): number { return Math.floor((score - 10) / 2); }
function formatModifier(n: number): string { return `${n >= 0 ? '+' : ''}${n}`; }
function capitalize(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatSpeed(speed: Record<string, number> | string | undefined): string {
  if (!speed) return '—';
  if (typeof speed === 'string') return speed;
  return Object.entries(speed).map(([k, v]) => k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`).join(', ');
}

// XP-by-CR table (5e DMG p.275). String CR as input since that's how Open5e stores it.
const XP_BY_CR: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};
function xpFor(cr: string): number | null { return XP_BY_CR[cr] ?? null; }
