<script setup>
import { onMounted, onUnmounted, ref } from "vue";

const containerRef = ref(null);
let viewer = null;
let SuperMap3D = null;
let scene, widget, sceneLayer;
let tilesets = [];
let pipeCustomShader = null;
let redPipeGlowStage = null;
const pipeInfoById = new Map();
const redPipeIds = new Set([1067, 979, 1357, 828, 592, 693, 751, 877]);
const greenPipeIds = new Set([264, 247, 215, 181]);

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;

  SuperMap3D = window.SuperMap3D;
  if (!SuperMap3D) {
    container.innerText =
      "SuperMap3D 未加载：请确认 index.html 中引入的 /SuperMap3D/SuperMap3D.js 可访问";
    return;
  }
  console.log("SuperMap3D", SuperMap3D);
  container.innerText = "SuperMap3D 已加载";
  viewer = new SuperMap3D.Viewer("superMapContainer", {
    contextOptions: {
      contextType: Number(3), // 设置渲染引擎类型：Webgl2:2 ; WebGPU:3
    },
  });
  // 等待场景初始化完成后执行初始化函数
  viewer.scenePromise.then(function (scene) {
    init(SuperMap3D, scene, viewer);
  });
});

const init = async (SuperMap3D, scene, viewer) => {
  console.log("场景初始化完成");
  // console.log(window)
  const baseUrl = window.location.origin;
  viewer.resolutionScale = window.devicePixelRatio;

  // 加载高德影像地图
  viewer.imageryLayers.addImageryProvider(
    new SuperMap3D.UrlTemplateImageryProvider({
      url: "https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}",
      minimumLevel: 3,
      maximumLevel: 18,
    }),
  );

var promise = scene.open('http://10.2.2.205:8090/iserver/services/HZYS_Line/rest/realspace');
      // 场景加载完成后的回调处理
      SuperMap3D.when(promise, function (layer) {
        // 查找指定名称的管道图层
        console.log(layer)
        viewer.flyTo(layer);
        // var line = scene.layers.find("纯水绿色管道优化");
        // // 设置管道纹理的UV动画速度，实现流动效果
        // line.textureUVSpeed = new SuperMap3D.Cartesian2(0, -2); // 模型纹理在UV坐标上的运动速度，Y轴负方向流动
      })

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
  <div
    ref="containerRef"
    id="superMapContainer"
    class="superMapContainer"
  ></div>
</template>

<style scoped>
.superMapContainer {
  width: 100vw;
  height: 100vh;
}
</style>
