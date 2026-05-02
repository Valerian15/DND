import { describe, it, expect } from 'vitest';
import { parseRaceGrants } from './raceParse';

describe('parseRaceGrants', () => {
  it('extracts walking speed from race.speed.walk', () => {
    expect(parseRaceGrants({ speed: { walk: 25 } }).speed).toBe(25);
    expect(parseRaceGrants({ speed: { walk: 35 } }).speed).toBe(35);
  });

  it('defaults speed to 30 when missing', () => {
    expect(parseRaceGrants({}).speed).toBe(30);
    expect(parseRaceGrants({ speed: {} }).speed).toBe(30);
  });

  it('extracts known languages from the languages text', () => {
    const grants = parseRaceGrants({
      languages: '**_Languages._** You can speak, read, and write Common and Dwarvish.',
    });
    expect(grants.languages).toContain('Common');
    expect(grants.languages).toContain('Dwarvish');
  });

  it('extracts exotic languages', () => {
    const grants = parseRaceGrants({
      languages: 'You can speak, read, and write Common and Infernal.',
    });
    expect(grants.languages).toEqual(expect.arrayContaining(['Common', 'Infernal']));
  });

  it('returns empty languages when text is missing', () => {
    expect(parseRaceGrants({}).languages).toEqual([]);
  });

  it('does not match unknown words as languages', () => {
    const grants = parseRaceGrants({
      languages: 'You can speak Aklo, Cyrillic, and Klingon.',
    });
    expect(grants.languages).toEqual([]);
  });

  it('extracts damage resistances from "resistance to X damage"', () => {
    const grants = parseRaceGrants({
      traits: '**_Hellish Resistance._** You have resistance to fire damage.',
    });
    expect(grants.resistances).toEqual(['fire']);
  });

  it('extracts "resistance against X damage" too', () => {
    const grants = parseRaceGrants({
      traits: 'You have resistance against poison damage and advantage on saves.',
    });
    expect(grants.resistances).toEqual(['poison']);
  });

  it('extracts multiple resistances and dedupes', () => {
    const grants = parseRaceGrants({
      traits: 'Resistance to fire damage. Resistance against cold damage. Resistance to fire damage.',
    });
    expect(grants.resistances.sort()).toEqual(['cold', 'fire']);
  });

  it('skips unknown damage types', () => {
    const grants = parseRaceGrants({
      traits: 'Resistance to ennui damage.',
    });
    expect(grants.resistances).toEqual([]);
  });

  it('returns no resistances when traits text is empty', () => {
    expect(parseRaceGrants({}).resistances).toEqual([]);
    expect(parseRaceGrants({ traits: '' }).resistances).toEqual([]);
  });

  it('full dwarf example: speed 25, Common+Dwarvish, poison resistance', () => {
    const grants = parseRaceGrants({
      speed: { walk: 25 },
      languages: '**_Languages._** You can speak, read, and write Common and Dwarvish.',
      traits: '**_Dwarven Resilience._** You have advantage on saves against poison, and you have resistance against poison damage.',
    });
    expect(grants.speed).toBe(25);
    expect(grants.languages.sort()).toEqual(['Common', 'Dwarvish']);
    expect(grants.resistances).toEqual(['poison']);
  });

  it('full tiefling example: speed 30, Common+Infernal, fire resistance', () => {
    const grants = parseRaceGrants({
      speed: { walk: 30 },
      languages: 'You can speak, read, and write Common and Infernal.',
      traits: '**_Hellish Resistance._** You have resistance to fire damage.',
    });
    expect(grants.speed).toBe(30);
    expect(grants.languages.sort()).toEqual(['Common', 'Infernal']);
    expect(grants.resistances).toEqual(['fire']);
  });
});
