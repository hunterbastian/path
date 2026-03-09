import * as THREE from 'three';

type ProceduralParallaxKind = 'terrain' | 'concrete' | 'steel';

interface ProceduralParallaxOptions {
  kind: ProceduralParallaxKind;
  strength?: number;
  scale?: number;
  secondaryScale?: number;
  useTerrainMasks?: boolean;
}

const DEFAULTS: Record<
  ProceduralParallaxKind,
  Required<Omit<ProceduralParallaxOptions, 'kind' | 'useTerrainMasks'>>
> = {
  terrain: {
    strength: 0.18,
    scale: 0.12,
    secondaryScale: 2.6,
  },
  concrete: {
    strength: 0.09,
    scale: 0.38,
    secondaryScale: 3.2,
  },
  steel: {
    strength: 0.06,
    scale: 0.42,
    secondaryScale: 2.4,
  },
};

export function applyProceduralParallax(
  material: THREE.MeshStandardMaterial,
  options: ProceduralParallaxOptions,
): void {
  const defaults = DEFAULTS[options.kind];
  const strength = options.strength ?? defaults.strength;
  const scale = options.scale ?? defaults.scale;
  const secondaryScale = options.secondaryScale ?? defaults.secondaryScale;
  const useTerrainMasks = options.useTerrainMasks ?? false;
  const existingOnBeforeCompile = material.onBeforeCompile;
  const existingCustomProgramCacheKey = material.customProgramCacheKey?.bind(material);

  material.customProgramCacheKey = () =>
    `${existingCustomProgramCacheKey?.() ?? 'standard'}|procedural-parallax:${options.kind}:${strength}:${scale}:${secondaryScale}:${useTerrainMasks ? 1 : 0}`;

  material.onBeforeCompile = (shader, renderer) => {
    existingOnBeforeCompile?.call(material, shader, renderer);

    shader.uniforms.uParallaxStrength = { value: strength };
    shader.uniforms.uParallaxScale = { value: scale };
    shader.uniforms.uParallaxSecondaryScale = { value: secondaryScale };

    const terrainVertexDeclarations = useTerrainMasks
      ? `
attribute float roadMask;
attribute float snowMask;
varying float vRoadMask;
varying float vSnowMask;
`
      : '';

    const terrainFragmentDeclarations = useTerrainMasks
      ? `
varying float vRoadMask;
varying float vSnowMask;
`
      : '';

    const terrainVertexAssignments = useTerrainMasks
      ? `
  vRoadMask = roadMask;
  vSnowMask = snowMask;
`
      : '';

    const terrainRoadMask = useTerrainMasks ? 'vRoadMask' : '0.0';
    const terrainSnowMask = useTerrainMasks
      ? 'vSnowMask'
      : 'smoothstep(0.58, 0.98, normalize(vParallaxWorldNormal).y) * smoothstep(6.0, 20.0, vParallaxWorldPos.y) * 0.28';

    const heightExpression =
      options.kind === 'terrain'
        ? 'parallaxTerrainHeight(coord, roadMaskValue, snowMaskValue)'
        : options.kind === 'concrete'
          ? 'parallaxConcreteHeight(coord)'
          : 'parallaxSteelHeight(coord)';

    const colorLogic =
      options.kind === 'terrain'
        ? `
float parallaxRoadMask = ${terrainRoadMask};
float parallaxSnowMask = ${terrainSnowMask};
vec3 parallaxWorldNormal = normalize(vParallaxWorldNormal);
vec3 parallaxViewDir = normalize(cameraPosition - vParallaxWorldPos);
float parallaxDetail = sampleParallaxDetail(
  vParallaxWorldPos,
  parallaxWorldNormal,
  parallaxViewDir,
  parallaxRoadMask,
  parallaxSnowMask
);
float parallaxTrough = smoothstep(0.0, 0.42, 1.0 - parallaxDetail);
float parallaxRidge = smoothstep(0.58, 0.95, parallaxDetail);
diffuseColor.rgb *= mix(0.9, 1.08, parallaxDetail);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7, parallaxTrough * (0.12 + parallaxRoadMask * 0.24));
diffuseColor.rgb += vec3(0.05, 0.035, 0.02) * parallaxRidge * parallaxRoadMask * 0.2;
diffuseColor.rgb += vec3(0.04, 0.06, 0.09) * parallaxRidge * parallaxSnowMask * 0.18;
`
        : `
float parallaxRoadMask = 0.0;
float parallaxSnowMask = ${terrainSnowMask};
vec3 parallaxWorldNormal = normalize(vParallaxWorldNormal);
vec3 parallaxViewDir = normalize(cameraPosition - vParallaxWorldPos);
float parallaxDetail = sampleParallaxDetail(
  vParallaxWorldPos,
  parallaxWorldNormal,
  parallaxViewDir,
  parallaxRoadMask,
  parallaxSnowMask
);
float parallaxTrough = smoothstep(0.0, 0.45, 1.0 - parallaxDetail);
float parallaxRidge = smoothstep(0.62, 0.96, parallaxDetail);
diffuseColor.rgb *= mix(0.92, 1.05, parallaxDetail);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.74, parallaxTrough * 0.22);
diffuseColor.rgb += vec3(0.05, 0.06, 0.08) * parallaxRidge * parallaxSnowMask * 0.16;
`;

    const roughnessBoost =
      options.kind === 'terrain'
        ? 'roughnessFactor = clamp(roughnessFactor + (1.0 - parallaxDetail) * 0.12, 0.0, 1.0);'
        : 'roughnessFactor = clamp(roughnessFactor + (1.0 - parallaxDetail) * 0.06, 0.0, 1.0);';

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vParallaxWorldPos;
varying vec3 vParallaxWorldNormal;
${terrainVertexDeclarations}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vec4 parallaxWorldPosition = modelMatrix * vec4(transformed, 1.0);
  vParallaxWorldPos = parallaxWorldPosition.xyz;
  vParallaxWorldNormal = normalize(mat3(modelMatrix) * normal);
${terrainVertexAssignments}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vParallaxWorldPos;
varying vec3 vParallaxWorldNormal;
${terrainFragmentDeclarations}
uniform float uParallaxStrength;
uniform float uParallaxScale;
uniform float uParallaxSecondaryScale;

float parallaxHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float parallaxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(parallaxHash12(i), parallaxHash12(i + vec2(1.0, 0.0)), f.x),
    mix(parallaxHash12(i + vec2(0.0, 1.0)), parallaxHash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float parallaxFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i += 1) {
    value += amplitude * parallaxNoise(p);
    p = p * 2.03 + vec2(17.13, -11.72);
    amplitude *= 0.5;
  }
  return value;
}

float parallaxTerrainHeight(vec2 p, float roadMaskValue, float snowMaskValue) {
  float macro = parallaxFbm(p * 0.55 + vec2(11.0, -8.0));
  float pebbles = parallaxFbm(p * uParallaxSecondaryScale + vec2(3.0, 19.0));
  float crust = abs(parallaxNoise(p * 1.8 + vec2(-9.0, 4.0)) * 2.0 - 1.0);
  float drift = parallaxFbm(p * 1.15 + vec2(17.0, 5.0));
  float dirt = mix(macro, pebbles, 0.38);
  float snow = mix(drift, 1.0 - crust, 0.4);
  float roadBreakup = mix(dirt, crust, roadMaskValue * 0.48);
  return clamp(
    mix(roadBreakup, snow, snowMaskValue * 0.78)
      - roadMaskValue * smoothstep(0.56, 0.94, pebbles) * 0.18,
    0.0,
    1.0
  );
}

float parallaxConcreteHeight(vec2 p) {
  vec2 grid = abs(fract(p * 0.75) - 0.5);
  float seam = 1.0 - smoothstep(0.42, 0.49, max(grid.x, grid.y));
  float pores = parallaxFbm(p * uParallaxSecondaryScale + vec2(2.0, 13.0));
  float chips = smoothstep(0.62, 0.94, parallaxFbm(p * 1.25 + vec2(-7.0, 4.0)));
  return clamp(0.56 + pores * 0.18 + chips * 0.1 - seam * 0.34, 0.0, 1.0);
}

float parallaxSteelHeight(vec2 p) {
  float brushed = parallaxFbm(
    vec2(p.x * uParallaxSecondaryScale * 1.6, p.y * 0.48) + vec2(8.0, -5.0)
  );
  float seam = 1.0 - smoothstep(0.44, 0.49, abs(fract(p.y * 0.75) - 0.5));
  float dents = smoothstep(0.72, 0.96, parallaxFbm(p * 1.05 + vec2(-4.0, 9.0)));
  return clamp(0.5 + brushed * 0.15 + dents * 0.12 - seam * 0.24, 0.0, 1.0);
}

float sampleParallaxHeight(vec2 coord, float roadMaskValue, float snowMaskValue) {
  return ${heightExpression};
}

float sampleParallaxDetail(
  vec3 worldPos,
  vec3 worldNormal,
  vec3 viewDir,
  float roadMaskValue,
  float snowMaskValue
) {
  vec3 blend = pow(abs(worldNormal), vec3(5.0));
  blend /= max(dot(blend, vec3(1.0)), 0.0001);

  vec2 coordX = worldPos.yz * uParallaxScale;
  float heightX = sampleParallaxHeight(coordX, roadMaskValue, snowMaskValue);
  coordX += viewDir.yz * (heightX - 0.5) * uParallaxStrength;
  heightX = sampleParallaxHeight(coordX, roadMaskValue, snowMaskValue);

  vec2 coordY = worldPos.xz * uParallaxScale;
  float heightY = sampleParallaxHeight(coordY, roadMaskValue, snowMaskValue);
  coordY += viewDir.xz * (heightY - 0.5) * uParallaxStrength;
  heightY = sampleParallaxHeight(coordY, roadMaskValue, snowMaskValue);

  vec2 coordZ = worldPos.xy * uParallaxScale;
  float heightZ = sampleParallaxHeight(coordZ, roadMaskValue, snowMaskValue);
  coordZ += viewDir.xy * (heightZ - 0.5) * uParallaxStrength;
  heightZ = sampleParallaxHeight(coordZ, roadMaskValue, snowMaskValue);

  return heightX * blend.x + heightY * blend.y + heightZ * blend.z;
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
${colorLogic}`,
      )
      .replace(
        'float roughnessFactor = roughness;',
        `float roughnessFactor = roughness;
${roughnessBoost}`,
      );
  };

  material.needsUpdate = true;
}
