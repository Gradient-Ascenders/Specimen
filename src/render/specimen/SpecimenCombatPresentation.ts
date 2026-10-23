import { menuIconMarkup as icon } from '../../ui/MenuIcons.ts';
import * as THREE from 'three';
import type { SpecimenDash } from '../../combat/SpecimenDash.ts';

import type {
  SpecimenAttackReadModel,
  SpecimenAttackEvents,
  SpecimenProjectileReadState,
} from '../../combat/SpecimenProjectileSystem.ts';
import type { EventBus } from '../../core/EventBus.ts';

export interface SpecimenCombatPresentationSource {
  readonly readModel: SpecimenAttackReadModel;
  readonly projectileStates: readonly SpecimenProjectileReadState[];
  readonly events?: EventBus<SpecimenAttackEvents>;
}

/**
 * Minimal bounded verification presentation for #127.
 *
 * Gameplay truth remains in SpecimenProjectileSystem. One InstancedMesh and one
 * DOM overlay are allocated for the loaded level and reused for all shots.
 */
export class SpecimenCombatPresentation {
  readonly root = new THREE.Group();
  readonly element: HTMLElement;

  private readonly source: SpecimenCombatPresentationSource;
  private readonly projectileGeometry: THREE.SphereGeometry;
  private readonly projectileMaterial: THREE.Material;
  private readonly projectiles: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly crosshair: HTMLElement;
  private readonly label: HTMLElement;
  private readonly charge: HTMLProgressElement;
  private readonly abilities: HTMLElement;
  private readonly overcharge: HTMLProgressElement;
  private readonly overchargeLabel: HTMLElement;
  private readonly dashCharge: HTMLProgressElement;
  private readonly dashLabel: HTMLElement;
  private readonly dash: SpecimenDash | undefined;
  private readonly projectileColor = new THREE.Color();
  private readonly unsubscribe: (() => void)[] = [];
  private readonly hitMarker: HTMLElement;
  private readonly dodgeFeedback: HTMLElement;
  private hitRemaining = 0;
  private dodgeRemaining = 0;
  private pulse = false;
  private feedbackEnabled = false;
  private disposed = false;

  constructor(options: {
    readonly scene: THREE.Scene;
    readonly host: HTMLElement;
    readonly source: SpecimenCombatPresentationSource;
    readonly document?: Document;
    readonly electricGoop?: boolean;
    readonly dash?: SpecimenDash;
  }) {
    this.source = options.source;
    this.dash = options.dash;
    this.root.name = 'specimen-combat-presentation';

    this.projectileGeometry = new THREE.SphereGeometry(1, 10, 7);
    this.projectileMaterial = options.electricGoop ? new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0}},
      vertexShader:`varying vec3 vP; varying vec3 vN;
        #include <color_pars_vertex>
        void main(){
        vP=position;vN=normal;vec4 p=vec4(position,1.);
        #ifdef USE_INSTANCING
          p=instanceMatrix*p;
        #endif
        #include <color_vertex>
        gl_Position=projectionMatrix*modelViewMatrix*p;}`,
      fragmentShader:`varying vec3 vP,vN;uniform float uTime;
        #include <color_pars_fragment>
        void main(){
        float arc=pow(abs(sin(vP.y*15.+sin(vP.x*11.+uTime*9.)+vP.z*8.)),20.);
        float rim=pow(1.-abs(vN.z),2.);vec3 col=vec3(.08,.65,.12)+arc*vec3(.7,1.,1.)+rim*vec3(.05,.6,.8);
        #ifdef USE_COLOR
          col *= vColor.rgb;
        #endif
        gl_FragColor=vec4(col,1.);}`,
    }) : new THREE.MeshStandardMaterial({
      color: 0xd6ff4a,
      emissive: 0xff4d2f,
      emissiveIntensity: 1.5,
      roughness: 0.3,
      metalness: 0.15,
    });
    this.projectiles = new THREE.InstancedMesh(
      this.projectileGeometry,
      this.projectileMaterial,
      this.source.projectileStates.length,
    );
    this.projectiles.name = 'specimen-electric-acid-projectiles';
    this.projectiles.setColorAt(0, this.projectileColor);
    this.projectiles.frustumCulled = false;
    this.projectiles.count = 0;
    this.root.add(this.projectiles);

    const hostDocument = options.document ?? document;
    const element = hostDocument.createElement('div');
    element.className = 'specimen-combat-overlay';
    element.setAttribute('data-clean-gameplay-aiming', '');
    element.setAttribute('aria-live', 'polite');

    this.crosshair = hostDocument.createElement('span');
    this.crosshair.className = 'specimen-combat-crosshair';
    this.crosshair.innerHTML = icon('Crosshair');
    this.crosshair.hidden = true;

    this.hitMarker = hostDocument.createElement('span');
    this.hitMarker.className = 'specimen-hit-marker';
    this.hitMarker.hidden = true;
    this.hitMarker.setAttribute('aria-live', 'off');
    this.dodgeFeedback = hostDocument.createElement('span');
    this.dodgeFeedback.className = 'specimen-dodge-feedback';
    this.dodgeFeedback.textContent = 'DODGED';
    this.dodgeFeedback.hidden = true;
    this.dodgeFeedback.setAttribute('role', 'status');

    this.label = hostDocument.createElement('span');
    this.label.className = 'specimen-combat-label';
    this.label.textContent = 'Specimen';
    this.label.hidden = true;

    this.charge = hostDocument.createElement('progress');
    this.charge.className = 'specimen-combat-charge';
    this.charge.max = 1;
    this.charge.value = 0;
    this.charge.hidden = true;
    this.charge.setAttribute('aria-label', 'Shot charge');

    this.abilities = hostDocument.createElement('div'); this.abilities.className = 'specimen-abilities';
    this.abilities.setAttribute('aria-live', 'off');
    this.dashLabel = hostDocument.createElement('span'); this.dashLabel.className = 'specimen-dash-label';
    this.dashCharge = hostDocument.createElement('progress'); this.dashCharge.max = 1;
    this.dashCharge.setAttribute('aria-label', 'Dash recovery');
    this.overchargeLabel = hostDocument.createElement('span');
    this.overcharge = hostDocument.createElement('progress'); this.overcharge.max = 1;
    this.overcharge.setAttribute('aria-label', 'Overcharge accuracy streak');
    this.abilities.append(this.dashLabel, this.dashCharge, this.overchargeLabel, this.overcharge);

    element.append(this.crosshair, this.hitMarker, this.dodgeFeedback, this.label, this.charge, this.abilities);
    this.element = element;

    try {
      options.scene.add(this.root);
      options.host.append(this.element);
      if (this.source.events) this.unsubscribe.push(this.source.events.on('hitFeedback', event => {
        if (!this.feedbackEnabled) return;
        this.hitRemaining = 0.2;
        this.hitMarker.hidden = false;
        this.hitMarker.textContent = event.kind === 'hit' ? '×' : '◇';
        this.hitMarker.dataset.kind = event.kind;
        this.crosshair.dataset.hit = event.kind;
        this.pulse = !this.pulse;
        this.crosshair.dataset.pulse = this.hitMarker.dataset.pulse = this.pulse ? 'a' : 'b';
      }));
      if (options.dash) this.unsubscribe.push(options.dash.events.on('dodged', () => {
        if (!this.feedbackEnabled) return;
        this.dodgeRemaining = 0.28;
        this.dodgeFeedback.hidden = false;
        this.element.dataset.dodged = 'true';
      }));
    } catch (error) {
      this.root.removeFromParent();
      this.element.remove();
      this.projectileGeometry.dispose();
      this.projectileMaterial.dispose();
      throw error;
    }
  }

  update(activeForm: boolean, deltaSeconds = 0): void {
    if (this.disposed) return;
    const model = this.source.readModel;
    this.feedbackEnabled = activeForm && model.fireEnabled;
    if (!this.feedbackEnabled) this.clearFeedback();
    this.hitRemaining = Math.max(0, this.hitRemaining - deltaSeconds);
    this.dodgeRemaining = Math.max(0, this.dodgeRemaining - deltaSeconds);
    if (this.hitRemaining === 0) {
      this.hitMarker.hidden = true;
      delete this.crosshair.dataset.hit;
      delete this.crosshair.dataset.pulse;
    }
    if (this.dodgeRemaining === 0) { this.dodgeFeedback.hidden = true; delete this.element.dataset.dodged; }
    if(this.projectileMaterial instanceof THREE.ShaderMaterial)this.projectileMaterial.uniforms.uTime!.value=performance.now()/1000;
    this.label.hidden = !activeForm;
    this.crosshair.hidden = !activeForm || !model.fireEnabled;
    this.charge.hidden = !activeForm || !model.fireEnabled;
    this.charge.value = model.chargeAmount;
    this.charge.dataset.state = model.fullyCharged
      ? 'full'
      : model.charging
        ? 'charging'
        : 'ready';
    this.abilities.hidden = !activeForm || !model.fireEnabled;
    this.dashLabel.hidden = this.dashCharge.hidden = !this.dash;
    this.dashCharge.value = this.dash?.readModel.cooldownProgress ?? 1;
    this.dashLabel.textContent = this.dashCharge.value >= 1 ? 'SHIFT · DASH READY' : 'SHIFT · DASH RECHARGING';
    this.overcharge.value = model.overchargeProgress;
    this.overchargeLabel.textContent = model.overchargeReady ? 'OVERCHARGE · NEXT SHOT BOOSTED' : 'OVERCHARGE · LAND CONSECUTIVE HITS';
    this.abilities.dataset.overcharged = String(model.overchargeReady);

    let count = 0;
    for (const state of this.source.projectileStates) {
      if (!state.active) continue;
      this.dummy.position.set(
        state.position.x,
        state.position.y,
        state.position.z,
      );
      this.dummy.scale.setScalar(state.radiusMetres);
      this.dummy.updateMatrix();
      this.projectiles.setMatrixAt(count, this.dummy.matrix);
      this.projectileColor.setRGB(state.overcharged ? 4 : 1, state.overcharged ? 2.5 : 1, state.overcharged ? 0.3 : 1);
      this.projectiles.setColorAt(count, this.projectileColor);
      count += 1;
    }
    this.projectiles.count = count;
    if (count > 0) { this.projectiles.instanceMatrix.needsUpdate = true; this.projectiles.instanceColor!.needsUpdate = true; }
  }

  suspend(): void {
    if (this.disposed) return;
    this.crosshair.hidden = true;
    this.charge.hidden = true;
    this.abilities.hidden = true;
    this.feedbackEnabled = false;
    this.clearFeedback();
  }

  private clearFeedback(): void {
    this.hitRemaining = this.dodgeRemaining = 0;
    this.hitMarker.hidden = this.dodgeFeedback.hidden = true;
    delete this.crosshair.dataset.hit;
    delete this.crosshair.dataset.pulse;
    delete this.element.dataset.dodged;
  }

  getDiagnostics(): {
    readonly activeProjectileCount: number;
    readonly capacity: number;
    readonly overlayAttached: boolean;
  } {
    return {
      activeProjectileCount: this.projectiles.count,
      capacity: this.source.projectileStates.length,
      overlayAttached: this.element.isConnected,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.unsubscribe) off();
    this.root.removeFromParent();
    this.element.remove();
    this.projectiles.dispose();
    this.projectileGeometry.dispose();
    this.projectileMaterial.dispose();
  }
}
