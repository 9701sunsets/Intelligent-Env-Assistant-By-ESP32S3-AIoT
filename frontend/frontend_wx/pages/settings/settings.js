// pages/settings/settings.js
Page({
  data: {
    settings: {
      tempAlert: true,
      humidityAlert: false,
      lightAlert: true,
      autoMode: false,
      notification: true
    },
    deviceInfo: {
      name: 'ESP32-S3 微感知主板',
      status: '模拟在线',
      firmware: 'v2.1.0-mock',
      macAddress: 'A1:B2:C3:D4:E5:F6',
      lastSync: '刚刚'
    },
    thresholds: {
      tempMax: 28,
      tempMin: 20,
      humidityMax: 70,
      humidityMin: 40,
      lightMax: 500
    }
  },

  onLoad() {
    wx.showToast({
      title: '设置页面加载完成',
      icon: 'success',
      duration: 800
    });
  },

  onSwitchChange(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({ [`settings.${key}`]: value });
    wx.showToast({ title: value ? '已开启' : '已关闭', icon: 'none', duration: 600 });
  },

  onSliderChange(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`thresholds.${key}`]: e.detail.value });
  },

  onDeviceTap() {
    wx.showModal({
      title: '设备信息',
      content: `设备：${this.data.deviceInfo.name}\n状态：${this.data.deviceInfo.status}\n固件：${this.data.deviceInfo.firmware}\n\n（模拟数据模式）`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onClearCache() {
    wx.showModal({
      title: '提示',
      content: '确定清除本地缓存？（模拟操作）',
      success: (res) => {
        if (res.confirm) wx.showToast({ title: '缓存已清除', icon: 'success' });
      }
    });
  }
});