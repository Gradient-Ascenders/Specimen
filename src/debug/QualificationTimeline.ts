export interface StableResources { programs:number; geometries:number; textures:number; usedJsHeapBytes:number|null }
export interface QualificationLifecycle {
  kind:'initial'|'transition'|'restart'; phase:string; level:string;
  requestedAtMs:number; readyAtMs:number|null; controlAtMs:number|null;
  resourceSample:(StableResources & {timestampMs:number;stableForMs:number})|null;
}

/** Debug-only bounded lifecycle evidence. Timing does not control gameplay. */
export class QualificationTimeline {
  readonly events: QualificationLifecycle[] = [];
  private pending: QualificationLifecycle | undefined;
  private stableSinceMs = 0;
  private programs = -1;
  private geometries = -1;
  private textures = -1;
  get needsFrame(): boolean { return this.pending !== undefined; }
  request(kind:QualificationLifecycle['kind'],phase:string,level:string,now:number): void {
    const entry:QualificationLifecycle = {kind,phase,level,requestedAtMs:now,
      readyAtMs:null,controlAtMs:null,resourceSample:null};
    if (this.events.length===32) this.events.shift();
    this.events.push(entry); this.pending=entry;
    this.programs=this.geometries=this.textures=-1;
  }
  ready(now:number):void { if (this.pending && this.pending.readyAtMs===null) this.pending.readyAtMs=now; }
  observe(now:number,level:string,controllable:boolean,programs:number,geometries:number,textures:number,heap:number|null):void {
    const entry=this.pending;
    if (!entry || entry.readyAtMs===null) return;
    if (!controllable) { this.stableSinceMs=now; return; }
    entry.level=level;
    entry.controlAtMs ??= now;
    if (programs!==this.programs || geometries!==this.geometries || textures!==this.textures) {
      this.programs=programs;this.geometries=geometries;this.textures=textures;this.stableSinceMs=now;
    }
    if (now-this.stableSinceMs<2000) return;
    entry.resourceSample={programs,geometries,textures,usedJsHeapBytes:heap,timestampMs:now,stableForMs:now-this.stableSinceMs};
    this.pending=undefined;
  }
}
