<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";

import { registerCustomMaterials } from "../utils/materials.js";

const containerRef = ref(null);
let viewer = null;
let SuperMap3D = null;
let scene, widget, sceneLayer;
let tilesets = [];
let pipeCustomShader = null;
let redPipeGlowStage = null;
let pipeTextureShader = null;
const pipeInfoById = new Map();
const redPipeIds = new Set([1067, 979, 1357, 828, 592, 693, 751, 877]);
const greenPipeIds = new Set([264, 247, 215, 181]);
const substationList = ref([]);
const substationHtmlElements = ref([]);
let pointLight3 = null;
let pointLightPos3 = null;
let pointLightOptions3 = null;
let nightSkyBox = null;
// Fog 控制状态
const fogParams = ref({
  enabled: true,
  density: 0,
  visualDensityScalar: 0,
  sse: 0,
  minimumBrightness: 0,
  heightScalar: 0,
  heightFalloff: 0,
  maxHeight: 0,
});

watch(
  () => fogParams.value,
  (newVal) => {
    // if (!viewer || !viewer.scene) return;
    // viewer.scene.fog.enabled = newVal.enabled;
    // viewer.scene.fog.density = Number(newVal.density);
    // viewer.scene.fog.visualDensityScalar = Number(newVal.visualDensityScalar);
    // viewer.scene.fog.screenSpaceErrorFactor = Number(newVal.sse);
    // viewer.scene.fog.minimumBrightness = Number(newVal.minimumBrightness);
    // viewer.scene.fog.heightScalar = Number(newVal.heightScalar);
    // viewer.scene.fog.heightFalloff = Number(newVal.heightFalloff);
    // viewer.scene.fog.maxHeight = Number(newVal.maxHeight);
  },
  { deep: true },
);

// --- 全局状态 ---

const getPipeIdFromFeature = (feature) => {
  try {
    const id = feature.getProperty?.("id");
    if (id !== undefined && id !== null && id !== "") return id;
  } catch (e) {}

  const candidates = [
    "id",
    "ID",
    "pipeId",
    "pipe_id",
    "PIPE_ID",
    "smid",
    "SMID",
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const key = candidates[i];
    try {
      const v = feature.getProperty?.(key);
      if (v !== undefined && v !== null && v !== "") return v;
    } catch (e) {}
  }
  return feature.featureId ?? feature.batchId ?? feature._batchId;
};

const getFeatureProps = (feature) => {
  if (!feature) return {};
  const out = {};
  const names = feature.getPropertyNames?.() ?? [];
  for (let i = 0; i < names.length; i += 1) {
    const k = names[i];
    try {
      out[k] = feature.getProperty(k);
    } catch (e) {}
  }
  return out;
};

const applyPipeColorToFeature = (feature) => {
  const id = getPipeIdFromFeature(feature);
  if (id === undefined || id === null) return;
  const idNumber = Number(id);
  if (!pipeInfoById.has(id)) {
    pipeInfoById.set(id, getFeatureProps(feature));
  }

  if (Number.isFinite(idNumber) && redPipeIds.has(idNumber)) {
    feature.color = SuperMap3D.Color.RED;
    return;
  }

  if (Number.isFinite(idNumber) && greenPipeIds.has(idNumber)) {
    feature.color = SuperMap3D.Color.GREEN;
  }
};

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  SuperMap3D = window.SuperMap3D;
  if (!SuperMap3D) {
    container.innerText =
      "SuperMap3D 未加载：请确认 index.html 中引入的 /SuperMap3D/SuperMap3D.js 可访问";
    return;
  }
  // console.log("SuperMap3D", SuperMap3D);
  // container.innerText = "SuperMap3D 已加载";
  const viewerOption = {
    contextOptions: {
      contextType: Number(2), // 设置渲染引擎类型：Webgl2:2 ; WebGPU:3
    },
    // animation: false,
    // timeline: false,
    // infoBox: false,
    // selectionIndicator: false,
    // navigation: false,
    // 开启阴影支持
    // shadows: true,
    // 【关键】：地形（包括地球表面）阴影
    // terrainShadows: window.SuperMap3D?.ShadowMode?.ENABLED ?? 1,
    // 强制使用基础水面地形以保证能够有深度去接收阴影
    // terrain: window.SuperMap3D?.Terrain?.fromWorldTerrain?.({
    //   requestVertexNormals: true, // 请求顶点法线 为了开启光照效果
    // }),
  };
  viewer = new SuperMap3D.Viewer("superMapContainer", viewerOption);
  scene = viewer.scene;
  // widget = viewer.cesiumWidget;
  // 2. 加快时间流逝速度（可选），如果要看静态阴影可以设为 1.0 或 0
  // viewer.clock.multiplier = 1000;

  // 3. 配置核心光照与阴影系统
  // setupLighting(SuperMap3D);

  // 设置夜景
  // setupNightScene();

  // 强制将引擎时间设置为白天（如北京时间中午12点）
  // 这样可以防止 Cesium 底层因判断太阳落山而将地球瓦片变黑或关闭阴影
  // 我们通过隐藏大气层和开启星空来伪造“夜景”效果
  // viewer.clock.currentTime = SuperMap3D.JulianDate.fromIso8601(
  //   "2023-01-01T06:00:00Z",
  // );

  // 等待场景初始化完成后执行业务数据加载
  viewer.scenePromise.then(function (scene) {
    init(SuperMap3D, scene, viewer);
    // 设置夜景
    setupNightScene();
    // 初始化 fog 状态
    fogParams.value.enabled = scene.fog.enabled;
    fogParams.value.density = scene.fog.density;
    fogParams.value.visualDensityScalar = scene.fog.visualDensityScalar;
    fogParams.value.sse = scene.fog.screenSpaceErrorFactor;
    fogParams.value.minimumBrightness = scene.fog.minimumBrightness;
    fogParams.value.heightScalar = scene.fog.heightScalar;
    fogParams.value.heightFalloff = scene.fog.heightFalloff;
    fogParams.value.maxHeight = scene.fog.maxHeight;
  });
});

const setupNightScene = () => {
  if (!scene) return;

  console.log(SuperMap3D);
  console.log(scene);

  viewer.clock.currentTime = SuperMap3D.JulianDate.fromDate(
    new Date(2023, 4, 15, 10),
  );
  viewer.shadows = false; // 默认关闭阴影，提高性能
  scene.debugShowFramesPerSecond = true; //显示帧率信息
  scene.envMapIntensity = 0.55; //设置环境贴图强度
  scene.sun.show = true; //显示太阳

  viewer.shadows = true;
  //  UE阴影 设置为false，使用原来的软阴影效果；设置为true，实现了新的阴影算法，可以大幅度提升阴影边界的质量，看起来会非常柔和，没有锯齿。这个设置webgl2.0默认开启了。
  viewer.pcss = true,
  viewer.shadowQuality = 0,
  //设置阴影的出现距离
  scene.shadowMap.maximumDistance = 2000;
  //设置阴影的浓度，值越高，阴影越淡
  viewer.shadowMap.darkness = 0.4;
  //默认值是0.1，值越小越清晰
  viewer.shadowMap.penumbraRatio = 0.1;


  //设置太阳光的颜色与强度（RGB值乘以3倍增强亮度）
  scene.lightSource.sunLightColor = new SuperMap3D.Color(
    1 * 3,
    1 * 3,
    1 * 3,
    1,
  );

  // 设置环境光贴图，提供真实的反射效果
  scene.specularEnvironmentMaps = "./textures/Studio_set2_02_KFJR_1K.hdr";
  const correction = scene.colorCorrection; //创建颜色校正对象
  correction.show = true; //开启颜色校正
  correction.brightness = 1.0;
  correction.contrast = 1.15;
  correction.saturation = 1.0;
  correction.hue = 0.0;
  const nightSkyBox = new SuperMap3D.SkyBox({
    sources: {
      positiveX: "./textures/skyBox/Right.png",
      negativeX: "./textures/skyBox/Left.png",
      positiveY: "./textures/skyBox/Front.png",
      negativeY: "./textures/skyBox/Back.png",
      positiveZ: "./textures/skyBox/Up.png",
      negativeZ: "./textures/skyBox/Down.png",
    },
  });
  // 整个场景的后处理
  const L00 = new SuperMap3D.Cartesian3(
    0.482930183410645,
    0.400395631790161,
    0.395146757364273,
  );
  const L1_1 = new SuperMap3D.Cartesian3(
    0.061545863747597,
    0.040452364832163,
    0.125792920589447,
  );
  const L10 = new SuperMap3D.Cartesian3(
    0.075215362012386,
    0.083970695734024,
    0.049690131098032,
  );
  const L11 = new SuperMap3D.Cartesian3(
    0.048506908118725,
    0.033957757055759,
    0.005837893113494,
  );
  const L2_2 = new SuperMap3D.Cartesian3(
    -0.039349641650915,
    -0.035721402615309,
    -0.037456795573235,
  );
  const L2_1 = new SuperMap3D.Cartesian3(
    0.023377167060971,
    0.011719226837158,
    0.003272810950875,
  );
  const L20 = new SuperMap3D.Cartesian3(
    0.092992208898067,
    0.078490316867828,
    0.066979713737965,
  );
  const L21 = new SuperMap3D.Cartesian3(
    -0.273886859416962,
    -0.242468923330307,
    -0.224863514304161,
  );
  const L22 = new SuperMap3D.Cartesian3(
    0.063277758657932,
    0.052205424755812,
    0.036139599978924,
  );
  const coefficients = [L00, L1_1, L10, L11, L2_2, L2_1, L20, L21, L22];
  scene.sphericalHarmonicCoefficients = coefficients;
  scene.specularEnvironmentMaps = "./textures/rooftop_night_1k_4.ktx2";
  scene.envMapIntensity = 0.3;

  viewer.clock.currentTime = SuperMap3D.JulianDate.fromDate(
    new Date(2024, 4, 24, 10),
  );
  scene.lightSource.sunLightColor = new SuperMap3D.Color(
    (153 / 255) * 1.0,
    (190 / 255) * 1.0,
    (255 / 255) * 1.0,
    1,
  );

  //泛光
  viewer.scene.bloomEffect.show = true;
  viewer.scene.bloomEffect.threshold = 0.9;
  viewer.scene.bloomEffect.bloomIntensity = 0.8;

  //全球影像亮度调节
  // viewer.imageryLayers._layers[1].brightness = 0.4;
  // viewer.imageryLayers._layers[1].hue = -0.2;

  // 天空盒
  scene.skyAtmosphere.show = false;
  scene.skyBox = nightSkyBox;

  return;
  viewer.clock.currentTime = SuperMap3D.JulianDate.fromIso8601(
    "2023-01-01T12:00:00Z",
  );

  scene.lightSource.ambientLightColor = new SuperMap3D.Color(
    0.05,
    0.05,
    0.95,
    1,
  );
  pointLightPos3 = SuperMap3D.Cartesian3.fromDegrees(
    113.84888797556859,
    34.02735651393037,
    20,
  );
  pointLightOptions3 = {
    cutoffDistance: 2000, // 光源影响距离
    color: new SuperMap3D.Color(0.9, 0.3, 0.1, 1.0), // 橙色光
    intensity: 10.5, // 光照强度
  };
  pointLight3 = new SuperMap3D.PointLight(pointLightPos3, pointLightOptions3);
  scene.addLightSource(pointLight3);
  scene.skyAtmosphere.show = false;

  let dataArr = [
    [113.82305775966881, 34.03586952204766, 100],
    [113.82484780601794, 34.03592645335979, 100],
    [113.82452548459116, 34.03296233083077, 100],
    [113.82270909486351, 34.03302352067625, 100],
    [113.82305775966881, 34.03586952204766, 100],
  ];
  let dataArr2 = [
    [113.82305775966881, 34.03586952204766],
    [113.82484780601794, 34.03592645335979],
    [113.82452548459116, 34.03296233083077],
    [113.82270909486351, 34.03302352067625],
    [113.82305775966881, 34.03586952204766],
  ];
  /**
   * 坐标数据转换处理
   * 功能：将二维坐标数组转换为一维数组格式
   * 用途：适配SuperMap3D的坐标输入格式要求
   * 方法：使用Array.prototype.concat.apply扁平化数组
   */
  const coord = Array.prototype.concat.apply([], dataArr);
  const coord2 = Array.prototype.concat.apply([], dataArr2);
  /**
   * 特效1：循环运动电子围栏
   * 功能：创建具有循环流动效果的动态围栏
   * 材质：DynamicWallMaterialProperty - 动态墙体材质
   * 效果：青色纹理沿围栏边界循环流动
   * 参数：纹理图片、颜色、动画持续时间
   */
  // console.log(SuperMap3D);
  // let flag = 0; // 高度变化标志位
  // viewer.entities.add({
  //   name: "电子围栏-动态-上升",
  //   wall: {
  //     positions: new SuperMap3D.Cartesian3.fromDegreesArrayHeights(coord), // 3D坐标数组
  //     minimumHeights: new Array(dataArr.length).fill(0), // 围栏底部高度0米
  //     maximumHeights: new SuperMap3D.CallbackProperty(function (time) {
  //       flag += 1; // 高度递增
  //       if (flag > 100) {
  //         flag = 1; // 循环重置
  //       }
  //       return new Array(dataArr.length).fill(flag); // 返回当前高度数组
  //     }, false),
  //     material: new SuperMap3D.ImageMaterialProperty({
  //       image: "./textures/gradient_blue.png", // 蓝色渐变纹理
  //       transparent: true, // 启用透明度
  //     }),
  //   },
  // });
  // viewer.entities.add({
  //   name: '电子围栏-静态风格-渐变',
  //   wall: {
  //       positions: SuperMap3D.Cartesian3.fromDegreesArray(coord2), // 围栏边界坐标
  //       maximumHeights: new Array(dataArr2.length).fill(60), // 围栏高度60米
  //       minimumHeights : new Array(dataArr2.length).fill(0), // 围栏底部高度0米
  //       material: new SuperMap3D.ImageMaterialProperty({
  //           image: "./textures/gradient_yellow.png", // 黄色渐变纹理
  //           transparent: true, // 启用透明度
  //           color: SuperMap3D.Color.AQUA // 青色色调叠加
  //       })
  //   },
  // });
};

/**
 * 包含：天空盒、太阳光、地球光照材质、地形阴影配置等
 */
const setupLighting = (SuperMap3D) => {
  if (!scene) return;
  // --- A. 基础大气与天空设置 ---
  scene.skyAtmosphere.show = false; // 关闭白天的大气散射蓝天效果，露出星空
  scene.hdrEnabled = true; // 开启 HDR 高动态范围渲染，光影过渡更真实
  scene.sun.show = false; // 隐藏天空中的实体太阳圆盘图形
  scene.moon.show = true; // 开启月亮
  scene.skyBox.show = true; // 开启星空背景，夜晚可见

  // --- B. 地球表面受光与深度配置 ---
  scene.globe.enableLighting = false; // 允许地球底图（影像）进行明暗计算
  scene.globe.receiveShadows = true; // 允许地球接收其他模型投射的阴影
  scene.globe.castShadows = true; // 允许地球自己产生阴影

  // 【关键配置】：当没有加载带高程的真实地形数据时（即地球只是一个平滑椭球体）
  // 必须强制开启“针对地形的深度测试”，否则阴影贴图无法正确投影在平坦的地图瓦片上
  scene.globe.depthTestAgainstTerrain = true;

  // --- C. 全局阴影引擎配置 ---
  viewer.shadows = false; // 视图级别阴影开关

  // 配置阴影贴图(ShadowMap)的质量和表现
  if (viewer.shadowMap && typeof viewer.shadowMap === "object") {
    // 阴影投射的最大距离，超出这个距离的对象不计算阴影
    viewer.shadowMap.maximumDistance = 10000.0;
    // 阴影贴图的分辨率：值越大（如 4096）平坦地面的阴影越清晰，但也更消耗显存性能
    viewer.shadowMap.size = 4096;
    // 开启软阴影，让阴影边缘带有羽化模糊效果，更贴近真实物理世界
    viewer.shadowMap.softShadows = true;
    // 阴影的暗度：0.0为全黑，1.0为完全不黑，0.5是一个比较适中的视觉浓度
    viewer.shadowMap.darkness = 0.5;
  }
};

/**
 * 核心初始化函数：加载底图、3D Tiles模型、解析数据并应用自定义着色器
 */
const init = async (SuperMap3D, scene, viewer) => {
  console.log("场景初始化完成，开始加载业务数据...");
  viewer.resolutionScale = window.devicePixelRatio; // 提高清晰度适配高分屏

  // 【预留功能】：管网发光后处理效果（目前暂不启用，避免全局泛光影响性能）
  if (
    !redPipeGlowStage &&
    viewer?.scene?.postProcessStages &&
    SuperMap3D?.PostProcessStage
  ) {
    const texelSize = new SuperMap3D.Cartesian2(1.0, 1.0);
    redPipeGlowStage = new SuperMap3D.PostProcessStage({
      name: "pipe_red_glow",
      fragmentShader: `
        uniform sampler2D colorTexture;
        varying vec2 v_textureCoordinates;
        uniform vec2 u_texelSize;
        uniform float u_strength;
        uniform float u_spread;
        uniform float u_threshold;
        uniform float u_contrast;

        float redMask(vec3 c) {
          float other = max(c.g, c.b);
          float m = max(c.r - other, 0.0);
          m = clamp(m * u_contrast, 0.0, 1.0);
          return smoothstep(u_threshold, 1.0, m);
        }

        void main() {
          vec4 base = texture2D(colorTexture, v_textureCoordinates);
          vec2 t = u_texelSize * u_spread;

          float glow = 0.0;
          for (int y = -2; y <= 2; y++) {
            for (int x = -2; x <= 2; x++) {
              vec2 o = vec2(float(x), float(y));
              vec3 c = texture2D(colorTexture, v_textureCoordinates + t * o).rgb;
              float w = 1.0 - 0.15 * length(o);
              glow += redMask(c) * w;
            }
          }

          glow = glow / 12.0;
          vec3 glowColor = vec3(1.0, 0.15, 0.15) * glow * u_strength;
          gl_FragColor = vec4(clamp(base.rgb + glowColor, 0.0, 1.0), base.a);
        }
      `,
      uniforms: {
        u_texelSize: function () {
          const w = viewer.scene.drawingBufferWidth || 1.0;
          const h = viewer.scene.drawingBufferHeight || 1.0;
          texelSize.x = 1.0 / w;
          texelSize.y = 1.0 / h;
          return texelSize;
        },
        u_strength: 5.0,
        u_spread: 3.0,
        u_threshold: 0.3,
        u_contrast: 3.0,
      },
    });
    // 用户明确提出“发光不要用后处理”，为了避免全局发光影响场景，暂时关闭红管发光的后处理阶段
    // viewer.scene.postProcessStages.add(redPipeGlowStage);
  }
  // 加载高德影像地图
  // const baseLayer = viewer.imageryLayers.addImageryProvider(
  //   new SuperMap3D.UrlTemplateImageryProvider({
  //     url: "https://api.mapbox.com/styles/v1/norush/cm8qnk3y600dt01sn2ssb3hem/tiles/256/{z}/{x}/{y}@2x?access_token=pk.eyJ1Ijoibm9ydXNoIiwiYSI6ImNrN2QyNTFubDA0MHMzZG83NHNpYXdzMnIifQ.Ox3rSMtzqR5wmKcmcdI5aA&zoomwheel=true&optimize=true",
  //     minimumLevel: 3,
  //     maximumLevel: 18,
  //   }),
  // );
  // 【核心配置】：允许建筑等实体模型投射和接收阴影
  const shadowMode = window.SuperMap3D?.ShadowMode?.ENABLED ?? 1;
  const noShadowMode = window.SuperMap3D?.ShadowMode?.DISABLED ?? 0;
  const offsetHeight = 10;
  // 加载许昌相关建筑、线、点模型
  try {
    const buildingTileset = await SuperMap3D.Cesium3DTileset.fromUrl(
      "http://localhost:5173/tiles/xuchang2/Building/tileset.json",
      {
        // enableCollision: true,
        // shadows: shadowMode, // 建筑模型必须开启阴影
      },
    );
    // 强制允许建筑在引擎底层参与光栅化阴影计算
    // buildingTileset.castShadows = true;
    // buildingTileset.receiveShadows = true;

    const xcLineTileset = await SuperMap3D.Cesium3DTileset.fromUrl(
      "http://localhost:5173/tiles/xuchang2/Line/tileset.json",
      {
        // // enableCollision: true,
        // shadows: noShadowMode, // 线模型关闭阴影防止变黑
      },
    );
    // xcLineTileset.castShadows = true;
    // xcLineTileset.receiveShadows = true;
    adjustHeight(xcLineTileset, offsetHeight);
    const xcPointTileset = await SuperMap3D.Cesium3DTileset.fromUrl(
      "http://localhost:5173/tiles/xuchang2/Point_Auto/tileset.json",
      {
        // // enableCollision: false,
        // shadows: noShadowMode, // 点模型关闭阴影防止变黑
      },
    );
    // xcPointTileset.castShadows = true;
    // xcPointTileset.receiveShadows = true;
    adjustHeight(xcPointTileset, offsetHeight);
    const xcPointPrefabTileset = await SuperMap3D.Cesium3DTileset.fromUrl(
      "http://localhost:5173/tiles/xuchang2/Point_Prefab/tileset.json",
      {
        enableCollision: true,
        shadows: noShadowMode, // 点模型关闭阴影防止变黑
      },
    );
    // xcPointPrefabTileset.castShadows = true;
    // xcPointPrefabTileset.receiveShadows = true;
    console.log(scene.layers);
    await adjustHeight(xcPointPrefabTileset, offsetHeight);
    viewer.flyTo(buildingTileset);
    console.log(xcLineTileset);

    // await addLineTexture(xcLineTileset)
    // xcLineTileset.colorBlendAmount = 1.0;
    // xcLineTileset.colorBlendMode = SuperMap3D.Cesium3DTileColorBlendMode?.REPLACE ?? 1;

    const processContent = (content) => {
      if (!content) return;
      const length = content.featuresLength;
      if (
        typeof length !== "number" ||
        typeof content.getFeature !== "function"
      )
        return;
      for (let i = 0; i < length; i += 1) {
        const feature = content.getFeature(i);
        applyPipeColorToFeature(feature);
      }
    };

    const getContents = (content) => {
      if (!content) return [];
      const candidates = [
        content.innerContents,
        content._innerContents,
        content._contents,
        content.contents,
      ];
      for (let i = 0; i < candidates.length; i += 1) {
        const c = candidates[i];
        if (Array.isArray(c)) return c;
      }
      return [content];
    };
    // 线模型加载事件，为每个特征应用颜色
    // xcLineTileset.tileLoad.addEventListener(function (tile) {
    //   const contents = getContents(tile.content);
    //   for (let i = 0; i < contents.length; i += 1) {
    //     processContent(contents[i]);
    //   }
    // });
    // 线模型添加自定义着色器
    // makeLineAnimation(xcLineTileset);
    scene.primitives.add(buildingTileset);
    scene.primitives.add(xcLineTileset);
    scene.primitives.add(xcPointTileset);
    scene.primitives.add(xcPointPrefabTileset);
    tilesets.push(buildingTileset);
    tilesets.push(xcLineTileset);
    tilesets.push(xcPointTileset);
    tilesets.push(xcPointPrefabTileset);
    // addSubstation(SuperMap3D, scene, viewer);
    addSubstation2(SuperMap3D, scene, viewer);
    viewer.scene.preUpdate.addEventListener(updatePipeShaderTime);
    viewer.scene.preRender.addEventListener(updateSubstationLabels);
  } catch (error) {
    console.error(`Error creating point tileset: ${error}`);
  }

  // tileset.tileVisible.addEventListener(function(tile){
  //     console.log(tile.boundingSphere)
  // });
};

const adjustHeight = (tileset, height) => {
  //高度偏差，正数为向上偏，负数为向下偏，根据真实的模型位置不断进行调整
  var heightOffset = height;
  //计算tileset的绑定范围 boundingSphere 是模型的包围球
  var boundingSphere = tileset.boundingSphere;
  //计算中心点位置
  var cartographic = SuperMap3D.Cartographic.fromCartesian(
    boundingSphere.center,
  );
  //计算中心点位置坐标
  var surface = SuperMap3D.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    0,
  );
  //偏移后的三维坐标
  var offset = SuperMap3D.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    heightOffset,
  );
  var translation = SuperMap3D.Cartesian3.subtract(
    offset,
    surface,
    new SuperMap3D.Cartesian3(),
  );
  //tileset.modelMatrix转换
  tileset.modelMatrix = SuperMap3D.Matrix4.fromTranslation(translation);
};

const addLineTexture = (xcLineTileset) => {
  // 给管网添加金属质感和粗糙度贴图
  pipeTextureShader = new SuperMap3D.CustomShader({
    lightingModel: SuperMap3D.LightingModel.PBR,
    uniforms: {
      u_baseColor: {
        type: SuperMap3D.UniformType.SAMPLER_2D,
        value: new SuperMap3D.TextureUniform({
          url: "/textures/pipe-metal-steel/Metal006_1K-JPG_Color.jpg",
        }),
      },
      u_normal: {
        type: SuperMap3D.UniformType.SAMPLER_2D,
        value: new SuperMap3D.TextureUniform({
          url: "textures/pipe-metal-steel/Metal006_1K-JPG_NormalGL.jpg",
        }),
      },
      u_time: {
        type: SuperMap3D.UniformType.FLOAT,
        value: 0.0,
      },
      u_metalness: {
        type: SuperMap3D.UniformType.SAMPLER_2D,
        value: new SuperMap3D.TextureUniform({
          url: "/textures/pipe-metal-steel/Metal006_1K-JPG_Metalness.jpg",
        }),
      },
      u_roughness: {
        type: SuperMap3D.UniformType.SAMPLER_2D,
        value: new SuperMap3D.TextureUniform({
          url: "/textures/pipe-metal-steel/Metal006_1K-JPG_Roughness.jpg",
        }),
      },
    },
    fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          vec2 uv = fsInput.attributes.texCoord_0;
          
          // 调整纹理缩放比例，使其在管线上看起来更自然
          vec2 texUv = vec2(uv.x * 10.0, uv.y * 2.0);
          
          // 1. 基础颜色
          vec4 baseColorMap = texture(u_baseColor, texUv);
          vec3 baseColor = baseColorMap.rgb;
          
          // 2. 金属度和粗糙度
          // 直接使用贴图原始值，依靠 PBR 模型自身的光照计算来体现质感
          float metalness = texture(u_metalness, texUv).r; 
          float roughness = texture(u_roughness, texUv).r;
          
          // 降低粗糙度下限，让金属表面更光滑，更容易产生高光反射
          roughness = clamp(roughness, 0.05, 0.8);
          
          // 3. 法线映射
          vec3 normalSample = texture(u_normal, texUv).rgb * 2.0 - 1.0;
          // 调整法线强度
          normalSample.xy *= 1.5; 
          normalSample = normalize(normalSample);
          
          // 计算 TBN 矩阵 (改进的健壮算法)
          vec3 positionEC = fsInput.attributes.positionEC;
          vec3 normalEC = normalize(fsInput.attributes.normalEC);
          
          vec3 pos_dx = dFdx(positionEC);
          vec3 pos_dy = dFdy(positionEC);
          vec2 tex_dx = dFdx(texUv);
          vec2 tex_dy = dFdy(texUv);
          
          float det = (tex_dx.x * tex_dy.y - tex_dy.x * tex_dx.y);
          vec3 tangentEC = (pos_dx * tex_dy.y - pos_dy * tex_dx.y);
          
          // 正交化与对齐
          tangentEC = normalize(tangentEC - normalEC * dot(normalEC, tangentEC));
          vec3 bitangentEC = normalize(cross(normalEC, tangentEC));
          
          // 处理 UV 镜像情况
          if (det < 0.0) {
              tangentEC *= -1.0;
          }
          
          mat3 tbn = mat3(tangentEC, bitangentEC, normalEC);
          material.normalEC = normalize(tbn * normalSample);
          
          // 应用 PBR 属性
          material.roughness = roughness;
          material.alpha = 1.0;
          
          // 在 Cesium PBR 材质模型中，没有 metallic 属性。
          // 金属度（metalness）的物理意义是：
          // - 对于金属：漫反射为 0，高光（F0）为材质本身颜色
          // - 对于非金属：高光（F0）为固定的 0.04（约 4% 的反射率），漫反射为材质颜色
          
          vec3 f0 = mix(vec3(0.04), baseColor, metalness);
          material.specular = f0;
          
          // 为了防止场景没有环境贴图（IBL）时金属完全变黑，
          // 我们保留一点点环境漫反射作为保底
          vec3 minDiffuse = baseColor * 0.1;
          material.diffuse = mix(baseColor, minDiffuse, metalness);
          
          // 4. 处理流动效果 (叠加发光)
          if (u_flowEnabled) {
            float time = u_time * 2.0;
            float stripe = fract(uv.x * 5.0 - time);
            float intensity = smoothstep(0.4, 0.6, stripe);
            
            vec3 flowColor = vec3(0.0, 1.0, 1.0);
            material.diffuse = mix(material.diffuse, flowColor, intensity * 0.8);
            material.emissive = flowColor * intensity * 2.0;
          }
        }
      `,
  });

  xcLineTileset.customShader = pipeTextureShader;
};

const makeLineAnimation = (xcLineTileset) => {
  pipeCustomShader = new SuperMap3D.CustomShader({
    uniforms: {
      u_time: {
        type: SuperMap3D.UniformType.FLOAT,
        value: 0.0,
      },
    },
    fragmentShaderText: `
          void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
            float time = u_time * 2.0; // 流速
            
            // 尝试使用纹理坐标 (UV) 来做流动
            // 如果模型没有 UV，可以使用 fsInput.attributes.positionMC.xy 等
            // 如果表现为自转，说明 Y 是环绕方向，X 是长度方向，需要改为 uv.x
            vec2 uv = fsInput.attributes.texCoord_0;
            
            // 创建流动条纹
            // 使用 fract 函数创建重复的纹理
            // 改为使用 uv.x (U坐标) 来沿管线长度方向流动
            float stripe = fract(uv.x * 5.0 - time);
            
            // 边缘柔化
            // float intensity = smoothstep(0.0, 0.2, stripe) - smoothstep(0.5, 0.8, stripe);
            // 简单高亮条纹
            float intensity = smoothstep(0.4, 0.6, stripe);
            
            // 流动颜色 (青色)
            vec3 flowColor = vec3(0.0, 1.0, 1.0);
            
            // 混合基础颜色和流动颜色
            // 增强发光效果
            material.diffuse = mix(material.diffuse, flowColor, intensity * 0.8);
            material.emissive = flowColor * intensity * 2.0;
          }
        `,
  });
  xcLineTileset.customShader = pipeCustomShader;
};

const addSubstation2 = async (SuperMap3D, scene, viewer) => {
  try {
    const res = await fetch("/json/substation.json");
    const data = await res.json();
    console.log(data);
    const colors = [
      SuperMap3D.Color.fromCssColorString("#0088ff"), // Blue
      SuperMap3D.Color.fromCssColorString("#00ff00"), // Green
      SuperMap3D.Color.fromCssColorString("#ffaa00"), // Yellow
      SuperMap3D.Color.fromCssColorString("#FFE366"), // Red
    ];
    const colorsCss = ["#0088ff", "#00ff00", "#ffaa00", "#ff0000"];
    const points = data.slice(0, 50);
    const subList = [];
    points.forEach((feature) => {
      const coord = feature.geometry.coordinates;
      const typeNum = Number(feature.properties.subType || 0);
      const colorIndex = typeNum % 4;
      const color = colors[colorIndex];
      const cssColor = colorsCss[colorIndex];
      const cylinderHeight = 40.0;

      makeCircle(color, coord, viewer, SuperMap3D);
      makePillar(color, coord, viewer, SuperMap3D);
      makeSpriteAnimation(color, coord, viewer, SuperMap3D);

      subList.push({
        id: feature.id,
        name: feature.properties.name,
        position: SuperMap3D.Cartesian3.fromDegrees(
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
  } catch (error) {
    console.error(`Error creating point tileset: ${error}`);
  }
};

const makeCircle = (color, coord, viewer, SuperMap3D) => {
  const options = {
    position: [(coord[0] * Math.PI) / 180, (coord[1] * Math.PI) / 180, 0],
    scale: 2.0, // 调整圆环大小以匹配尖柱底部
  };

  // 参考 makePillar 方案，使用 Primitive 和 Geometry 构造底部的圆形面片
  // 这个圆盘的顶点坐标是按照六边形或者多边形展开的
  // 刚才提供的顶点其实是和 makePillar 一模一样的！
  // 为了得到一个真正的圆环/圆盘效果，我们不能直接复用 makePillar 的顶点，
  // 因为 makePillar 的顶点是一个立体的柱子（有Z轴高度），而波纹是一个平面的圆（Z轴应该为0）。

  // 我们可以利用 Cesium 自带的 CircleGeometry 来构造平面圆环，
  // 这样既能使用底层 Primitive 关闭深度测试，又能保证它是完美的圆形！

  const circleGeometry = new SuperMap3D.CircleGeometry({
    center: SuperMap3D.Cartesian3.fromDegrees(coord[0], coord[1], 0.5),
    radius: 38.0,
    vertexFormat: SuperMap3D.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
  });

  const instance = new SuperMap3D.GeometryInstance({
    geometry: circleGeometry,
  });

  // 波纹扩散着色器逻辑
  const appearance = new SuperMap3D.EllipsoidSurfaceAppearance({
    renderState: {
      blending: SuperMap3D.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: false }, // 关键：关闭深度测试
      depthMask: false,
    },
    fragmentShaderSource: `
      varying vec2 v_st;
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
          gl_FragColor = vec4(u_color.rgb, alpha * u_color.a * 2.0);
      }
    `,
  });

  appearance.uniforms = {
    u_color: color,
  };

  const primitive = new SuperMap3D.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

const makePillar = (color, coord, viewer, SuperMap3D) => {
  const options = {
    position: [(coord[0] * Math.PI) / 180, (coord[1] * Math.PI) / 180, 0],
    scale: 2.0,
  };

  // 生成16边形的顶点数据，为了实现向内弯曲的弧度，我们需要在高度方向上进行分段
  const segments = 16; // 圆周分段数
  const heightSegments = 30; // 高度分段数，分段越多弧度越平滑
  const radius = 8.0; // 底部半径基准
  const topRadius = 0.5; // 顶部半径基准（增大，使其不要太尖）
  const height = 120.0; // 高度基准

  // 使用指数衰减函数来实现平滑的“人”字形弯曲（从顶到底一直弯曲下来）
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

  const geometry = new SuperMap3D.Geometry({
    attributes: {
      position: new SuperMap3D.GeometryAttribute({
        componentDatatype: SuperMap3D.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new SuperMap3D.GeometryAttribute({
        componentDatatype: SuperMap3D.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: SuperMap3D.PrimitiveType.TRIANGLES,
    boundingSphere: SuperMap3D.BoundingSphere.fromVertices(positions),
  });

  const instance = new SuperMap3D.GeometryInstance({
    geometry: geometry,
    modelMatrix: SuperMap3D.Transforms.headingPitchRollToFixedFrame(
      SuperMap3D.Cartesian3.fromDegrees(coord[0], coord[1], 0),
      new SuperMap3D.HeadingPitchRoll(0, 0, 0),
    ),
  });

  const appearance = new SuperMap3D.Appearance({
    renderState: {
      blending: SuperMap3D.BlendingState.ALPHA_BLEND,
      // 修复：对于透视建筑，我们可以将 primitive 的 renderState depthTest.enabled 设置为 false
      depthTest: { enabled: false },
      depthMask: false,
    },
    fragmentShaderSource: `
      varying vec2 v_st;
      uniform vec4 u_color;
      void main() {
          // 由于材质中 u_color 的 alpha 值可能很低或者外部颜色不是 vec4
          // 我们直接使用传进来的颜色
          float powerRatio = fract(czm_frameNumber / 30.0) + 1.0;
          float alpha = pow(1.0 - v_st.t, powerRatio);
          gl_FragColor = vec4(u_color.rgb, alpha * u_color.a * 2.0);
      }
    `,
    vertexShaderSource: `
      attribute vec3 position3DHigh;
      attribute vec3 position3DLow;
      attribute vec2 st;
      attribute float batchId;
      varying vec2 v_st;
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

  const primitive = new SuperMap3D.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

const makeSpriteAnimation = (color, coord, viewer, SuperMap3D) => {
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

  const geometry = new SuperMap3D.Geometry({
    attributes: {
      position: new SuperMap3D.GeometryAttribute({
        componentDatatype: SuperMap3D.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      st: new SuperMap3D.GeometryAttribute({
        componentDatatype: SuperMap3D.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: sts,
      }),
    },
    indices: indices,
    primitiveType: SuperMap3D.PrimitiveType.TRIANGLES,
    boundingSphere: SuperMap3D.BoundingSphere.fromVertices(positions),
  });

  const instance = new SuperMap3D.GeometryInstance({
    geometry: geometry,
    modelMatrix: SuperMap3D.Transforms.headingPitchRollToFixedFrame(
      SuperMap3D.Cartesian3.fromDegrees(coord[0], coord[1], 0),
      new SuperMap3D.HeadingPitchRoll(0, 0, 0),
    ),
  });

  const appearance = new SuperMap3D.MaterialAppearance({
    renderState: {
      blending: SuperMap3D.BlendingState.ALPHA_BLEND,
      depthTest: { enabled: false }, // 关闭深度测试，避免被建筑遮挡
      depthMask: false,
    },
    material: new SuperMap3D.Material({
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
            
            vec4 imageColor = texture2D(u_image, st);
            
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
      attribute vec3 position3DHigh;
      attribute vec3 position3DLow;
      attribute vec2 st;
      attribute float batchId;
      varying vec3 v_positionEC;
      varying vec3 v_normalEC;
      varying vec2 v_st;
      void main() {
          vec4 p = czm_computePosition();
          v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
          v_normalEC = vec3(0.0, 0.0, 1.0);
          v_st = st;
          gl_Position = czm_modelViewProjectionRelativeToEye * p;
      }
    `,
  });

  const primitive = new SuperMap3D.Primitive({
    geometryInstances: instance,
    appearance: appearance,
    asynchronous: false,
  });

  viewer.scene.primitives.add(primitive);
  return primitive;
};

const createGlowCanvas = (colorHex) => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  let r = 255,
    g = 255,
    b = 255;
  if (colorHex.startsWith("#") && colorHex.length === 7) {
    r = parseInt(colorHex.slice(1, 3), 16);
    g = parseInt(colorHex.slice(3, 5), 16);
    b = parseInt(colorHex.slice(5, 7), 16);
  }
  gradient.addColorStop(0, `rgba(255,255,255,1)`);
  gradient.addColorStop(0.2, `rgba(${r},${g},${b},1)`);
  gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.4)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas.toDataURL("image/png");
};

const addSubstation = async (SuperMap3D, scene, viewer) => {
  const { CylinderGlowMaterialProperty, CircleRippleMaterialProperty } =
    registerCustomMaterials(SuperMap3D);
  try {
    const res = await fetch("/json/substation.json");
    const data = await res.json();

    const colors = [
      SuperMap3D.Color.fromCssColorString("#0088ff"), // Blue
      SuperMap3D.Color.fromCssColorString("#00ff00"), // Green
      SuperMap3D.Color.fromCssColorString("#ffaa00"), // Yellow
      SuperMap3D.Color.fromCssColorString("#ff0000"), // Red
    ];

    const colorsCss = ["#0088ff", "#00ff00", "#ffaa00", "#ff0000"];

    // 只取前50个点位，防止性能问题
    const points = data.slice(0, 50);
    const subList = [];

    points.forEach((feature, index) => {
      const coord = feature.geometry.coordinates;
      const typeNum = Number(feature.properties.subType || 0);
      const colorIndex = typeNum % 4;
      const color = colors[colorIndex];
      const cssColor = colorsCss[colorIndex];

      const cylinderHeight = 40.0;
      const position = SuperMap3D.Cartesian3.fromDegrees(
        coord[0],
        coord[1],
        cylinderHeight / 2.0,
      );

      // 添加底部波纹
      viewer.entities.add({
        position: SuperMap3D.Cartesian3.fromDegrees(coord[0], coord[1], 0.5),
        ellipse: {
          semiMinorAxis: 15.0,
          semiMajorAxis: 15.0,
          material: new CircleRippleMaterialProperty({
            color: color,
            speed: 2.0,
            count: 3.0,
          }),
          // 在较新版本的 Cesium/SuperMap3D 中关闭深度测试的方式可能不直接适用于 geometry, 但可以用 zIndex 或 heightReference 尝试
          height: 0.5, // 提高一点防止与地面 z-fighting
        },
      });

      // 由于 st.s/t 在不同情况下映射方向可能翻转，我们这里使用两个发光圆锥体，直接给材质通过修改 geometry 或者通过自定义 Primitive 来彻底解决。
      // 但是在 Entity API 中最简便的做法是，如果 st.s/t 不对，我们可以尝试改变 Entity 的朝向或者使用内置的 distance 变量。
      viewer.entities.add({
        position: position,
        cylinder: {
          length: cylinderHeight,
          topRadius: 0.1,
          bottomRadius: 10.0,
          material: new CylinderGlowMaterialProperty({
            color: color,
            speed: 3.0,
            length: cylinderHeight,
          }),
        },
      });

      // 添加底部点发光效果（代替后处理发光）
      // 这里也用 billboard 的 disableDepthTestDistance 来防止遮挡
      viewer.entities.add({
        position: SuperMap3D.Cartesian3.fromDegrees(coord[0], coord[1], 1.5),
        billboard: {
          image: createGlowCanvas(cssColor),
          width: 80,
          height: 80,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // 防止被地面或建筑遮挡导致发光被切断
        },
      });

      // 记录点位信息用于HTML标签
      subList.push({
        id: feature.id,
        name: feature.properties.name,
        position: SuperMap3D.Cartesian3.fromDegrees(
          coord[0],
          coord[1],
          cylinderHeight,
        ), // 标签高度
        temp: (35 + Math.random() * 5).toFixed(1), // 模拟温度
        color: cssColor,
        show: false,
        top: 0,
        left: 0,
      });
    });

    substationList.value = subList;

    // 取消场景或实体的深度测试以防止被建筑掩盖：
    // 关闭地球表面（地形）对几何体的深度测试
    // viewer.scene.globe.depthTestAgainstTerrain = false;

    // 如果要让实体透视 3D Tiles 建筑物：
    // 在 Cesium 中，控制 3D Tiles 与不透明/半透明几何体之间遮挡关系的最强属性是 orderIndependentTranslucency
    // 确保 OIT 开启，可以让半透明材质（如我们的光柱和波纹）拥有更好的混合与透视效果。
    viewer.scene.orderIndependentTranslucency = true;

    // 如果仍然看不见，可能需要调整相机视角或者等待贴图加载

    // 我们尝试禁用全局的高动态范围以确保正常的透明混合：
    viewer.scene.highDynamicRange = false;
  } catch (e) {
    console.error("Failed to load substation.json", e);
  }
};

const updateSubstationLabels = () => {
  if (
    !viewer ||
    !substationList.value.length ||
    !substationHtmlElements.value.length
  )
    return;

  substationList.value.forEach((item, index) => {
    const el = substationHtmlElements.value[index];
    if (!el) return;

    // 判断点是否在相机前方
    const windowPosition = SuperMap3D.SceneTransforms.wgs84ToWindowCoordinates(
      viewer.scene,
      item.position,
    );
    if (windowPosition) {
      el.style.display = "flex";
      el.style.left = windowPosition.x + "px";
      el.style.top = windowPosition.y + "px";
    } else {
      el.style.display = "none";
    }
  });
};

const updatePipeShaderTime = () => {
  if (pipeCustomShader) {
    pipeCustomShader.setUniform("u_time", performance.now() / 1000.0);
  }
  if (pipeTextureShader) {
    pipeTextureShader.setUniform("u_time", performance.now() / 1000.0);
  }
};

onUnmounted(() => {
  if (viewer) {
    if (redPipeGlowStage && viewer?.scene?.postProcessStages) {
      viewer.scene.postProcessStages.remove(redPipeGlowStage);
      redPipeGlowStage = null;
    }
    tilesets.forEach((t) => {
      if (viewer?.scene?.primitives && t) viewer.scene.primitives.remove(t);
    });
    tilesets = [];
    viewer.destroy();
    viewer = null;
  }
});
</script>

<template>
  <div class="superMapContainer-wrapper">
    <div
      ref="containerRef"
      id="superMapContainer"
      class="superMapContainer"
    ></div>

    <!-- Fog Control Panel -->
    <div class="fog-control-panel">
      <h3>Fog Controls</h3>
      <div class="control-item">
        <label>
          <input type="checkbox" v-model="fogParams.enabled" /> Enabled
        </label>
      </div>
      <div class="control-item">
        <label>Density: {{ Number(fogParams.density).toFixed(6) }}</label>
        <input
          type="range"
          v-model="fogParams.density"
          min="0"
          max="0.002"
          step="0.00005"
        />
      </div>
      <div class="control-item">
        <label
          >Visual Density Scalar:
          {{ Number(fogParams.visualDensityScalar).toFixed(2) }}</label
        >
        <input
          type="range"
          v-model="fogParams.visualDensityScalar"
          min="0"
          max="1"
          step="0.01"
        />
      </div>
      <div class="control-item">
        <label>SSE: {{ fogParams.sse }}</label>
        <input
          type="range"
          v-model="fogParams.sse"
          min="0"
          max="10"
          step="0.1"
        />
      </div>
      <div class="control-item">
        <label
          >Min Brightness:
          {{ Number(fogParams.minimumBrightness).toFixed(2) }}</label
        >
        <input
          type="range"
          v-model="fogParams.minimumBrightness"
          min="0"
          max="1"
          step="0.01"
        />
      </div>
      <div class="control-item">
        <label
          >Height Scalar: {{ Number(fogParams.heightScalar).toFixed(2) }}</label
        >
        <input
          type="range"
          v-model="fogParams.heightScalar"
          min="0"
          max="1000"
          step="1"
        />
      </div>
      <div class="control-item">
        <label
          >Height Falloff:
          {{ Number(fogParams.heightFalloff).toFixed(2) }}</label
        >
        <input
          type="range"
          v-model="fogParams.heightFalloff"
          min="0"
          max="1"
          step="0.01"
        />
      </div>
      <div class="control-item">
        <label>Max Height: {{ fogParams.maxHeight }}</label>
        <input
          type="range"
          v-model="fogParams.maxHeight"
          min="0"
          max="10000"
          step="10"
        />
      </div>
    </div>

    <!-- <div
      v-for="(item, index) in substationList"
      :key="item.id"
      class="substation-label"
      :style="{
        display: 'none',
        borderColor: item.color,
        boxShadow: `inset 0 0 10px ${item.color}40`,
      }"
      :ref="
        (el) => {
          if (el) substationHtmlElements[index] = el;
        }
      "
    >
      <div class="label-content">
        <span class="label-title">温度</span>
        <span class="label-temp" :style="{ color: item.color }"
          >{{ item.temp }}℃</span
        >
      </div>
      <div class="label-line" :style="{ backgroundColor: item.color }"></div>
      <div class="label-dot" :style="{ backgroundColor: item.color }"></div>
    </div> -->
  </div>
</template>

<!-- CSS 样式 -->
<style scoped>
.superMapContainer-wrapper {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.superMapContainer {
  width: 100%;
  height: 100%;
}

.fog-control-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 15, 30, 0.8);
  border: 1px solid rgba(0, 255, 255, 0.3);
  padding: 15px;
  border-radius: 8px;
  color: #fff;
  font-family: sans-serif;
  z-index: 10;
  backdrop-filter: blur(4px);
  width: 250px;
}

.fog-control-panel h3 {
  margin: 0 0 15px 0;
  font-size: 16px;
  text-align: center;
  color: #00ffff;
}

.control-item {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}

.control-item label {
  font-size: 12px;
  margin-bottom: 4px;
}

.control-item input[type="range"] {
  width: 100%;
}

.substation-label {
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 15, 30, 0.8);
  border: 1px solid rgba(0, 255, 255, 0.3);
  padding: 6px 12px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 10;
  color: #ffffff;
  font-family: sans-serif;
  font-size: 14px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}

.label-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 5px currentColor;
}
</style>
