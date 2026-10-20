import type { ContainmentFinaleFrame } from './ContainmentFinaleTimeline.ts';
import { CONTAINMENT_FINALE_TIMING as T } from './ContainmentFinaleTiming.ts';

/** DOM optics, not another render target or a full-screen GPU postprocess. */
export class ContainmentFinaleOverlay {
  readonly element: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private readonly scan: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly details: HTMLDivElement;
  private readonly threat: HTMLDivElement;
  private readonly threatLevel: HTMLDivElement;
  private readonly directive: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private scanKey = '';
  constructor(host: HTMLElement, onSkip: () => void) {
    const doc = host.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'containment-finale';
    this.element.dataset.cleanGameplayEssential = 'true';
    this.element.hidden = true;
    const child = (name: string) => { const el = doc.createElement('div'); el.className = `finale-${name}`; this.element.append(el); return el; };
    child('bar top'); child('bar bottom');
    this.scan = child('scan');
    const title = doc.createElement('div'); title.className = 'finale-scan-heading'; title.textContent = 'SENTINEL / OPTICAL IDENTIFICATION';
    const reticle = doc.createElement('div'); reticle.className = 'finale-reticle';
    this.details = doc.createElement('div'); this.details.className = 'finale-scan-details';
    this.progress = doc.createElement('div'); this.progress.className = 'finale-scan-progress';
    this.threat = doc.createElement('div'); this.threat.className = 'finale-threat'; this.threat.hidden = true;
    const threatCaption = doc.createElement('div'); threatCaption.className = 'finale-threat-caption'; threatCaption.textContent = 'THREAT LEVEL';
    this.threatLevel = doc.createElement('div'); this.threatLevel.className = 'finale-threat-level';
    this.directive=child('termination');this.directive.hidden=true;this.directive.textContent='MUST TERMINATE';
    this.threat.append(threatCaption,this.threatLevel);
    this.scan.append(title, reticle, this.details, this.progress,this.threat);
    this.subtitle = child('subtitle'); this.subtitle.textContent = 'Thanks';
    this.fade = child('fade'); this.status = child('status');
    this.status.textContent = 'Preparing escape sequence…'; this.status.setAttribute('role', 'status');
    this.skip = doc.createElement('button'); this.skip.type = 'button'; this.skip.className = 'finale-skip';
    this.skip.textContent = 'Skip  ↵'; this.skip.addEventListener('click', onSkip); this.element.append(this.skip);
    host.append(this.element);
  }
  preparing(failed = false): void {
    this.element.hidden = false; this.fade.style.opacity = '1'; this.scan.hidden = true;
    this.directive.hidden=true;
    this.subtitle.hidden = true; this.status.hidden = false;
    this.status.textContent = failed ? 'Sequence unavailable. Press Enter to continue.' : 'Preparing escape sequence…';
  }
  render(frame: ContainmentFinaleFrame): void {
    this.element.hidden = false; this.status.hidden = true;
    this.fade.style.opacity = String(frame.fade); this.scan.hidden = !frame.pov;
    this.subtitle.hidden = !frame.thank;
    this.directive.style.setProperty('--termination-flash-opacity',String(.25+.75*(.5+.5*Math.cos((frame.seconds-T.terminate)*Math.PI*2/.7))));
    const key = frame.scan ?? (frame.pov ? 'search' : '');
    const stage = Math.min(2, Math.floor(frame.scanProgress * 3));
    const signature = `${key}:${stage}:${frame.scanStage}`;
    if (signature !== this.scanKey) {
      this.scanKey = signature; this.scan.dataset.target = key;
      this.scan.dataset.stage = frame.scanStage;
      const complete=frame.scanStage==='threat'||frame.scanStage==='terminate';
      this.threat.hidden=!complete;
      this.threatLevel.textContent=key==='goop'?'CRITICAL':'UNKNOWN';
      this.directive.hidden=frame.scanStage!=='terminate';
      this.details.textContent = key === 'bob' ? 'SPECIMEN: BOB\n' + (stage >= 1 ? 'ELASTIC RESILIENCE / ADHESION\n' : 'ANALYSING BIOLOGICAL SIGNATURE…\n') + (complete ? 'IDENTIFICATION COMPLETE' : 'THREAT ASSESSMENT PENDING')
        : key === 'goop' ? 'SPECIMEN: GOOP\n' + (stage >= 1 ? 'CORROSIVE SECRETION\n' : 'ANALYSING BIOLOGICAL SIGNATURE…\n') + (complete ? 'CONTAINMENT BREACH CONFIRMED' : 'THREAT ASSESSMENT PENDING')
        : 'ACQUIRING NEXT TARGET…';
    }
    this.progress.style.transform = `scaleX(${frame.scan ? frame.scanProgress : .08})`;
    this.element.dataset.shot = frame.shot;
  }
  hide(): void { this.element.hidden = true; }
  dispose(): void { this.element.remove(); }
}
