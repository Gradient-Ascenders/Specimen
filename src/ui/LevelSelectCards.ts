import { menuIconMarkup as icon } from './MenuIcons.ts';

const LEVELS = [
  { id: 'level-1', number: 1, name: 'Containment', image: 'containment',
    description: 'Wake up, master Bob’s movement and free Goop.' },
  { id: 'level-2', number: 2, name: 'Cultivation', image: 'cultivation',
    description: 'Combine Bob and Goop’s abilities to reach Volt.' },
  { id: 'level-3', number: 3, name: 'Blackout', image: 'blackout',
    description: 'Restore power and find a way out of the facility.' },
] as const;

export const createLevelSelectCards = (): string => LEVELS.map(level => `
  <button type="button" class="menu-action level-preview-card" data-action="select-level" data-level="${level.id}"
    aria-labelledby="${level.id}-name" aria-describedby="${level.id}-description" ${level.number === 1 ? 'data-autofocus' : ''}>
    <span class="level-card-image" aria-hidden="true"><img data-level-preview="./assets/ui/level-previews/${level.image}.jpg"
      alt="" width="480" height="270" decoding="async"></span>
    <span class="level-card-copy"><span id="${level.id}-name" class="level-card-name"><small>Level ${level.number}</small><strong>${level.name}</strong></span>
      <span id="${level.id}-description" class="level-card-description">${level.description}</span></span>
    <span class="level-card-arrow" aria-hidden="true">${icon('ArrowRight')}</span>
  </button>`).join('');

/** No src exists until the selector opens, so boot never downloads previews. */
export function loadLevelPreviews(panel: HTMLElement): void {
  for (const image of panel.querySelectorAll<HTMLImageElement>('img[data-level-preview]')) {
    if (image.hasAttribute('src')) continue;
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    image.src = image.dataset.levelPreview!;
  }
}
