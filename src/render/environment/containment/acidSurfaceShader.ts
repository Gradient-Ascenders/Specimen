export const acidSurfaceVertexPars = /* glsl */ `
varying vec3 vAcidWorldPosition;
`;

export const acidSurfaceVertexPosition = /* glsl */ `
vAcidWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

export const acidSurfaceFragmentPars = /* glsl */ `
uniform float uTime;
uniform vec3 uDeepColour;
uniform vec3 uMidColour;
uniform vec3 uFilmColour;
uniform vec3 uBubbleColour;
uniform float uFlowSpeed;
uniform float uFlowScale;
uniform float uBubbleScale;
uniform float uBubbleStrength;
uniform float uEmissionStrength;

varying vec3 vAcidWorldPosition;

struct AcidSurfaceSample {
  vec3 colour;
  float bodyVariation;
  float film;
  float filmEdge;
  float bubbleRing;
  float bubbleInterior;
  float surfaceHeight;
};

float acidHash12(vec2 value) {
  vec3 hashed = fract(vec3(value.xyx) * 0.1031);
  hashed += dot(hashed, hashed.yzx + 33.33);
  return fract((hashed.x + hashed.y) * hashed.z);
}

vec2 acidHash22(vec2 value) {
  float first = acidHash12(value);
  return vec2(first, acidHash12(value + first + 19.19));
}

float acidValueNoise(vec2 coordinate) {
  vec2 cell = floor(coordinate);
  vec2 local = fract(coordinate);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float southWest = acidHash12(cell);
  float southEast = acidHash12(cell + vec2(1.0, 0.0));
  float northWest = acidHash12(cell + vec2(0.0, 1.0));
  float northEast = acidHash12(cell + vec2(1.0, 1.0));
  return mix(
    mix(southWest, southEast, blend.x),
    mix(northWest, northEast, blend.x),
    blend.y
  );
}

float acidFbm(vec2 coordinate) {
  float value = 0.0;
  float amplitude = 0.54;
  mat2 rotation = mat2(0.80, 0.60, -0.60, 0.80);
  value += acidValueNoise(coordinate) * amplitude;
  coordinate = rotation * coordinate * 2.03 + vec2(7.1, -3.8);
  amplitude *= 0.5;
  value += acidValueNoise(coordinate) * amplitude;
  coordinate = rotation * coordinate * 2.07 + vec2(-2.6, 11.4);
  amplitude *= 0.5;
  value += acidValueNoise(coordinate) * amplitude;
  return value / 0.945;
}

void evaluateAcidBubbles(
  vec2 worldCoordinate,
  float timeSeconds,
  out float ringMask,
  out float interiorMask
) {
  vec2 bubbleCoordinate = worldCoordinate / uBubbleScale;
  vec2 baseCell = floor(bubbleCoordinate);
  ringMask = 0.0;
  interiorMask = 0.0;

  for (int offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (int offsetX = -1; offsetX <= 1; offsetX += 1) {
      vec2 cell = baseCell + vec2(float(offsetX), float(offsetY));
      vec2 randomPair = acidHash22(cell + vec2(41.7, -13.2));
      float selection = acidHash12(cell + vec2(-8.3, 27.1));
      float selected = step(0.72, selection);
      float lifetimeSeconds = mix(11.0, 18.0, randomPair.y);
      float phaseOffset = acidHash12(cell + vec2(73.1, 5.9));
      float lifePhase = fract(timeSeconds / lifetimeSeconds + phaseOffset);
      float fadeIn = smoothstep(0.04, 0.20, lifePhase);
      float fadeOut = 1.0 - smoothstep(0.72, 0.94, lifePhase);
      float life = fadeIn * fadeOut * selected;

      vec2 centre = (cell + 0.16 + randomPair * 0.68) * uBubbleScale;
      float sizeVariation = mix(0.52, 1.12, randomPair.x);
      float growth = smoothstep(0.02, 0.78, lifePhase);
      float radius = mix(0.045, 0.56 * sizeVariation, growth);
      float distanceToCentre = length(worldCoordinate - centre);
      float edgeWidth = mix(0.018, 0.047, randomPair.y);
      float ringDistance = abs(distanceToCentre - radius);
      float ring = 1.0 - smoothstep(edgeWidth, edgeWidth * 2.6, ringDistance);
      float interior = 1.0 - smoothstep(
        max(radius * 0.42, 0.025),
        max(radius * 0.88, 0.06),
        distanceToCentre
      );

      ringMask = max(ringMask, ring * life);
      interiorMask = max(interiorMask, interior * life);
    }
  }
}

AcidSurfaceSample evaluateAcidSurface(vec2 worldCoordinate) {
  float flowTime = uTime * uFlowSpeed;

  // Two differently-scaled, counter-moving layers warp the domain before any
  // colour thresholding. Their motion therefore reads as viscous circulation,
  // not as two textures visibly scrolling over one another.
  vec2 broadCoordinate = worldCoordinate * uFlowScale;
  float broadA = acidValueNoise(
    broadCoordinate * 0.74 + vec2(0.17, -0.08) * flowTime
  );
  float broadB = acidValueNoise(
    broadCoordinate.yx * 0.93 + vec2(-0.11, 0.14) * flowTime + 17.3
  );
  vec2 broadWarp = (vec2(broadA, broadB) - 0.5) * 1.65;

  vec2 fineCoordinate = worldCoordinate * (uFlowScale * 2.15);
  float fineA = acidValueNoise(
    fineCoordinate + vec2(-0.19, 0.07) * flowTime + 31.7
  );
  float fineB = acidValueNoise(
    fineCoordinate.yx + vec2(0.09, -0.16) * flowTime - 9.4
  );
  vec2 fineWarp = (vec2(fineA, fineB) - 0.5) * 0.42;
  vec2 warpedCoordinate = broadCoordinate + broadWarp + fineWarp;

  float bodyVariation = acidFbm(
    warpedCoordinate * 0.72 + vec2(0.055, -0.028) * flowTime
  );
  float secondaryVariation = acidFbm(
    mat2(0.36, 0.93, -0.93, 0.36) * warpedCoordinate * 1.48 +
      vec2(-0.072, 0.046) * flowTime + 23.8
  );
  float filmDetail = acidFbm(
    mat2(0.84, -0.54, 0.54, 0.84) * warpedCoordinate * 2.75 +
      vec2(0.095, -0.064) * flowTime - 37.2
  );

  float filmSignal =
    bodyVariation * 0.24 +
    secondaryVariation * 0.32 +
    filmDetail * 0.44;
  float film = smoothstep(0.545, 0.665, filmSignal);
  float filmCore = smoothstep(0.645, 0.745, filmSignal);
  float filmEdge = clamp(film - filmCore, 0.0, 1.0);

  float bubbleRing = 0.0;
  float bubbleInterior = 0.0;
  vec2 bubbleDistortion = (vec2(secondaryVariation, bodyVariation) - 0.5) * 0.48;
  evaluateAcidBubbles(
    worldCoordinate + bubbleDistortion,
    uTime,
    bubbleRing,
    bubbleInterior
  );
  bubbleRing *= uBubbleStrength;
  bubbleInterior *= uBubbleStrength;

  float bodyMix = smoothstep(0.26, 0.72, bodyVariation) * 0.72;
  vec3 colour = mix(uDeepColour, uMidColour, bodyMix);
  colour = mix(colour, uFilmColour, film * 0.62);
  colour = mix(colour, uFilmColour * 1.05, filmEdge * 0.28);
  colour = mix(colour, uDeepColour * 0.74, bubbleInterior * 0.30);
  colour = mix(colour, uBubbleColour, bubbleRing * 0.48);

  AcidSurfaceSample surfaceSample;
  surfaceSample.colour = colour;
  surfaceSample.bodyVariation = bodyVariation;
  surfaceSample.film = film;
  surfaceSample.filmEdge = filmEdge;
  surfaceSample.bubbleRing = bubbleRing;
  surfaceSample.bubbleInterior = bubbleInterior;
  surfaceSample.surfaceHeight =
    bodyVariation * 0.36 +
    secondaryVariation * 0.24 +
    filmDetail * 0.11 +
    film * 0.04 -
    bubbleInterior * 0.12 +
    bubbleRing * 0.045;
  return surfaceSample;
}
`;

export const acidSurfaceFragmentColour = /* glsl */ `
AcidSurfaceSample acidSurface = evaluateAcidSurface(vAcidWorldPosition.xz);
vec3 acidFoundation = diffuseColor.rgb;
diffuseColor.rgb = acidSurface.colour * mix(
  vec3(1.0),
  acidFoundation,
  0.025
);
`;

export const acidSurfaceFragmentRoughness = /* glsl */ `
float acidRoughness = mix(0.29, 0.46, acidSurface.film);
acidRoughness += (acidSurface.bodyVariation - 0.5) * 0.05;
acidRoughness = mix(acidRoughness, 0.17, acidSurface.bubbleRing);
roughnessFactor = clamp(acidRoughness, 0.16, 0.48);
`;

export const acidSurfaceFragmentNormal = /* glsl */ `
// Screen derivatives convert the procedural height gradient into the current
// view-space tangent frame. This changes only reflected light, never geometry.
vec3 acidPositionDerivativeX = dFdx(-vViewPosition);
vec3 acidPositionDerivativeY = dFdy(-vViewPosition);
vec3 acidTangentPerpendicularX = cross(acidPositionDerivativeY, normal);
vec3 acidTangentPerpendicularY = cross(normal, acidPositionDerivativeX);
float acidOrientation = dot(
  acidPositionDerivativeX,
  acidTangentPerpendicularX
);
vec3 acidHeightGradient = sign(acidOrientation) * (
  dFdx(acidSurface.surfaceHeight) * acidTangentPerpendicularX +
  dFdy(acidSurface.surfaceHeight) * acidTangentPerpendicularY
);
normal = normalize(
  abs(acidOrientation) * normal - acidHeightGradient * 0.18
);
`;

export const acidSurfaceFragmentEmission = /* glsl */ `
vec3 acidViewDirection = normalize(vViewPosition);
float acidFresnel = pow(
  1.0 - saturate(dot(normalize(normal), acidViewDirection)),
  3.0
);
float acidEmissionMask =
  acidSurface.film * 0.12 +
  acidSurface.filmEdge * 0.14 +
  acidSurface.bubbleRing * 0.58 +
  acidFresnel * 0.10;
totalEmissiveRadiance +=
  mix(uFilmColour, uBubbleColour, acidSurface.bubbleRing) *
  acidEmissionMask *
  uEmissionStrength;
`;
