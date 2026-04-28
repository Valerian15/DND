import type { ClassResource } from './types';

export function defaultResourcesForClass(classSlug: string, level: number): ClassResource[] {
  switch (classSlug) {
    case 'barbarian': {
      const max = level >= 17 ? 6 : level >= 12 ? 5 : level >= 9 ? 4 : level >= 6 ? 3 : 2;
      return [{ name: 'Rage', current: max, max, reset: 'long' }];
    }
    case 'monk':
      return [{ name: 'Ki Points', current: level, max: level, reset: 'short' }];
    case 'bard':
      return [{ name: 'Bardic Inspiration', current: 1, max: 1, reset: 'long' }];
    case 'cleric':
      return [{ name: 'Channel Divinity', current: 1, max: 1, reset: 'short' }];
    case 'druid':
      return [{ name: 'Wild Shape', current: 2, max: 2, reset: 'short' }];
    case 'fighter':
      return [
        { name: 'Action Surge', current: 1, max: 1, reset: 'short' },
        { name: 'Second Wind', current: 1, max: 1, reset: 'short' },
      ];
    case 'paladin':
      return [{ name: 'Channel Divinity', current: 1, max: 1, reset: 'short' }];
    case 'sorcerer':
      return [{ name: 'Sorcery Points', current: level, max: level, reset: 'long' }];
    case 'wizard':
      return [{ name: 'Arcane Recovery', current: 1, max: 1, reset: 'long' }];
    default:
      return [];
  }
}
