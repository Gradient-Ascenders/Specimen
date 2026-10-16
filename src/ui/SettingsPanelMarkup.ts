import { MAX_FOLLOW_DISTANCE_METRES, MIN_FOLLOW_DISTANCE_METRES } from '../render/CameraRig.ts';

const range = (id: string, key: string, label: string, min: number, max: number, step: number, note: string): string => `
  <div class="setting-row">
    <div class="setting-heading"><label for="${id}">${label}</label><output for="${id}" data-setting-output="${key}"></output></div>
    <input id="${id}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" aria-describedby="${id}-note">
    <p class="setting-note" id="${id}-note">${note}</p>
  </div>`;

const select = (id: string, key: string, label: string, options: string, note: string, autofocus = false): string => `
  <div class="setting-row">
    <div class="setting-heading"><label for="${id}">${label}</label><output for="${id}" data-setting-output="${key}"></output></div>
    <select id="${id}" data-setting="${key}" aria-describedby="${id}-note" ${autofocus ? 'data-autofocus' : ''}>${options}</select>
    <p class="setting-note" id="${id}-note">${note}</p>
  </div>`;

const toggle = (id: string, key: string, label: string, note: string): string => `
  <label class="setting-row setting-toggle-row" for="${id}">
    <span class="setting-heading"><span>${label}</span><output for="${id}" data-setting-output="${key}"></output></span>
    <input id="${id}" data-setting="${key}" type="checkbox" aria-describedby="${id}-note">
    <span class="setting-note" id="${id}-note">${note}</span>
  </label>`;

/** Static, labelled sections; no settings value is interpolated as HTML. */
export function createSettingsPanelMarkup(): string {
  return `<section class="flow-screen submenu-screen settings-screen" data-flow-panel="settings" aria-labelledby="settings-heading" hidden>
    <div class="system-panel lab-menu-panel settings-panel">
      <header class="system-panel-header">
        <span class="signal-bar" aria-hidden="true"></span>
        <div><p class="system-label">Make yourself at home</p><h1 id="settings-heading">Settings</h1></div>
      </header>
      <p class="settings-intro">Tune the experiment. Gameplay settings last for this session; FPS and menu-motion preferences are saved on this device.</p>
      <nav class="settings-section-links" aria-label="Settings sections">
        ${['Graphics', 'Display', 'Audio', 'Controls', 'Accessibility'].map(section =>
          `<button type="button" data-action="settings-section" data-section="${section.toLowerCase()}">${section}</button>`).join('')}
      </nav>
      <div class="settings-sections">
        <fieldset class="settings-section" id="settings-graphics"><legend>Graphics</legend>
          ${select('graphics-profile', 'graphics-profile', 'Graphics profile', `
            <option value="minimum">Minimum hardware — recommended starting point</option>
            <option value="standard">Standard — sharper image and refraction</option>
            <option value="custom" disabled>Custom — choose a profile to reset</option>`,
          'One choice sets resolution, gel, shadow detail and decorative effects. Minimum is the safest starting point; Standard spends more graphics power. Gameplay and hazard beams are unchanged.', true)}
          ${select('gel-rendering', 'gel-rendering', 'Character gel', `
            <option value="minimum">Minimum hardware — glossy gel</option>
            <option value="reduced-transmission">Balanced — soft refraction</option>
            <option value="physical">High — full refraction</option>`,
          'Glossy gel keeps reflections and character glow. Refraction adds background distortion and costs more GPU time.')}
          ${select('graphics-preset', 'graphics-preset', 'Additional performance cap', `
            <option value="normal">Off — profile settings</option>
            <option value="performance">On — cap density and refraction</option>`,
          'Optional extra limit: density at most 1× before render scaling, with refraction at half resolution. Your requested choices are kept for when this is switched off.')}
          <p class="setting-note graphics-readout" data-graphics-diagnostics></p>
        </fieldset>
        <fieldset class="settings-section" id="settings-display"><legend>Display</legend>
          ${select('render-resolution', 'render-resolution', 'Display density cap', `
            <option value="0.75">0.75× — fewer pixels</option><option value="1">1.0× — CSS pixel density</option>
            <option value="1.5">1.5× — sharper on high-DPI screens</option><option value="2">2.0× — highest density</option>`,
          'Gameplay density before render scaling. The profile pixel budget always applies. Text stays at native interface resolution; the title and trailers use their own bounded 1× presentation.')}
          ${select('render-scale', 'render-scale', '3D render scale', `
            <option value="0.5">50% — fastest, softest</option><option value="0.75">75% — reduced detail</option>
            <option value="1">100% — full selected density</option>`,
          'Scales gameplay width and height: 75% draws about 56% as many pixels. Large windows may be reduced further to respect the budget.')}
          ${toggle('show-fps', 'show-fps', 'Show FPS', 'A lightweight frame-rate counter during gameplay. Saved on this device; hidden by F1 clean mode.')}
        </fieldset>
        <fieldset class="settings-section" id="settings-audio"><legend>Audio</legend>
          ${range('master-volume', 'volume', 'Master volume', 0, 100, 5, 'Controls all game audio. 0% mutes the game.')}
          ${range('effects-volume', 'effects-volume', 'Sound effects volume', 0, 100, 5, 'Character, machinery, drone and interaction sounds, relative to master volume.')}
        </fieldset>
        <fieldset class="settings-section" id="settings-controls"><legend>Controls</legend>
          ${range('mouse-sensitivity', 'sensitivity', 'Mouse sensitivity', 0.5, 2, 0.1, 'Lower values make camera aiming more precise; higher values turn faster.')}
          ${range('camera-distance', 'camera-distance', 'Camera distance', MIN_FOLLOW_DISTANCE_METRES, MAX_FOLLOW_DISTANCE_METRES, 0.1, 'How far the camera follows the active specimen. Collision can bring it closer.')}
          ${toggle('invert-vertical', 'invert-vertical', 'Invert vertical look', 'Reverse the camera’s up/down mouse movement.')}
        </fieldset>
        <fieldset class="settings-section" id="settings-accessibility"><legend>Accessibility</legend>
          ${toggle('reduce-menu-motion', 'reduce-menu-motion', 'Reduce menu motion', 'Keep the title camera and egg still. Saved on this device. Your system reduced-motion preference is always respected.')}
          <p class="setting-note">F1 hides gameplay guidance without hiding your aiming overlay. Menus, loading and recovery controls remain available.</p>
        </fieldset>
      </div>
      <footer class="settings-footer">
        <div class="settings-footer-actions">
          <button type="button" class="system-action" data-action="back"><span aria-hidden="true">←</span><span>Back</span></button>
          <button type="button" class="system-action settings-reset" data-action="reset-settings"><span aria-hidden="true">↺</span><span>Reset to defaults</span></button>
        </div>
        <p class="setting-note settings-feedback" data-settings-feedback role="status" aria-live="polite"></p>
        <p class="setting-note settings-navigation-hint">Tab moves · Arrows navigate / adjust · Enter / Space select · Esc back<br>Controller: D-pad / stick move and adjust · A select · B back</p>
      </footer>
    </div>
  </section>`;
}
