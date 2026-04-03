<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TilesRenderer, B3DMLoader } from "3d-tiles-renderer";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as THREE from "three";

const containerRef = ref(null);
let renderer;
let scene;
let camera;
let offsetParent;
let tilesRenderer, box, sphere, orthoCamera;
const DEFAULT = 0;
const GRADIENT = 1;
const TOPOGRAPHIC_LINES = 2;
const LIGHTING = 3;
const params = {
  material: DEFAULT,
  orthographic: false,
  rebuild: initTiles,
};

const gradientShader = {
  vertexShader: /* glsl */ `
		varying vec3 wPosition;
		void main() {

			#include <begin_vertex>
			#include <project_vertex>
			wPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;

		}
	`,
  fragmentShader: /* glsl */ `
		varying vec3 wPosition;
		void main() {

			float minVal = - 30.0;
			float maxVal = 30.0;

			float val = ( wPosition.y - minVal ) / ( maxVal - minVal );

			vec4 color1 = vec4( 0.149, 0.196, 0.219, 1.0 ) * 0.5;
			vec4 color2 = vec4( 1.0 );

			gl_FragColor = mix( color1, color2, val );

		}
	`,
};

const topoShader = {
  extensions: {
    derivatives: true,
  },
  vertexShader: /* glsl */ `
		varying vec3 wPosition;
		varying vec3 vViewPosition;
		void main() {

			#include <begin_vertex>
			#include <project_vertex>
			wPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
			vViewPosition = - mvPosition.xyz;

		}
	`,
  fragmentShader: /* glsl */ `
		varying vec3 wPosition;
		varying vec3 vViewPosition;
		void main() {

			// lighting
			vec3 fdx = vec3( dFdx( wPosition.x ), dFdx( wPosition.y ), dFdx( wPosition.z ) );
			vec3 fdy = vec3( dFdy( wPosition.x ), dFdy( wPosition.y ), dFdy( wPosition.z ) );
			vec3 worldNormal = normalize( cross( fdx, fdy ) );

			float lighting =
				0.4 +
				clamp( dot( worldNormal, vec3( 1.0, 1.0, 1.0 ) ), 0.0, 1.0 ) * 0.5 +
				clamp( dot( worldNormal, vec3( - 1.0, 1.0, - 1.0 ) ), 0.0, 1.0 ) * 0.3;

			// thickness scale
			float upwardness = dot( worldNormal, vec3( 0.0, 1.0, 0.0 ) );
			float yInv = clamp( 1.0 - abs( upwardness ), 0.0, 1.0 );
			float thicknessScale = pow( yInv, 0.4 );
			thicknessScale *= 0.25 + 0.5 * ( vViewPosition.z + 1.0 ) / 2.0;

			// thickness
			float thickness = 0.01 * thicknessScale;
			float thickness2 = thickness / 2.0;
			float m = mod( wPosition.y, 3.0 );

			// soften edge
			float center = thickness2;
			float dist = clamp( abs( m - thickness2 ) / thickness2, 0.0, 1.0 );

			vec4 topoColor = vec4( 0.149, 0.196, 0.219, 1.0 ) * 0.5;
			gl_FragColor = mix( topoColor * lighting, vec4( lighting ), dist );

		}
	`,
};

function initTiles() {
  if (tilesRenderer) {
    tilesRenderer.group.parent.remove(tilesRenderer.group);
    tilesRenderer.dispose();
  }
  const url = "tiles/data/tileset.json";
  tilesRenderer = new TilesRenderer(url);
  tilesRenderer.errorTarget = 2;
  tilesRenderer.addEventListener("load-model", onLoadModel);
  tilesRenderer.addEventListener("dispose-model", onDisposeModel);
  offsetParent.add(tilesRenderer.group); // 将3D Tiles模型加入到场景中
}
onMounted(() => {
  const container = containerRef.value;
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

  camera.position.set( 400, 400, 400 );
  orthoCamera = new THREE.OrthographicCamera();
  // 添加环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 2000;
  // lights
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
  dirLight.position.set(1, 2, 3).multiplyScalar(40);
  dirLight.castShadow = true;
  dirLight.shadow.bias = -0.01;
  dirLight.shadow.mapSize.setScalar(2048);

  const shadowCam = dirLight.shadow.camera;
  shadowCam.left = -200;
  shadowCam.bottom = -200;
  shadowCam.right = 200;
  shadowCam.top = 200;
  shadowCam.updateProjectionMatrix();
  scene.add(dirLight);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshPhongMaterial({
    color: 0x00ff00,
  });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  box = new THREE.Box3();
  sphere = new THREE.Sphere();

  offsetParent = new THREE.Group();
  scene.add(offsetParent);

  initTiles();

  function animate() {
    requestAnimationFrame(animate); // 使动画循环进行
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    camera.updateMatrixWorld();
    tilesRenderer.setCamera( camera );
    tilesRenderer.setResolutionFromRenderer( camera, renderer );
    tilesRenderer.update(); // 更新3D Tiles模型
    renderer.render(scene, camera); // 渲染场景和相机
  }
  function onLoadModel(model) {
    console.log("模型加载完成", model);
  }
  animate();
});

function onLoadModel({ scene }) {
  scene.traverse((c) => {
    if (c.isMesh) {
      c.originalMaterial = c.material;
    }
  });

  updateMaterial(scene);
}

function onDisposeModel({ scene }) {
  scene.traverse((c) => {
    if (c.isMesh) {
      c.material.dispose();
    }
  });
}

function updateMaterial(scene) {
  const materialIndex = parseFloat(params.material);
  scene.traverse((c) => {
    if (c.isMesh) {
      c.material.dispose();
      switch (materialIndex) {
        case DEFAULT:
          c.material = c.originalMaterial;
          c.material.side = 2;
          c.receiveShadow = false;
          c.castShadow = false;
          break;
        case GRADIENT:
          c.material = new THREE.ShaderMaterial(gradientShader);
          c.material.side = 2;
          c.receiveShadow = false;
          c.castShadow = false;
          break;
        case TOPOGRAPHIC_LINES:
          c.material = new THREE.ShaderMaterial(topoShader);
          c.material.side = 2;
          c.material.flatShading = true;
          c.receiveShadow = false;
          c.castShadow = false;
          break;
        case LIGHTING:
          c.material = new THREE.MeshStandardMaterial();
          c.material.side = 2;
          c.receiveShadow = true;
          c.castShadow = true;
      }
    }
  });
}

onUnmounted(() => {
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
  }
});
</script>

<template>
  <div ref="containerRef" class="viewport"></div>
</template>

<style scoped>
.viewport {
  width: 100vw;
  height: 100vh;
}
</style>
