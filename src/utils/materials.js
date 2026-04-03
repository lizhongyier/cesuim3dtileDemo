export const registerCustomMaterials = (SuperMap3D) => {
  // 1. 发光圆柱体带上升光环效果
  class CylinderGlowMaterialProperty {
    constructor(options = {}) {
      this._definitionChanged = new SuperMap3D.Event();
      this.color = options.color || SuperMap3D.Color.fromCssColorString('#00ffff');
      this.speed = options.speed || 1.0;
      this.length = options.length || 40.0;
    }

    get isConstant() {
      return false;
    }

    get definitionChanged() {
      return this._definitionChanged;
    }

    getType(time) {
      return 'CylinderGlow';
    }

    getValue(time, result) {
      if (!SuperMap3D.defined(result)) {
        result = {};
      }
      result.color = SuperMap3D.Property.getValueOrClonedDefault(this.color, time, SuperMap3D.Color.WHITE, result.color);
      result.speed = this.speed;
      result.length = this.length;
      return result;
    }

    equals(other) {
      return this === other ||
        (other instanceof CylinderGlowMaterialProperty &&
          SuperMap3D.Property.equals(this.color, other.color) &&
          this.speed === other.speed &&
          this.length === other.length);
    }
  }

  Object.defineProperties(CylinderGlowMaterialProperty.prototype, {
    color: SuperMap3D.createPropertyDescriptor('color'),
    speed: SuperMap3D.createPropertyDescriptor('speed'),
    length: SuperMap3D.createPropertyDescriptor('length')
  });

  SuperMap3D.Material._materialCache.addMaterial('CylinderGlow', {
    fabric: {
      type: 'CylinderGlow',
      uniforms: {
        color: new SuperMap3D.Color(1.0, 0.0, 0.0, 1.0),
        speed: 1.0,
        length: 40.0
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          // 为了让圆锥透视建筑（取消深度测试的影响）
          // 由于我们不能直接在 Entity 级别关闭深度测试，我们可以在片元着色器中修改片段的深度值
          // 通过输出极小的 gl_FragDepth，骗过深度缓冲，让它永远渲染在最前面！
          // 注意：这需要 WebGL 扩展支持，但在高版本 Cesium 中通常可用
          
          czm_material material = czm_getDefaultMaterial(materialInput);
          
          // 既然 st.t 和 st.s 都是水平方向（从南到北，从西到东）的，说明纹理坐标完全映射在了底面上（可能是因为圆锥特殊的UV展开方式）。
          // 我们必须抛弃纹理坐标，改用空间位置来计算高度！
          
          // 在 Cesium Fabric 中，可以通过将 materialInput.positionToEyeEC（眼坐标系下的坐标）
          // 转换回模型坐标或世界坐标。但最简单的近似方法是利用到中心的距离或借助传入的高度变量计算。
          // 因为我们知道实体是在原点上方，直接取世界坐标的 Z 或者利用 length
          
          // 获取片段到模型中心(0,0,0)的距离。由于这是一个圆锥，顶端在 +length/2，底端在 -length/2。
          // 但是没有直接的模型坐标。我们可以通过一个非常聪明的 hack：
          // 利用 materialInput.normalEC（法线），但法线也是弯的。
          
          // 让我们采用终极解法：因为这只是一个垂直向上的光柱，在地球表面小范围内，它的世界坐标方向(向上)
          // 几乎与它相对地心的法线方向一致。但是由于我们无法直接在 fabric 里获取模型矩阵，
          // 我们退回到一个更通用的做法，在 Shader 中通过 uniform 传入原点位置或者利用一个特定的三维空间算法。
          
          // 其实，在较新版本的 Cesium 中，除了 position3DMC，还有 position3DWC (世界坐标)。
          // 但是由于位置问题，高度并不好算。
          // 回到最初：为什么 position3DMC 会消失？因为 Cone 默认不生成该属性。
          // 只要我们在 SuperMap3d.vue 里把 topRadius 改成不为 0 的极小值（比如 0.1），它依然被当作 Cone 处理，但我们可以改用纯着色器绘制锥体或者使用自定义几何体。
          
          // 为了不改动太多底层代码，我们可以利用 \`materialInput.str\` （如果是3D纹理）或者最可靠的：
          // 我们改变渲染思路，不依赖模型的Z轴，而是通过计算相机视点与模型表面的交点！
          // 其实，还有一个被遗忘的内置变量可以使用： \`czm_modelView\` 或者是计算顶点。
          
          // 让我们使用一个绝对可靠的方法：因为您是在局部创建的 Entity，它的位置在笛卡尔坐标系中，Z轴并不一定是“上”（地球是个球体，上是沿法线向外）。
          // 但是！如果在创建时不使用 Entity API，而是使用 Primitive API 配合 Geometry，我们可以控制属性。
          // 在 Entity API 中，我们可以利用 distance，但这只适用于球体。
          
          // 既然 st 都不行，我们在 fabric 中利用 v_st 吗？不。
          // 让我给出一个最稳妥的基于当前片段法线和视点距离的近似算法：
          // 或者是，其实我们只要把圆锥改成真正的圆柱（上下半径一样），st.t 就会恢复正常垂直！
          // 但如果要保持圆锥形，又要在 Entity 里用材质，最简单的是在片段着色器中用 \`gl_FragCoord.z\`（深度）吗？不行，会随视角变。
          
          // 这里提供一个通过 st 计算高度的黑科技（针对 Cesium Cone 的 UV 映射）：
          // 如果 Cone 的 UV 是极坐标展开（像个扇形），那么高度实际上是与 (st.s - 0.5) 和 (st.t - 0.5) 的距离相关的！
          // 让我们试试 \`length(materialInput.st - vec2(0.5))\` 或者它的变体。
          // 对于标准的 Cone，纹理展开是一个扇形，半径代表从顶点到底部的距离！
          // 所以：顶点在圆心(或某个点)，底边在圆弧上。
          // 让我们计算到中心的距离：
          float dist = distance(materialInput.st, vec2(0.5));
          // 如果展开中心在 (0.5, 0.5)，dist 越大说明越靠近底部。
          // 反之，我们可以直接把它作为高度的近似！
          // 让我们假设 normalizedZ = 1.0 - (dist * 2.0); (中心最高，边缘最低)
          float normalizedZ = clamp(1.0 - dist * 2.0, 0.0, 1.0);
          
          float time = czm_frameNumber * speed / 100.0;
          
          // 创建几个上升的光环
          float ring = fract(normalizedZ * 5.0 - time);
          ring = smoothstep(0.4, 0.5, ring) - smoothstep(0.5, 0.6, ring);
          
          // 顶部渐隐
          float fade = smoothstep(1.0, 0.0, normalizedZ);
          
          // 底部发光加强
          float bottomGlow = smoothstep(0.2, 0.0, normalizedZ);
          
          float alpha = (ring * 0.8 + bottomGlow * 0.5 + 0.2) * fade;
          
          material.diffuse = color.rgb;
          material.alpha = alpha * color.a;
          material.emission = material.diffuse * alpha * 3.0;
          
          return material;
        }
      `
    },
    translucent: function(material) {
      return true;
    }
  });

  // 2. 底部波纹扩散效果
  class CircleRippleMaterialProperty {
    constructor(options = {}) {
      this._definitionChanged = new SuperMap3D.Event();
      this.color = options.color || SuperMap3D.Color.fromCssColorString('#00ffff');
      this.speed = options.speed || 1.0;
      this.count = options.count || 2.0;
    }

    get isConstant() {
      return false;
    }

    get definitionChanged() {
      return this._definitionChanged;
    }

    getType(time) {
      return 'CircleRipple';
    }

    getValue(time, result) {
      if (!SuperMap3D.defined(result)) {
        result = {};
      }
      result.color = SuperMap3D.Property.getValueOrClonedDefault(this.color, time, SuperMap3D.Color.WHITE, result.color);
      result.speed = this.speed;
      result.count = this.count;
      return result;
    }

    equals(other) {
      return this === other ||
        (other instanceof CircleRippleMaterialProperty &&
          SuperMap3D.Property.equals(this.color, other.color) &&
          this.speed === other.speed &&
          this.count === other.count);
    }
  }

  Object.defineProperties(CircleRippleMaterialProperty.prototype, {
    color: SuperMap3D.createPropertyDescriptor('color'),
    speed: SuperMap3D.createPropertyDescriptor('speed'),
    count: SuperMap3D.createPropertyDescriptor('count')
  });

  SuperMap3D.Material._materialCache.addMaterial('CircleRipple', {
    fabric: {
      type: 'CircleRipple',
      uniforms: {
        color: new SuperMap3D.Color(1.0, 0.0, 0.0, 1.0),
        speed: 1.0,
        count: 2.0
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          
          vec2 st = materialInput.st;
          float dist = distance(st, vec2(0.5, 0.5));
          
          // 如果超出半径则透明
          if (dist > 0.5) {
            discard;
          }
          
          float time = czm_frameNumber * speed / 100.0;
          
          // 从中心向外扩散的波纹
          // r 是距离乘以波纹数量减去时间
          float r = fract(dist * count * 2.0 - time);
          
          // 波纹变细，边缘模糊
          float ripple = smoothstep(0.4, 0.5, r) - smoothstep(0.5, 0.6, r);
          
          // 中心高亮
          float centerGlow = smoothstep(0.15, 0.0, dist);
          
          // 边缘渐隐
          float fade = 1.0 - smoothstep(0.3, 0.5, dist);
          
          float alpha = (ripple + centerGlow) * fade;
          
          material.diffuse = color.rgb;
          material.alpha = alpha * color.a;
          material.emission = material.diffuse * alpha * 2.0;
          
          return material;
        }
      `
    },
    translucent: function(material) {
      return true;
    }
  });

  return { CylinderGlowMaterialProperty, CircleRippleMaterialProperty };
};
