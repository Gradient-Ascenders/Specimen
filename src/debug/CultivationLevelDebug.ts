import { CultivationTestPanel } from './CultivationTestPanel.ts';

export interface CultivationLevelDebugSupport {
  readonly TestPanel: typeof CultivationTestPanel;
}

/** Developer UI only; authored gameplay lives in CultivationLevelGameplay. */
export const CULTIVATION_LEVEL_DEBUG_SUPPORT: CultivationLevelDebugSupport = {
  TestPanel: CultivationTestPanel,
};
