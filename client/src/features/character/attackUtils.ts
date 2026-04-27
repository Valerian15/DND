const DAMAGE_TYPES = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';

export const SAVE_ABBREV: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export interface SpellAttackInfo {
  mode: 'spell_attack' | 'save' | 'damage_only' | null;
  saveAbility: string | null;
  damageDice: string | null;
  damageType: string | null;
}

export function parseSpellForAttack(desc: string): SpellAttackInfo {
  const dmgMatch = desc.match(new RegExp(`(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\s+(${DAMAGE_TYPES})\\s+damage`, 'i'));
  if (!dmgMatch) return { mode: null, saveAbility: null, damageDice: null, damageType: null };

  let mode: 'spell_attack' | 'save' | 'damage_only' = 'damage_only';
  let saveAbility: string | null = null;

  if (/(ranged|melee) spell attack/i.test(desc)) {
    mode = 'spell_attack';
  } else {
    const saveMatch = desc.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw/i);
    if (saveMatch) {
      mode = 'save';
      saveAbility = SAVE_ABBREV[saveMatch[1].toLowerCase()] ?? saveMatch[1].slice(0, 3).toUpperCase();
    }
  }

  return {
    mode,
    saveAbility,
    damageDice: dmgMatch[1].replace(/\s+/g, ''),
    damageType: dmgMatch[2].toLowerCase(),
  };
}

export function scaleCantripDice(dice: string, level: number): string {
  const multiplier = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  if (multiplier === 1) return dice;
  return dice.replace(/^(\d+)(d\d+)/, (_, n, die) => `${Number(n) * multiplier}${die}`);
}
