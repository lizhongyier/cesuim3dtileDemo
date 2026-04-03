// 泛光效果管理
let bloomStage = null;
let scene = null;
let Cesium = null;
const lonIncrement = 0.00025;
const initialLon = -122.99875;
const lat = 44.0503706;
const height = 100.0;
const addBloomEffect = (scene, Cesium) => {
  scene = scene;
  Cesium = Cesium;
  console.log(scene);
  console.log(Cesium);
  const viewModel = {
    show: true,
    glowOnly: false,
    contrast: 128,
    brightness: -0.3,
    delta: 1.0,
    sigma: 3.78,
    stepSize: 3.0,
  };

  Cesium.knockout.track(viewModel);
  const toolbar = document.getElementById("toolbar");
  console.log(toolbar);
  Cesium.knockout.applyBindings(viewModel, toolbar);
  for (const name in viewModel) {
    if (viewModel.hasOwnProperty(name)) {
      Cesium.knockout
        .getObservable(viewModel, name)
        .subscribe(updatePostProcess);
    }
  }

  function updatePostProcess() {
    const bloom = scene.postProcessStages.bloom;
    bloom.enabled = Boolean(viewModel.show);
    bloom.uniforms.glowOnly = Boolean(viewModel.glowOnly);
    bloom.uniforms.contrast = Number(viewModel.contrast);
    bloom.uniforms.brightness = Number(viewModel.brightness);
    bloom.uniforms.delta = Number(viewModel.delta);
    bloom.uniforms.sigma = Number(viewModel.sigma);
    bloom.uniforms.stepSize = Number(viewModel.stepSize);
    console.log(bloom.uniforms);
  }
  updatePostProcess();
};

export { addBloomEffect };
