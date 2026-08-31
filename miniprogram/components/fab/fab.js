Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    icon: { type: String, value: 'plus' }
  }
  // 不拦截 tap：页面 <p-fab bind:tap> 直接捕获内部原生 tap 冒泡。
  // （曾在此 triggerEvent('tap')，与原生冒泡叠加导致页面回调执行两次、navigateTo 双跳）
});
