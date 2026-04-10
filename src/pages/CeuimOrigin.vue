<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";
import * as Cesium from "cesium";
import CesiumNavigaion from "cesium-navigation-es6";
import skyBox from "@/utils/skyBox";
import { Cartesian3, UniformType } from "cesium";
import { addBloomEffect } from "@/utils/addBloomEffect";
import * as dat from "dat.gui";
import animationPipelineShader from "@/utils/animationPipelineShader";
import pipelineShader from "@/utils/pipelineShader";
import CesiumPopup from "@/utils/cesuimPopup";
const cesiumContainer = ref(null);
let viewer = null;
let scene = null;
let pipelineTile = null;
let pointTile = null;
let buildingTile = null;
let imageBasedLighting = null;
let pipelineShaderRef = null;
let pointShaderRef = null;
let animationId = null;
let handler = null;
let isAnimating = false;
let fenceAnimationPrimitives = [];
const gui = new dat.GUI();

// ========== 楼宇渐变颜色参数 ==========
const buildingParameters = {
  // 底部颜色 (默认深蓝色)
  startColor: {
    red: 0.0,
    green: 0.0,
    blue: 0.0,
  },
  // 顶部颜色 (默认亮青色)
  endColor: {
    red: 0.4,
    green: 0.45,
    blue: 0.55,
  },
  // 最小高度 (用于归一化)
  minHeight: 0.0,
  // 最大高度 (用于归一化)
  maxHeight: 18.0,
  // 渐变强度 (0-1, 1为完全渐变，0为纯色)
  gradientIntensity: 1.0,
  // 是否启用高度渐变
  enableGradient: true,
};

const pipiLineParameters = {
  baseColorTint: {
    red: 0.1,
    green: 0.11,
    blue: 0.12,
  },
  flowColor: {
    red: 1.0,
    green: 0.5,
    blue: 0.01,
  },
  metallicScale: 0.2,
  roughnessScale: 0.9,
  normalScale: 0.1,
};

const heatplantParameters = {
  baseColor: "#FFFFFF",
  scale: 1200.0, // 根据模型实际尺寸调整
  colorBlendMode: "HIGHLIGHT", // 模型颜色混合模式HIGHLIGHT | REPLACE | MIX
  colorBlendAmount: 1, // 混色强度（1是纯色，0是模型原色）
};

const fenceParameters = {
  width: 260.0,
  depth: 260.0,
  wallHeight: 120.0,
  bottomHeight: 6.0, // 墙底部重点线高度
  baseColor: "#FF8843", // 底部圆环颜色
  baseExpandSpeed: 0.6,
  baseExpandMax: 2.5,
  wallColor: "#FF8843", // 墙底部颜色
  wallOpacity: 1, // 从0.6改为0.4，更透明
  particleColor: "#FF8843", // 贴图颜色
  particleSpeed: 0.5, // 贴图上升速度
  particleDensity: 50, // 亮度
};

const substationModelMatrix = (coord) => {
  return Cesium.Transforms.headingPitchRollToFixedFrame(
    Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0),
    new Cesium.HeadingPitchRoll(0, 0, 0),
  );
};

const addBillboard = (coord, height, imgUrl, type) => {
  if (!imgUrl) {
    return;
  }
  let billboard = {
    image: imgUrl,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    // 距离在2000-10000之间的时候，Billboard的Scale比例按照1->0之间的插值来缩放
    scaleByDistance: new Cesium.NearFarScalar(2000, 1, 10000, 0.5),
    width: 40,//换热站大小
    height: 40
  }
  if (type === 'heatplant') {
    // 热源情况
    billboard = {
      image: imgUrl,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      // 距离在2000-10000之间的时候，Billboard的Scale比例按照1->0之间的插值来缩放
      scaleByDistance: new Cesium.NearFarScalar(2000, 1, 10000, 0.5),
      width: 50,//热源大小
      height: 50
    }
  }
  viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(coord[0], coord[1], height),
    billboard: billboard,
  });
};

const substationList = ref([]);

onMounted(() => {
  console.log(cesiumContainer.value);
  if (!cesiumContainer.value) return;
  initViewer();
  initLight();
  add3DTiles();
  addSubStations();
  addHeatplants();
});

const initViewer = () => {
  viewer = new Cesium.Viewer(cesiumContainer.value, {
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    animation: false,
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: "",
      minimumLevel: 3,
      maximumLevel: 18,
    }),
  });
  viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: "your url",
      minimumLevel: 3,
      maximumLevel: 18,
    }),
  );
  scene = viewer.scene;
  window.viewer = viewer;
  viewer.resolutionScale = window.devicePixelRatio;
  // 开启抗锯齿
  scene.fxaa = true;
  scene.postProcessStages.fxaa.enabled = true;
  // viewer.antialias = true;

  scene.globe.baseColor = Cesium.Color.GRAY;
  viewer.camera.setView({
    // Cesium的坐标是以地心为原点，一向指向南美洲，一向指向亚洲，一向指向北极州
    // fromDegrees()方法，将经纬度和高程转换为世界坐标
    destination: Cesium.Cartesian3.fromDegrees(
      113.84888797556859,
      34.00735651393037,
      1800,
    ),
    orientation: {
      // 指向
      heading: 6.283185307179581,
      // 视角
      pitch: -0.17747153403675142,
      roll: 0.0,
    },
  });
  // 设置导航罗盘的配置
  let options = {
    // 启用罗盘
    enableCompass: true,
    // 是否启用缩放
    enableZoomControls: true,
    // 是否启用指南针外环
    enableCompassOuterRing: true,
    // 是否启用距离的图例
    enableDistanceLegend: true,
  };
  // 初始化导航罗盘
  let navigation = new CesiumNavigaion(viewer, options);
  // viewer.imageryLayers.removeAll();
};

const initLight = () => {
  scene.globe.enableLighting = true;
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(
    new Date(2023, 4, 15, 10),
  );
  scene.debugShowFramesPerSecond = true; //显示帧率信息
  // scene.envMapIntensity = 0.55; //设置环境贴图强度
  scene.sun.show = true; //显示太阳

  viewer.shadows = true;
  //  UE阴影 设置为false，使用原来的软阴影效果；设置为true，实现了新的阴影算法，可以大幅度提升阴影边界的质量，看起来会非常柔和，没有锯齿。这个设置webgl2.0默认开启了。
  ((viewer.pcss = true),
    // viewer.shadowQuality = 0,
    //设置阴影的出现距离
    (scene.shadowMap.maximumDistance = 2000));
  // 阴影贴图的分辨率：值越大（如 4096）平坦地面的阴影越清晰，但也更消耗显存性能
  scene.shadowMap.size = 4096;
  scene.shadowMap.numberOfCascades = 4;
  // scene.shadowMap.softShadows = true;
  //设置阴影的浓度，值越高，阴影越淡
  scene.shadowMap.darkness = 0.7;
  //默认值是0.1，值越小越清晰
  scene.shadowMap.penumbraRatio = 1.8;

  // 天空盒
  const { addPostRender, removePostRender } = skyBox(viewer);
  addPostRender();
  // scene.specularEnvironmentMaps = "./textures/rooftop_night_1k_4.ktx2";
  // scene.envMapIntensity = 1.3;
  // 设置fog
  const fogBrightness = 1; // 0-1
  const fogIntensity = 4; // 0-2
  scene.fog.enabled = true;
  scene.fog.density = 2.0e-4 * fogIntensity;
  scene.fog.minimumBrightness = fogBrightness;

  // 设置天空大气
  const RayleighCoefficientR = 20; // 0-100
  const RayleighCoefficientG = 20; // 0-100
  const RayleighCoefficientB = 100; // 0-100
  const RayleighScaleHeight = 150; // 0-20000
  const skyAtmosphere = scene.skyAtmosphere;
  skyAtmosphere.show = true;
  skyAtmosphere.atmosphereRayleighCoefficient.x =
    parseFloat(RayleighCoefficientR) * 1e-6;
  skyAtmosphere.atmosphereRayleighCoefficient.y =
    parseFloat(RayleighCoefficientG) * 1e-6;
  skyAtmosphere.atmosphereRayleighCoefficient.z =
    parseFloat(RayleighCoefficientB) * 1e-6;
  skyAtmosphere.atmosphereRayleighScaleHeight = parseFloat(RayleighScaleHeight);

  // ========== 添加泛光效果 ==========
  addBloomEffect(scene, Cesium);
};

const add3DTiles = () => {
  let urls = [
    "./tiles/xuchang2/Building/tileset.json",
    "./tiles/xuchang2/Line/tileset.json",
    "./tiles/xuchang2/Point_Auto/tileset.json",
    "./tiles/xuchang2/Point_Prefab/tileset.json",
  ];
  const fileRequest = urls.map((url) => {
    return Cesium.Cesium3DTileset.fromUrl(url, {});
  });
  Promise.all(fileRequest).then((tilesets) => {
    tilesets.forEach((tileset, index) => {
      console.log(tileset);
      if (tileset._basePath.indexOf("Line") > -1) {
        pipelineTile = tileset;
      }
      if (tileset._basePath.indexOf("Building") > -1) {
        buildingTile = tileset;
      }
      if (tileset._basePath.indexOf("Point_Auto") > -1) {
        pointTile = tileset;
      }
      scene.primitives.add(tileset);
    });

    if (pipelineTile) {
      const environmentMapURL =
        "https://cesium.com/public/SandcastleSampleData/kiara_6_afternoon_2k_ibl.ktx2";

      const L00 = new Cesium.Cartesian3(
        1.234897375106812,
        1.221635103225708,
        1.273374080657959,
      );
      const L1_1 = new Cesium.Cartesian3(
        1.136140108108521,
        1.171419978141785,
        1.287894368171692,
      );
      const L10 = new Cesium.Cartesian3(
        1.245410919189453,
        1.245791077613831,
        1.283067107200623,
      );
      const L11 = new Cesium.Cartesian3(
        1.107124328613281,
        1.112697005271912,
        1.153419137001038,
      );
      const L2_2 = new Cesium.Cartesian3(
        1.08641505241394,
        1.079904079437256,
        1.10212504863739,
      );
      const L2_1 = new Cesium.Cartesian3(
        1.190043210983276,
        1.186099290847778,
        1.214627981185913,
      );
      const L20 = new Cesium.Cartesian3(
        0.017783647403121,
        0.020140396431088,
        0.025317270308733,
      );
      const L21 = new Cesium.Cartesian3(
        1.087014317512512,
        1.084779262542725,
        1.111417651176453,
      );
      const L22 = new Cesium.Cartesian3(
        -0.052426788955927,
        -0.048315055668354,
        -0.041973855346441,
      );
      const coefficients = [L00, L1_1, L10, L11, L2_2, L2_1, L20, L21, L22];

      imageBasedLighting = new Cesium.ImageBasedLighting({
        sphericalHarmonicCoefficients: coefficients,
        specularEnvironmentMaps: environmentMapURL,
      });
      imageBasedLighting.sphericalHarmonicCoefficients = coefficients;
      imageBasedLighting.specularEnvironmentMaps = environmentMapURL;
      imageBasedLighting.imageBasedLightingFactor = Cesium.Cartesian2.ONE;
      scene.light.intensity = 1; // 环境光
      addPipelineTexture();
    }
    if (buildingTile) {
      const shader = makeBuildingCustomShader();
      buildingTile.customShader = shader;
      // 保存引用以便后续更新
      buildingTile._customShaderRef = shader;
      // 添加楼宇渐变调试面板
      setBuildingParameters(shader);
    }
  });
};

const addPipelineTexture = () => {
  pipelineTile.imageBasedLighting = imageBasedLighting;
  const shader = makeAnimationPipeLieCustomShader();
  pipelineTile.customShader = shader;
  pipelineShaderRef = shader;
  setPipelineParameters();
  if (pointTile) {
    // 管子连接处
    pointTile.imageBasedLighting = imageBasedLighting;
    pointTile.customShader = makePipeLieCustomShader();
  }
  startFlowAnimation();
};

// ========== 新增：楼宇渐变调试面板 ==========
const setBuildingParameters = (shader) => {
  const group = gui.addFolder("楼宇渐变调参");
  group.open();

  // 起始颜色控制
  const startColorFolder = group.addFolder("底部颜色 (Start Color)");
  startColorFolder.open();
  startColorFolder
    .add(buildingParameters.startColor, "red", 0, 1)
    .name("Red")
    .onChange((e) => {
      buildingParameters.startColor.red = e;
      updateBuildingShaderUniforms(shader);
    });
  startColorFolder
    .add(buildingParameters.startColor, "green", 0, 1)
    .name("Green")
    .onChange((e) => {
      buildingParameters.startColor.green = e;
      updateBuildingShaderUniforms(shader);
    });
  startColorFolder
    .add(buildingParameters.startColor, "blue", 0, 1)
    .name("Blue")
    .onChange((e) => {
      buildingParameters.startColor.blue = e;
      updateBuildingShaderUniforms(shader);
    });

  // 结束颜色控制
  const endColorFolder = group.addFolder("顶部颜色 (End Color)");
  endColorFolder.open();
  endColorFolder
    .add(buildingParameters.endColor, "red", 0, 1)
    .name("Red")
    .onChange((e) => {
      buildingParameters.endColor.red = e;
      updateBuildingShaderUniforms(shader);
    });
  endColorFolder
    .add(buildingParameters.endColor, "green", 0, 1)
    .name("Green")
    .onChange((e) => {
      buildingParameters.endColor.green = e;
      updateBuildingShaderUniforms(shader);
    });
  endColorFolder
    .add(buildingParameters.endColor, "blue", 0, 1)
    .name("Blue")
    .onChange((e) => {
      buildingParameters.endColor.blue = e;
      updateBuildingShaderUniforms(shader);
    });

  // 高度范围控制
  group
    .add(buildingParameters, "minHeight", -100, 500)
    .name("最小高度")
    .onChange((e) => {
      buildingParameters.minHeight = e;
      updateBuildingShaderUniforms(shader);
    });
  group
    .add(buildingParameters, "maxHeight", 0, 1000)
    .name("最大高度")
    .onChange((e) => {
      buildingParameters.maxHeight = e;
      updateBuildingShaderUniforms(shader);
    });

  // 渐变强度
  group
    .add(buildingParameters, "gradientIntensity", 0, 1)
    .name("渐变强度")
    .onChange((e) => {
      buildingParameters.gradientIntensity = e;
      updateBuildingShaderUniforms(shader);
    });

  // 是否启用渐变
  group
    .add(buildingParameters, "enableGradient")
    .name("启用渐变")
    .onChange((e) => {
      buildingParameters.enableGradient = e;
      updateBuildingShaderUniforms(shader);
    });

  // 初始化uniform值
  updateBuildingShaderUniforms(shader);
};

// 更新楼宇Shader的Uniform值
const updateBuildingShaderUniforms = (shader) => {
  if (!shader) return;

  shader.setUniform(
    "u_startColor",
    new Cartesian3(
      buildingParameters.startColor.red,
      buildingParameters.startColor.green,
      buildingParameters.startColor.blue,
    ),
  );
  shader.setUniform(
    "u_endColor",
    new Cartesian3(
      buildingParameters.endColor.red,
      buildingParameters.endColor.green,
      buildingParameters.endColor.blue,
    ),
  );
  shader.setUniform("u_minHeight", buildingParameters.minHeight);
  shader.setUniform("u_maxHeight", buildingParameters.maxHeight);
  shader.setUniform(
    "u_gradientIntensity",
    buildingParameters.gradientIntensity,
  );
  shader.setUniform(
    "u_enableGradient",
    buildingParameters.enableGradient ? 1.0 : 0.0,
  );
};

const setPipelineParameters = () => {
  const group = gui.addFolder("管网调参");
  group.open();
  group
    .add(pipiLineParameters.baseColorTint, "red", 0, 1)
    .name("baseColor-red")
    .onChange((e) => {
      pipiLineParameters.baseColorTint.red = e;
      pipelineShaderRef.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
      pointTile.customShader.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters.baseColorTint, "green", 0, 1)
    .name("baseColor-green")
    .onChange((e) => {
      pipiLineParameters.baseColorTint.green = e;
      pipelineShaderRef.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
      pointTile.customShader.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters.baseColorTint, "blue", 0, 1)
    .name("baseColor-blue")
    .onChange((e) => {
      pipiLineParameters.baseColorTint.blue = e;
      pipelineShaderRef.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
      pointTile.customShader.setUniform(
        "u_baseColorTint",
        new Cartesian3(
          pipiLineParameters.baseColorTint.red,
          pipiLineParameters.baseColorTint.green,
          pipiLineParameters.baseColorTint.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters.flowColor, "red", 0, 1)
    .name("flowColor-red")
    .onChange((e) => {
      pipiLineParameters.flowColor.red = e;
      pipelineShaderRef.setUniform(
        "u_flowColor",
        new Cartesian3(
          pipiLineParameters.flowColor.red,
          pipiLineParameters.flowColor.green,
          pipiLineParameters.flowColor.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters.flowColor, "green", 0, 1)
    .name("flowColor-green")
    .onChange((e) => {
      pipiLineParameters.flowColor.green = e;
      pipelineShaderRef.setUniform(
        "u_flowColor",
        new Cartesian3(
          pipiLineParameters.flowColor.red,
          pipiLineParameters.flowColor.green,
          pipiLineParameters.flowColor.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters.flowColor, "blue", 0, 1)
    .name("flowColor-blue")
    .onChange((e) => {
      pipiLineParameters.flowColor.blue = e;
      pipelineShaderRef.setUniform(
        "u_flowColor",
        new Cartesian3(
          pipiLineParameters.flowColor.red,
          pipiLineParameters.flowColor.green,
          pipiLineParameters.flowColor.blue,
        ),
      );
    });
  group
    .add(pipiLineParameters, "metallicScale", 0, 10)
    .name("metallicScale")
    .onChange((e) => {
      pipiLineParameters.metallicScale = e;
      pipelineShaderRef.setUniform(
        "u_metallicScale",
        pipiLineParameters.metallicScale,
      );
      pointTile.customShader.setUniform(
        "u_metallicScale",
        pipiLineParameters.metallicScale,
      );
    });
  group
    .add(pipiLineParameters, "roughnessScale", 0, 10)
    .name("roughnessScale")
    .onChange((e) => {
      pipiLineParameters.roughnessScale = e;
      pipelineShaderRef.setUniform(
        "u_roughnessScale",
        pipiLineParameters.roughnessScale,
      );
      pointTile.customShader.setUniform(
        "u_roughnessScale",
        pipiLineParameters.roughnessScale,
      );
    });
  group
    .add(pipiLineParameters, "normalScale", 0, 10)
    .name("normalScale")
    .onChange((e) => {
      pipiLineParameters.normalScale = e;
      pipelineShaderRef.setUniform(
        "u_normalScale",
        pipiLineParameters.normalScale,
      );
      pointTile.customShader.setUniform(
        "u_normalScale",
        pipiLineParameters.normalScale,
      );
    });
};

// ========== 完善后的楼宇渐变Shader ==========
const makeBuildingCustomShader = () => {
  return new Cesium.CustomShader({
    // 定义Uniform变量，用于外部传入颜色参数
    // 注意：这里定义的 uniforms 会自动注入到 shader 中，不需要在 fragmentShaderText 中重复声明
    uniforms: {
      u_startColor: {
        type: UniformType.VEC3,
        value: new Cartesian3(
          buildingParameters.startColor.red,
          buildingParameters.startColor.green,
          buildingParameters.startColor.blue,
        ),
      },
      u_endColor: {
        type: UniformType.VEC3,
        value: new Cartesian3(
          buildingParameters.endColor.red,
          buildingParameters.endColor.green,
          buildingParameters.endColor.blue,
        ),
      },
      u_minHeight: {
        type: UniformType.FLOAT,
        value: buildingParameters.minHeight,
      },
      u_maxHeight: {
        type: UniformType.FLOAT,
        value: buildingParameters.maxHeight,
      },
      u_gradientIntensity: {
        type: UniformType.FLOAT,
        value: buildingParameters.gradientIntensity,
      },
      u_enableGradient: {
        type: UniformType.FLOAT,
        value: buildingParameters.enableGradient ? 1.0 : 0.0,
      },
    },
    // 片元着色器 - 不要重复声明 uniforms，直接使用即可
    fragmentShaderText: `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        // 获取模型坐标系下的位置
        vec3 positionMC = fsInput.attributes.positionMC;

        // 计算高度因子 (0.0 到 1.0)
        float heightRange = u_maxHeight - u_minHeight;
        float heightFactor = 0.0;

        if (heightRange > 0.0) {
          heightFactor = clamp((positionMC.z - u_minHeight) / heightRange, 0.0, 1.0);
        }

        // 根据高度在起始颜色和结束颜色之间进行线性插值
        vec3 gradientColor = mix(u_startColor, u_endColor, heightFactor);

        // 判断是否启用渐变
        vec3 finalColor;
        if (u_enableGradient > 0.5) {
          // 混合原始材质颜色和渐变颜色
          finalColor = mix(material.diffuse, gradientColor, u_gradientIntensity);
        } else {
          finalColor = material.diffuse;
        }

        // 应用最终颜色到 diffuse
        material.diffuse = finalColor;

        // 注意：czm_modelMaterial 结构体在这个版本中没有 emission 字段
        // 如果需要发光效果，可以通过调整 baseColor 或 specular 来实现
        // 或者使用 material.emissive（如果存在的话）

        // 尝试使用 emissive 如果存在，否则跳过
        #ifdef HAS_EMISSIVE
          material.emissive = finalColor * 0.2;
        #endif
      }
    `,
  });
};

const updateFenceAnimation = (time) => {
  fenceAnimationPrimitives.forEach((primitive) => {
    if (primitive.appearanceRef && primitive.appearanceRef.uniforms) {
      primitive.appearanceRef.uniforms.u_time = time;
    }
    if (
      primitive.appearance &&
      primitive.appearance.material &&
      primitive.appearance.material.uniforms
    ) {
      if (primitive.appearance.material.uniforms.u_time !== undefined) {
        primitive.appearance.material.uniforms.u_time = time;
      }
    }
  });
};

// 动态更新流动参数
const startFlowAnimation = () => {
  if (isAnimating) return;
  isAnimating = true;

  let startTime = performance.now();

  const animate = () => {
    if (!isAnimating) return;

    // 计算经过的时间（秒）
    const currentTime = (performance.now() - startTime) / 1000.0;

    // 更新shader中的时间uniform
    if (pipelineShaderRef) {
      pipelineShaderRef.setUniform("u_time", currentTime);
    }
    if (pointShaderRef) {
      pointShaderRef.setUniform("u_time", currentTime);
    }
    updateFenceAnimation(currentTime);
    // 请求下一帧
    animationId = requestAnimationFrame(animate);
  };

  // 启动动画
  animationId = requestAnimationFrame(animate);
  console.log("流动动画已启动");
};

const makeAnimationPipeLieCustomShader = () => {
  return animationPipelineShader(pipiLineParameters);
};

const makePipeLieCustomShader = () => {
  return pipelineShader(pipiLineParameters);
};

const addHeatplants = async () => {
  try {
    const res = await fetch("/json/许昌-重要站点.geojson");
    const data = await res.json();

    const points = data.features;
    const modelUri = "/models/热源模型2.glb";

    // 第一步：先创建所有热源模型（不透明物体先渲染）
    const heatplantEntities = [];
    points.forEach((feature) => {
      const coord = feature.geometry.coordinates;
      addBillboard(coord, 180, "/statics/热源.png", 'heatplant');
      const entity = viewer.entities.add({
        id: `heatplant-${feature.properties.pid}`,
        name: `点位 ${feature.properties.name}`,
        position: Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0),
        model: {
          uri: modelUri,
          scale: new Cesium.CallbackProperty(
            () => heatplantParameters.scale,
            false,
          ),
          clampAnimations: false,
          incrementallyLoadTextures: true,
          runAnimations: true,
          color: new Cesium.CallbackProperty(() => {
            const baseColor = Cesium.Color.fromCssColorString(
              heatplantParameters.baseColor,
            );
            return new Cesium.Color(
              Math.min(baseColor.red * 1.3, 1.0),
              Math.min(baseColor.green * 1.3, 1.0),
              Math.min(baseColor.blue * 1.3, 1.0),
              baseColor.alpha,
            );
          }, false),
          colorBlendMode: new Cesium.CallbackProperty(
            () => Cesium.ColorBlendMode[heatplantParameters.colorBlendMode],
            false,
          ),
          colorBlendAmount: new Cesium.CallbackProperty(
            () => heatplantParameters.colorBlendAmount,
            false,
          ),
          shadows: Cesium.ShadowMode.ENABLED,
        },
      });
      heatplantEntities.push({ entity, coord, properties: feature.properties });
    });

    // 第二步：再创建围栏（透明物体后渲染）
    // 使用 requestAnimationFrame 确保在模型渲染后再添加围栏
    requestAnimationFrame(() => {
      heatplantEntities.forEach(({ coord, properties }) => {
        const baseColor = Cesium.Color.fromCssColorString(
          fenceParameters.baseColor,
        );
        const wallColor = Cesium.Color.fromCssColorString(
          fenceParameters.wallColor,
        );
        const particleColor = Cesium.Color.fromCssColorString(
          fenceParameters.particleColor,
        );

        const basePrimitive = makeFenceBaseExpand(baseColor, coord, properties);
        fenceAnimationPrimitives.push(basePrimitive);

        const wallPrimitive = makeFenceWall(wallColor, coord, properties);
        fenceAnimationPrimitives.push(wallPrimitive);

        const particlePrimitive = makeFenceParticles(
          particleColor,
          coord,
          properties,
        );
        fenceAnimationPrimitives.push(particlePrimitive);
      });
    });

    setHeatplantParameters();
    // setFenceParameters();
  } catch (error) {
    console.error(`Error creating point tileset: ${error}`);
  }
};

// ========== 四边形底部扩散动画 ==========
const makeFenceBaseExpand = (color, coord, properties) => {
  properties["coord"] = coord;
  const circleGeometry = new Cesium.CircleGeometry({
    center: Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0.5),
    radius: 180, // 波纹扩散半径
    vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
  });

  const instance = new Cesium.GeometryInstance({
    geometry: circleGeometry,
    id: properties,
  });

  // 波纹扩散着色器逻辑
  const appearance = new Cesium.EllipsoidSurfaceAppearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: true }, // 关键：关闭深度测试
      depthMask: false,
    },
    fragmentShaderSource: `
      in vec2 v_st;
      uniform vec4 u_color;
      void main() {
          // v_st 是从 0 到 1 的正方形纹理坐标
          float dist = distance(v_st, vec2(0.5));
          if(dist > 0.5) discard;

          float time = czm_frameNumber * 2.0 / 100.0;
          float r = fract(dist * 6.0 - time);
          float ripple = smoothstep(0.4, 0.5, r) - smoothstep(0.5, 0.6, r);
          float centerGlow = smoothstep(0.35, -0.1, dist);
          float fade = 1.0 - smoothstep(0.3, 0.5, dist);

          float alpha = (ripple + centerGlow) * fade;
          out_FragColor = vec4(u_color.rgb, alpha * u_color.a * 2.0); // 底部圆环颜色强度
      }
    `,
  });

  appearance.uniforms = {
    u_color: color,
  };

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: true,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

// ========== 四边形围墙 ==========
const makeFenceWall = (color, coord, properties) => {
  const width = fenceParameters.width;
  const depth = fenceParameters.depth;
  const height = fenceParameters.bottomHeight;
  const halfW = width / 2;
  const halfD = depth / 2;

  const positionsArray = [
    -halfW,
    -halfD,
    0,
    halfW,
    -halfD,
    0,
    halfW,
    -halfD,
    height,
    -halfW,
    -halfD,
    height,
    halfW,
    -halfD,
    0,
    halfW,
    halfD,
    0,
    halfW,
    halfD,
    height,
    halfW,
    -halfD,
    height,
    halfW,
    halfD,
    0,
    -halfW,
    halfD,
    0,
    -halfW,
    halfD,
    height,
    halfW,
    halfD,
    height,
    -halfW,
    halfD,
    0,
    -halfW,
    -halfD,
    0,
    -halfW,
    -halfD,
    height,
    -halfW,
    halfD,
    height,
  ];

  const stsArray = [
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0,
    0, 1, 0, 1, 1, 0, 1,
  ];

  const indicesArray = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14,
    15,
  ];

  const positions = new Float64Array(positionsArray);
  const sts = new Float32Array(stsArray);
  const indices = new Uint16Array(indicesArray);

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });

  const instance = new Cesium.GeometryInstance({
    geometry: geometry,
    modelMatrix: substationModelMatrix(coord),
    id: properties,
  });

  // 优化：使用更透明的线框效果，确保内部模型可见
  const appearance = new Cesium.Appearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      // 启用深度测试，确保正确遮挡关系
      depthTest: { enabled: true, func: Cesium.DepthFunction.LEQUAL },
      // 透明物体不写入深度缓冲
      depthMask: false,
      // 关键修复：禁用面剔除，让围栏双面可见（从内外都能看到）
      cull: { enabled: false }, // 改为 false
    },
    fragmentShaderSource: `
      in vec2 v_st;
      uniform vec4 u_color;
      uniform float u_opacity;
      uniform float u_time;
      
      void main() {
        float edgeX = smoothstep(0.0, 0.02, v_st.x) - smoothstep(0.98, 1.0, v_st.x);
        float edgeY = smoothstep(0.0, 0.02, v_st.y) - smoothstep(0.98, 1.0, v_st.y);
        
        float scanLine = fract(v_st.y - u_time * 0.5);
        float scanEffect = smoothstep(0.45, 0.5, scanLine) - smoothstep(0.5, 0.55, scanLine);
        
        float baseAlpha = 0.15;
        float edgeAlpha = (edgeX + edgeY) * 0.6;
        float scanAlpha = scanEffect * 0.4;
        
        float alpha = (baseAlpha + edgeAlpha + scanAlpha) * u_opacity;
        alpha = clamp(alpha, 0.0, 1.8);
        
        // 透明度太低时丢弃
        if (alpha < 0.01) discard;
        
        vec3 finalColor = u_color.rgb * 1.2;
        
        out_FragColor = vec4(finalColor, alpha);
      }
    `,
    vertexShaderSource: `
      in vec3 position3DHigh;
      in vec3 position3DLow;
      in vec2 st;
      in float batchId;
      out vec2 v_st;
      
      void main() {
        vec4 p = czm_computePosition();
        v_st = st;
        gl_Position = czm_modelViewProjectionRelativeToEye * p;
      }
    `,
  });

  appearance.uniforms = {
    u_color: color,
    u_opacity: fenceParameters.wallOpacity,
    u_time: 0.0,
  };

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: true,
    // 关键：设置渲染顺序，透明物体在后
    classificationType: Cesium.ClassificationType.BOTH,
  });

  primitive.appearanceRef = appearance;
  viewer.scene.primitives.add(primitive);
  return primitive;
};

// ========== 四边形粒子上升动画 ==========
const makeFenceParticles = (color, coord, properties) => {
  const width = fenceParameters.width * 0.98;
  const depth = fenceParameters.depth * 0.98;
  const height = fenceParameters.wallHeight;
  const halfW = width / 2;
  const halfD = depth / 2;

  const positionsArray = [];
  const stsArray = [];
  const indicesArray = [];

  const verticalSegments = 12; // 增加分段数
  const perimeterSegments = 20; // 增加周长分段

  for (let v = 0; v <= verticalSegments; v++) {
    const t = v / verticalSegments;
    const z = t * height;

    for (let p = 0; p <= perimeterSegments; p++) {
      const pt = p / perimeterSegments;
      let x, y;

      if (pt <= 0.25) {
        const localT = pt / 0.25;
        x = -halfW + localT * width;
        y = -halfD;
      } else if (pt <= 0.5) {
        const localT = (pt - 0.25) / 0.25;
        x = halfW;
        y = -halfD + localT * depth;
      } else if (pt <= 0.75) {
        const localT = (pt - 0.5) / 0.25;
        x = halfW - localT * width;
        y = halfD;
      } else {
        const localT = (pt - 0.75) / 0.25;
        x = -halfW;
        y = halfD - localT * depth;
      }

      positionsArray.push(x, y, z);
      stsArray.push(pt, t);
    }
  }

  for (let v = 0; v < verticalSegments; v++) {
    for (let p = 0; p < perimeterSegments; p++) {
      const current = v * (perimeterSegments + 1) + p;
      const next = current + 1;
      const top = current + (perimeterSegments + 1);
      const topNext = top + 1;

      indicesArray.push(current, next, top);
      indicesArray.push(next, topNext, top);
    }
  }

  const positions = new Float64Array(positionsArray);
  const sts = new Float32Array(stsArray);
  const indices = new Uint16Array(indicesArray);

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });

  const instance = new Cesium.GeometryInstance({
    geometry: geometry,
    modelMatrix: substationModelMatrix(coord),
    id: properties,
  });

  // 优化粒子材质：更透明，更细
  const appearance = new Cesium.MaterialAppearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: true },
      depthMask: false,
    },
    material: new Cesium.Material({
      fabric: {
        uniforms: {
          u_color: color,
          // u_particleTex: "/statics/particles.png",
          u_particleTex: "/statics/flow2.png",
          u_time: 0.0,
          u_speed: fenceParameters.particleSpeed,
          u_density: fenceParameters.particleDensity / 10.0,
        },
        source: `
         czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            
            vec2 v_st = materialInput.st;
            float time = u_time * u_speed;
            float particleOffset = fract(v_st.y - time);
            
            vec2 particleUV = vec2(v_st.x, particleOffset);
            // 设置横向重复贴图
            particleUV.x = fract(particleUV.x * 1.0);

            vec4 particleColor = texture(u_particleTex, particleUV);
            float densityThreshold = step(1.0 - u_density, particleColor.a);
            float heightFade = pow(1.0 - v_st.y, 1.0); // 更快的淡出

            // 边缘发光但透明度更低
            float edgeGlow = sin(v_st.x * 3.14159) * 0.5 + 0.5;
            
            vec3 finalColor = u_color.rgb * (0.8 + edgeGlow * 0.4);
            // 降低整体透明度
            float alpha = particleColor.a * densityThreshold * heightFade * u_color.a * 1.5;
            alpha = clamp(alpha, 0.0, 0.3); // 限制最大透明度
            
            material.diffuse = finalColor;
            material.alpha = alpha;
            material.emission = finalColor * edgeGlow * 0.8; // 降低发光强度
            
            return material;
          }
        `,
      },
    }),
    translucent: true,
    vertexShaderSource: `
      in vec3 position3DHigh;
      in vec3 position3DLow;
      in vec2 st;
      in float batchId;
      out vec2 v_st;
      out vec3 v_positionEC;
      out vec3 v_normalEC;
      
      void main() {
        vec4 p = czm_computePosition();
        v_st = st;
        v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
        v_normalEC = vec3(0.0, 0.0, 1.0);
        gl_Position = czm_modelViewProjectionRelativeToEye * p;
      }
    `,
  });

  appearance.uniforms = { u_time: 0.0 };

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: false,
  });

  primitive.appearanceRef = appearance;
  viewer.scene.primitives.add(primitive);
  return primitive;
};

const setHeatplantParameters = () => {
  const group = gui.addFolder("热源调参");
  group.open();
  group
    .add(heatplantParameters, "scale", 0, 2000)
    .name("模型大小")
    .onChange((e) => {
      heatplantParameters.scale = e;
    });
  group
    .add(heatplantParameters, "colorBlendMode", {
      HIGHLIGHT: "HIGHLIGHT",
      REPLACE: "REPLACE",
      MIX: "MIX",
    })
    .name("混合模式")
    .onChange((e) => {
      heatplantParameters.colorBlendMode = e;
    });
  group
    .addColor(heatplantParameters, "baseColor")
    .name("混合颜色")
    .onChange((e) => {
      heatplantParameters.baseColor = e;
    });
  group
    .add(heatplantParameters, "colorBlendAmount", 0, 1)
    .name("混色强度")
    .onChange((e) => {
      heatplantParameters.colorBlendAmount = e;
    });
};

const addSubStations = async () => {
  // 添加换热站
  try {
    const res = await fetch("/json/substation.json");
    const data = await res.json();
    console.log(data);
    // 换热站颜色
    const colors = [
      Cesium.Color.fromCssColorString("#B59E07"), // Blue
      Cesium.Color.fromCssColorString("#B59E07"), // Green
      Cesium.Color.fromCssColorString("#B59E07"), // Yellow
      Cesium.Color.fromCssColorString("#B59E07"), // Orange
    ];
    const colorsCss = ["#0088ff", "#00ff00", "#ffaa00", "#FFE366"];
    const points = data.slice(0, 50);
    // const points = data;
    const subList = [];
    points.forEach((feature) => {
      const coord = feature.geometry.coordinates;
      const typeNum = Number(feature.properties.subType || 0);
      const colorIndex = typeNum % 4;
      const color = colors[colorIndex];
      const cssColor = colorsCss[colorIndex];
      const cylinderHeight = 40.0;
      const properties = feature.properties;
      addBillboard(coord, 120, "/statics/换热站.png", 'substation');
      const circlePrimitive = makeCircle(color, coord, properties);
      const pillarPrimitive = makePillar(color, coord, properties);
      makeSpriteAnimation(color, coord);

      subList.push({
        id: feature.id,
        name: feature.properties.name,
        position: Cesium.Cartesian3.fromDegrees(
          coord[0],
          coord[1],
          cylinderHeight,
        ),
        temp: (35 + Math.random() * 5).toFixed(1),
        color: cssColor,
        show: false,
        top: 0,
        left: 0,
      });
    });
    substationList.value = subList;
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event) => {
      const pickResult = scene.pick(event.position);
      console.log(pickResult);
      if (pickResult && pickResult.id) {
        const coord = pickResult.id.coord;
        console.log(coord);
        const height = 120.0;
        const position = Cesium.Cartesian3.fromDegrees(
          coord[0],
          coord[1],
          height,
        );
        console.log(position);
        const pickData = pickResult.id;
        console.log(pickData);
        let html = `hello ${pickData.name} ${pickData.pid}`;
        // 添加弹窗
        // const a = new CesiumPopup({
        //   title: "信息",
        // })
        //   .setPosition(position)
        //   .setHTML(html)
        //   .addTo(viewer)
        //   .setTitle("详细信息框");

        // a.on("close", function () {
        //   console.log("close");
        // });

        // a.on("open", function () {
        //   console.log("open");
        // });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  } catch (error) {
    console.error(`Error creating point tileset: ${error}`);
  }
};

const makeCircle = (color, coord, properties) => {
  properties["coord"] = coord;
  // 参考 makePillar 方案，使用 Primitive 和 Geometry 构造底部的圆形面片
  // 这个圆盘的顶点坐标是按照六边形或者多边形展开的
  // 刚才提供的顶点其实是和 makePillar 一模一样的！
  // 为了得到一个真正的圆环/圆盘效果，我们不能直接复用 makePillar 的顶点，
  // 因为 makePillar 的顶点是一个立体的柱子（有Z轴高度），而波纹是一个平面的圆（Z轴应该为0）。

  // 我们可以利用 Cesium 自带的 CircleGeometry 来构造平面圆环，
  // 这样既能使用底层 Primitive 关闭深度测试，又能保证它是完美的圆形！

  const circleGeometry = new Cesium.CircleGeometry({
    center: Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0.5),
    radius: 60.0, // 波纹扩散半径
    vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
  });

  const instance = new Cesium.GeometryInstance({
    geometry: circleGeometry,
    id: properties,
  });

  // 波纹扩散着色器逻辑
  const appearance = new Cesium.EllipsoidSurfaceAppearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: false }, // 关键：关闭深度测试
      depthMask: false,
    },
    fragmentShaderSource: `
      in vec2 v_st;
      uniform vec4 u_color;
      void main() {
          // v_st 是从 0 到 1 的正方形纹理坐标
          float dist = distance(v_st, vec2(0.5));
          if(dist > 0.5) discard;

          float time = czm_frameNumber * 2.0 / 100.0;
          float r = fract(dist * 6.0 - time);
          float ripple = smoothstep(0.4, 0.5, r) - smoothstep(0.5, 0.6, r);
          float centerGlow = smoothstep(0.35, -0.1, dist);
          float fade = 1.0 - smoothstep(0.3, 0.5, dist);

          float alpha = (ripple + centerGlow) * fade;
          out_FragColor = vec4(u_color.rgb, alpha * u_color.a * 2.0); // 底部圆环颜色强度
      }
    `,
  });

  appearance.uniforms = {
    u_color: color,
  };

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: true,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

const makePillar = (color, coord, properties) => {
  const options = {
    position: [(coord[0] * Math.PI) / 180, (coord[1] * Math.PI) / 180, 0],
    scale: 2.0,
  };

  properties["coord"] = coord;

  // 生成16边形的顶点数据，为了实现向内弯曲的弧度，我们需要在高度方向上进行分段
  const segments = 16; // 圆周分段数
  const heightSegments = 30; // 高度分段数，分段越多弧度越平滑
  const radius = 8.0; // 底部半径基准
  const topRadius = 0.5; // 顶部半径基准（增大，使其不要太尖）
  const height = 60.0; // 高度基准

  // 使用指数衰减函数来实现平滑的"人"字形弯曲（从顶到底一直弯曲下来）
  // power 控制弯曲的剧烈程度。power = 1 是直线，power > 1 是向内凹的抛物线
  const curvePower = 3.0;

  const positionsArray = [];
  const stsArray = [];
  const indicesArray = [];

  // 1. 生成所有顶点
  // 底部中心点 (索引 0)
  positionsArray.push(0, 0, 0);
  stsArray.push(0.5, 0);

  // 侧面顶点网格 (从底到顶，包括底部边缘和顶部边缘)
  for (let h = 0; h <= heightSegments; h++) {
    const t = h / heightSegments; // 从 0 到 1 (0 是底部, 1 是顶部)
    const currentHeight = t * height;

    // 使用指数公式计算半径：让半径随着高度的下降呈指数级扩大
    // t 从 0(底) 到 1(顶)，所以 (1-t) 是从顶到底。
    // 当 t=1 (顶), pow(0, power) = 0, currentRadius = topRadius
    // 当 t=0 (底), pow(1, power) = 1, currentRadius = topRadius + (radius - topRadius) = radius
    // 通过改变 curvePower 的值，可以得到非常优美的平滑曲线
    const currentRadius =
      topRadius + (radius - topRadius) * Math.pow(1.0 - t, curvePower);

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      positionsArray.push(
        Math.cos(angle) * currentRadius,
        Math.sin(angle) * currentRadius,
        currentHeight,
      );
      stsArray.push(i / segments, t);
    }
  }

  // 顶部中心点 (最后压入)
  const topCenterIndex = 1 + (heightSegments + 1) * segments;
  positionsArray.push(0, 0, height);
  stsArray.push(0.5, 1);

  // 2. 构建索引 (Triangles)
  // 底部面 (连接底部中心 0 和第 0 层的圆周 1~segments)
  for (let i = 0; i < segments; i++) {
    const currI = 1 + i;
    const nextI = 1 + ((i + 1) % segments);
    indicesArray.push(0, nextI, currI); // 注意缠绕方向
  }

  // 侧面 (连接相邻高度层)
  for (let h = 0; h < heightSegments; h++) {
    const layerStart = 1 + h * segments;
    const nextLayerStart = 1 + (h + 1) * segments;

    for (let i = 0; i < segments; i++) {
      const currI = layerStart + i;
      const nextI = layerStart + ((i + 1) % segments);
      const topI = nextLayerStart + i;
      const nextTopI = nextLayerStart + ((i + 1) % segments);

      indicesArray.push(currI, nextI, topI);
      indicesArray.push(nextI, nextTopI, topI);
    }
  }

  // 顶部面 (连接顶部中心和最顶层的圆周)
  const topLayerStart = 1 + heightSegments * segments;
  for (let i = 0; i < segments; i++) {
    const currI = topLayerStart + i;
    const nextI = topLayerStart + ((i + 1) % segments);
    indicesArray.push(topCenterIndex, currI, nextI);
  }

  const positions = new Float64Array(positionsArray);

  // 应用缩放
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= 1.5 * options.scale;
    positions[i + 1] *= 1.5 * options.scale;
    positions[i + 2] *= options.scale; // 原来150已经很高了，稍微降低高度比例或者保持
  }

  const sts = new Float32Array(stsArray);
  const indices = new Uint16Array(indicesArray);

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });

  const instance = new Cesium.GeometryInstance({
    geometry: geometry,
    modelMatrix: substationModelMatrix(coord),
    id: properties,
  });

  const appearance = new Cesium.Appearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      // 修复：对于透视建筑，我们可以将 primitive 的 renderState depthTest.enabled 设置为 false
      depthTest: { enabled: false },
      depthMask: false,
    },
    fragmentShaderSource: `
      in vec2 v_st;
      uniform vec4 u_color;
      void main() {
          // 由于材质中 u_color 的 alpha 值可能很低或者外部颜色不是 vec4
          // 我们直接使用传进来的颜色
          float powerRatio = fract(czm_frameNumber / 30.0) + 1.0;
          float alpha = pow(1.0 - v_st.t, powerRatio);
          out_FragColor = vec4(u_color.rgb, alpha * u_color.a * 2.0); // 侧边颜色强度
      }
    `,
    vertexShaderSource: `
      in vec3 position3DHigh;
      in vec3 position3DLow;
      in vec2 st;
      in float batchId;
      out vec2 v_st;
      void main() {
          vec4 p = czm_computePosition();
          v_st = st;
          gl_Position = czm_modelViewProjectionRelativeToEye * p;
      }
    `,
  });

  appearance.uniforms = {
    u_color: color,
  };

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: true,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

const makeSpriteAnimation = (color, coord) => {
  const options = {
    position: [(coord[0] * Math.PI) / 180, (coord[1] * Math.PI) / 180, 0],
    scale: 2.0,
  };

  // 生成16边形的顶点数据，和尖柱一样，不过我们要让它比尖柱宽一些，并且是一个直筒（或者带有一点锥度），
  // 为了让粒子动画也贴合弯曲的尖柱，我们需要使用和 makePillar 完全相同的生成逻辑
  const segments = 16;
  const heightSegments = 20; // 与尖柱保持一致
  const radius = 4; // 半径比尖柱(6.0)大一点，包裹在外面
  const topRadius = 0.5; // 顶部比尖柱(1.5)大一点
  const height = 100.0; // 高度
  const curvePower = 3.0; // 弯曲程度与尖柱保持一致
  const positionsArray = [];
  const stsArray = [];
  const indicesArray = [];

  // 侧面顶点网格 (从底到顶)
  for (let h = 0; h <= heightSegments; h++) {
    const t = h / heightSegments; // 从 0 到 1
    const currentHeight = t * height;

    // 使用与尖柱相同的指数公式计算半径
    const currentRadius =
      topRadius + (radius - topRadius) * Math.pow(1.0 - t, curvePower);

    for (let i = 0; i <= segments; i++) {
      // 使用 i <= segments 保证贴图首尾相接
      const angle = (i / segments) * Math.PI * 2;
      positionsArray.push(
        Math.cos(angle) * currentRadius,
        Math.sin(angle) * currentRadius,
        currentHeight,
      );
      // st.s 控制水平环绕，st.t 控制垂直高度
      stsArray.push(i / segments, t);
    }
  }

  // 构建索引 (Triangles)
  for (let h = 0; h < heightSegments; h++) {
    // 每一层有 segments + 1 个点
    const layerStart = h * (segments + 1);
    const nextLayerStart = (h + 1) * (segments + 1);

    for (let i = 0; i < segments; i++) {
      const currI = layerStart + i;
      const nextI = layerStart + i + 1;
      const topI = nextLayerStart + i;
      const nextTopI = nextLayerStart + i + 1;

      indicesArray.push(currI, nextI, topI);
      indicesArray.push(nextI, nextTopI, topI);
    }
  }

  const positions = new Float64Array(positionsArray);

  // 应用缩放
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= 1.5 * options.scale;
    positions[i + 1] *= 1.5 * options.scale;
    positions[i + 2] *= options.scale;
  }

  const sts = new Float32Array(stsArray);
  const indices = new Uint16Array(indicesArray);

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });

  const instance = new Cesium.GeometryInstance({
    geometry: geometry,
    modelMatrix: substationModelMatrix(coord),
  });

  const appearance = new Cesium.MaterialAppearance({
    renderState: {
      blending: Cesium.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: false }, // 关闭深度测试，避免被建筑遮挡
      depthMask: false,
    },
    material: new Cesium.Material({
      fabric: {
        uniforms: {
          u_color: color,
          u_image: "/statics/particles.png", // 贴图地址
        },
        source: `
          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);

            // dt 动画时间，从下向上移动
            float dt = fract(czm_frameNumber / 90.0);

            vec2 v_st = materialInput.st;

            // 沿 t 轴向上移动，使用 fract 保证坐标在 0-1 之间循环
            vec2 st = vec2(v_st.s, fract(v_st.t - dt));

            vec4 imageColor = texture(u_image, st);

            // 透明度从底部向上越来越透明
            float alphaFade = pow(1.0 - v_st.t, 2.0);

            vec3 diffuse = imageColor.rgb * u_color.rgb;
            float alpha = imageColor.a * u_color.a * alphaFade * 3.0; // 提高亮度确保能看见

            material.diffuse = diffuse;
            material.alpha = alpha;
            material.emission = diffuse * 2.0;

            return material;
          }
        `,
      },
    }),
    translucent: true,
    vertexShaderSource: `
      in vec3 position3DHigh;
      in vec3 position3DLow;
      in vec2 st;
      in float batchId;
      out vec3 v_positionEC;
      out vec3 v_normalEC;
      out vec2 v_st;
      void main() {
          vec4 p = czm_computePosition();
          v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
          v_normalEC = vec3(0.0, 0.0, 1.0);
          v_st = st;
          gl_Position = czm_modelViewProjectionRelativeToEye * p;
      }
    `,
  });

  const primitive = new Cesium.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
    allowPicking: false,
  });

  scene.primitives.add(primitive);
  return primitive;
};

onUnmounted(() => {
  // 清理gui
  if (gui) {
    gui.destroy();
  }
  // 停止动画
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  // 移除事件监听
  if (handler) {
    handler.destroy();
  }
  // 销毁viewer
  if (viewer) {
    viewer.destroy();
  }
  viewer = null;
  fenceAnimationPrimitives = [];
});
</script>
<template>
  <div class="cesuim-container" id="cesiumContainer" ref="cesiumContainer">
    <div id="toolbar">
      <table>
        <tbody>
          <tr>
            <td>Bloom</td>
            <td><input type="checkbox" data-bind="checked: show" /></td>
          </tr>
          <tr>
            <td>Glow only</td>
            <td><input type="checkbox" data-bind="checked: glowOnly" /></td>
          </tr>
          <tr>
            <td>Contrast</td>
            <td>
              <input
                type="range"
                min="-255.0"
                max="255.0"
                step="0.01"
                data-bind="value: contrast, valueUpdate: 'input'"
              />
            </td>
          </tr>
          <tr>
            <td>Brightness</td>
            <td>
              <input
                type="range"
                min="-1.0"
                max="1.0"
                step="0.01"
                data-bind="value: brightness, valueUpdate: 'input'"
              />
            </td>
          </tr>
          <tr>
            <td>Delta</td>
            <td>
              <input
                type="range"
                min="1"
                max="5"
                step="0.01"
                data-bind="value: delta, valueUpdate: 'input'"
              />
            </td>
          </tr>
          <tr>
            <td>Sigma</td>
            <td>
              <input
                type="range"
                min="1"
                max="10"
                step="0.01"
                data-bind="value: sigma, valueUpdate: 'input'"
              />
            </td>
          </tr>
          <tr>
            <td>Step Size</td>
            <td>
              <input
                type="range"
                min="0"
                max="7"
                step="0.01"
                data-bind="value: stepSize, valueUpdate: 'input'"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style>
.cesuim-container {
  height: 100vh;
  width: 100vw;
  background-color: #738471;
  position: relative;
}
#toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 9999;
  color: #fff;
}
.cesium-popup-panel {
  opacity: 0.8;
  width: 312px;
  position: absolute;
  z-index: 999;
  color: #00fcf9;
  background: rgba(23, 50, 108, 0.6);
  border: 1px solid #4674d6;
}
.cesium-popup-tip-panel {
  width: 40px;
  height: 20px;
  position: absolute;
  left: 50%;
  bottom: -20px;
  margin-left: -20px;
  overflow: hidden;
  pointer-events: none;
  opacity: 0.8;
}
.cesium-popup-tip-bottom {
  width: 17px;
  background: rgba(23, 50, 108, 0.8);
  border-bottom: 1px solid #4674d6;
  height: 17px;
  padding: 1px;
  margin: -10px auto 0;
  -webkit-transform: rotate(45deg);
  -moz-transform: rotate(45deg);
  -ms-transform: rotate(45deg);
  transform: rotate(45deg);
}
.cesium-popup-header-panel {
  /* display: flex; */
  /* justify-content: space-between; */
  align-items: center;
  font-size: 14px;
  padding: 5px 15px;
  background: rgba(23, 50, 108, 0.8);

  border-bottom: 1px solid #4674d6;
}

.cesium-poput-header-title {
  font-size: 16px;
  font-family: Microsoft YaHei;
  font-weight: 400;
  color: #ffffff;
}

.cesium-popup-content-panel {
  padding: 18px;
}
.cesium-popup-close-btn {
  float: right;
  position: relative;
  right: 10px;
}
.cesium-popup-close-btn,
.cesium-popup-close-btn:focus {
  cursor: pointer;
}
cesium-popup-close-btn > svg:hover {
  color: #00fcf9 !important;
}
.cesium-popup-close-btn > svg {
  user-select: auto;
  color: #4674d6;
  cursor: pointer;
  width: 15px;
  /* height: 15px; */
}
</style>
