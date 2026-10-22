export type ContainmentSignLabel =
  | 'bay'
  | 'specimen'
  | 'locked'
  | 'vent'
  | 'chamber'
  | 'ascent'
  | 'roomThree'
  | 'chemical'
  | 'laserArray'
  | 'adhesionTest'
  | 'roomFour'
  | 'serviceOne'
  | 'transferTwo'
  | 'laserCore'
  | 'roomFiveExit'
  | 'roomFive'
  | 'primaryContainment'
  | 'pressureArray'
  | 'observationControl'
  | 'compositeAccess';

type Rgba = readonly [number, number, number, number];

export const CONTAINMENT_SIGNS: readonly [
  ContainmentSignLabel,
  string,
  string,
  Rgba,
][] = [
  ['bay', 'C-01', 'BIOLOGICAL CONTAINMENT', [180, 141, 48, 255]],
  ['specimen', 'SP-01', 'SPECIMEN TEST BAY', [83, 137, 135, 255]],
  ['locked', 'LOCKED', 'DOOR C-01', [168, 54, 61, 255]],
  ['vent', 'VENT ACCESS', 'SERVICE ROUTE', [117, 139, 60, 255]],
  ['chamber', 'C-02', 'TRAVERSAL TEST CHAMBER', [83, 137, 135, 255]],
  ['ascent', 'ASCENT 09 M', 'CALIBRATION ROUTE', [180, 141, 48, 255]],
  ['roomThree', 'C-03', 'BIOLOGICAL MATERIAL TESTING', [83, 137, 135, 255]],
  ['chemical', 'CHEMICAL CONTAINMENT', 'AUTHORIZED TEST AREA', [180, 141, 48, 255]],
  ['laserArray', 'LASER ARRAY L-03', 'ALIGNMENT CONTROL', [168, 54, 61, 255]],
  ['adhesionTest', 'ADHESION TEST A03', 'REPLACEABLE MEMBRANE', [83, 137, 135, 255]],
  ['roomFour', 'C-04', 'VERTICAL TRANSFER CORE', [180, 141, 48, 255]],
  ['serviceOne', 'S01  08 M', 'SERVICE LEVEL', [151, 159, 157, 255]],
  ['transferTwo', 'S02  24 M', 'TRANSFER ARRAY', [180, 141, 48, 255]],
  ['laserCore', 'L-04', 'ACTIVE ALIGNMENT ZONE', [168, 54, 61, 255]],
  ['roomFiveExit', 'C-05', 'RESEARCH LAB ACCESS', [83, 137, 135, 255]],
  ['roomFive', 'C-05', 'PRIMARY CONTAINMENT LAB', [180, 141, 48, 255]],
  ['primaryContainment', 'PC-05', 'BIOLOGICAL PROCESS CHAMBER', [117, 139, 60, 255]],
  ['pressureArray', 'PRESSURE ARRAY', 'MANIFOLD 05', [180, 141, 48, 255]],
  ['observationControl', 'OBSERVATION CONTROL', 'SPECIMEN MONITORING', [83, 137, 135, 255]],
  ['compositeAccess', 'COMPOSITE ACCESS', 'CORROSIVE CLEARANCE', [180, 141, 48, 255]],
];

