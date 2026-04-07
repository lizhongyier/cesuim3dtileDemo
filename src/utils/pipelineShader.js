import {
  Cartesian3,
  CustomShader,
  CustomShaderMode,
  LightingModel,
  TextureUniform,
  UniformType,
} from "cesium";
const pipelineShader = (pipiLineParameters) => {
  const PIPE_TEXTURES = {
    baseColor: "/textures/pipe-metal-oxidized/Metal024_1K-JPG_Color.png",
    normal: "/textures/pipe-metal-oxidized/Metal024_1K-JPG_NormalGL.png",
    metallicRoughness:
      "/textures/pipe-metal-oxidized/Metal024_1K-JPG_Roughness_Metalness.png",
  };
  const createSolidTexture = (red, green, blue, alpha) => {
    return new TextureUniform({
      typedArray: new Uint8Array([red, green, blue, alpha]),
      width: 1,
      height: 1,
    });
  };
  const DEFAULT_OCCLUSION_TEXTURE = createSolidTexture(255, 255, 255, 255);
  const DEFAULT_EMISSIVE_TEXTURE = createSolidTexture(0, 0, 0, 255);
  const PIPE_DEBUG_VIEW_VALUES = {
    off: 0,
    "attribute-normal": 1,
    roughness: 2,
    metallic: 3,
  };
  const customShaderOpt = new CustomShader({
    mode: CustomShaderMode.REPLACE_MATERIAL,
    lightingModel: LightingModel.PBR,
    uniforms: {
      u_baseColorTex: {
        type: UniformType.SAMPLER_2D,
        value: new TextureUniform({ url: PIPE_TEXTURES.baseColor }),
      },
      u_normalTex: {
        type: UniformType.SAMPLER_2D,
        value: new TextureUniform({ url: PIPE_TEXTURES.normal }),
      },
      u_metallicRoughnessTex: {
        type: UniformType.SAMPLER_2D,
        value: new TextureUniform({ url: PIPE_TEXTURES.metallicRoughness }),
      },
      u_occlusionTex: {
        type: UniformType.SAMPLER_2D,
        value: DEFAULT_OCCLUSION_TEXTURE,
      },
      u_emissiveTex: {
        type: UniformType.SAMPLER_2D,
        value: DEFAULT_EMISSIVE_TEXTURE,
      },
      u_baseColorTint: {
        type: UniformType.VEC3,
        value: new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      },
      u_metallicScale: {
        type: UniformType.FLOAT,
        value: pipiLineParameters.metallicScale,
      },
      u_roughnessScale: {
        type: UniformType.FLOAT,
        value: pipiLineParameters.roughnessScale,
      },
      u_normalScale: {
        type: UniformType.FLOAT,
        value: pipiLineParameters.normalScale,
      },
      u_occlusionStrength: {
        type: UniformType.FLOAT,
        value: 0.0,
      },
      u_debugViewMode: {
        type: UniformType.INT,
        value: PIPE_DEBUG_VIEW_VALUES.off,
      },
      u_hasOcclusionTex: {
        type: UniformType.BOOL,
        value: false,
      },
      u_hasEmissiveTex: {
        type: UniformType.BOOL,
        value: false,
      },
    },
    fragmentShaderText: `
    vec2 rotatePipeTexCoord90(vec2 texCoord) {
      vec2 centered = texCoord - vec2(0.5);
      return vec2(centered.y, -centered.x) + vec2(0.5);
    }

    mat3 computeCotangentFrame(vec3 normalEC, vec3 positionEC, vec2 texCoord) {
      vec3 dp1 = dFdx(positionEC);
      vec3 dp2 = dFdy(positionEC);
      vec2 duv1 = dFdx(texCoord);
      vec2 duv2 = dFdy(texCoord);
      vec3 dp2perp = cross(dp2, normalEC);
      vec3 dp1perp = cross(normalEC, dp1);
      vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
      vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
      float invMax = inversesqrt(max(dot(tangent, tangent), dot(bitangent, bitangent)));
      return mat3(tangent * invMax, bitangent * invMax, normalEC);
    }

    vec3 applyNormalMap(vec3 baseNormalEC, vec3 positionEC, vec2 texCoord) {
      vec3 normalSample = texture(u_normalTex, texCoord).xyz * 2.0 - 1.0;
      vec3 scaledNormalTS = normalize(vec3(
        normalSample.xy * u_normalScale,
        max(normalSample.z, 0.001)
      ));
      mat3 tbn = computeCotangentFrame(baseNormalEC, positionEC, texCoord);
      return normalize(tbn * scaledNormalTS);
    }

    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      vec2 texCoord = rotatePipeTexCoord90(fsInput.attributes.texCoord_0);
      vec4 baseColorSample = texture(u_baseColorTex, texCoord);
      vec4 metallicRoughnessSample = texture(u_metallicRoughnessTex, texCoord);
      vec3 baseColor = clamp(baseColorSample.rgb * u_baseColorTint, 0.0, 1.0);
      float alpha = baseColorSample.a;
      float roughness = clamp(metallicRoughnessSample.g * u_roughnessScale, 0.04, 1.0);
      float metallic = clamp(metallicRoughnessSample.b * u_metallicScale, 0.0, 1.0);
      vec3 rawNormalEC = fsInput.attributes.normalEC;
      float rawNormalLength = length(rawNormalEC);
      vec3 geometryNormalEC = rawNormalLength > 0.0
        ? rawNormalEC / rawNormalLength
        : vec3(0.0, 0.0, 1.0);
      vec3 normalEC = applyNormalMap(
        geometryNormalEC,
        fsInput.attributes.positionEC,
        texCoord
      );
      vec3 viewDirectionEC = normalize(-fsInput.attributes.positionEC);

      if (dot(normalEC, viewDirectionEC) < 0.0) {
        normalEC = -normalEC;
      }

      if (u_debugViewMode != 0) {
        if (u_debugViewMode == 1) {
          vec3 debugColor = rawNormalLength > 0.0
            ? geometryNormalEC * 0.5 + 0.5
            : vec3(1.0, 0.0, 1.0);
          material.occlusion = 1.0;
          material.emissive = debugColor;
          material.baseColor = vec4(debugColor, 1.0);
          material.diffuse = vec3(0.0);
          material.specular = vec3(0.0);
          material.roughness = 1.0;
          material.normalEC = geometryNormalEC;
          material.alpha = 1.0;
          return;
        }

        if (u_debugViewMode == 2) {
          vec3 debugColor = vec3(roughness);
          material.occlusion = 1.0;
          material.emissive = debugColor;
          material.baseColor = vec4(debugColor, 1.0);
          material.diffuse = vec3(0.0);
          material.specular = vec3(0.0);
          material.roughness = 1.0;
          material.normalEC = normalEC;
          material.alpha = 1.0;
          return;
        }

        vec3 debugColor = vec3(metallic);
        material.occlusion = 1.0;
        material.emissive = debugColor;
        material.baseColor = vec4(debugColor, 1.0);
        material.diffuse = vec3(0.0);
        material.specular = vec3(0.0);
        material.roughness = 1.0;
        material.normalEC = normalEC;
        material.alpha = 1.0;
        return;
      }

      vec3 f0 = mix(vec3(0.04), baseColor, metallic);
      vec3 diffuseColor = baseColor * (1.0 - metallic) * 0.96;

      material.occlusion = 1.0;
      if (u_hasOcclusionTex) {
        float occlusion = texture(u_occlusionTex, texCoord).r;
        material.occlusion = mix(1.0, occlusion, u_occlusionStrength);
      }

      material.emissive = u_hasEmissiveTex
        ? texture(u_emissiveTex, texCoord).rgb
        : vec3(0.0);
      material.baseColor = vec4(baseColor, alpha);
      material.diffuse = diffuseColor;
      material.specular = f0;
      material.roughness = roughness;
      material.normalEC = normalEC;
      material.alpha = alpha;
    }
    `,
  });
  return customShaderOpt;
}
export default pipelineShader
