// 5e encounter difficulty math (DMG p.82).
// CR → XP value table, party threshold table, and group-size multiplier.

const CR_TO_XP: Record<string, number> = {
  '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
  '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
  '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

export function crToXp(cr: number | null | undefined): number {
  if (cr == null) return 0;
  return CR_TO_XP[String(cr)] ?? 0;
}

interface ThresholdRow { easy: number; medium: number; hard: number; deadly: number }

const XP_THRESHOLDS: ThresholdRow[] = [
  { easy: 0, medium: 0, hard: 0, deadly: 0 }, // level 0 placeholder
  { easy: 25, medium: 50, hard: 75, deadly: 100 },     // 1
  { easy: 50, medium: 100, hard: 150, deadly: 200 },   // 2
  { easy: 75, medium: 150, hard: 225, deadly: 400 },   // 3
  { easy: 125, medium: 250, hard: 375, deadly: 500 },  // 4
  { easy: 250, medium: 500, hard: 750, deadly: 1100 }, // 5
  { easy: 300, medium: 600, hard: 900, deadly: 1400 }, // 6
  { easy: 350, medium: 750, hard: 1100, deadly: 1700 },// 7
  { easy: 450, medium: 900, hard: 1400, deadly: 2100 },// 8
  { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },// 9
  { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },// 10
  { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },// 11
  { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },// 12
  { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },// 13
  { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },// 14
  { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },// 15
  { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },// 16
  { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },// 17
  { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },// 18
  { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },// 19
  { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },// 20
];

export function partyThresholds(levels: number[]): ThresholdRow {
  let easy = 0, medium = 0, hard = 0, deadly = 0;
  for (const lvl of levels) {
    const row = XP_THRESHOLDS[Math.min(20, Math.max(1, lvl))];
    easy += row.easy; medium += row.medium; hard += row.hard; deadly += row.deadly;
  }
  return { easy, medium, hard, deadly };
}

// 5e DMG group-size multiplier — applied to summed monster XP before comparing to party thresholds.
export function encounterMultiplier(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

export type Difficulty = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly';

export function difficultyOf(adjustedXp: number, t: ThresholdRow): Difficulty {
  if (adjustedXp >= t.deadly) return 'Deadly';
  if (adjustedXp >= t.hard) return 'Hard';
  if (adjustedXp >= t.medium) return 'Medium';
  if (adjustedXp >= t.easy) return 'Easy';
  return 'Trivial';
}

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Trivial: '#888',
  Easy:    '#4a8',
  Medium:  '#cc7700',
  Hard:    '#c44',
  Deadly:  '#7a0000',
};
