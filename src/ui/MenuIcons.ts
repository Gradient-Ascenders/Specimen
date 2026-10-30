import { Activity, Accessibility, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Circle, CircleCheck, Code, Cpu, Crosshair, Cuboid, Download, ExternalLink, EyeOff, Flag, Info, Keyboard, List, LoaderCircle, Monitor, Mouse, Music2, Pause, Play, RotateCcw, Settings, SkipForward, Square, Triangle, Type, Volume2 } from 'lucide';

const icons = { Activity, Accessibility, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Circle, CircleCheck, Code, Cpu, Crosshair, Cuboid, Download, ExternalLink, EyeOff, Flag, Info, Keyboard, List, LoaderCircle, Monitor, Mouse, Music2, Pause, Play, RotateCcw, Settings, SkipForward, Square, Triangle, Type, Volume2 };
export type MenuIconName = keyof typeof icons;

/** Serialize only trusted Lucide nodes, without depending on a global document. */
export function menuIconMarkup(name: MenuIconName, hidden = false): string {
  const shapes = icons[name].map(([tag, attributes]) => `<${tag} ${Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ')}></${tag}>`).join('');
  return `<svg class="ui-icon" data-ui-icon="${name}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${hidden ? ' hidden' : ''}>${shapes}</svg>`;
}
