import { ElevatorDroneEncounter } from '../hazards/ElevatorDroneEncounter.ts';
import { ElevatorEncounterView } from '../ui/ElevatorEncounterView.ts';
import { RoomFiveDroneEncounter } from '../hazards/RoomFiveDroneEncounter.ts';
import { SecurityNetworkView } from '../ui/SecurityNetworkView.ts';
import {
  RoomThreeDroneEncounter,
  type RoomThreeDroneEncounterOptions,
} from '../hazards/RoomThreeDroneEncounter.ts';
import { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
import { SlimeDamageVignette } from '../ui/SlimeDamageVignette.ts';
import { CultivationRoomThreeController } from './CultivationRoomThreeController.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from './CultivationRoomThreeAuthoring.ts';
import {
  CULTIVATION_ROOM_OBJECTIVES,
  LevelTwoPreviewScene,
} from './LevelTwoPreviewScene.ts';
import {
  advanceLevelTwoPreviewProgression,
  createLevelTwoPreviewProgression,
} from './LevelTwoPreviewProgression.ts';

export interface CultivationLevelGameplaySupport {
  readonly RoomFiveDroneEncounter: typeof RoomFiveDroneEncounter;
  readonly SecurityNetworkView: typeof SecurityNetworkView;
  readonly ElevatorDroneEncounter: typeof ElevatorDroneEncounter;
  readonly ElevatorEncounterView: typeof ElevatorEncounterView;
  readonly PreviewScene: typeof LevelTwoPreviewScene;
  readonly roomObjectives: typeof CULTIVATION_ROOM_OBJECTIVES;
  readonly createPreviewProgression: typeof createLevelTwoPreviewProgression;
  readonly advancePreviewProgression: typeof advanceLevelTwoPreviewProgression;
  readonly createRoomThreeEncounter: (
    options: Omit<RoomThreeDroneEncounterOptions, 'config'>,
  ) => RoomThreeDroneEncounter;
  readonly RoomThreeController: typeof CultivationRoomThreeController;
  readonly DroneProjectilePresentation: typeof DroneProjectilePresentation;
  readonly DamageVignette: typeof SlimeDamageVignette;
}

/** Authored gameplay dependencies, loaded with the level in every build. */
export const CULTIVATION_LEVEL_GAMEPLAY_SUPPORT: CultivationLevelGameplaySupport = {
  RoomFiveDroneEncounter,
  SecurityNetworkView,
  ElevatorDroneEncounter, ElevatorEncounterView,
  PreviewScene: LevelTwoPreviewScene,
  roomObjectives: CULTIVATION_ROOM_OBJECTIVES,
  createPreviewProgression: createLevelTwoPreviewProgression,
  advancePreviewProgression: advanceLevelTwoPreviewProgression,
  createRoomThreeEncounter: (options) => new RoomThreeDroneEncounter({
    ...options,
    config: CULTIVATION_ROOM_THREE_DRONE_AUTHORING,
  }),
  RoomThreeController: CultivationRoomThreeController,
  DroneProjectilePresentation,
  DamageVignette: SlimeDamageVignette,
};
