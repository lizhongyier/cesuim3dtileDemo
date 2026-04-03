import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/ceuimOrigin' },
    {
      path: '/three',
      name: 'three',
      component: () => import('../pages/ThreeLoad.vue')
    },
    {
      path: '/ceuimOrigin',
      name: 'ceuimOrigin',
      component: () => import('../pages/CeuimOrigin.vue')
    },
    {
      path: '/superMap',
      name: 'superMap',
      component: () => import('../pages/SuperMap3d.vue')
    },
    {
      path: '/superMapWebGpu',
      name: 'superMapWebGpu',
      component: () => import('../pages/SuperMap3dWebGpu.vue')
    }
  ]
})

export default router
