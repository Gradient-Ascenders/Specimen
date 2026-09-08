import { CultivationTestPanel } from './CultivationTestPanel.ts';
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
import { CultivationRoomThreeController } from '../levels/CultivationRoomThreeController.ts';
import { CULTIVATION_ROOM_THREE_DRONE_AUTHORING } from '../levels/CultivationRoomThreeAuthoring.ts';
import {
  CULTIVATION_ROOM_OBJECTIVES,
  LevelTwoPreviewScene,
} from '../levels/LevelTwoPreviewScene.ts';
import {
  advanceLevelTwoPreviewProgression,
  createLevelTwoPreviewProgression,
} from '../levels/LevelTwoPreviewProgression.ts';

export interface CultivationLevelDebugSupport {
  readonly RoomFiveDroneEncounter: typeof RoomFiveDroneEncounter;
  readonly SecurityNetworkView: typeof SecurityNetworkView;
  readonly ElevatorDroneEncounter: typeof ElevatorDroneEncounter;
  readonly ElevatorEncounterView: typeof ElevatorEncounterView;
  readonly PreviewScene: typeof LevelTwoPreviewScene;
  readonly TestPanel: typeof CultivationTestPanel;
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

/** Dependencies loaded only for the explicitly enabled Cultivation debug route. */
export const CULTIVATION_LEVEL_DEBUG_SUPPORT: CultivationLevelDebugSupport = {
  RoomFiveDroneEncounter,
  SecurityNetworkView,
  ElevatorDroneEncounter, ElevatorEncounterView,
  PreviewScene: LevelTwoPreviewScene,
  TestPanel: CultivationTestPanel,
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
