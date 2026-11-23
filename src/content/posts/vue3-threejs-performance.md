---
title: 'Vue3 + Three.js 大场景卡顿：先查 dispose，再谈优化'
description: '场站三维展示越用越卡，切换五次页面后帧率掉到个位数。大部分"渲染优化"其实是在补没有释放的几何体和纹理。'
pubDate: 2026-10-28
tags: ['VUE', 'PERF', 'THREE']
---

一个场站监控页：左侧设备列表，右侧 Three.js 场景，切换不同场站时重建模型。上线后客户反馈"看半小时就卡"，切得越勤卡得越快——这个特征几乎就排除了着色器写法的问题，指向内存。

## 先确认是泄漏还是算力不够

打开 Chrome DevTools 的 Memory 面板，连续切换五次场站，看两件事：

1. `JSHeapUsedSize` 是否单调上涨不回落
2. `renderer.info.memory` 里的 `geometries`、`textures` 数量是否只增不减

如果几何体和纹理数量一直涨，说明是没释放；如果数量稳定但帧率仍低，才是 draw call 和三角形数量的问题。这两种情况要完全不同的修法。

## dispose 的对象不止一个

```ts
function disposeScene(scene: THREE.Scene) {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of materials) {
      // 贴图必须逐个释放，材质 dispose 不会替你释放纹理
      for (const key of Object.keys(m) as (keyof typeof m)[]) {
        const value = m[key];
        if (value && (value as THREE.Texture).isTexture) {
          (value as THREE.Texture).dispose();
        }
      }
      m.dispose();
    }
  });
}
```

常见疏漏：只 `dispose()` 了 geometry，忘了 material 引用的贴图；只处理了直接子节点，忘了 `traverse`；甚至根本没从 `scene` 里 `remove`，对象还挂在场景树上继续参与渲染。

## Vue 这边同样会漏

`onUnmounted` 里只取消 `requestAnimationFrame` 是不够的：

```ts
let raf = 0;
onUnmounted(() => {
  cancelAnimationFrame(raf);
  disposeScene(scene);
  renderer.dispose();
  renderer.forceContextLoss(); // 释放 WebGL 上下文
  renderer.domElement.remove();
});
```

`forceContextLoss()` 很关键。不调用它，被丢弃的 canvas 的 WebGL 上下文不会立即回收，浏览器对同时存在的上下文数量有上限（通常 16 个），切到第八、第九个页面时就会出现"新的 canvas 画不出来"。

## 真正需要优化的部分

清掉泄漏之后，如果还是慢，再按这个顺序：

- **合并静态几何**：场地围栏、地面这类不动的东西用 `BufferGeometryUtils.mergeGeometries` 合成一个 mesh，draw call 从几百降到个位数
- **实例化**：同一种设备几十上百个，用 `InstancedMesh`
- **共享材质**：不同设备颜色不同的话，用 `vertexColors` 而不是几十个材质
- **降低贴图**：一张 4096 的贴图在移动端就是灾难，多数场景 1024 足够

先修泄漏，再谈这些。顺序反了，优化效果会被泄漏吃掉。
