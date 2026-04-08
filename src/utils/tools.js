import * as Cesium from "cesium";
export const addModelByPrimitive = () => {};

export const loadModelAtMultiplePositions = async (url, locations, viewer) => {
  // 方案选择：少量点位用Entity，大量点位用ModelInstanceCollection
  const useEntity = locations.length < 50;
  if (useEntity) {
    // Entity方案 - 更好的交互支持
    locations.forEach((loc) => {
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(loc.lon, loc.lat, loc.height),
        model: {
          uri: url,
          scale: 100, // 根据模型实际大小调整
          silhouetteColor: Cesium.Color.WHITE,
          silhouetteSize: 0,
        },
        label: {
          text: loc.name,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -50),
        },
      });
    });

    // // 点击事件
    // const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    // handler.setInputAction((click) => {
    //   const picked = viewer.scene.pick(click.position);
    //   if (Cesium.defined(picked) && picked.id) {
    //     console.log("点击了:", picked.id.label.text._value);
    //   }
    // }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  } else {
    // ModelInstanceCollection方案 - 高性能
    const instances = locations.map((loc) => {
      const position = Cesium.Cartesian3.fromDegrees(
        loc.lon,
        loc.lat,
        loc.height,
      );
      return new Cesium.ModelInstance({
        modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(position),
      });
    });

    viewer.scene.primitives.add(
      new Cesium.ModelInstanceCollection({
        url: url,
        instances: instances,
        scale: 100,
      }),
    );
  }
};
