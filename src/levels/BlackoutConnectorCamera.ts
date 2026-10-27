import type {ContextualCameraAnchor,ContextualCameraContext,ContextualCameraProfile} from '../render/CameraProfile.ts';

const base={distanceMetres:3.4,targetHeightMetres:.50,pitchRadians:.15,
  transitionDurationSeconds:.45,framingDeadZoneHalfWidthMetres:.08,
  framingDeadZoneHalfHeightMetres:.08,framingDampingPerSecond:10,framingPlanarRadiusMetres:.12};

/** Profiles bound the boom inside each real bore; collision sweeps retain the
 * sloped roof and elbow ownership, and the player's yaw remains available. */
export class BlackoutConnectorCamera {
  private readonly contexts:readonly ContextualCameraContext[];
  private readonly anchor:ContextualCameraAnchor;
  constructor(anchor:ContextualCameraAnchor){
    this.anchor=anchor;
    const profiles:ContextualCameraProfile[]=[
      {...base,id:'blackout-vent-inlet',cameraBounds:{min:{x:-6.75,y:0,z:53.4},max:{x:-5.25,y:2.2,z:61.5}}},
      {...base,id:'blackout-vent-turn',cameraBounds:{min:{x:-16.75,y:0,z:60},max:{x:-5.25,y:2.2,z:63}}},
      {...base,id:'blackout-vent-rise',cameraBounds:{min:{x:-16.75,y:0,z:61.5},max:{x:-15.25,y:4.8,z:80.4}}},
    ];
    this.contexts=profiles.map(profile=>({profile,anchor}));
  }
  resolve(voltControlled:boolean):ContextualCameraContext|undefined{
    if(!voltControlled)return;
    const {x,y,z}=this.anchor.position;
    if(y<0||y>5)return;
    if(x>=-6.75&&x<=-5.25&&z>=53.6&&z<60)return this.contexts[0];
    if(x>=-16.75&&x<=-5.25&&z>=60&&z<=63)return this.contexts[1];
    if(x>=-16.75&&x<=-15.25&&z>63&&z<=79.9)return this.contexts[2];
    return;
  }
}
