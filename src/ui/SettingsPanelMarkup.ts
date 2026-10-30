import { KEY_BINDING_ACTIONS } from '../core/KeyBindings.ts';
import { menuIconMarkup as icon } from './MenuIcons.ts';
import { MAX_FOLLOW_DISTANCE_METRES, MIN_FOLLOW_DISTANCE_METRES } from '../render/CameraRig.ts';

const sections = [
  ['graphics', 'Graphics', 'Cpu'],
  ['display', 'Display', 'Monitor'],
  ['audio', 'Audio', 'Volume2'],
  ['controls', 'Controls', 'Mouse'],
  ['accessibility', 'Accessibility', 'Accessibility'],
] as const;

const description = (id: string, note?: string): string => note ? ` aria-describedby="${id}-note"` : '';
const hint = (id: string, note?: string): string => note ? `<p class="setting-note" id="${id}-note">${note}</p>` : '';

const range = (id: string, key: string, label: string, min: number, max: number, step: number, note?: string): string => `
  <div class="setting-row setting-range-row">
    <div class="setting-heading"><label for="${id}">${label}</label><output for="${id}" data-setting-output="${key}"></output></div>
    <input id="${id}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}"${description(id, note)}>
    ${hint(id, note)}
  </div>`;

const select = (id: string, key: string, label: string, options: string, note?: string): string => `
  <div class="setting-row setting-select-row">
    <div class="setting-heading"><label for="${id}">${label}</label><output for="${id}" data-setting-output="${key}" hidden></output></div>
    <select id="${id}" data-setting="${key}"${description(id, note)}>${options}</select>
    ${hint(id, note)}
  </div>`;

const toggle = (id: string, key: string, label: string, note?: string): string => `
  <label class="setting-row setting-toggle-row" for="${id}">
    <span class="setting-heading"><span>${label}</span><output for="${id}" data-setting-output="${key}"></output></span>
    <input id="${id}" data-setting="${key}" type="checkbox"${description(id, note)}>
    ${note ? `<span class="setting-note" id="${id}-note">${note}</span>` : ''}
  </label>`;

/** Static, labelled sections; no settings value is interpolated as HTML. */
export function createSettingsPanelMarkup(): string {
  return `<section class="flow-screen submenu-screen settings-screen" data-flow-panel="settings" aria-labelledby="settings-heading" hidden>
    <div class="system-panel lab-menu-panel settings-panel">
      <header class="system-panel-header">
        <span class="signal-bar" aria-hidden="true"></span>
        <h1 id="settings-heading">Settings</h1>
      </header>
      <div class="settings-section-links" role="tablist" aria-label="Settings categories">
        ${sections.map(([id, label, symbol], index) => `<button type="button" role="tab" id="settings-tab-${id}"
          data-action="settings-section" data-section="${id}" aria-controls="settings-${id}"
          aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" ${index === 0 ? 'data-autofocus' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('')}
      </div>
      <div class="settings-sections" tabindex="-1">
        <fieldset class="settings-section" id="settings-graphics" role="tabpanel" aria-labelledby="settings-tab-graphics"><legend class="graphics-legend">Graphics</legend>
          <div class="graphics-preset-selector">
            ${select('graphics-profile', 'graphics-profile', 'Preset', `
              <option value="minimum">Low</option>
              <option value="standard">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
              <option value="custom">Custom</option>`)}
            <button type="button" class="system-action graphics-auto-detect" data-action="calibrate-graphics">${icon('RotateCcw')}<span>Auto-detect</span></button>
          </div>
          <div class="graphics-settings-grid">
            <section class="graphics-settings-group" aria-labelledby="graphics-image-heading">
              <h2 id="graphics-image-heading">${icon('Monitor')}<span>Image</span></h2>
              ${select('render-scale', 'render-scale', 'Render scale', `
                <option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option>`)}
              ${select('render-resolution', 'render-resolution', 'Pixel density', `
                <option value="0.75">0.75×</option><option value="1">1×</option>
                <option value="1.5">1.5×</option><option value="2">2×</option>`)}
              ${select('pixel-budget', 'pixel-budget', 'Resolution limit', `
                <option value="921600">HD · 720p</option>
                <option value="2073600">Full HD · 1080p</option>
                <option value="3686400">QHD · 1440p</option>`)}
              ${select('graphics-preset', 'graphics-preset', 'Performance cap', `
                <option value="normal">Off</option><option value="performance">On</option>`)}
            </section>
            <section class="graphics-settings-group" aria-labelledby="graphics-effects-heading">
              <h2 id="graphics-effects-heading">${icon('Cpu')}<span>Lighting &amp; effects</span></h2>
              ${select('gel-rendering', 'gel-rendering', 'Character gel', `
                <option value="minimum">Glossy</option>
                <option value="reduced-transmission">Efficient refraction</option>
                <option value="balanced-transmission">Balanced refraction</option>
                <option value="physical">Full refraction</option>`)}
              ${select('shadow-quality', 'shadow-quality', 'Shadow detail', `
                <option value="512">Low</option><option value="1024">Medium</option><option value="2048">High</option>`)}
              ${select('shadow-filtering', 'shadow-filtering', 'Shadow softness', `
                <option value="standard">Standard</option><option value="soft">Soft</option>`)}
              ${select('effects-density', 'effects-density', 'Particle density', `
                <option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option>`)}
            </section>
          </div>
        </fieldset>
        <fieldset class="settings-section" id="settings-display" role="tabpanel" aria-labelledby="settings-tab-display" hidden><legend>Display</legend>
          ${toggle('fullscreen', 'fullscreen', 'Fullscreen')}
          ${select('frame-rate-limit', 'frame-rate-limit', 'Frame-rate limit', `
            <option value="0">Uncapped</option><option value="30">30 FPS</option>
            <option value="60">60 FPS</option><option value="120">120 FPS</option>`)}
          ${range('brightness', 'brightness', 'Brightness', 70, 130, 5)}
          <div class="brightness-calibration" aria-label="Brightness calibration">
            <div class="brightness-swatches" aria-hidden="true"><span>${icon('Circle')}</span><span>${icon('Circle')}</span><span>${icon('Circle')}</span></div>
            <p class="setting-note">Keep the middle symbol faintly visible.</p>
          </div>
          ${range('field-of-view', 'field-of-view', 'Field of view', 40, 75, 1)}
          ${select('hud-visibility', 'hud-visibility', 'HUD visibility', `
            <option value="automatic">Automatic</option><option value="always">Always visible</option><option value="minimal">Minimal</option>`)}
          ${toggle('show-fps', 'show-fps', 'Show frame rate')}
          ${toggle('pause-background', 'pause-background', 'Pause when unfocused')}
          <p class="setting-note graphics-readout" data-graphics-diagnostics></p>
        </fieldset>
        <fieldset class="settings-section" id="settings-audio" role="tabpanel" aria-labelledby="settings-tab-audio" hidden><legend>Audio</legend>
          ${range('master-volume', 'volume', 'Master volume', 0, 100, 5)}
          ${range('music-volume', 'music-volume', 'Music', 0, 100, 5)}
          ${range('effects-volume', 'effects-volume', 'Sound effects', 0, 100, 5)}
          ${toggle('mute-background', 'mute-background', 'Mute when unfocused')}
        </fieldset>
        <fieldset class="settings-section" id="settings-controls" role="tabpanel" aria-labelledby="settings-tab-controls" hidden><legend>Controls</legend>
          ${range('mouse-sensitivity', 'sensitivity', 'Mouse sensitivity', 0.5, 2, 0.1)}
          ${range('camera-distance', 'camera-distance', 'Camera distance', MIN_FOLLOW_DISTANCE_METRES, MAX_FOLLOW_DISTANCE_METRES, 0.1)}
          ${toggle('invert-vertical', 'invert-vertical', 'Invert vertical look')}
          <h2 class="settings-group-heading">${icon('Keyboard')}<span>Key bindings</span></h2>
          ${KEY_BINDING_ACTIONS.map(([action, label]) => `<div class="setting-row setting-binding-row">
            <label for="binding-${action}">${label}</label>
            <button type="button" class="setting-binding" id="binding-${action}" data-setting="binding-${action}" data-binding="${action}" aria-label="Change ${label.toLowerCase()} key"></button>
          </div>`).join('')}
          <p class="setting-note binding-feedback" data-binding-feedback role="status" aria-live="polite"></p>
        </fieldset>
        <fieldset class="settings-section" id="settings-accessibility" role="tabpanel" aria-labelledby="settings-tab-accessibility" hidden><legend>Accessibility</legend>
          ${select('camera-shake', 'camera-shake', 'Camera shake', `
            <option value="1">Full</option><option value="0.35">Reduced</option><option value="0">Off</option>`)}
          ${range('interface-scale', 'interface-scale', 'Interface scale', 75, 150, 25)}
          ${toggle('reduce-menu-motion', 'reduce-menu-motion', 'Reduce menu motion')}
        </fieldset>
      </div>
      <footer class="settings-footer">
        <div class="settings-footer-actions">
          <button type="button" class="system-action" data-action="back">${icon('ArrowLeft')}<span>Back</span></button>
          <button type="button" class="system-action settings-reset" data-action="reset-settings">${icon('RotateCcw')}<span>Reset defaults</span></button>
        </div>
        <p class="setting-note settings-feedback" data-settings-feedback role="status" aria-live="polite"></p>
      </footer>
    </div>
  </section>`;
}
