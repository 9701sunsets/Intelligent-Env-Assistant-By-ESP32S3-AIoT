// app.js
App({
  onLaunch() {
    console.log('[App] 智能环境监测助手启动（模拟数据模式）');
    
    // 全局数据，纯模拟，无任何网络请求
    this.globalData = {
      userInfo: null,
      systemInfo: null,
      isMockMode: false,// true,
      apiBaseUrl: 'http://localhost:3000' //null  // 显式置空，防止任何请求
    };
    
    // 捕获基础库灰度版的 timeout 错误（非业务代码问题）
    wx.onError((err) => {
      if (err && err.includes && err.includes('timeout')) return;
      console.log('[App Error]', err);
    });
  },

  onShow() {
    // 不做任何网络请求
  },

  onHide() {
    // 不做任何网络请求
  },

  onError(msg) {
    // 静默 timeout 错误（基础库 3.16.0 灰度版已知问题）
    if (typeof msg === 'string' && msg.includes('timeout')) return;
    console.log('[App Error]', msg);
  }
});