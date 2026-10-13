// Preserve Bob's public shader contract and approved default deformation.
export {
  BOB_WOBBLE_AMPLITUDE_METRES,
  BOB_IMPACT_RIPPLE_AMPLITUDE_METRES,
  BOB_IMPACT_RIPPLE_DURATION_SECONDS,
  injectGelSecondaryMotionVertexShader as injectBobSecondaryMotionVertexShader,
} from '../slime/GelSecondaryMotionShader.ts';
