export const TITLE_SPECIMEN_ORDER = ['goop', 'bob', 'volt'] as const;
export type TitleSpecimenId = typeof TITLE_SPECIMEN_ORDER[number];

export interface TitleSpecimenRegion {
  readonly id: TitleSpecimenId;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const TITLE_SPECIMEN_VIEWS = {
  bob: { label: 'Specimen / B–01', name: 'Bob · Adhesive specimen', ability: 'Charged jump', color: '#80e3f2' },
  goop: { label: 'Specimen / G–02', name: 'Goop · Corrosive specimen', ability: 'Acid projectile', color: '#a9ec60' },
  volt: { label: 'Specimen / V–03', name: 'Volt · Electrical specimen', ability: 'Light emission', color: '#ffe17c' },
} as const;

export function isTitleSpecimenId(value: string | undefined): value is TitleSpecimenId {
  return TITLE_SPECIMEN_ORDER.some(id => id === value);
}
