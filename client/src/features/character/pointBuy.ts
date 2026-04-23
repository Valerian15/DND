// 5e Point-Buy rules:
// You start with 8 in every ability, 27 points to spend.
// Scores 8-13 cost 1 point per +1.
// Score 14 costs 2 points. Score 15 costs 2 points.
// Max 15 before racial bonuses. Min 8.

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

const COST_TABLE: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointCost(score: number): number {
  return COST_TABLE[score] ?? 0;
}

export function totalSpent(scores: number[]): number {
  return scores.reduce((sum, s) => sum + pointCost(s), 0);
}

export function remaining(scores: number[]): number {
  return POINT_BUY_BUDGET - totalSpent(scores);
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
