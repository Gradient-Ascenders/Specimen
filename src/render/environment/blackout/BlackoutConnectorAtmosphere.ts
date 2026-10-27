import {gameplayAudioEvents,type AudioPosition} from '../../../audio/GameplayAudioEvents.ts';

const KNOCK={x:6,y:3.1,z:69.5};
const RATTLE={x:-14.8,y:1.65,z:61.5};

/** Presentation only: sparse practical failures and two first-traversal cues. */
export class BlackoutConnectorAtmosphere {
  private seconds=0;
  private hallBeat=-1;
  private ventBeat=-1;
  private knocked=false;
  private previous:{x:number;y:number;z:number}|undefined;

  update(dt:number,listener?:AudioPosition):void {
    this.seconds+=Math.max(0,dt);
    const old=this.previous;
    if(listener&&old){
      const distance=(listener.x-old.x)**2+(listener.y-old.y)**2+(listener.z-old.z)**2;
      // Recovery/teleports cannot simulate a physical crossing.
      if(distance<4){
        if(this.hallBeat<0&&listener.x>3.4&&listener.x<8.6&&old.z<60.5&&listener.z>=60.5){
          this.hallBeat=this.seconds;
        }
        if(this.ventBeat<0&&listener.z>60&&listener.z<63&&old.x>-8.8&&listener.x<=-8.8){
          this.ventBeat=this.seconds;
          gameplayAudioEvents.emit('cue',{sound:'world-release-01',position:RATTLE,volumeScale:.22,maxDistance:11});
        }
      }
    }
    if(listener){
      // Reuse the same small record after the first update.
      if(!this.previous)this.previous={x:listener.x,y:listener.y,z:listener.z};
      else {this.previous.x=listener.x;this.previous.y=listener.y;this.previous.z=listener.z;}
    }else this.previous=undefined;
    if(!this.knocked&&this.hallBeat>=0&&this.seconds-this.hallBeat>=.7){
      this.knocked=true;
      gameplayAudioEvents.emit('cue',{sound:'world-lever-lock-01',position:KNOCK,volumeScale:.12,maxDistance:13});
    }
  }

  lightIntensity(index:number):number {
    const bases=[14,8.2,.28,12];
    const t=this.seconds;
    // Long quiet holds, isolated failures and a nearly dead third fitting.
    const tremor=.96+.04*Math.sin(t*(1.1+index*.17)+index*2.3);
    const phase=(t+index*4.7)%(13.7+index*3.1);
    const failure=phase>12.7&&phase<13.1?.06:phase>13.25?.25:1;
    const behind=index===0&&this.hallBeat>=0&&t-this.hallBeat<2.5?.025:1;
    return (bases[index]??3)*tremor*failure*behind;
  }

  reset():void {this.seconds=0;this.hallBeat=-1;this.ventBeat=-1;this.knocked=false;this.previous=undefined;}
}
