// Per-class feature progression (5e 2014 PHB). Headlines only — one short line each.
// Used for display in the wizard / sheet; nothing here is auto-applied during play.
//
// ASI levels (4, 8, 12, 16, 19) and Extra Attack at L5 are intentionally repeated here
// because the wizard / level-up dialog displays this table directly.

export interface ClassFeature {
  level: number;
  name: string;
  desc: string;
}

export const CLASS_FEATURES: Record<string, ClassFeature[]> = {
  barbarian: [
    { level: 1, name: 'Rage', desc: 'Bonus action: gain bonus damage, advantage on STR checks/saves, resistance to bludgeoning/piercing/slashing. 2 uses (3 at L3, 4 at L6, 5 at L12, 6 at L17, unlimited at L20).' },
    { level: 1, name: 'Unarmored Defense', desc: 'AC = 10 + DEX + CON when unarmored.' },
    { level: 2, name: 'Reckless Attack', desc: 'Attack with advantage; attacks against you have advantage.' },
    { level: 2, name: 'Danger Sense', desc: 'Advantage on DEX saves vs effects you can see (spells, traps).' },
    { level: 3, name: 'Primal Path', desc: 'Choose your subclass (Berserker, Totem Warrior, etc.).' },
    { level: 5, name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
    { level: 5, name: 'Fast Movement', desc: '+10 ft walking speed when not in heavy armor.' },
    { level: 7, name: 'Feral Instinct', desc: 'Advantage on initiative; can act on a surprise round if you rage.' },
    { level: 9, name: 'Brutal Critical', desc: '+1 weapon die on crit (+2 at L13, +3 at L17).' },
    { level: 11, name: 'Relentless Rage', desc: 'When dropped to 0 HP while raging, DC 10 CON save (+5 each subsequent attempt) to drop to 1 HP instead.' },
    { level: 15, name: 'Persistent Rage', desc: 'Rage only ends if you choose or fall unconscious.' },
    { level: 18, name: 'Indomitable Might', desc: 'Treat STR check rolls as your STR score if lower.' },
    { level: 20, name: 'Primal Champion', desc: '+4 to STR and CON max (cap raises to 24).' },
  ],
  bard: [
    { level: 1, name: 'Spellcasting', desc: 'CHA-based, prepared from full bard list.' },
    { level: 1, name: 'Bardic Inspiration', desc: 'Bonus action: give a creature a d6 inspiration die. CHA mod uses/long rest. Die scales d8 (L5), d10 (L10), d12 (L15).' },
    { level: 2, name: 'Jack of All Trades', desc: 'Add half proficiency to non-proficient ability checks.' },
    { level: 2, name: 'Song of Rest', desc: 'Add 1d6 (scales) to short rest hit-die healing.' },
    { level: 3, name: 'Bard College', desc: 'Choose your subclass (Lore, Valor).' },
    { level: 3, name: 'Expertise', desc: 'Pick 2 skills to double proficiency. +2 more at L10.' },
    { level: 5, name: 'Font of Inspiration', desc: 'Bardic Inspiration recharges on short or long rest.' },
    { level: 6, name: 'Countercharm', desc: 'Action: friends within 30 ft get adv on saves vs charmed/frightened until your next turn.' },
    { level: 10, name: 'Magical Secrets', desc: 'Pick 2 spells from any class list. +2 more at L14, +2 at L18.' },
    { level: 20, name: 'Superior Inspiration', desc: 'Regain 1 Bardic Inspiration on initiative if at 0.' },
  ],
  cleric: [
    { level: 1, name: 'Spellcasting', desc: 'WIS-based, prepares spells from full cleric list daily.' },
    { level: 1, name: 'Divine Domain', desc: 'Choose your subclass (Life, War, Trickery, etc.).' },
    { level: 2, name: 'Channel Divinity (Turn Undead)', desc: 'Action: undead within 30 ft must save vs WIS DC or be turned for 1 minute. 1 use/short rest (2 at L6, 3 at L18).' },
    { level: 5, name: 'Destroy Undead', desc: 'Turned undead of low CR are destroyed instead. CR cap raises with level.' },
    { level: 10, name: 'Divine Intervention', desc: 'Action: roll d100 ≤ cleric level for divine aid. Once/long rest, success on L20.' },
    { level: 14, name: 'Divine Strike or Potent Spellcasting', desc: 'Subclass-determined upgrade.' },
  ],
  druid: [
    { level: 1, name: 'Druidic', desc: 'Speak the secret druidic language.' },
    { level: 1, name: 'Spellcasting', desc: 'WIS-based, prepares from full druid list daily.' },
    { level: 2, name: 'Wild Shape', desc: 'Action: transform into a beast (CR 1/4, no flying/swimming) for half druid level hours. 2 uses/short rest. Restrictions ease at L4 and L8.' },
    { level: 2, name: 'Druid Circle', desc: 'Choose your subclass (Land, Moon).' },
    { level: 18, name: 'Timeless Body', desc: 'Age slower; immune to magical aging.' },
    { level: 18, name: 'Beast Spells', desc: 'Cast spells while in Wild Shape (verbal/somatic only).' },
    { level: 20, name: 'Archdruid', desc: 'Unlimited Wild Shape; ignore material components for druid spells unless costly.' },
  ],
  fighter: [
    { level: 1, name: 'Fighting Style', desc: 'Pick a fighting style (Defense, Dueling, GWF, Protection, etc.).' },
    { level: 1, name: 'Second Wind', desc: 'Bonus action: regain 1d10 + fighter level HP. Once per short rest.' },
    { level: 2, name: 'Action Surge', desc: 'Take an additional action on your turn. 1/short rest (2 at L17).' },
    { level: 3, name: 'Martial Archetype', desc: 'Choose your subclass (Champion, Battle Master, Eldritch Knight).' },
    { level: 5, name: 'Extra Attack', desc: 'Attack twice when you take the Attack action. Three at L11, four at L20.' },
    { level: 9, name: 'Indomitable', desc: 'Reroll a failed save. 1 use/long rest (2 at L13, 3 at L17).' },
  ],
  monk: [
    { level: 1, name: 'Unarmored Defense', desc: 'AC = 10 + DEX + WIS.' },
    { level: 1, name: 'Martial Arts', desc: 'Use DEX for unarmed/monk weapons; bonus unarmed strike after Attack action; martial arts die scales d4→d10.' },
    { level: 2, name: 'Ki', desc: 'Pool of points = monk level. Spend on Flurry of Blows, Patient Defense, Step of the Wind. Refresh on short rest.' },
    { level: 2, name: 'Unarmored Movement', desc: '+10 ft speed unarmored. Scales to +30 at L18.' },
    { level: 3, name: 'Monastic Tradition', desc: 'Choose your subclass (Open Hand, Shadow, Four Elements).' },
    { level: 3, name: 'Deflect Missiles', desc: 'Reaction: reduce ranged weapon damage by 1d10 + DEX + monk level. Catch on 0; throw it back for 1 ki.' },
    { level: 4, name: 'Slow Fall', desc: 'Reaction: reduce falling damage by 5 × monk level.' },
    { level: 5, name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
    { level: 5, name: 'Stunning Strike', desc: 'Spend 1 ki on a melee hit; target makes CON save or is stunned until end of your next turn.' },
    { level: 6, name: 'Ki-Empowered Strikes', desc: 'Unarmed strikes count as magical.' },
    { level: 7, name: 'Evasion', desc: 'Half damage on failed DEX saves; none on success.' },
    { level: 7, name: 'Stillness of Mind', desc: 'Action: end one charmed or frightened effect on yourself.' },
    { level: 10, name: 'Purity of Body', desc: 'Immune to disease and poison.' },
    { level: 14, name: 'Diamond Soul', desc: 'Proficiency in all saves; spend 1 ki to reroll a failed save.' },
    { level: 15, name: 'Timeless Body', desc: 'No aging; need no food or water.' },
    { level: 18, name: 'Empty Body', desc: '4 ki: invisible + resistance to all damage except force for 1 minute. 8 ki: cast Astral Projection.' },
    { level: 20, name: 'Perfect Self', desc: 'Regain 4 ki on initiative if you have none.' },
  ],
  paladin: [
    { level: 1, name: 'Divine Sense', desc: 'Action: detect celestials/fiends/undead within 60 ft. CHA mod + 1 uses/long rest.' },
    { level: 1, name: 'Lay on Hands', desc: 'Pool of paladin level × 5 HP to heal by touch (or cure disease/poison for 5 from pool).' },
    { level: 2, name: 'Fighting Style', desc: 'Pick a fighting style.' },
    { level: 2, name: 'Spellcasting', desc: 'CHA-based, prepares from paladin list. Half-caster; first slot at L2.' },
    { level: 2, name: 'Divine Smite', desc: 'When you hit with a melee weapon, expend a spell slot to add 2d8 radiant damage (+1d8 per slot level above 1, max 5d8).' },
    { level: 3, name: 'Divine Health', desc: 'Immune to disease.' },
    { level: 3, name: 'Sacred Oath', desc: 'Choose your subclass (Devotion, Ancients, Vengeance).' },
    { level: 5, name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
    { level: 6, name: 'Aura of Protection', desc: 'Within 10 ft (30 ft at L18), allies and you add CHA mod to saves.' },
    { level: 10, name: 'Aura of Courage', desc: 'Within 10 ft (30 ft at L18), allies and you cannot be frightened.' },
    { level: 11, name: 'Improved Divine Smite', desc: '+1d8 radiant damage on every melee hit.' },
    { level: 14, name: 'Cleansing Touch', desc: 'Action: end one spell on a touched creature (incl. self). CHA mod uses/long rest.' },
  ],
  ranger: [
    { level: 1, name: 'Favored Enemy', desc: 'Pick a creature type; advantage on Survival to track them and on INT checks to recall info.' },
    { level: 1, name: 'Natural Explorer', desc: 'Pick a favored terrain; doubled INT/WIS profs related to it, plus travel/foraging perks.' },
    { level: 2, name: 'Fighting Style', desc: 'Pick a fighting style (Archery, Defense, Dueling, Two-Weapon).' },
    { level: 2, name: 'Spellcasting', desc: 'WIS-based, half-caster. Spells known list.' },
    { level: 3, name: 'Ranger Archetype', desc: 'Choose your subclass (Hunter, Beast Master).' },
    { level: 3, name: 'Primeval Awareness', desc: 'Spend a slot to sense favored creatures within 1 mile (6 in favored terrain).' },
    { level: 5, name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
    { level: 8, name: 'Land\'s Stride', desc: 'Move through nonmagical difficult terrain at full speed; advantage on saves vs plants that impede movement.' },
    { level: 10, name: 'Hide in Plain Sight', desc: 'Spend 1 minute to camouflage; +10 to Stealth checks while you stay still.' },
    { level: 14, name: 'Vanish', desc: 'Hide as a bonus action. Can\'t be magically tracked unless willing.' },
    { level: 18, name: 'Feral Senses', desc: 'No disadvantage attacking unseen creatures within 30 ft. Aware of invisible creatures.' },
    { level: 20, name: 'Foe Slayer', desc: 'Once per turn add WIS mod to attack or damage roll vs favored enemy.' },
  ],
  rogue: [
    { level: 1, name: 'Expertise', desc: 'Pick 2 skill proficiencies (or one + thieves\' tools) to double proficiency. +2 more at L6.' },
    { level: 1, name: 'Sneak Attack', desc: 'Once per turn, +Nd6 damage on a hit with finesse/ranged weapon if you have advantage or an ally is adjacent. Scales: 1d6 → 10d6.' },
    { level: 1, name: 'Thieves\' Cant', desc: 'Speak the secret rogue tongue.' },
    { level: 2, name: 'Cunning Action', desc: 'Bonus action: Dash, Disengage, or Hide.' },
    { level: 3, name: 'Roguish Archetype', desc: 'Choose your subclass (Thief, Assassin, Arcane Trickster).' },
    { level: 5, name: 'Uncanny Dodge', desc: 'Reaction: halve the damage of an attack you can see.' },
    { level: 7, name: 'Evasion', desc: 'Half damage on failed DEX saves; none on success.' },
    { level: 11, name: 'Reliable Talent', desc: 'Treat any d20 roll of 9 or lower as a 10 for proficient ability checks.' },
    { level: 14, name: 'Blindsense', desc: 'Aware of hidden/invisible creatures within 10 ft.' },
    { level: 15, name: 'Slippery Mind', desc: 'Proficiency in WIS saves.' },
    { level: 18, name: 'Elusive', desc: 'No attack roll has advantage against you while you\'re not incapacitated.' },
    { level: 20, name: 'Stroke of Luck', desc: 'Turn a missed attack into a hit, or a failed ability check into a 20. 1/short rest.' },
  ],
  sorcerer: [
    { level: 1, name: 'Spellcasting', desc: 'CHA-based, spells known list.' },
    { level: 1, name: 'Sorcerous Origin', desc: 'Choose your subclass (Draconic, Wild Magic, etc.) at level 1.' },
    { level: 2, name: 'Font of Magic', desc: 'Sorcery points = sorcerer level. Convert slots ↔ points.' },
    { level: 3, name: 'Metamagic', desc: 'Pick 2 metamagic options (Twin, Quicken, Subtle, etc.). +1 at L10, +1 at L17.' },
    { level: 20, name: 'Sorcerous Restoration', desc: 'Regain 4 sorcery points on a short rest (once per long rest).' },
  ],
  warlock: [
    { level: 1, name: 'Otherworldly Patron', desc: 'Choose your subclass (Fiend, Archfey, Great Old One) at level 1.' },
    { level: 1, name: 'Pact Magic', desc: 'CHA-based. Few slots, all of the same level, recharge on short rest.' },
    { level: 2, name: 'Eldritch Invocations', desc: 'Pick 2 invocations. +1 at L5, L7, L9, L12, L15, L18.' },
    { level: 3, name: 'Pact Boon', desc: 'Pact of the Blade / Chain / Tome.' },
    { level: 11, name: 'Mystic Arcanum (6th)', desc: '6th-level spell of choice; cast once/long rest, no slot needed.' },
    { level: 13, name: 'Mystic Arcanum (7th)', desc: '7th-level spell once/long rest.' },
    { level: 15, name: 'Mystic Arcanum (8th)', desc: '8th-level spell once/long rest.' },
    { level: 17, name: 'Mystic Arcanum (9th)', desc: '9th-level spell once/long rest.' },
    { level: 20, name: 'Eldritch Master', desc: 'Spend 1 minute to recover all spell slots once/long rest.' },
  ],
  wizard: [
    { level: 1, name: 'Spellcasting', desc: 'INT-based, spellbook (start with 6 spells; learn 2 per level + scribe).' },
    { level: 1, name: 'Arcane Recovery', desc: 'On short rest, regain spell slots (level/2 rounded up worth) once per long rest.' },
    { level: 2, name: 'Arcane Tradition', desc: 'Choose your subclass (school of magic).' },
    { level: 18, name: 'Spell Mastery', desc: 'Pick a 1st- and 2nd-level spell to cast at will.' },
    { level: 20, name: 'Signature Spells', desc: 'Pick two 3rd-level spells; cast each once for free between rests.' },
  ],
};

/** Returns features at every level UP TO classLevel (inclusive). */
export function featuresThroughLevel(classSlug: string, classLevel: number): ClassFeature[] {
  return (CLASS_FEATURES[classSlug] ?? []).filter((f) => f.level <= classLevel);
}

/** Returns features gained AT a specific class level. */
export function featuresAtLevel(classSlug: string, classLevel: number): ClassFeature[] {
  return (CLASS_FEATURES[classSlug] ?? []).filter((f) => f.level === classLevel);
}
