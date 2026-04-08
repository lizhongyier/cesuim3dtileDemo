import {
  Cartesian3,
  CustomShader,
  CustomShaderMode,
  LightingModel,
  TextureUniform,
  UniformType,
} from "cesium";
const animationPipelineShader = (pipiLineParameters) => {
  const PIPE_TEXTURES = {
    baseColor: "/textures/pipe-metal-oxidized/Metal024_1K-JPG_Color.png",
    normal: "/textures/pipe-metal-oxidized/Metal024_1K-JPG_NormalGL.png",
    metallicRoughness:
      "",
    // metallicRoughness:
    //   "/textures/pipe-metal-oxidized/Metal024_1K-JPG_Roughness_Metalness.png",
  };

  const FLOW_TEXTURE = "/textures/lineTexture/bj3.png";

  const createSolidTexture = (red, green, blue, alpha) => {
    return new TextureUniform({
      typedArray: new Uint8Array([red, green, blue, alpha]),
      width: 1,
      height: 1,
    });
  };

  const DEFAULT_OCCLUSION_TEXTURE = createSolidTexture(255, 255, 255, 255);
  const DEFAULT_EMISSIVE_TEXTURE = createSolidTexture(0, 0, 0, 255);

  const FLOW_CONFIG = {
    speed: 0.2,
    intensity: 2.5,
    color: new Cartesian3(pipiLineParameters.flowColor.red, pipiLineParameters.flowColor.green, pipiLineParameters.flowColor.blue),
    uvScale: 1.0, // 整体UV缩放
    repeatX: 0.03, // 新增：横向重复次数（越大=横向越短/密集，越小=横向越长/稀疏）
    repeatY: 1.0, // 新增：纵向重复次数
    direction: 0,
  };

  const customShaderOpt = new CustomShader({
    mode: CustomShaderMode.MODIFY_MATERIAL,
    lightingModel: LightingModel.PBR,
    uniforms: {
      // ... 原有PBR贴图保持不变 ...
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

      // 流动贴图和参数
      u_flowTexture: {
        type: UniformType.SAMPLER_2D,
        value: new TextureUniform({ url: FLOW_TEXTURE }),
      },
      u_time: { type: UniformType.FLOAT, value: 0.0 },
      u_flowSpeed: { type: UniformType.FLOAT, value: FLOW_CONFIG.speed },
      u_flowIntensity: {
        type: UniformType.FLOAT,
        value: FLOW_CONFIG.intensity,
      },
      u_flowColor: {
        type: UniformType.VEC3,
        value: FLOW_CONFIG.color,
      },
      u_flowUVScale: { type: UniformType.FLOAT, value: FLOW_CONFIG.uvScale },
      // 新增：独立控制横向和纵向重复
      u_flowRepeatX: { type: UniformType.FLOAT, value: FLOW_CONFIG.repeatX },
      u_flowRepeatY: { type: UniformType.FLOAT, value: FLOW_CONFIG.repeatY },
      u_flowDirection: { type: UniformType.INT, value: FLOW_CONFIG.direction },
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

    // ========== 流动动画函数（支持独立XY重复）==========
    vec4 calculateFlow(vec2 baseUV) {
      // 旋转UV 90度，让水平贴图适配纵向管子
      vec2 rotatedUV = vec2(baseUV.t, baseUV.s);
      
      // 关键修改：独立控制横向和纵向重复
      // 注意：由于UV旋转了，这里的X对应管子的长度方向，Y对应环绕方向
      vec2 repeatUV = vec2(
        rotatedUV.x * u_flowRepeatX,  // 横向（长度方向）重复
        rotatedUV.y * u_flowRepeatY   // 纵向（环绕方向）重复
      );
      
      // 应用整体缩放（可选，保留兼容）
      vec2 scaledUV = repeatUV * u_flowUVScale;
      
      // 计算流动偏移
      float flowOffset = u_time * u_flowSpeed;
      
      // 根据方向选择流动轴向
      vec2 flowUV;
      if (u_flowDirection == 0) {
        // 沿管子长度方向流动（X轴）
        flowUV = vec2(fract(scaledUV.s - flowOffset), scaledUV.t);
      } else {
        // 环绕管子流动（Y轴）
        flowUV = vec2(scaledUV.s, fract(scaledUV.t - flowOffset));
      }
      
      // 采样流动贴图
      vec4 flowSample = texture(u_flowTexture, flowUV);
      
      // 应用颜色染色和强度
      vec3 coloredFlow = flowSample.rgb * u_flowColor;
      float alpha = flowSample.a * u_flowIntensity;
      
      return vec4(coloredFlow, alpha);
    }

    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      vec2 texCoord = rotatePipeTexCoord90(fsInput.attributes.texCoord_0);
      
      // 采样基础PBR材质
      vec4 baseColorSample = texture(u_baseColorTex, texCoord);
      vec4 metallicRoughnessSample = texture(u_metallicRoughnessTex, texCoord);
      vec3 baseColor = clamp(baseColorSample.rgb * u_baseColorTint, 0.0, 1.0);
      float alpha = baseColorSample.a;
      float roughness = clamp(metallicRoughnessSample.g * u_roughnessScale, 0.04, 1.0);
      float metallic = clamp(metallicRoughnessSample.b * u_metallicScale, 0.0, 1.0);
      
      // 法线计算
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

      // 流动效果计算
      vec4 flowResult = calculateFlow(texCoord);
      
      // 叠加模式：基础颜色 + 流动效果
      vec3 finalBaseColor = baseColor + flowResult.rgb * flowResult.a;
      finalBaseColor = clamp(finalBaseColor, 0.0, 1.0);
      
      // 自发光增强
      vec3 emissive = flowResult.rgb * flowResult.a * 0.5;

      // PBR材质组装
      vec3 f0 = mix(vec3(0.04), finalBaseColor, metallic);
      vec3 diffuseColor = finalBaseColor * (1.0 - metallic) * 0.96;

      material.occlusion = 1.0;
      material.emissive = emissive;
      material.baseColor = vec4(finalBaseColor, alpha);
      material.diffuse = diffuseColor;
      material.specular = f0;
      material.roughness = roughness;
      material.normalEC = normalEC;
      material.alpha = alpha;
    }
    `,
  });
  return customShaderOpt;
};
export default animationPipelineShader
