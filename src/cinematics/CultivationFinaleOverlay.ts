import {VOLT_FINALE as T,finaleSmooth,voltFinaleShot} from './CultivationFinaleTimeline.ts';
import {voltFinaleTime as at} from './CultivationFinaleTiming.ts';

export function voltFinaleScan(t:number):'volt'|'bob'|undefined{
  return t>=T.scanVolt&&t<T.coverRun?'volt':t>=T.scanBob&&t<T.voltJump?'bob':undefined;
}
export function voltFinaleScanStage(t:number):'identifying'|'threat'|'terminate'{
  const target=voltFinaleScan(t);
  if(t>=(target==='bob'?T.terminateBob:T.terminateVolt))return'terminate';
  if(t>=(target==='bob'?T.catastrophic:T.critical))return'threat';
  return'identifying';
}
export const VOLT_FINALE_DIALOGUE=Object.freeze([
  {start:T.even,end:at(74.5),speaker:'goop',text:"Now we're even"},
  {start:T.getOn,end:T.bobJump,speaker:'volt',text:'Get on'},
  {start:T.followMe,end:T.ductRun,speaker:'goop',text:'Follow me, I know the way out'},
] as const);

/** Shared DOM optics/letterboxing: no second camera render, texture or postprocess. */
export class CultivationFinaleOverlay {
  readonly element:HTMLDivElement|undefined;
  private readonly scan?:HTMLDivElement;
  private readonly details?:HTMLDivElement;
  private readonly threat?:HTMLDivElement;
  private readonly threatLevel?:HTMLDivElement;
  private readonly directive?:HTMLDivElement;
  private readonly progress?:HTMLDivElement;
  private readonly subtitle?:HTMLDivElement;
  private readonly fade?:HTMLDivElement;
  private readonly alarm?:HTMLDivElement;
  private signature='';
  constructor(host:HTMLElement,onSkip:()=>void){
    const doc=host.ownerDocument;if(!doc)return;
    const root=doc.createElement('div');root.className='containment-finale cultivation-finale';root.hidden=true;
    root.dataset.cleanGameplayEssential='true';this.element=root;
    const child=(name:string,parent:HTMLElement=root)=>{const el=doc.createElement('div');el.className=`finale-${name}`;parent.append(el);return el;};
    child('bar top');child('bar bottom');this.scan=child('scan');
    child('scan-heading',this.scan).textContent='SENTINEL / BIOLOGICAL THREAT ANALYSIS';child('reticle',this.scan);
    this.details=child('scan-details',this.scan);this.progress=child('scan-progress',this.scan);
    this.threat=child('threat',this.scan);child('threat-caption',this.threat).textContent='THREAT LEVEL';
    this.threatLevel=child('threat-level',this.threat);this.directive=child('termination');this.directive.textContent='TERMINATE';
    this.subtitle=child('subtitle');this.alarm=child('alarm-wash');this.fade=child('fade');
    const skip=doc.createElement('button');skip.className='finale-skip';skip.type='button';skip.textContent='Skip ↵';
    skip.addEventListener('click',onSkip);root.append(skip);host.append(root);
  }
  present(t:number):void{
    if(!this.element)return;
    this.element.hidden=false;this.element.dataset.shot=voltFinaleShot(t).id;
    const target=voltFinaleScan(t),stage=voltFinaleScanStage(t);
    this.scan!.hidden=!target;this.threat!.hidden=!target||stage==='identifying';
    this.directive!.hidden=stage!=='terminate'||!target;
    this.scan!.dataset.target=target??'';this.scan!.dataset.stage=stage;
    const key=`${target}:${stage}`;
    if(key!==this.signature){
      this.signature=key;
      this.threatLevel!.textContent=target==='bob'?'CATASTROPHIC':'CRITICAL';
      this.details!.textContent=target==='volt'?'SPECIMEN: VOLT\nBIOELECTRIC OUTPUT / GRID-SCALE DISCHARGE\n'+(stage==='identifying'?'ASSESSING THREAT…':'CRITICAL CONTAINMENT FAILURE'):
        target==='bob'?'SPECIMEN: BOB\nADAPTIVE TACTICS / COORDINATED RESISTANCE\n'+(stage==='identifying'?'REVISING PREVIOUS ASSESSMENT…':'THREAT RECLASSIFIED: CATASTROPHIC'):'';
    }
    const start=target==='bob'?T.scanBob:T.scanVolt;
    this.progress!.style.transform=`scaleX(${Math.min(1,Math.max(0,(t-start)/3.5))})`;
    this.directive!.style.setProperty('--termination-flash-opacity',String(.42+.58*(.5+.5*Math.cos(t*9))));
    const line=VOLT_FINALE_DIALOGUE.find(line=>t>=line.start&&t<line.end);
    this.subtitle!.hidden=!line;
    if(line){this.subtitle!.textContent=line.text.slice(0,Math.floor((t-line.start)*22));this.subtitle!.dataset.speaker=line.speaker;}
    this.fade!.style.opacity=String(1-finaleSmooth(0,.35,t)+finaleSmooth(T.fade,T.duration,t));
    // A slow emergency pulse continues through the room escape. No rapid
    // strobes, blackouts, additional lights or changes to the light layout.
    const pulse=.5-.5*Math.cos((t-T.open)*Math.PI/1.2);
    this.alarm!.style.opacity=String(t>=T.open&&t<T.ventCamera?.025+.05*pulse:0);
  }
  hide():void{if(this.element)this.element.hidden=true;this.signature='';}
  dispose():void{this.element?.remove();}
}
