// Hand-authored entries for non-SRD official 5e content the user owns. Each entry tags
// `source: 'phb-2014'` so the read-only SRD lock at `'srd-2014'` doesn't apply to them.
//
// Run via `pnpm seed:expanded`. Idempotent — INSERT OR REPLACE.

import { db, initSchema } from './index.js';

interface BackgroundEntry {
  slug: string;
  source: string;
  data: {
    name: string;
    slug: string;
    desc: string;
    skill_proficiencies: string;
    tool_proficiencies: string;
    languages: string;
    equipment: string;
    feature: string;
    feature_desc: string;
  };
}

interface FeatEntry {
  slug: string;
  source: string;
  data: {
    name: string;
    slug: string;
    prerequisite: string;
    desc: string;
  };
}

interface SubclassEntry {
  slug: string;
  class_slug: string;
  source: string;
  data: {
    name: string;
    slug: string;
    desc: string;
  };
}

interface RaceEntry {
  slug: string;
  source: string;
  data: {
    name: string;
    slug: string;
    desc: string;
    asi_desc: string;
    asi: Array<{ attributes: string[]; value: number }>;
    age?: string;
    alignment?: string;
    size_raw?: string;
    speed?: { walk: number };
    speed_desc?: string;
    languages?: string;
    vision?: string;
    traits?: string;
    subraces?: unknown[];
  };
}

// ─────────────── Backgrounds ───────────────
const BACKGROUNDS: BackgroundEntry[] = [
  {
    slug: 'charlatan',
    source: 'phb-2014',
    data: {
      name: 'Charlatan',
      slug: 'charlatan',
      desc: 'You have always had a way with people. You know what makes them tick, you can tease out their hearts\' desires after a few minutes of conversation, and with a few leading questions you can read them like they were children\'s books. It\'s a useful talent, and one that you\'re perfectly willing to use for your advantage.',
      skill_proficiencies: 'Deception, Sleight of Hand',
      tool_proficiencies: 'Disguise kit, forgery kit',
      languages: '',
      equipment: 'A set of fine clothes, a disguise kit, tools of the con of your choice, and a belt pouch containing 15 gp',
      feature: 'False Identity',
      feature_desc: '**_False Identity._** You have created a second identity that includes documentation, established acquaintances, and disguises that allow you to assume that persona. Additionally, you can forge documents including official papers and personal letters, as long as you have seen an example of the kind of document or the handwriting you are trying to copy.',
    },
  },
  {
    slug: 'criminal',
    source: 'phb-2014',
    data: {
      name: 'Criminal',
      slug: 'criminal',
      desc: 'You are an experienced criminal with a history of breaking the law. You have spent a lot of time among other criminals and still have contacts within the criminal underworld. You\'re far closer than most people to the world of murder, theft, and violence that pervades the underbelly of civilization, and you have survived up to this point by flouting the rules and regulations of society.',
      skill_proficiencies: 'Deception, Stealth',
      tool_proficiencies: 'One type of gaming set, thieves\' tools',
      languages: '',
      equipment: 'A crowbar, a set of dark common clothes including a hood, and a belt pouch containing 15 gp',
      feature: 'Criminal Contact',
      feature_desc: '**_Criminal Contact._** You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals. You know how to get messages to and from your contact, even over great distances; specifically, you know the local messengers, corrupt caravan masters, and seedy sailors who can deliver messages for you.',
    },
  },
  {
    slug: 'entertainer',
    source: 'phb-2014',
    data: {
      name: 'Entertainer',
      slug: 'entertainer',
      desc: 'You thrive in front of an audience. You know how to entrance them, entertain them, and even inspire them. Your poetics can stir the hearts of those who hear you, awakening grief or joy, laughter or anger. Your music raises their spirits or captures their sorrow. Your dance steps captivate, your humor cuts to the quick. Whatever techniques you use, your art is your life.',
      skill_proficiencies: 'Acrobatics, Performance',
      tool_proficiencies: 'Disguise kit, one type of musical instrument',
      languages: '',
      equipment: 'A musical instrument (one of your choice), the favor of an admirer (love letter, lock of hair, or trinket), a costume, and a belt pouch containing 15 gp',
      feature: 'By Popular Demand',
      feature_desc: '**_By Popular Demand._** You can always find a place to perform, usually in an inn or tavern but possibly with a circus, at a theater, or even in a noble\'s court. At such a place, you receive free lodging and food of a modest or comfortable standard (depending on the quality of the establishment), as long as you perform each night. In addition, your performance makes you something of a local figure.',
    },
  },
  {
    slug: 'folk-hero',
    source: 'phb-2014',
    data: {
      name: 'Folk Hero',
      slug: 'folk-hero',
      desc: 'You come from a humble social rank, but you are destined for so much more. Already the people of your home village regard you as their champion, and your destiny calls you to stand against the tyrants and monsters that threaten the common folk everywhere.',
      skill_proficiencies: 'Animal Handling, Survival',
      tool_proficiencies: 'One type of artisan\'s tools, vehicles (land)',
      languages: '',
      equipment: 'A set of artisan\'s tools (one of your choice), a shovel, an iron pot, a set of common clothes, and a belt pouch containing 10 gp',
      feature: 'Rustic Hospitality',
      feature_desc: '**_Rustic Hospitality._** Since you come from the ranks of the common folk, you fit in among them with ease. You can find a place to hide, rest, or recuperate among other commoners, unless you have shown yourself to be a danger to them. They will shield you from the law or anyone else searching for you, though they will not risk their lives for you.',
    },
  },
  {
    slug: 'guild-artisan',
    source: 'phb-2014',
    data: {
      name: 'Guild Artisan',
      slug: 'guild-artisan',
      desc: 'You are a member of an artisan\'s guild, skilled in a particular field and closely associated with other artisans. You are a well-established part of the mercantile world, freed by talent and wealth from the constraints of a feudal social order. You learned your skills as an apprentice to a master artisan, under the sponsorship of your guild, until you became a master in your own right.',
      skill_proficiencies: 'Insight, Persuasion',
      tool_proficiencies: 'One type of artisan\'s tools',
      languages: 'One of your choice',
      equipment: 'A set of artisan\'s tools (one of your choice), a letter of introduction from your guild, a set of traveler\'s clothes, and a belt pouch containing 15 gp',
      feature: 'Guild Membership',
      feature_desc: '**_Guild Membership._** As an established and respected member of a guild, you can rely on certain benefits that membership provides. Your fellow guild members will provide you with lodging and food if necessary, and pay for your funeral if needed. In some cities and towns, a guildhall offers a central place to meet other members of your profession. Guilds often wield tremendous political power. As long as you remain in good standing with your guild, it can provide you with access to powerful political figures.',
    },
  },
  {
    slug: 'hermit',
    source: 'phb-2014',
    data: {
      name: 'Hermit',
      slug: 'hermit',
      desc: 'You lived in seclusion — either in a sheltered community such as a monastery, or entirely alone — for a formative part of your life. In your time apart from the clamor of society, you found quiet, solitude, and perhaps some of the answers you were looking for.',
      skill_proficiencies: 'Medicine, Religion',
      tool_proficiencies: 'Herbalism kit',
      languages: 'One of your choice',
      equipment: 'A scroll case stuffed full of notes from your studies or prayers, a winter blanket, a set of common clothes, an herbalism kit, and 5 gp',
      feature: 'Discovery',
      feature_desc: '**_Discovery._** The quiet seclusion of your extended hermitage gave you access to a unique and powerful discovery. The exact nature of this revelation depends on the nature of your seclusion. It might be a great truth about the cosmos, the deities, the powerful beings of the outer planes, or the forces of nature. It could be a site that no one else has ever seen. You might have uncovered a fact that has long been forgotten, or unearthed some relic of the past that could rewrite history.',
    },
  },
  {
    slug: 'noble',
    source: 'phb-2014',
    data: {
      name: 'Noble',
      slug: 'noble',
      desc: 'You understand wealth, power, and privilege. You carry a noble title, and your family owns land, collects taxes, and wields significant political influence. You might be a pampered aristocrat unfamiliar with work or discomfort, a former merchant just elevated to the nobility, or a disinherited scoundrel with a disproportionate sense of entitlement.',
      skill_proficiencies: 'History, Persuasion',
      tool_proficiencies: 'One type of gaming set',
      languages: 'One of your choice',
      equipment: 'A set of fine clothes, a signet ring, a scroll of pedigree, and a purse containing 25 gp',
      feature: 'Position of Privilege',
      feature_desc: '**_Position of Privilege._** Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other people of high birth treat you as a member of the same social sphere. You can secure an audience with a local noble if you need to.',
    },
  },
  {
    slug: 'outlander',
    source: 'phb-2014',
    data: {
      name: 'Outlander',
      slug: 'outlander',
      desc: 'You grew up in the wilds, far from civilization and the comforts of town and technology. You\'ve witnessed the migration of herds larger than forests, survived weather more extreme than any city-dweller could comprehend, and enjoyed the solitude of being the only thinking creature for miles in any direction.',
      skill_proficiencies: 'Athletics, Survival',
      tool_proficiencies: 'One type of musical instrument',
      languages: 'One of your choice',
      equipment: 'A staff, a hunting trap, a trophy from an animal you killed, a set of traveler\'s clothes, and a belt pouch containing 10 gp',
      feature: 'Wanderer',
      feature_desc: '**_Wanderer._** You have an excellent memory for maps and geography, and you can always recall the general layout of terrain, settlements, and other features around you. In addition, you can find food and fresh water for yourself and up to five other people each day, provided that the land offers berries, small game, water, and so forth.',
    },
  },
  {
    slug: 'sage',
    source: 'phb-2014',
    data: {
      name: 'Sage',
      slug: 'sage',
      desc: 'You spent years learning the lore of the multiverse. You scoured manuscripts, studied scrolls, and listened to the greatest experts on the subjects that interest you. Your efforts have made you a master in your fields of study.',
      skill_proficiencies: 'Arcana, History',
      tool_proficiencies: '',
      languages: 'Two of your choice',
      equipment: 'A bottle of black ink, a quill, a small knife, a letter from a dead colleague posing a question you have not yet been able to answer, a set of common clothes, and a belt pouch containing 10 gp',
      feature: 'Researcher',
      feature_desc: '**_Researcher._** When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it. Usually, this information comes from a library, scriptorium, university, or a sage or other learned person or creature. Your DM might rule that the knowledge you seek is secreted away in an almost inaccessible place, or that it simply cannot be found.',
    },
  },
  {
    slug: 'sailor',
    source: 'phb-2014',
    data: {
      name: 'Sailor',
      slug: 'sailor',
      desc: 'You sailed on a seagoing vessel for years. In that time, you faced down mighty storms, monsters of the deep, and those who wanted to sink your craft to the bottomless depths. Your first love is the distant line of the horizon, but the time has come to try your hand at something new.',
      skill_proficiencies: 'Athletics, Perception',
      tool_proficiencies: 'Navigator\'s tools, vehicles (water)',
      languages: '',
      equipment: 'A belaying pin (club), 50 feet of silk rope, a lucky charm such as a rabbit foot or a small stone with a hole in the center, a set of common clothes, and a belt pouch containing 10 gp',
      feature: 'Ship\'s Passage',
      feature_desc: '**_Ship\'s Passage._** When you need to, you can secure free passage on a sailing ship for yourself and your adventuring companions. You might sail on the ship you served on, or another ship you have good relations with (perhaps one captained by a former crewmate). Because you\'re calling in a favor, you can\'t be certain of a schedule or route that will meet your every need. Your DM will determine how long it takes to get where you need to go.',
    },
  },
  {
    slug: 'soldier',
    source: 'phb-2014',
    data: {
      name: 'Soldier',
      slug: 'soldier',
      desc: 'War has been your life for as long as you care to remember. You trained as a youth, studied the use of weapons and armor, learned basic survival techniques, including how to stay alive on the battlefield. You might have been part of a national army or a mercenary company, or perhaps a member of a local militia who rose to prominence during a recent war.',
      skill_proficiencies: 'Athletics, Intimidation',
      tool_proficiencies: 'One type of gaming set, vehicles (land)',
      languages: '',
      equipment: 'An insignia of rank, a trophy taken from a fallen enemy (a dagger, broken blade, or piece of a banner), a set of bone dice or deck of cards, a set of common clothes, and a belt pouch containing 10 gp',
      feature: 'Military Rank',
      feature_desc: '**_Military Rank._** You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank. You can invoke your rank to exert influence over other soldiers and requisition simple equipment or horses for temporary use. You can also usually gain access to friendly military encampments and fortresses where your rank is recognized.',
    },
  },
  {
    slug: 'urchin',
    source: 'phb-2014',
    data: {
      name: 'Urchin',
      slug: 'urchin',
      desc: 'You grew up on the streets alone, orphaned, and poor. You had no one to watch over you or to provide for you, so you learned to provide for yourself. You fought fiercely over food and kept a constant watch out for other desperate souls who might steal from you. You slept on rooftops and in alleyways, exposed to the elements, and endured sickness without the advantage of medicine or a place to recuperate.',
      skill_proficiencies: 'Sleight of Hand, Stealth',
      tool_proficiencies: 'Disguise kit, thieves\' tools',
      languages: '',
      equipment: 'A small knife, a map of the city you grew up in, a pet mouse, a token to remember your parents by, a set of common clothes, and a belt pouch containing 10 gp',
      feature: 'City Secrets',
      feature_desc: '**_City Secrets._** You know the secret patterns and flow to cities and can find passages through the urban sprawl that others would miss. When you are not in combat, you (and companions you lead) can travel between any two locations in the city twice as fast as your speed would normally allow.',
    },
  },
];

// ─────────────── Feats ───────────────
const FEATS: FeatEntry[] = [
  {
    slug: 'alert',
    source: 'phb-2014',
    data: {
      name: 'Alert',
      slug: 'alert',
      prerequisite: '',
      desc: 'Always on the lookout for danger, you gain the following benefits:\n\n- You gain a +5 bonus to initiative.\n- You can\'t be surprised while you are conscious.\n- Other creatures don\'t gain advantage on attack rolls against you as a result of being unseen by you.',
    },
  },
  {
    slug: 'crossbow-expert',
    source: 'phb-2014',
    data: {
      name: 'Crossbow Expert',
      slug: 'crossbow-expert',
      prerequisite: '',
      desc: 'Thanks to extensive practice with the crossbow, you gain the following benefits:\n\n- You ignore the loading quality of crossbows with which you are proficient.\n- Being within 5 feet of a hostile creature doesn\'t impose disadvantage on your ranged attack rolls.\n- When you use the Attack action and attack with a one-handed weapon, you can use a bonus action to attack with a hand crossbow you are holding.',
    },
  },
  {
    slug: 'great-weapon-master',
    source: 'phb-2014',
    data: {
      name: 'Great Weapon Master',
      slug: 'great-weapon-master',
      prerequisite: '',
      desc: 'You\'ve learned to put the weight of a weapon to your advantage, letting its momentum empower your strikes. You gain the following benefits:\n\n- On your turn, when you score a critical hit with a melee weapon or reduce a creature to 0 hit points with one, you can make one melee weapon attack as a bonus action.\n- Before you make a melee attack with a heavy weapon that you are proficient with, you can choose to take a -5 penalty to the attack roll. If the attack hits, you add +10 to the attack\'s damage.',
    },
  },
  {
    slug: 'lucky',
    source: 'phb-2014',
    data: {
      name: 'Lucky',
      slug: 'lucky',
      prerequisite: '',
      desc: 'You have inexplicable luck that seems to kick in at just the right moment.\n\nYou have 3 luck points. Whenever you make an attack roll, an ability check, or a saving throw, you can spend one luck point to roll an additional d20. You can choose to spend one of your luck points after you roll the die, but before the outcome is determined. You choose which of the d20s is used for the attack roll, ability check, or saving throw.\n\nYou can also spend one luck point when an attack roll is made against you. Roll a d20, and then choose whether the attack uses the attacker\'s roll or yours. If more than one creature spends a luck point to influence the outcome of a roll, the points cancel each other out; no additional dice are rolled.\n\nYou regain your expended luck points when you finish a long rest.',
    },
  },
  {
    slug: 'magic-initiate',
    source: 'phb-2014',
    data: {
      name: 'Magic Initiate',
      slug: 'magic-initiate',
      prerequisite: '',
      desc: 'Choose a class: bard, cleric, druid, sorcerer, warlock, or wizard. You learn two cantrips of your choice from that class\'s spell list.\n\nIn addition, choose one 1st-level spell from that same list. You learn that spell and can cast it at its lowest level. Once you cast it, you must finish a long rest before you can cast it again.\n\nYour spellcasting ability for these spells depends on the class you chose: Charisma for bard, sorcerer, or warlock; Wisdom for cleric or druid; or Intelligence for wizard.',
    },
  },
  {
    slug: 'mobile',
    source: 'phb-2014',
    data: {
      name: 'Mobile',
      slug: 'mobile',
      prerequisite: '',
      desc: 'You are exceptionally speedy and agile. You gain the following benefits:\n\n- Your speed increases by 10 feet.\n- When you use the Dash action, difficult terrain doesn\'t cost you extra movement on that turn.\n- When you make a melee attack against a creature, you don\'t provoke opportunity attacks from that creature for the rest of the turn, whether you hit or not.',
    },
  },
  {
    slug: 'polearm-master',
    source: 'phb-2014',
    data: {
      name: 'Polearm Master',
      slug: 'polearm-master',
      prerequisite: '',
      desc: 'You can keep your enemies at bay with reach weapons. You gain the following benefits:\n\n- When you take the Attack action and attack with only a glaive, halberd, or quarterstaff, you can use a bonus action to make a melee attack with the opposite end of the weapon. The weapon\'s damage die for this attack is a d4, and the attack deals bludgeoning damage.\n- While you are wielding a glaive, halberd, pike, or quarterstaff, other creatures provoke an opportunity attack from you when they enter the reach you have with that weapon.',
    },
  },
  {
    slug: 'sharpshooter',
    source: 'phb-2014',
    data: {
      name: 'Sharpshooter',
      slug: 'sharpshooter',
      prerequisite: '',
      desc: 'You have mastered ranged weapons and can make shots that others find impossible. You gain the following benefits:\n\n- Attacking at long range doesn\'t impose disadvantage on your ranged weapon attack rolls.\n- Your ranged weapon attacks ignore half cover and three-quarters cover.\n- Before you make an attack with a ranged weapon that you are proficient with, you can choose to take a -5 penalty to the attack roll. If the attack hits, you add +10 to the attack\'s damage.',
    },
  },
  {
    slug: 'tough',
    source: 'phb-2014',
    data: {
      name: 'Tough',
      slug: 'tough',
      prerequisite: '',
      desc: 'Your hit point maximum increases by an amount equal to twice your level when you gain this feat. Whenever you gain a level thereafter, your hit point maximum increases by an additional 2 hit points.',
    },
  },
  {
    slug: 'war-caster',
    source: 'phb-2014',
    data: {
      name: 'War Caster',
      slug: 'war-caster',
      prerequisite: 'The ability to cast at least one spell',
      desc: 'You have practiced casting spells in the midst of combat, learning techniques that grant you the following benefits:\n\n- You have advantage on Constitution saving throws that you make to maintain your concentration on a spell when you take damage.\n- You can perform the somatic components of spells even when you have weapons or a shield in one or both hands.\n- When a hostile creature\'s movement provokes an opportunity attack from you, you can use your reaction to cast a spell at the creature, rather than making an opportunity attack. The spell must have a casting time of 1 action and must target only that creature.',
    },
  },
];

// ─────────────── Races (non-SRD) ───────────────
const RACES: RaceEntry[] = [
  {
    slug: 'human-variant',
    source: 'phb-2014',
    data: {
      name: 'Variant Human',
      slug: 'human-variant',
      desc: `Most worlds have a wide variety of humans. The variant human trades the standard human's broad +1 to all six abilities for narrower bonuses, an extra skill, and a feat at 1st level — making them one of the most flexible starting races in the game.`,
      asi_desc: '**_Ability Score Increase._** Two different ability scores of your choice each increase by 1.',
      asi: [
        { attributes: ['Other'], value: 1 },
        { attributes: ['Other'], value: 1 },
      ],
      age: '**_Age._** Humans reach adulthood in their late teens and live less than a century.',
      alignment: '**_Alignment._** Humans tend toward no particular alignment. The best and the worst are found among them.',
      size_raw: 'Medium',
      speed: { walk: 30 },
      speed_desc: '**_Speed._** Your base walking speed is 30 feet.',
      languages: '**_Languages._** You can speak, read, and write Common and one extra language of your choice.',
      vision: '',
      traits: `**_Skills._** You gain proficiency in one skill of your choice.

**_Feat._** You gain one feat of your choice at 1st level.`,
      subraces: [],
    },
  },
];

// ─────────────── Subclasses ───────────────
const SUBCLASSES: SubclassEntry[] = [
  {
    slug: 'trickery-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'Trickery Domain',
      slug: 'trickery-domain',
      desc: `Gods of trickery — such as Tymora, Beshaba, Olidammara, the Traveler, Garl Glittergold, and Loki — are mischief-makers and instigators who stand as a constant challenge to the accepted order among both gods and mortals. They're patrons of thieves, scoundrels, gamblers, rebels, and liberators. Their clerics are a disruptive force in the world, puncturing pride, mocking tyrants, stealing from the rich, freeing captives, and flouting hollow traditions. They prefer subterfuge, pranks, deception, and theft to direct confrontation.

##### Domain Spells

You gain domain spells at the cleric levels listed in the Trickery Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | charm person, disguise self         |
| 3rd          | mirror image, pass without trace    |
| 5th          | blink, dispel magic                 |
| 7th          | dimension door, polymorph           |
| 9th          | dominate person, modify memory      |

##### Blessing of the Trickster

Starting when you choose this domain at 1st level, you can use your action to touch a willing creature other than yourself to give it advantage on Dexterity (Stealth) checks. This blessing lasts for 1 hour or until you use this feature again.

##### Channel Divinity: Invoke Duplicity

Starting at 2nd level, you can use your Channel Divinity to create an illusory duplicate of yourself.

As an action, you create a perfect illusion of yourself that lasts for 1 minute, or until you lose your concentration (as if you were concentrating on a spell). The illusion appears in an unoccupied space that you can see within 30 feet of you. As a bonus action on your turn, you can move the illusion up to 30 feet to a space you can see, but it must remain within 120 feet of you.

For the duration, you can cast spells as though you were in the illusion's space, but you must use your own senses. Additionally, when both you and your illusion are within 5 feet of a creature that can see the illusion, you have advantage on attack rolls against that creature, given how distracting the illusion is to the target.

##### Channel Divinity: Cloak of Shadows

Starting at 6th level, you can use your Channel Divinity to vanish.

As an action, you become invisible until the end of your next turn. You become visible if you attack or cast a spell.

##### Divine Strike

At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 poison damage to the target. When you reach 14th level, the extra damage increases to 2d8.

##### Improved Duplicity

At 17th level, you can create up to four duplicates of yourself, instead of one, when you use Invoke Duplicity. As a bonus action on your turn, you can move any number of them up to 30 feet, to a maximum range of 120 feet.`,
    },
  },
  {
    slug: 'war-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'War Domain',
      slug: 'war-domain',
      desc: `War has many manifestations. It can make heroes of ordinary people. It can be desperate and horrific, with acts of cruelty and cowardice eclipsing instances of excellence and courage. In either case, the gods of war watch over warriors and reward them for their great deeds. The clerics of such gods excel in battle, inspiring others to fight the good fight or offering sacrifices of opponents' bodies to their god. Gods of war include champions of honor and chivalry (such as Torm, Heironeous, and Kiri-Jolith) as well as gods of destruction and pillage (such as Erythnul, the Fury, Gruumsh, and Ares) and gods of conquest and domination (such as Bane, Hextor, and Maglubiyet). Other war gods (such as Tempus, Nike, and Nuada) take a more neutral stance, promoting war in all its manifestations and supporting warriors in any circumstance.

##### Domain Spells

You gain domain spells at the cleric levels listed in the War Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | divine favor, shield of faith       |
| 3rd          | magic weapon, spiritual weapon      |
| 5th          | crusader's mantle, spirit guardians |
| 7th          | freedom of movement, stoneskin      |
| 9th          | flame strike, hold monster          |

##### Bonus Proficiencies

At 1st level, you gain proficiency with martial weapons and heavy armor.

##### War Priest

From 1st level, your god delivers bonuses to you in battle. When you use the Attack action, you can make one weapon attack as a bonus action.

You can use this feature a number of times equal to your Wisdom modifier (a minimum of once). You regain all expended uses when you finish a long rest.

##### Channel Divinity: Guided Strike

Starting at 2nd level, you can use your Channel Divinity to strike with supernatural accuracy. When you make an attack roll, you can use your Channel Divinity to gain a +10 bonus to the roll. You make this choice after you see the roll, but before the DM says whether the attack hits or misses.

##### Channel Divinity: War God's Blessing

At 6th level, when a creature within 30 feet of you makes an attack roll, you can use your reaction to grant that creature a +10 bonus to the roll, using your Channel Divinity. You make this choice after you see the roll, but before the DM says whether the attack hits or misses.

##### Divine Strike

At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 damage of the same type dealt by the weapon to the target. When you reach 14th level, the extra damage increases to 2d8.

##### Avatar of Battle

At 17th level, you gain resistance to bludgeoning, piercing, and slashing damage from nonmagical weapons.`,
    },
  },
  {
    slug: 'tempest-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'Tempest Domain',
      slug: 'tempest-domain',
      desc: `Gods whose portfolios include the Tempest domain — including Talos, Umberlee, Kord, Zeboim, the Devourer, Zeus, and Thor — govern storms, sea, and sky. They include gods of lightning and thunder, gods of earthquakes, some fire gods, and certain gods of violence, physical strength, and courage. In some pantheons, a god of this domain rules over other deities and is known for swift justice delivered by thunderbolts. In the pantheons of seafaring people, gods of this domain are ocean deities and the patrons of sailors. Tempest gods send their clerics to inspire fear in the common folk, either to keep those folk on the path of righteousness or to encourage them to offer sacrifices of propitiation to ward off divine wrath.

##### Domain Spells

You gain domain spells at the cleric levels listed in the Tempest Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | fog cloud, thunderwave              |
| 3rd          | gust of wind, shatter               |
| 5th          | call lightning, sleet storm         |
| 7th          | control water, ice storm            |
| 9th          | destructive wave, insect plague     |

##### Bonus Proficiencies

At 1st level, you gain proficiency with martial weapons and heavy armor.

##### Wrath of the Storm

Also at 1st level, you can thunderously rebuke attackers. When a creature within 5 feet of you that you can see hits you with an attack, you can use your reaction to cause the creature to make a Dexterity saving throw. The creature takes 2d8 lightning or thunder damage (your choice) on a failed saving throw, and half as much damage on a successful one.

You can use this feature a number of times equal to your Wisdom modifier (a minimum of once). You regain all expended uses when you finish a long rest.

##### Channel Divinity: Destructive Wrath

Starting at 2nd level, you can use your Channel Divinity to wield the power of the storm with unchecked ferocity.

When you roll lightning or thunder damage, you can use your Channel Divinity to deal maximum damage, instead of rolling.

##### Thunderbolt Strike

At 6th level, when you deal lightning damage to a Large or smaller creature, you can also push it up to 10 feet away from you.

##### Divine Strike

At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 thunder damage to the target. When you reach 14th level, the extra damage increases to 2d8.

##### Stormborn

At 17th level, you have a flying speed equal to your current walking speed whenever you are not underground or indoors.`,
    },
  },
  {
    slug: 'nature-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'Nature Domain',
      slug: 'nature-domain',
      desc: `Gods of nature are as varied as the natural world itself, from inscrutable gods of the deep forests (such as Silvanus, Obad-Hai, Chislev, Balinor, and Pan) to friendly deities associated with particular springs and groves (such as Eldath). Druids revere nature as a whole and might serve one of these deities, practicing mysterious rites and reciting all-but-forgotten prayers in their own secret tongue. But many of these gods have clerics as well, champions who take a more active role in advancing the interests of a particular nature god. These clerics might hunt the evil monstrosities that despoil the woodlands, bless the harvest of the faithful, or wither the crops of those who anger their gods.

##### Domain Spells

You gain domain spells at the cleric levels listed in the Nature Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | animal friendship, speak with animals |
| 3rd          | barkskin, spike growth              |
| 5th          | plant growth, wind wall             |
| 7th          | dominate beast, grasping vine       |
| 9th          | insect plague, tree stride          |

##### Acolyte of Nature

At 1st level, you learn one druid cantrip of your choice. You also gain proficiency in one of the following skills of your choice: Animal Handling, Nature, or Survival.

##### Bonus Proficiency

Also at 1st level, you gain proficiency with heavy armor.

##### Channel Divinity: Charm Animals and Plants

Starting at 2nd level, you can use your Channel Divinity to charm animals and plants.

As an action, you present your holy symbol and invoke the name of your deity. Each beast or plant creature that can see you within 30 feet of you must make a Wisdom saving throw. If the creature fails its saving throw, it is charmed by you for 1 minute or until it takes damage. While it is charmed by you, it is friendly to you and other creatures you designate.

##### Dampen Elements

Starting at 6th level, when you or a creature within 30 feet of you takes acid, cold, fire, lightning, or thunder damage, you can use your reaction to grant resistance to the creature against that instance of the damage.

##### Divine Strike

At 8th level, you gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 cold, fire, or lightning damage (your choice) to the target. When you reach 14th level, the extra damage increases to 2d8.

##### Master of Nature

At 17th level, you gain the ability to command animals and plant creatures. While creatures are charmed by your Charm Animals and Plants feature, you can take a bonus action on your turn to verbally command what each of those creatures will do on its next turn.`,
    },
  },
  {
    slug: 'light-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'Light Domain',
      slug: 'light-domain',
      desc: `Gods of light — including Helm, Lathander, Pholtus, Branchala, the Silver Flame, Belenus, Apollo, and Re-Horakhty — promote the ideals of rebirth and renewal, truth, vigilance, and beauty, often using the symbol of the sun. Some of these gods are portrayed as the sun itself or as a charioteer who guides the sun across the sky. Others are tireless sentinels whose eyes pierce every shadow and see through every deception. Some are deities of beauty and artistry, who teach that art is a vehicle for the soul's improvement. Clerics of a god of light are enlightened souls infused with radiance and the power of their gods' discerning vision, charged with chasing away lies and burning away darkness.

##### Domain Spells

You gain domain spells at the cleric levels listed in the Light Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | burning hands, faerie fire          |
| 3rd          | flaming sphere, scorching ray       |
| 5th          | daylight, fireball                  |
| 7th          | guardian of faith, wall of fire     |
| 9th          | flame strike, scrying               |

##### Bonus Cantrip

When you choose this domain at 1st level, you gain the light cantrip if you don't already know it.

##### Warding Flare

Also at 1st level, you can interpose divine light between yourself and an attacking enemy. When you are attacked by a creature within 30 feet of you that you can see, you can use your reaction to impose disadvantage on the attack roll, causing light to flare before the attacker before it hits or misses. An attacker that can't be blinded is immune to this feature.

You can use this feature a number of times equal to your Wisdom modifier (a minimum of once). You regain all expended uses when you finish a long rest.

##### Channel Divinity: Radiance of the Dawn

Starting at 2nd level, you can use your Channel Divinity to harness sunlight, banishing darkness and dealing radiant damage to your foes.

As an action, you present your holy symbol, and any magical darkness within 30 feet of you is dispelled. Additionally, each hostile creature within 30 feet of you must make a Constitution saving throw. A creature takes radiant damage equal to 2d10 + your cleric level on a failed saving throw, and half as much damage on a successful one. A creature that has total cover from you is not affected.

##### Improved Flare

Starting at 6th level, you can also use your Warding Flare feature when a creature that you can see within 30 feet of you attacks a creature other than you.

##### Potent Spellcasting

Starting at 8th level, you add your Wisdom modifier to the damage you deal with any cleric cantrip.

##### Corona of Light

Starting at 17th level, you can use your action to activate an aura of sunlight that lasts for 1 minute or until you dismiss it using another action. You emit bright light in a 60-foot radius and dim light 30 feet beyond that. Your enemies in the bright light have disadvantage on saving throws against any spell that deals fire or radiant damage.`,
    },
  },
  {
    slug: 'knowledge-domain',
    class_slug: 'cleric',
    source: 'phb-2014',
    data: {
      name: 'Knowledge Domain',
      slug: 'knowledge-domain',
      desc: `The gods of knowledge — including Oghma, Boccob, Gilean, Aureon, and Thoth — value learning and understanding above all. Some teach that knowledge is to be gathered and shared in libraries and universities, or promote the practical knowledge of craft and invention. Some deities hoard knowledge and keep its secrets to themselves. And some promise their followers that they will gain tremendous power if they unlock the secrets of the multiverse. Followers of these gods study esoteric lore, collect old tomes, delve into the secret places of the earth, and learn all they can.

##### Domain Spells

You gain domain spells at the cleric levels listed in the Knowledge Domain Spells table. See the Divine Domain class feature for how domain spells work.

| Cleric Level | Spells                              |
|--------------|-------------------------------------|
| 1st          | command, identify                   |
| 3rd          | augury, suggestion                  |
| 5th          | nondetection, speak with dead       |
| 7th          | arcane eye, confusion               |
| 9th          | legend lore, scrying                |

##### Blessings of Knowledge

At 1st level, you learn two languages of your choice. You also become proficient in your choice of two of the following skills: Arcana, History, Nature, or Religion.

Your proficiency bonus is doubled for any ability check you make that uses either of those skills.

##### Channel Divinity: Knowledge of the Ages

Starting at 2nd level, you can use your Channel Divinity to tap into a divine well of knowledge. As an action, you choose one skill or tool. For 10 minutes, you have proficiency with the chosen skill or tool.

##### Channel Divinity: Read Thoughts

At 6th level, you can use your Channel Divinity to read a creature's thoughts. You can then use your access to the creature's mind to command it.

As an action, choose one creature that you can see within 60 feet of you. That creature must make a Wisdom saving throw. If the creature succeeds on the saving throw, you can't use this feature on it again until you finish a long rest. If the creature fails its save, you can read its surface thoughts (those foremost in its mind, reflecting its current emotions and what it is actively thinking about) for 1 minute. As an action, you can end this effect and cast the suggestion spell on the creature without expending a spell slot. The target automatically fails its saving throw against the spell.

##### Potent Spellcasting

Starting at 8th level, you add your Wisdom modifier to the damage you deal with any cleric cantrip.

##### Visions of the Past

Starting at 17th level, you can call up visions of the past that relate to an object you hold or your immediate surroundings. You spend at least 1 minute in meditation and prayer, then receive dreamlike, shadowy glimpses of recent events. You can meditate in this way for a number of minutes equal to your Wisdom score and must maintain concentration during that time, as if you were casting a spell.

Once you use this feature, you can't use it again until you finish a short or long rest.

**_Object Reading._** Holding an object as you meditate, you can see visions of the object's previous owner. After meditating for 1 minute, you learn how the owner acquired and lost the object, as well as the most recent significant event involving the object and that owner. If the object was owned by another creature in the recent past (within a number of days equal to your Wisdom score), you can spend 1 additional minute for each owner to learn the same information about that creature.

**_Area Reading._** As you meditate, you see visions of recent events in your immediate vicinity (a room, street, tunnel, clearing, or the like, up to a 50-foot cube), going back a number of days equal to your Wisdom score. For each minute you meditate, you learn about one significant event, beginning with the most recent. Significant events typically involve powerful emotions, such as battles and betrayals, marriages and murders, births and funerals. However, they might also include more mundane events that are nevertheless important in your current situation.`,
    },
  },
  {
    slug: 'college-of-valor',
    class_slug: 'bard',
    source: 'phb-2014',
    data: {
      name: 'College of Valor',
      slug: 'college-of-valor',
      desc: `Bards of the College of Valor are daring skalds whose tales keep alive the memory of the great heroes of the past, and thereby inspire a new generation of heroes. These bards gather in mead halls or around great bonfires to sing the deeds of the mighty, both past and present. They travel the land to witness great events firsthand and to ensure that the memory of those events doesn't pass from the world. With their songs, they inspire others to reach the same heights of accomplishment as the heroes of old.

##### Bonus Proficiencies

When you join the College of Valor at 3rd level, you gain proficiency with medium armor, shields, and martial weapons.

##### Combat Inspiration

Also at 3rd level, you learn to inspire others in battle. A creature that has a Bardic Inspiration die from you can roll that die and add the number rolled to a weapon damage roll it just made. Alternatively, when an attack roll is made against the creature, it can use its reaction to roll the Bardic Inspiration die and add the number rolled to its AC against that attack, after seeing the roll but before knowing whether it hits or misses.

##### Extra Attack

Starting at 6th level, you can attack twice, instead of once, whenever you take the Attack action on your turn.

##### Battle Magic

At 14th level, you have mastered the art of weaving spellcasting and weapon use into a single harmonious act. When you use your action to cast a bard spell, you can make one weapon attack as a bonus action.`,
    },
  },
  {
    slug: 'path-of-the-totem-warrior',
    class_slug: 'barbarian',
    source: 'phb-2014',
    data: {
      name: 'Path of the Totem Warrior',
      slug: 'path-of-the-totem-warrior',
      desc: `The Path of the Totem Warrior is a spiritual journey, as the barbarian accepts a spirit animal as guide, protector, and inspiration. In battle, your totem spirit fills you with supernatural might, adding magical fuel to your barbarian rage.

Most barbarian tribes consider a totem animal to be kin to a particular clan. In such cases, it is unusual for an individual to have more than one totem animal spirit, though exceptions exist.

##### Spirit Seeker

Yours is a path that seeks attunement with the natural world, giving you a kinship with beasts. At 3rd level when you adopt this path, you gain the ability to cast the beast sense and speak with animals spells, but only as rituals, as described in chapter 10.

##### Totem Spirit

At 3rd level, when you adopt this path, you choose a totem spirit and gain its feature. You must make or acquire a physical totem object — an amulet or similar adornment — that incorporates fur or feathers, claws, teeth, or bones of the totem animal. At your option, you also gain minor physical attributes that are reminiscent of your totem spirit.

Your totem animal might be an animal related to those listed here but more appropriate to your homeland. For example, you could choose a hawk or vulture in place of an eagle.

**_Bear._** While raging, you have resistance to all damage except psychic damage. The spirit of the bear makes you tough enough to withstand any punishment.

**_Eagle._** While you're raging and aren't wearing heavy armor, other creatures have disadvantage on opportunity attack rolls against you, and you can use the Dash action as a bonus action on your turn. The spirit of the eagle makes you into a predator who can weave through the fray with ease.

**_Wolf._** While you're raging, your friends have advantage on melee attack rolls against any creature within 5 feet of you that is hostile to you. The spirit of the wolf makes you a leader of hunters.

##### Aspect of the Beast

At 6th level, you gain a magical benefit based on the totem animal of your choice. You can choose the same animal you selected at 3rd level or a different one.

**_Bear._** You gain the might of a bear. Your carrying capacity (including maximum load and maximum lift) is doubled, and you have advantage on Strength checks made to push, pull, lift, or break objects.

**_Eagle._** You gain the eyesight of an eagle. You can see up to 1 mile away with no difficulty, able to discern even fine details as though looking at something no more than 100 feet away from you. Additionally, dim light doesn't impose disadvantage on your Wisdom (Perception) checks.

**_Wolf._** You gain the hunting sensibilities of a wolf. You can track other creatures while traveling at a fast pace, and you can move stealthily while traveling at a normal pace (see chapter 8 for rules on travel pace).

##### Spirit Walker

At 10th level, you can cast the commune with nature spell, but only as a ritual. When you do so, a spiritual version of one of the animals you chose for Totem Spirit or Aspect of the Beast appears to you to convey the information you seek.

##### Totemic Attunement

At 14th level, you gain a magical benefit based on a totem animal of your choice. You can choose the same animal you selected previously or a different one.

**_Bear._** While you're raging, any creature within 5 feet of you that's hostile to you has disadvantage on attack rolls against targets other than you or another character with this feature. An enemy is immune to this effect if it can't see or hear you or if it can't be frightened.

**_Eagle._** While raging, you have a flying speed equal to your current walking speed. This benefit works only in short bursts; you fall if you end your turn in the air and nothing else is holding you aloft.

**_Wolf._** While you're raging, you can use a bonus action on your turn to knock a Large or smaller creature prone when you hit it with a melee weapon attack.`,
    },
  },
  {
    slug: 'school-of-transmutation',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Transmutation',
      slug: 'school-of-transmutation',
      desc: `You are a student of spells that modify energy and matter. To you, the world is not a fixed thing, but eminently mutable, and you delight in being an agent of change. You wield the raw stuff of creation and learn to alter both physical forms and mental qualities. Your magic gives you the tools to become a smith on reality's forge.

Some transmuters are tinkerers and pranksters, turning people into toads and transforming copper into silver for fun and occasional profit. Others pursue their magical studies with deadly seriousness, seeking the power of the gods to make and destroy worlds.

##### Transmutation Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy a transmutation spell into your spellbook is halved.

##### Minor Alchemy

Starting at 2nd level when you select this school, you can temporarily alter the physical properties of one nonmagical object, changing it from one substance into another. You perform a special alchemical procedure on one object composed entirely of wood, stone (but not a gemstone), iron, copper, or silver, transforming it into a different one of those materials. For each 10 minutes you spend performing the procedure, you can transform up to 1 cubic foot of material. After 1 hour, or until you lose your concentration (as if you were concentrating on a spell), the material reverts to its original substance.

##### Transmuter's Stone

Starting at 6th level, you can spend 8 hours creating a transmuter's stone that stores transmutation magic. You can benefit from the stone yourself or give it to another creature. A creature gains a benefit of your choice as long as the stone is in the creature's possession. When you create the stone, choose the benefit from the following options:

- Darkvision out to a range of 60 feet, as described in chapter 8
- An increase to speed of 10 feet while the creature is unencumbered
- Proficiency in Constitution saving throws
- Resistance to acid, cold, fire, lightning, or thunder damage (your choice whenever you choose this benefit)

Each time you cast a transmutation spell of 1st level or higher, you can change the effect of your stone if the stone is on your person. If you create a new transmuter's stone, the previous one ceases to function.

##### Shapechanger

At 10th level, you add the polymorph spell to your spellbook, if it is not there already. You can cast polymorph without expending a spell slot. When you do so, you can target only yourself and transform into a beast whose challenge rating is 1 or lower.

Once you cast polymorph in this way, you can't do so again until you finish a short or long rest, though you can still cast it normally using an available spell slot.

##### Master Transmuter

Starting at 14th level, you can use your action to consume the reserve of transmutation magic stored within your transmuter's stone in a single burst. When you do so, choose one of the following effects. Your transmuter's stone is destroyed and can't be remade until you finish a long rest.

**_Major Transformation._** You can transmute one nonmagical object — no larger than a 5-foot cube — into another nonmagical object of similar size and mass and of equal or lesser value. You must spend 10 minutes handling the object to transform it.

**_Panacea._** You remove all curses, diseases, and poisons affecting a creature that you touch with the transmuter's stone. The creature also regains all its hit points.

**_Restore Life._** You cast the raise dead spell on a creature you touch with the transmuter's stone, without expending a spell slot or needing to have the spell in your spellbook.

**_Restore Youth._** You touch the transmuter's stone to a willing creature, and that creature's apparent age is reduced by 3d10 years, to a minimum of 13 years. This effect doesn't extend the creature's lifespan.`,
    },
  },
  {
    slug: 'school-of-necromancy',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Necromancy',
      slug: 'school-of-necromancy',
      desc: `The School of Necromancy explores the cosmic forces of life, death, and undeath. As you study this school, you learn to manipulate the energy that animates all living beings. As you progress, you learn to sap the life force from a creature as your magic destroys its body, transforming that vital energy into magical power you can manipulate.

Most people see necromancers as menacing, or even villainous, due to the close association with death. Not all necromancers are evil, but the forces they manipulate are considered taboo by many societies.

##### Necromancy Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy a necromancy spell into your spellbook is halved.

##### Grim Harvest

At 2nd level, you gain the ability to reap life energy from creatures you kill with your spells. Once per turn when you kill one or more creatures with a spell of 1st level or higher, you regain hit points equal to twice the spell's level, or three times its level if the spell belongs to the School of Necromancy. You don't gain this benefit for killing constructs or undead.

##### Undead Thralls

At 6th level, you add the animate dead spell to your spellbook if it is not there already. When you cast animate dead, you can target one additional corpse or pile of bones, creating another zombie or skeleton, as appropriate.

Whenever you create an undead using a necromancy spell, it has additional benefits:

- The creature's hit point maximum is increased by an amount equal to your wizard level.
- The creature adds your proficiency bonus to its weapon damage rolls.

##### Inured to Undeath

Beginning at 10th level, you have resistance to necrotic damage, and your hit point maximum can't be reduced. You have spent so much time dealing with undead and the forces that animate them that you have become inured to some of their worst effects.

##### Command Undead

Starting at 14th level, you can use magic to bring undead under your control, even those created by other wizards. As an action, you can choose one undead that you can see within 60 feet of you. That creature must make a Charisma saving throw against your wizard spell save DC. If it succeeds, you can't use this feature on it again. If it fails, it becomes friendly to you and obeys your commands until you use this feature again.

Intelligent undead are harder to control in this way. If the target has an Intelligence of 8 or higher, it has advantage on the saving throw. If it fails the saving throw and has an Intelligence of 12 or higher, it can repeat the saving throw at the end of every hour until it succeeds and breaks free.`,
    },
  },
  {
    slug: 'school-of-illusion',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Illusion',
      slug: 'school-of-illusion',
      desc: `You focus your studies on magic that dazzles the senses, befuddles the mind, and tricks even the wisest folk. Your magic is subtle, but the illusions crafted by your keen mind make the impossible seem real. Some illusionists — including many gnome wizards — are benign tricksters who use their spells to entertain. Others are more sinister masters of deception, using their illusions to frighten and fool others for their personal gain.

##### Illusion Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy an illusion spell into your spellbook is halved.

##### Improved Minor Illusion

When you choose this school at 2nd level, you learn the minor illusion cantrip. If you already know this cantrip, you learn a different wizard cantrip of your choice. The cantrip doesn't count against your number of cantrips known.

When you cast minor illusion, you can create both a sound and an image with a single casting of the spell.

##### Malleable Illusions

Starting at 6th level, when you cast an illusion spell that has a duration of 1 minute or longer, you can use your action to change the nature of that illusion (using the spell's normal parameters for the illusion), provided that you can see the illusion.

##### Illusory Self

Beginning at 10th level, you can create an illusory duplicate of yourself as an instant, almost instinctual reaction to danger. When a creature makes an attack roll against you, you can use your reaction to interpose the illusory duplicate between the attacker and yourself. The attack automatically misses you, then the illusion dissipates.

Once you use this feature, you can't use it again until you finish a short or long rest.

##### Illusory Reality

By 14th level, you have learned the secret of weaving shadow magic into your illusions to give them a semi-reality. When you cast an illusion spell of 1st level or higher, you can choose one inanimate, nonmagical object that is part of the illusion and make that object real. You can do this on your turn as a bonus action while the spell is ongoing. The object remains real for 1 minute. For example, you can create an illusion of a bridge over a chasm and then make it real long enough for your allies to cross.

The object can't deal damage or otherwise directly harm anyone.`,
    },
  },
  {
    slug: 'school-of-enchantment',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Enchantment',
      slug: 'school-of-enchantment',
      desc: `As a member of the School of Enchantment, you have honed your ability to magically entrance and beguile other people and monsters. Some enchanters are peacemakers who bewitch the violent to lay down their arms and charm the cruel into showing mercy. Others are tyrants who magically bind the unwilling into their service. Most enchanters fall somewhere in between.

##### Enchantment Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy an enchantment spell into your spellbook is halved.

##### Hypnotic Gaze

Starting at 2nd level when you choose this school, your soft words and enchanting gaze can magically enthrall another creature. As an action, choose one creature that you can see within 5 feet of you. If the target can see or hear you, it must succeed on a Wisdom saving throw against your wizard spell save DC or be charmed by you until the end of your next turn. The charmed creature's speed drops to 0, and the creature is incapacitated and visibly dazed.

On subsequent turns, you can use your action to maintain this effect, extending its duration until the end of your next turn. However, the effect ends if the creature ends its turn out of line of sight or more than 60 feet away from you.

If the creature succeeds on its saving throw, you can't use this feature on that creature again for 24 hours.

Once you use this feature, you can't use it again until you finish a short or long rest.

##### Instinctive Charm

Beginning at 6th level, when a creature you can see within 30 feet of you makes an attack roll against you, you can use your reaction to divert the attack, provided that another creature is within the attack's range. The attacker must make a Wisdom saving throw against your wizard spell save DC. On a failed save, the attacker must target the creature that is closest to it, not including you or itself. If multiple creatures are closest, the attacker chooses which one to target. On a successful save, you can't use this feature on the attacker again until you finish a long rest.

You must choose to use this feature before knowing whether the attack hits or misses. Creatures that can't be charmed are immune to this effect.

##### Split Enchantment

Starting at 10th level, when you cast an enchantment spell of 1st level or higher that targets only one creature, you can have it target a second creature.

##### Alter Memories

At 14th level, you gain the ability to make a creature unaware of your magical influence on it. When you cast an enchantment spell to charm one or more creatures, you can alter one creature's understanding so that it remains unaware of being charmed.

Additionally, once before the spell expires, you can use your action to try to make the chosen creature forget some of the time it spent charmed. The creature must succeed on an Intelligence saving throw against your wizard spell save DC or lose a number of hours of its memories equal to 1 + your Charisma modifier (minimum 1). You can make the creature forget less time, and the amount of time can't exceed the duration of your enchantment spell.`,
    },
  },
  {
    slug: 'school-of-divination',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Divination',
      slug: 'school-of-divination',
      desc: `The counsel of a diviner is sought by royalty and commoners alike, for all seek a clearer understanding of the past, present, and future. As a diviner, you strive to part the veils of space, time, and consciousness so that you can see clearly. You work to master spells of discernment, remote viewing, supernatural knowledge, and foresight.

##### Divination Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy a divination spell into your spellbook is halved.

##### Portent

Starting at 2nd level when you choose this school, glimpses of the future begin to press in on your awareness. When you finish a long rest, roll two d20s and record the numbers rolled. You can replace any attack roll, saving throw, or ability check made by you or a creature that you can see with one of these foretelling rolls. You must choose to do so before the roll, and you can replace a roll in this way only once per turn.

Each foretelling roll can be used only once. When you finish a long rest, you lose any unused foretelling rolls.

##### Expert Divination

Beginning at 6th level, casting divination spells comes so easily to you that it expends only a fraction of your spellcasting efforts. When you cast a divination spell of 2nd level or higher using a spell slot, you regain one expended spell slot. The slot you regain must be of a level lower than the spell you cast and can't be higher than 5th level.

##### The Third Eye

Starting at 10th level, you can use your action to increase your powers of perception. When you do so, choose one of the following benefits, which lasts until you are incapacitated or you take a short or long rest. You can't use the feature again until you finish a rest.

**_Darkvision._** You gain darkvision out to a range of 60 feet, as described in chapter 8.

**_Ethereal Sight._** You can see into the Ethereal Plane within 60 feet of you.

**_Greater Comprehension._** You can read any language.

**_See Invisibility._** You can see invisible creatures and objects within 10 feet of you that are within line of sight.

##### Greater Portent

Starting at 14th level, the visions in your dreams intensify and paint a more accurate picture in your mind of what is to come. You roll three d20s for your Portent feature, rather than two.`,
    },
  },
  {
    slug: 'school-of-conjuration',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Conjuration',
      slug: 'school-of-conjuration',
      desc: `As a conjurer, you favor spells that produce objects and creatures out of thin air. You can conjure billowing clouds of killing fog or summon creatures from elsewhere to fight on your behalf. As your mastery grows, you learn spells of transportation and can teleport yourself across vast distances, even to other planes of existence, in an instant.

##### Conjuration Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy a conjuration spell into your spellbook is halved.

##### Minor Conjuration

Starting at 2nd level when you select this school, you can use your action to conjure up an inanimate object in your hand or on the ground in an unoccupied space that you can see within 10 feet of you. This object can be no larger than 3 feet on a side and weigh no more than 10 pounds, and its form must be that of a nonmagical object that you have seen. The object is visibly magical, radiating dim light out to 5 feet.

The object disappears after 1 hour, when you use this feature again, or if it takes any damage.

##### Benign Transposition

Starting at 6th level, you can use your action to teleport up to 30 feet to an unoccupied space that you can see. Alternatively, you can choose a space within range that is occupied by a Small or Medium creature. If that creature is willing, you both teleport, swapping places.

Once you use this feature, you can't use it again until you finish a long rest or you cast a conjuration spell of 1st level or higher.

##### Focused Conjuration

Beginning at 10th level, while you are concentrating on a conjuration spell, your concentration can't be broken as a result of taking damage.

##### Durable Summons

Starting at 14th level, any creature that you summon or create with a conjuration spell has 30 temporary hit points.`,
    },
  },
  {
    slug: 'school-of-abjuration',
    class_slug: 'wizard',
    source: 'phb-2014',
    data: {
      name: 'School of Abjuration',
      slug: 'school-of-abjuration',
      desc: `The School of Abjuration emphasizes magic that blocks, banishes, or protects. Detractors of this school say that its tradition is about denial, negation rather than positive assertion. You understand, however, that ending harmful effects, protecting the weak, and banishing evil influences is anything but a philosophical void. It is a proud and respected vocation.

Called abjurers, members of this school are sought when baleful spirits require exorcism, when important locations must be guarded against magical spying, and when portals to other planes of existence must be closed.

##### Abjuration Savant

Beginning when you select this school at 2nd level, the gold and time you must spend to copy an abjuration spell into your spellbook is halved.

##### Arcane Ward

Starting at 2nd level, you can weave magic around yourself for protection. When you cast an abjuration spell of 1st level or higher, you can simultaneously use a strand of the spell's magic to create a magical ward on yourself that lasts until you finish a long rest. The ward has hit points equal to twice your wizard level + your Intelligence modifier. Whenever you take damage, the ward takes the damage instead. If this damage reduces the ward to 0 hit points, you take any remaining damage.

While the ward has 0 hit points, it can't absorb damage, but its magic remains. Whenever you cast an abjuration spell of 1st level or higher, the ward regains a number of hit points equal to twice the level of the spell.

Once you create the ward, you can't create it again until you finish a long rest.

##### Projected Ward

Starting at 6th level, when a creature that you can see within 30 feet of you takes damage, you can use your reaction to cause your Arcane Ward to absorb that damage. If this damage reduces the ward to 0 hit points, the warded creature takes any remaining damage.

##### Improved Abjuration

Beginning at 10th level, when you cast an abjuration spell that requires you to make an ability check as a part of casting that spell (as in counterspell and dispel magic), you add your proficiency bonus to that ability check.

##### Spell Resistance

Starting at 14th level, you have advantage on saving throws against spells.

Furthermore, you have resistance against the damage of spells.`,
    },
  },
  {
    slug: 'circle-of-the-moon',
    class_slug: 'druid',
    source: 'phb-2014',
    data: {
      name: 'Circle of the Moon',
      slug: 'circle-of-the-moon',
      desc: `Druids of the Circle of the Moon are fierce guardians of the wilds. Their order gathers under the full moon to share news and trade warnings. They haunt the deepest parts of the wilderness, where they might go for weeks on end before crossing paths with another humanoid creature, let alone another druid.

Changeable as the moon, a druid of this circle might prowl as a great cat one night, soar over the treetops as an eagle the next day, and crash through the undergrowth in bear form to drive off a trespassing monster. The wild is in the druid's blood.

##### Combat Wild Shape

When you choose this circle at 2nd level, you gain the ability to use Wild Shape on your turn as a bonus action, rather than as an action.

Additionally, while you are transformed by Wild Shape, you can use a bonus action to expend one spell slot to regain 1d8 hit points per level of the spell slot expended.

##### Circle Forms

The rites of your circle grant you the ability to transform into more dangerous animal forms. Starting at 2nd level, you can use your Wild Shape to transform into a beast with a challenge rating as high as 1 (you ignore the Max. CR column of the Beast Shapes table, but must abide by the other limitations there).

Starting at 6th level, you can transform into a beast with a challenge rating as high as your druid level divided by 3, rounded down.

##### Primal Strike

Starting at 6th level, your attacks in beast form count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.

##### Elemental Wild Shape

At 10th level, you can expend two uses of Wild Shape at the same time to transform into an air elemental, an earth elemental, a fire elemental, or a water elemental.

##### Thousand Forms

By 14th level, you have learned to use magic to alter your physical form in more subtle ways. You can cast the alter self spell at will.`,
    },
  },
  {
    slug: 'battle-master',
    class_slug: 'fighter',
    source: 'phb-2014',
    data: {
      name: 'Battle Master',
      slug: 'battle-master',
      desc: `Those who emulate the archetypal Battle Master employ martial techniques passed down through generations. To a Battle Master, combat is an academic field, sometimes including subjects beyond battle such as weaponsmithing and calligraphy. Not every fighter absorbs the lessons of history, theory, and artistry that are reflected in the Battle Master archetype, but those who do are well-rounded fighters of great skill and knowledge.

##### Combat Superiority

When you choose this archetype at 3rd level, you learn maneuvers that are fueled by special dice called superiority dice.

**_Maneuvers._** You learn three maneuvers of your choice, which are detailed under "Maneuvers" below. Many maneuvers enhance an attack in some way. You can use only one maneuver per attack.

You learn two additional maneuvers of your choice at 7th, 10th, and 15th level. Each time you learn new maneuvers, you can also replace one maneuver you know with a different one.

**_Superiority Dice._** You have four superiority dice, which are d8s. A superiority die is expended when you use it. You regain all of your expended superiority dice when you finish a short or long rest.

You gain another superiority die at 7th level and one more at 15th level.

**_Saving Throws._** Some of your maneuvers require your target to make a saving throw to resist the maneuver's effects. The saving throw DC is calculated as follows:

**Maneuver save DC** = 8 + your proficiency bonus + your Strength or Dexterity modifier (your choice).

##### Student of War

At 3rd level, you gain proficiency with one type of artisan's tools of your choice.

##### Know Your Enemy

Starting at 7th level, if you spend at least 1 minute observing or interacting with another creature outside combat, you can learn certain information about its capabilities compared to your own. The DM tells you if the creature is your equal, superior, or inferior in regard to two of the following characteristics of your choice: Strength score, Dexterity score, Constitution score, Armor Class, current hit points, total class levels (if any), fighter class levels (if any).

##### Improved Combat Superiority

At 10th level, your superiority dice turn into d10s. At 18th level, they turn into d12s.

##### Relentless

Starting at 15th level, when you roll initiative and have no superiority dice remaining, you regain one superiority die.

##### Maneuvers

The maneuvers are presented in alphabetical order: Commander's Strike, Disarming Attack, Distracting Strike, Evasive Footwork, Feinting Attack, Goading Attack, Lunging Attack, Maneuvering Attack, Menacing Attack, Parry, Precision Attack, Pushing Attack, Rally, Riposte, Sweeping Attack, and Trip Attack. (See the Player's Handbook for the full text of each.)`,
    },
  },
  {
    slug: 'eldritch-knight',
    class_slug: 'fighter',
    source: 'phb-2014',
    data: {
      name: 'Eldritch Knight',
      slug: 'eldritch-knight',
      desc: `The archetypal Eldritch Knight combines the martial mastery common to all fighters with a careful study of magic. Eldritch Knights use magical techniques similar to those practiced by wizards. They focus their study on two of the eight schools of magic: abjuration and evocation. Abjuration spells grant an Eldritch Knight additional protection in battle, and evocation spells deal damage to many foes at once, extending the fighter's reach in combat. These knights learn a comparatively small number of spells, committing them to memory instead of keeping them in a spellbook.

##### Spellcasting

When you reach 3rd level, you augment your martial prowess with the ability to cast spells.

**_Cantrips._** You learn two cantrips of your choice from the wizard spell list. You learn an additional wizard cantrip of your choice at 10th level.

**_Spell Slots._** The Eldritch Knight Spellcasting table shows how many spell slots you have to cast your wizard spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.

For example, if you know the 1st-level spell shield and have a 1st-level and a 2nd-level spell slot available, you can cast shield using either slot.

**_Spells Known of 1st-Level and Higher._** You know three 1st-level wizard spells of your choice, two of which you must choose from the abjuration and evocation spells on the wizard spell list.

The Spells Known column of the Eldritch Knight Spellcasting table shows when you learn more wizard spells of 1st level or higher. Each of these spells must be an abjuration or evocation spell of your choice, and must be of a level for which you have spell slots. For instance, when you reach 7th level in this class, you can learn one new spell of 1st or 2nd level.

The spells you learn at 8th, 14th, and 20th level can come from any school of magic.

Whenever you gain a level in this class, you can replace one of the wizard spells you know with another spell of your choice from the wizard spell list. The new spell must be of a level for which you have spell slots, and it must be an abjuration or evocation spell, unless you're replacing the spell you gained at 3rd, 8th, 14th, or 20th level from any school of magic.

**_Spellcasting Ability._** Intelligence is your spellcasting ability for your wizard spells, since you learn your spells through study and memorization. You use your Intelligence whenever a spell refers to your spellcasting ability. In addition, you use your Intelligence modifier when setting the saving throw DC for a wizard spell you cast and when making an attack roll with one.

**Spell save DC** = 8 + your proficiency bonus + your Intelligence modifier

**Spell attack modifier** = your proficiency bonus + your Intelligence modifier

##### Weapon Bond

At 3rd level, you learn a ritual that creates a magical bond between yourself and one weapon. You perform the ritual over the course of 1 hour, which can be done during a short rest. The weapon must be within your reach throughout the ritual, at the conclusion of which you touch the weapon and forge the bond.

Once you have bonded a weapon to yourself, you can't be disarmed of that weapon unless you are incapacitated. If it is on the same plane of existence, you can summon that weapon as a bonus action on your turn, causing it to teleport instantly to your hand.

You can have up to two bonded weapons, but can only summon one at a time with your bonus action. If you attempt to bond with a third weapon, you must break the bond with one of the other two.

##### War Magic

Beginning at 7th level, when you use your action to cast a cantrip, you can make one weapon attack as a bonus action.

##### Eldritch Strike

At 10th level, you learn how to make your weapon strikes undercut a creature's resistance to your spells. When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.

##### Arcane Charge

At 15th level, you gain the ability to teleport up to 30 feet to an unoccupied space you can see when you use your Action Surge. You can teleport before or after the additional action.

##### Improved War Magic

Starting at 18th level, when you use your action to cast a spell, you can make one weapon attack as a bonus action.`,
    },
  },
  {
    slug: 'way-of-shadow',
    class_slug: 'monk',
    source: 'phb-2014',
    data: {
      name: 'Way of Shadow',
      slug: 'way-of-shadow',
      desc: `Monks of the Way of Shadow follow a tradition that values stealth and subterfuge. These monks might be called ninjas or shadowdancers, and they serve as spies and assassins. Sometimes the members of a ninja monastery are family members, forming a clan sworn to secrecy about their arts and missions. Other monasteries are more like thieves' guilds, hiring out their services to nobles, rich merchants, or anyone else who can pay their fees. Regardless of their methods, the heads of these monasteries expect the unquestioning obedience of their students.

##### Shadow Arts

Starting when you choose this tradition at 3rd level, you can use your ki to duplicate the effects of certain spells. As an action, you can spend 2 ki points to cast darkness, darkvision, pass without trace, or silence, without providing material components. Additionally, you gain the minor illusion cantrip if you don't already know it.

##### Shadow Step

At 6th level, you gain the ability to step from one shadow into another. When you are in dim light or darkness, as a bonus action you can teleport up to 60 feet to an unoccupied space you can see that is also in dim light or darkness. You then have advantage on the first melee attack you make before the end of the turn.

##### Cloak of Shadows

By 11th level, you have learned to become one with the shadows. When you are in an area of dim light or darkness, you can use your action to become invisible. You remain invisible until you make an attack, cast a spell, or are in an area of bright light.

##### Opportunist

At 17th level, you can exploit a creature's momentary distraction when it is hit by an attack. Whenever a creature within 5 feet of you is hit by an attack made by a creature other than you, you can use your reaction to make a melee attack against that creature.`,
    },
  },
  {
    slug: 'way-of-the-four-elements',
    class_slug: 'monk',
    source: 'phb-2014',
    data: {
      name: 'Way of the Four Elements',
      slug: 'way-of-the-four-elements',
      desc: `You follow a monastic tradition that teaches you to harness the elements. When you focus your ki, you can align yourself with the forces of creation and bend the four elements to your will, using them as an extension of your body. Some members of this tradition dedicate themselves to a single element, but others weave the elements together.

Many monks of this tradition tattoo their bodies with representations of their ki powers, commonly imagined as coiling dragons, but also as phoenixes, fish, plants, mountains, and cresting waves.

##### Disciple of the Elements

When you choose this tradition at 3rd level, you learn magical disciplines that harness the power of the four elements. A discipline requires you to spend ki points each time you use it.

You know the Elemental Attunement discipline and one other elemental discipline of your choice, which are detailed in the "Elemental Disciplines" section below. You learn one additional elemental discipline of your choice at 6th, 11th, and 17th level.

Whenever you learn a new elemental discipline, you can also replace one elemental discipline that you already know with a different discipline.

**_Casting Elemental Spells._** Some elemental disciplines allow you to cast spells. See chapter 10 for the general rules of spellcasting. To cast one of these spells, you use its casting time and other rules, but you don't need to provide material components for it.

Once you reach 5th level in this class, you can spend additional ki points to increase the level of an elemental discipline spell that you cast, provided that the spell has an enhanced effect at a higher level, as burning hands does. The spell's level increases by 1 for each additional ki point you spend. For example, if you are a 5th-level monk and use Sweeping Cinder Strike to cast burning hands, you can spend 3 ki points to cast it as a 2nd-level spell (the discipline's base cost of 2 ki points plus 1).

The maximum number of ki points you can spend to cast a spell in this way (including its base ki point cost and any additional ki points you spend to increase its level) is determined by your monk level: 5th–8th level (2 ki), 9th–12th level (3 ki), 13th–16th level (4 ki), 17th–20th level (5 ki).

##### Elemental Disciplines

The disciplines are presented in alphabetical order. If a discipline requires a level, you must be that level in this class to learn the discipline.

**_Breath of Winter (17th level required)._** You can spend 6 ki points to cast cone of cold.

**_Clench of the North Wind (6th level required)._** You can spend 3 ki points to cast hold person.

**_Eternal Mountain Defense (11th level required)._** You can spend 5 ki points to cast stoneskin, targeting yourself.

**_Elemental Attunement._** You can use your action to briefly control elemental forces nearby, causing one of the following effects of your choice: a harmless sensory effect, instantly light or snuff out a candle/torch/small campfire, chill or warm up to 1 pound of nonliving material for up to 1 hour, or cause earth/fire/water/fog to shape itself into a 1-foot cube for 1 minute.

**_Fangs of the Fire Snake._** When you use the Attack action on your turn, you can spend 1 ki point to cause tongues of fire to flicker from your fists and feet. Your reach with your unarmed strikes increases by 10 feet for that action, as well as the rest of the turn. A hit with such an attack deals fire damage instead of bludgeoning damage, and if you spend 1 ki point when the attack hits, it also deals an extra 1d10 fire damage.

**_Fist of Four Thunders._** You can spend 2 ki points to cast thunderwave.

**_Fist of Unbroken Air._** You can create a blast of compressed air that strikes like a mighty fist. As an action, you can spend 2 ki points and choose a creature within 30 feet of you. That creature must make a Strength saving throw. On a failed save, the creature takes 3d10 bludgeoning damage, plus an extra 1d10 bludgeoning damage for each additional ki point you spend, and you can push the creature up to 20 feet away from you and knock it prone. On a successful save, the creature takes half as much damage, and you don't push it or knock it prone.

**_Flames of the Phoenix (11th level required)._** You can spend 4 ki points to cast fireball.

**_Gong of the Summit (6th level required)._** You can spend 3 ki points to cast shatter.

**_Mist Stance (11th level required)._** You can spend 4 ki points to cast gaseous form, targeting yourself.

**_Ride the Wind (11th level required)._** You can spend 4 ki points to cast fly, targeting yourself.

**_River of Hungry Flame (17th level required)._** You can spend 5 ki points to cast wall of fire.

**_Rush of the Gale Spirits._** You can spend 2 ki points to cast gust of wind.

**_Shape the Flowing River._** As an action, you can spend 1 ki point to choose an area of ice or water no larger than 30 feet on a side within 120 feet of you. You can change water to ice within the area and vice versa, and you can reshape ice in the area in any manner you choose. You can raise or lower the ice's elevation, create or fill in a trench, erect or flatten a wall, or form a pillar. The extent of any such changes can't exceed half the area's largest dimension.

**_Sweeping Cinder Strike._** You can spend 2 ki points to cast burning hands.

**_Water Whip._** You can spend 2 ki points as a bonus action to create a whip of water that shoves and pulls a creature to unbalance it. A creature that you can see within 30 feet must make a Dexterity saving throw. On a failed save, it takes 3d10 bludgeoning damage, plus 1d10 bludgeoning damage for each additional ki point you spend, and you can either knock it prone or pull it up to 25 feet closer to you. On a successful save, the creature takes half damage and you don't pull it or knock it prone.

**_Wave of Rolling Earth (17th level required)._** You can spend 6 ki points to cast wall of stone.`,
    },
  },
  {
    slug: 'oath-of-the-ancients',
    class_slug: 'paladin',
    source: 'phb-2014',
    data: {
      name: 'Oath of the Ancients',
      slug: 'oath-of-the-ancients',
      desc: `The Oath of the Ancients is as old as the race of elves and the rituals of the druids. Sometimes called fey knights, green knights, or horned knights, paladins who swear this oath cast their lot with the side of the light in the cosmic struggle against darkness because they love the beautiful and life-giving things of the world, not necessarily because they believe in honor, courage, or justice. They adorn their armor and clothing with images of growing things — leaves, antlers, or flowers — to reflect their commitment to preserving life and light in the world.

##### Tenets of the Ancients

The tenets of the Oath of the Ancients have been preserved for uncounted centuries. This oath emphasizes the principles of good above any concerns of law or chaos. Its four central principles are simple.

**_Kindle the Light._** Through your acts of mercy, kindness, and forgiveness, kindle the light of hope in the world, beating back despair.

**_Shelter the Light._** Where there is good, beauty, love, and laughter in the world, stand against the wickedness that would swallow it. Where life flourishes, stand against the forces that would render it barren.

**_Preserve Your Own Light._** Delight in song and laughter, in beauty and art. If you allow the light to die in your own heart, you can't preserve it in the world.

**_Be the Light._** Be a glorious beacon for all who live in despair. Let the light of your joy and courage shine forth in all your deeds.

##### Oath Spells

You gain oath spells at the paladin levels listed.

| Paladin Level | Spells                                |
|---------------|---------------------------------------|
| 3rd           | ensnaring strike, speak with animals  |
| 5th           | moonbeam, misty step                  |
| 9th           | plant growth, protection from energy  |
| 13th          | ice storm, stoneskin                  |
| 17th          | commune with nature, tree stride      |

##### Channel Divinity

When you take this oath at 3rd level, you gain the following two Channel Divinity options.

**_Nature's Wrath._** You can use your Channel Divinity to invoke primeval forces to ensnare a foe. As an action, you can cause spectral vines to spring up and reach for a creature within 10 feet of you that you can see. The creature must succeed on a Strength or Dexterity saving throw (its choice) or be restrained. While restrained by the vines, the creature repeats the saving throw at the end of each of its turns. On a success, it frees itself and the vines vanish.

**_Turn the Faithless._** You can use your Channel Divinity to utter ancient words that are painful for fey and fiends to hear. As an action, you present your holy symbol, and each fey or fiend within 30 feet of you that can hear you must make a Wisdom saving throw. On a failed save, the creature is turned for 1 minute or until it takes damage.

A turned creature must spend its turns trying to move as far away from you as it can, and it can't willingly move to a space within 30 feet of you. It also can't take reactions. For its action, it can use only the Dash action or try to escape from an effect that prevents it from moving. If there's nowhere to move, the creature can use the Dodge action.

If the creature's true form is concealed by an illusion, shapeshifting, or other effect, that form is revealed while it is turned.

##### Aura of Warding

Starting at 7th level, ancient magic lies so heavily upon you that it forms an eldritch ward. You and friendly creatures within 10 feet of you have resistance to damage from spells.

At 18th level, the range of this aura increases to 30 feet.

##### Undying Sentinel

At 15th level, when you are reduced to 0 hit points and are not killed outright, you can choose to drop to 1 hit point instead. Once you use this ability, you can't use it again until you finish a long rest.

Additionally, you suffer none of the drawbacks of old age, and you can't be aged magically.

##### Elder Champion

At 20th level, you can assume the form of an ancient force of nature, taking on an appearance you choose. For example, your skin might turn green or take on a bark-like texture, your hair might become leafy or moss-like, or you might sprout antlers or a lion-like mane.

Using your action, you undergo a transformation. For 1 minute, you gain the following benefits: At the start of each of your turns, you regain 10 hit points. Once on each of your turns, you can cast a paladin spell with a casting time of 1 action as a bonus action. Enemy creatures within 10 feet of you have disadvantage on saving throws against your paladin spells and Channel Divinity options.

Once you use this feature, you can't use it again until you finish a long rest.`,
    },
  },
  {
    slug: 'oath-of-vengeance',
    class_slug: 'paladin',
    source: 'phb-2014',
    data: {
      name: 'Oath of Vengeance',
      slug: 'oath-of-vengeance',
      desc: `The Oath of Vengeance is a solemn commitment to punish those who have committed a grievous sin. When evil forces slaughter helpless villagers, when an entire people turns against the will of the gods, when a thieves' guild grows too violent and powerful, when a dragon rampages through the countryside — at times like these, paladins arise and swear an Oath of Vengeance to set right that which has gone wrong. To these paladins — sometimes called avengers or dark knights — their own purity is not as important as delivering justice.

##### Tenets of Vengeance

The tenets of the Oath of Vengeance vary by paladin, but all the tenets revolve around punishing wrongdoers by any means necessary. Paladins who uphold these tenets are willing to sacrifice even their own righteousness to mete out justice upon those who do evil, so the paladins are often neutral or lawful neutral in alignment. The core principles of the tenets are brutally simple.

**_Fight the Greater Evil._** Faced with a choice of fighting my sworn foes or combating a lesser evil, I choose the greater evil.

**_No Mercy for the Wicked._** Ordinary foes might win my mercy, but my sworn enemies do not.

**_By Any Means Necessary._** My qualms can't get in the way of exterminating my foes.

**_Restitution._** If my foes wreak ruin on the world, it is because I failed to stop them. I must help those harmed by their misdeeds.

##### Oath Spells

You gain oath spells at the paladin levels listed.

| Paladin Level | Spells                              |
|---------------|-------------------------------------|
| 3rd           | bane, hunter's mark                 |
| 5th           | hold person, misty step             |
| 9th           | haste, protection from energy       |
| 13th          | banishment, dimension door          |
| 17th          | scrying, hold monster               |

##### Channel Divinity

When you take this oath at 3rd level, you gain the following two Channel Divinity options.

**_Abjure Enemy._** As an action, you present your holy symbol and speak a prayer of denunciation, using your Channel Divinity. Choose one creature within 60 feet of you that you can see. That creature must make a Wisdom saving throw, unless it is immune to being frightened. Fiends and undead have disadvantage on this saving throw.

On a failed save, the creature is frightened for 1 minute or until it takes any damage. While frightened, the creature's speed is 0, and it can't benefit from any bonus to its speed.

On a successful save, the creature's speed is halved for 1 minute or until the creature takes any damage.

**_Vow of Enmity._** As a bonus action, you can utter a vow of enmity against a creature you can see within 10 feet of you, using your Channel Divinity. You gain advantage on attack rolls against the creature for 1 minute or until it drops to 0 hit points or falls unconscious.

##### Relentless Avenger

By 7th level, your supernatural focus helps you close off a foe's retreat. When you hit a creature with an opportunity attack, you can move up to half your speed immediately after the attack and as part of the same reaction. This movement doesn't provoke opportunity attacks.

##### Soul of Vengeance

Starting at 15th level, the authority with which you speak your Vow of Enmity gives you greater power over your foe. When a creature under the effect of your Vow of Enmity makes an attack, you can use your reaction to make a melee weapon attack against that creature if it is within range.

##### Avenging Angel

At 20th level, you can assume the form of an angelic avenger. Using your action, you undergo a transformation. For 1 hour, you gain the following benefits: wings sprout from your back and grant you a flying speed of 60 feet, you emanate an aura of menace in a 30-foot radius. The first time any enemy creature enters the aura or starts its turn there during a battle, the creature must succeed on a Wisdom saving throw or become frightened of you for 1 minute or until it takes any damage. Attack rolls against the frightened creature have advantage.

Once you use this feature, you can't use it again until you finish a long rest.`,
    },
  },
  {
    slug: 'beast-master',
    class_slug: 'ranger',
    source: 'phb-2014',
    data: {
      name: 'Beast Master',
      slug: 'beast-master',
      desc: `The Beast Master archetype embodies a friendship between the civilized races and the beasts of the world. United in focus, beast and ranger work as one to fight the monstrous foes that threaten civilization and the wilderness alike. Emulating the Beast Master archetype means committing yourself to this ideal, working in partnership with an animal as its companion and friend.

##### Ranger's Companion

At 3rd level, you learn to use your magic to create a powerful bond with a creature of the natural world.

With 8 hours of work and the expenditure of 50 gp worth of rare herbs and fine food, you call forth an animal from the wilderness to serve as your faithful companion. You normally select your companion from among the following animals: an ape, a black bear, a boar, a giant badger, a giant weasel, a mule, a panther, a wolf, or any other beast no larger than Medium and that has a challenge rating of 1/4 or lower (the GM might pick one of these animals for you, based on the surrounding terrain and on what types of creatures would logically be present in the area). The beast becomes your companion.

Add your proficiency bonus to the beast's AC, attack rolls, and damage rolls, as well as to any saving throws and skills it is proficient in. Its hit point maximum equals its normal maximum or four times your ranger level, whichever is higher.

The beast obeys your commands as best as it can. It takes its turn on your initiative, though it doesn't take an action unless you command it to. On your turn, you can verbally command the beast where to move (no action required by you). You can use your action to verbally command it to take the Attack, Dash, Disengage, or Help action. Once you have the Extra Attack feature, you can make one weapon attack yourself when you command the beast to take the Attack action.

While traveling through your favored terrain with only the beast, you can move stealthily at a normal pace. If the beast dies, you can obtain another one by spending 8 hours magically bonding with another beast that isn't hostile to you, either the same type of beast as before or a different one.

##### Exceptional Training

Beginning at 7th level, on any of your turns when your beast companion doesn't attack, you can use a bonus action to command the beast to take the Dash, Disengage, Dodge, or Help action on its turn.

In addition, the beast's attacks count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.

##### Bestial Fury

Starting at 11th level, your beast companion can make two attacks when you command it to use the Attack action.

##### Share Spells

Beginning at 15th level, when you cast a spell targeting yourself, you can also affect your beast companion with the spell if the beast is within 30 feet of you.`,
    },
  },
  {
    slug: 'assassin',
    class_slug: 'rogue',
    source: 'phb-2014',
    data: {
      name: 'Assassin',
      slug: 'assassin',
      desc: `You focus your training on the grim art of death. Those who adhere to this archetype are diverse: hired killers, spies, bounty hunters, and even specially anointed priests trained to gain the trust of mortals so they can be slain in the name of a god. Stealth, poison, and disguise help you eliminate your foes with deadly efficiency.

##### Bonus Proficiencies

When you choose this archetype at 3rd level, you gain proficiency with the disguise kit and the poisoner's kit.

##### Assassinate

Starting at 3rd level, you are at your deadliest when you get the drop on your enemies. You have advantage on attack rolls against any creature that hasn't taken a turn in the combat yet. In addition, any hit you score against a creature that is surprised is a critical hit.

##### Infiltration Expertise

Starting at 9th level, you can unfailingly create false identities for yourself. You must spend seven days and 25 gp to establish the history, profession, and affiliations for an identity. You can't establish an identity that belongs to someone else. For example, you might acquire appropriate clothing, letters of introduction, and official-looking certification to establish yourself as a member of a trading house from a remote city so you can insinuate yourself into the company of other wealthy merchants.

Thereafter, if you adopt the new identity as a disguise, other creatures believe you to be that person until given an obvious reason not to.

##### Impostor

At 13th level, you gain the ability to unerringly mimic another person's speech, writing, and behavior. You must spend at least three hours studying these three components of the person's behavior, listening to speech, examining handwriting, and observing mannerisms.

Your ruse is indiscernible to the casual observer. If a wary creature suspects something is amiss, you have advantage on any Charisma (Deception) check you make to avoid detection.

##### Death Strike

Starting at 17th level, you become a master of instant death. When you attack and hit a creature that is surprised, it must make a Constitution saving throw (DC 8 + your Dexterity modifier + your proficiency bonus). On a failed save, double the damage of your attack against the creature.`,
    },
  },
  {
    slug: 'arcane-trickster',
    class_slug: 'rogue',
    source: 'phb-2014',
    data: {
      name: 'Arcane Trickster',
      slug: 'arcane-trickster',
      desc: `Some rogues enhance their fine-honed skills of stealth and agility with magic, learning tricks of enchantment and illusion. These rogues include pickpockets and burglars, but also pranksters, mischief-makers, and a significant number of adventurers.

##### Spellcasting

When you reach 3rd level, you augment your martial prowess with the ability to cast spells.

**_Cantrips._** You learn three cantrips: mage hand and two other cantrips of your choice from the wizard spell list. You learn another wizard cantrip of your choice at 10th level.

**_Spell Slots._** The Arcane Trickster Spellcasting table shows how many spell slots you have to cast your wizard spells of 1st level and higher. To cast one of these spells, you must expend a slot of the spell's level or higher. You regain all expended spell slots when you finish a long rest.

**_Spells Known of 1st-Level and Higher._** You know three 1st-level wizard spells of your choice, two of which you must choose from the enchantment and illusion spells on the wizard spell list.

The Spells Known column of the Arcane Trickster Spellcasting table shows when you learn more wizard spells of 1st level or higher. Each of these spells must be an enchantment or illusion spell of your choice, and must be of a level for which you have spell slots. For instance, when you reach 7th level in this class, you can learn one new spell of 1st or 2nd level.

The spells you learn at 8th, 14th, and 20th level can come from any school of magic.

Whenever you gain a level in this class, you can replace one of the wizard spells you know with another spell of your choice from the wizard spell list. The new spell must be of a level for which you have spell slots, and it must be an enchantment or illusion spell, unless you're replacing the spell you gained at 3rd, 8th, 14th, or 20th level from any school of magic.

**_Spellcasting Ability._** Intelligence is your spellcasting ability for your wizard spells, since you learn your spells through dedicated study and memorization. You use your Intelligence whenever a spell refers to your spellcasting ability. In addition, you use your Intelligence modifier when setting the saving throw DC for a wizard spell you cast and when making an attack roll with one.

**Spell save DC** = 8 + your proficiency bonus + your Intelligence modifier

**Spell attack modifier** = your proficiency bonus + your Intelligence modifier

##### Mage Hand Legerdemain

Starting at 3rd level, when you cast mage hand, you can make the spectral hand invisible, and you can perform the following additional tasks with it: stow one object the hand is holding in a container worn or carried by another creature; retrieve an object in a container worn or carried by another creature; use thieves' tools to pick locks and disarm traps at range. You can perform one of these tasks without being noticed by a creature if you succeed on a Dexterity (Sleight of Hand) check contested by the creature's Wisdom (Perception) check.

In addition, you can use the bonus action granted by your Cunning Action to control the hand.

##### Magical Ambush

Starting at 9th level, if you are hidden from a creature when you cast a spell on it, the creature has disadvantage on any saving throw it makes against the spell this turn.

##### Versatile Trickster

At 13th level, you gain the ability to distract targets with your mage hand. As a bonus action on your turn, you can designate a creature within 5 feet of the spectral hand created by the spell. Doing so gives you advantage on attack rolls against that creature until the end of the turn.

##### Spell Thief

At 17th level, you gain the ability to magically steal the knowledge of how to cast a spell from another spellcaster.

Immediately after a creature casts a spell that targets you or includes you in its area of effect, you can use your reaction to force the creature to make a saving throw with its spellcasting ability modifier. The DC equals your spell save DC. On a failed save, you negate the spell's effect against you, and you steal the knowledge of the spell if it is at least 1st level and of a level you can cast (it doesn't need to be a wizard spell). For the next 8 hours, you know the spell and can cast it using your spell slots. The creature can't cast that spell until the 8 hours have passed.

Once you use this feature, you can't use it again until you finish a long rest.`,
    },
  },
  {
    slug: 'wild-magic',
    class_slug: 'sorcerer',
    source: 'phb-2014',
    data: {
      name: 'Wild Magic',
      slug: 'wild-magic',
      desc: `Your innate magic comes from the wild forces of chaos that underlie the order of creation. You might have endured exposure to some form of raw magic, perhaps through a planar portal leading to Limbo, the Elemental Planes, or the mysterious Far Realm. Perhaps you were blessed by a powerful fey creature or marked by a demon. Or your magic could be a fluke of your birth, with no apparent cause or reason. However it came to be, this magic churns within you, waiting for any outlet.

##### Wild Magic Surge

Starting when you choose this origin at 1st level, your spellcasting can unleash surges of untamed magic. Immediately after you cast a sorcerer spell of 1st level or higher, the DM can have you roll a d20. If you roll a 1, roll on the Wild Magic Surge table to create a random magical effect. A surge effect runs its course before you can roll on the table again.

If a surge effect is a spell, it is too wild to be affected by Metamagic. If it normally requires concentration, it doesn't require concentration in this case; the spell lasts for its full duration.

##### Tides of Chaos

Starting at 1st level, you can manipulate the forces of chance and chaos to gain advantage on one attack roll, ability check, or saving throw. Once you do so, you must finish a long rest before you can use this feature again.

Any time before you regain the use of this feature, the DM can have you roll on the Wild Magic Surge table immediately after you cast a sorcerer spell of 1st level or higher. You then regain the use of this feature.

##### Bend Luck

Starting at 6th level, you have the ability to twist fate using your wild magic. When another creature you can see makes an attack roll, an ability check, or a saving throw, you can use your reaction and spend 2 sorcery points to roll 1d4 and apply the number rolled as a bonus or penalty (your choice) to the creature's roll. You can do so after the creature rolls but before any effects of the roll occur.

##### Controlled Chaos

At 14th level, you gain a modicum of control over the surges of your wild magic. Whenever you roll on the Wild Magic Surge table, you can roll twice and use either number.

##### Spell Bombardment

Beginning at 18th level, the harmful energy of your spells intensifies. When you roll damage for a spell and roll the highest number possible on any of the dice, choose one of those dice, roll it again and add that roll to the damage. You can use the feature only once per turn.

##### Wild Magic Surge Table (d100)

01–02. Roll on this table at the start of each of your turns for the next minute, ignoring this result on subsequent rolls.

03–04. For the next minute, you can see any invisible creature if you have line of sight to it.

05–06. A modron chosen and controlled by the DM appears in an unoccupied space within 5 feet of you, then disappears 1 minute later.

07–08. You cast fireball as a 3rd-level spell centered on yourself.

09–10. You cast magic missile as a 5th-level spell.

11–12. Roll a d10. Your height changes by a number of inches equal to the roll. If the roll is odd, you shrink. If the roll is even, you grow.

13–14. You cast confusion centered on yourself.

15–16. For the next minute, you regain 5 hit points at the start of each of your turns.

17–18. You grow a long beard made of feathers that remains until you sneeze, at which point the feathers explode out from your face.

19–20. You cast grease centered on yourself.

21–22. Creatures have disadvantage on saving throws against the next spell you cast in the next minute that involves a saving throw.

23–24. Your skin turns a vibrant shade of blue. A remove curse spell can end this effect.

25–26. An eye appears on your forehead for the next minute. During that time, you have advantage on Wisdom (Perception) checks that rely on sight.

27–28. For the next minute, all your spells with a casting time of 1 action have a casting time of 1 bonus action.

29–30. You teleport up to 60 feet to an unoccupied space of your choice that you can see.

31–32. You are transported to the Astral Plane until the end of your next turn, after which time you return to the space you previously occupied or the nearest unoccupied space if that space is occupied.

33–34. Maximize the damage of the next damaging spell you cast within the next minute.

35–36. Roll a d10. Your age changes by a number of years equal to the roll. If the roll is odd, you get younger (minimum 1 year old). If the roll is even, you get older.

37–38. 1d6 flumphs controlled by the DM appear in unoccupied spaces within 60 feet of you and are frightened of you. They vanish after 1 minute.

39–40. You regain 2d10 hit points.

41–42. You turn into a potted plant until the start of your next turn. While a plant, you are incapacitated and have vulnerability to all damage. If you drop to 0 hit points, your pot breaks, and your form reverts.

43–44. For the next minute, you can teleport up to 20 feet as a bonus action on each of your turns.

45–46. You cast levitate on yourself.

47–48. A unicorn controlled by the DM appears in a space within 5 feet of you, then disappears 1 minute later.

49–50. You can't speak for the next minute. Whenever you try, pink bubbles float out of your mouth.

51–52. A spectral shield hovers near you for the next minute, granting you a +2 bonus to AC and immunity to magic missile.

53–54. You are immune to being intoxicated by alcohol for the next 5d6 days.

55–56. Your hair falls out but grows back within 24 hours.

57–58. For the next minute, any flammable object you touch that isn't being worn or carried by another creature bursts into flame.

59–60. You regain your lowest-level expended spell slot.

61–62. For the next minute, you must shout when you speak.

63–64. You cast fog cloud centered on yourself.

65–66. Up to three creatures you choose within 30 feet of you take 4d10 lightning damage.

67–68. You are frightened by the nearest creature until the end of your next turn.

69–70. Each creature within 30 feet of you becomes invisible for the next minute. The invisibility ends on a creature when it attacks or casts a spell.

71–72. You gain resistance to all damage for the next minute.

73–74. A random creature within 60 feet of you becomes poisoned for 1d4 hours.

75–76. You glow with bright light in a 30-foot radius for the next minute. Any creature that ends its turn within 5 feet of you is blinded until the end of its next turn.

77–78. You cast polymorph on yourself. If you fail the saving throw, you turn into a sheep for the spell's duration.

79–80. Illusory butterflies and flower petals flutter in the air within 10 feet of you for the next minute.

81–82. You can take one additional action immediately.

83–84. Each creature within 30 feet of you takes 1d10 necrotic damage. You regain hit points equal to the sum of the necrotic damage dealt.

85–86. You cast mirror image.

87–88. You cast fly on a random creature within 60 feet of you.

89–90. You become invisible for the next minute. During that time, other creatures can't hear you. The invisibility ends if you attack or cast a spell.

91–92. If you die within the next minute, you immediately come back to life as if by the reincarnate spell.

93–94. Your size increases by one category for the next minute.

95–96. You and all creatures within 30 feet of you gain vulnerability to piercing damage for the next minute.

97–98. You are surrounded by faint, ethereal music for the next minute.

99–00. You regain all expended sorcery points.`,
    },
  },
  {
    slug: 'the-archfey',
    class_slug: 'warlock',
    source: 'phb-2014',
    data: {
      name: 'The Archfey',
      slug: 'the-archfey',
      desc: `Your patron is a lord or lady of the fey, a creature of legend who holds secrets that were forgotten before the mortal races were born. This being's motivations are often inscrutable, and sometimes whimsical, and might involve a striving for greater magical power or the settling of age-old grudges. Beings of this sort include the Prince of Frost; the Queen of Air and Darkness, ruler of the Gloaming Court; Titania of the Summer Court; her consort Oberon, the Green Lord; Hyrsam, the Prince of Fools; and ancient hags.

##### Expanded Spell List

The Archfey lets you choose from an expanded list of spells when you learn a warlock spell. The following spells are added to the warlock spell list for you.

| Spell Level | Spells                                          |
|-------------|-------------------------------------------------|
| 1st         | faerie fire, sleep                              |
| 2nd         | calm emotions, phantasmal force                 |
| 3rd         | blink, plant growth                             |
| 4th         | dominate beast, greater invisibility            |
| 5th         | dominate person, seeming                        |

##### Fey Presence

Starting at 1st level, your patron bestows upon you the ability to project the beguiling and fearsome presence of the fey. As an action, you can cause each creature in a 10-foot cube originating from you to make a Wisdom saving throw against your warlock spell save DC. The creatures that fail their saving throws are all charmed or frightened by you (your choice) until the end of your next turn.

Once you use this feature, you can't use it again until you finish a short or long rest.

##### Misty Escape

Starting at 6th level, you can vanish in a puff of mist in response to harm. When you take damage, you can use your reaction to turn invisible and teleport up to 60 feet to an unoccupied space you can see. You remain invisible until the start of your next turn or until you attack or cast a spell.

Once you use this feature, you can't use it again until you finish a short or long rest.

##### Beguiling Defenses

Beginning at 10th level, your patron teaches you how to turn the mind-affecting magic of your enemies against them. You are immune to being charmed, and when another creature attempts to charm you, you can use your reaction to attempt to turn the charm back on that creature. The creature must succeed on a Wisdom saving throw against your warlock spell save DC or be charmed by you for 1 minute or until the creature takes any damage.

##### Dark Delirium

Starting at 14th level, you can plunge a creature into an illusory realm. As an action, choose a creature that you can see within 60 feet of you. It must make a Wisdom saving throw against your warlock spell save DC. On a failed save, it is charmed or frightened by you (your choice) for 1 minute or until your concentration is broken (as if you are concentrating on a spell). This effect ends early if the creature takes any damage.

Until this illusion ends, the creature thinks it is lost in a misty realm, the appearance of which you choose. The creature can see and hear only itself, you, and the illusion.

You must finish a short or long rest before you can use this feature again.`,
    },
  },
  {
    slug: 'the-great-old-one',
    class_slug: 'warlock',
    source: 'phb-2014',
    data: {
      name: 'The Great Old One',
      slug: 'the-great-old-one',
      desc: `Your patron is a mysterious entity whose nature is utterly foreign to the fabric of reality. It might come from the Far Realm, the space beyond reality, or it could be one of the elder gods known only in legends. Its motives are incomprehensible to mortals, and its knowledge so immense and ancient that even the greatest libraries pale in comparison to the vast secrets it holds. The Great Old One might be unaware of your existence or entirely indifferent to you, but the secrets you have learned allow you to draw your magic from it.

Entities of this type include Ghaunadar, called That Which Lurks; Tharizdun, the Chained God; Dendar, the Night Serpent; Zargon, the Returner; Great Cthulhu; and other unfathomable beings.

##### Expanded Spell List

The Great Old One lets you choose from an expanded list of spells when you learn a warlock spell. The following spells are added to the warlock spell list for you.

| Spell Level | Spells                                          |
|-------------|-------------------------------------------------|
| 1st         | dissonant whispers, Tasha's hideous laughter    |
| 2nd         | detect thoughts, phantasmal force               |
| 3rd         | clairvoyance, sending                           |
| 4th         | dominate beast, Evard's black tentacles         |
| 5th         | dominate person, telekinesis                    |

##### Awakened Mind

Starting at 1st level, your alien knowledge gives you the ability to touch the minds of other creatures. You can communicate telepathically with any creature you can see within 30 feet of you. You don't need to share a language with the creature for it to understand your telepathic utterances, but the creature must be able to understand at least one language.

##### Entropic Ward

At 6th level, you learn to magically ward yourself against attack and to turn an enemy's failed strike into good luck for yourself. When a creature makes an attack roll against you, you can use your reaction to impose disadvantage on that roll. If the attack misses you, your next attack roll against the creature has advantage if you make it before the end of your next turn.

Once you use this feature, you can't use it again until you finish a short or long rest.

##### Thought Shield

Starting at 10th level, your thoughts can't be read by telepathy or other means unless you allow it. You also have resistance to psychic damage, and whenever a creature deals psychic damage to you, that creature takes the same amount of damage that you do.

##### Create Thrall

At 14th level, you gain the ability to infect a humanoid's mind with the alien magic of your patron. You can use your action to touch an incapacitated humanoid. That creature is then charmed by you until a remove curse spell is cast on it, the charmed condition is removed from it, or you use this feature again.

You can communicate telepathically with the charmed creature as long as the two of you are on the same plane of existence.`,
    },
  },
];

// ─────────────── Run ───────────────
function run() {
  initSchema();

  const bgStmt = db.prepare(
    `INSERT OR REPLACE INTO backgrounds (slug, name, data, source) VALUES (?, ?, ?, ?)`,
  );
  const featStmt = db.prepare(
    `INSERT OR REPLACE INTO feats (slug, name, data, source) VALUES (?, ?, ?, ?)`,
  );
  const subStmt = db.prepare(
    `INSERT OR REPLACE INTO subclasses (slug, name, class_slug, data, source) VALUES (?, ?, ?, ?, ?)`,
  );
  const raceStmt = db.prepare(
    `INSERT OR REPLACE INTO races (slug, name, data, source) VALUES (?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (const b of BACKGROUNDS) bgStmt.run(b.slug, b.data.name, JSON.stringify(b.data), b.source);
    for (const f of FEATS) featStmt.run(f.slug, f.data.name, JSON.stringify(f.data), f.source);
    for (const s of SUBCLASSES) subStmt.run(s.slug, s.data.name, s.class_slug, JSON.stringify(s.data), s.source);
    for (const r of RACES) raceStmt.run(r.slug, r.data.name, JSON.stringify(r.data), r.source);
  })();

  console.log(`✅ Seeded ${BACKGROUNDS.length} backgrounds + ${FEATS.length} feats + ${SUBCLASSES.length} subclasses + ${RACES.length} races (source: phb-2014)`);
}

run();
