// pages/index/index.js

// Generate 24h trend data
function genTrendData() {
  const data = [];
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    const t = now - i * 60 * 60 * 1000;
    const hour = new Date(t).getHours();
    const isNight = hour < 6 || hour > 20;
    data.push({
      temperature: Math.round((24 + Math.sin((hour - 6) * Math.PI / 12) * 3 + (Math.random() - 0.5)) * 10) / 10,
      humidity: Math.round(55 + Math.sin((hour - 12) * Math.PI / 12) * 10 + (Math.random() - 0.5) * 4),
      light: isNight ? Math.round(Math.random() * 10) : Math.round(100 + Math.sin((hour - 6) * Math.PI / 12) * 350),
      ppm: Math.round(80 + Math.random() * 40),
      timestamp: new Date(t).toISOString(),
    });
  }
  return data;
}

Page({
  data: {
    sensor: { temperature: 26.5, humidity: 58, light: 320, ppm: 100},
    lastUpdate: '刚刚',
    connected: false,
    cBg: '#FFF5E0',
    cColor: '#EA580C',
    cText: '模拟运行',
    cDot: '#EA580C',
    tDot: '#EA580C',
    tColor: '#EA580C',
    tText: '稍高',
    hDot: '#3B82F6',
    hColor: '#3B82F6',
    hText: '适宜',
    lDot: '#F59E0B',
    lColor: '#F59E0B',
    lText: '明亮',
    pDot: '#34D399',
    pColor: '#34D399',
    pText: '正常',
    aText: '当前环境整体舒适，温度略高建议适当通风，光照充足适合阅读。',
    aBorder: '#EA580C',
    fanOn: false,
    ledOn: false,
    buzzerOn: false,
    chartMode: 'th',
    history: [],
    msgs: [
      { role: 'ai', content: '您好，我是智能环境助手。请随时提问，或使用下方快捷指令。' },
      { role: 'user', content: '需要开风扇降温吗？' },
      { role: 'ai', content: '室温26.5°C稍高，建议开风扇。' }
    ],
    chatLoading: false,
    chatInp: '',
    scrollTop: 9999
  },

  onLoad() {
    // 若启用真实后端，则从后端拉取历史与最新数据；否则使用本地模拟数据
    const app = getApp();
    if (app && app.globalData && !app.globalData.isMockMode) {
      this.fetchHistory();
      this.fetchLatest();
    } else {
      this.setData({ history: genTrendData() });
    }
  },

  onReady() {
    setTimeout(() => this.drawAll(), 300);
    const app = getApp();
    if (app && app.globalData && !app.globalData.isMockMode) {
      // 每 4s 拉取最新传感器数据
      this._poller = setInterval(() => this.fetchLatest(), 4000);
    }
  },

  onUnload() {
    if (this._poller) clearInterval(this._poller);
  },

  // ===== Device Controls =====
  toggleFan() {
    const v = !this.data.fanOn;
    this.setData({ fanOn: v });
    this.controlDevice('fan', { state: v ? 'on' : 'off' });
    wx.showToast({ title: v ? '风扇已开启' : '风扇已关闭', icon: 'none', duration: 800 });
  },

  toggleLed() {
    const v = !this.data.ledOn;
    this.setData({ ledOn: v });
    this.controlDevice('led', { state: v ? 'on' : 'off' });
    wx.showToast({ title: v ? 'LED已开启' : 'LED已关闭', icon: 'none', duration: 800 });
  },

  toggleBuzzer() {
    const v = !this.data.buzzerOn;
    this.setData({ buzzerOn: v });
    this.controlDevice('buzzer', { state: v ? 'on' : 'off' });
    wx.showToast({ title: v ? '蜂鸣器已开启' : '蜂鸣器已关闭', icon: 'none', duration: 800 });
    if (v) setTimeout(() => this.setData({ buzzerOn: false }), 3000);
  },

  // ===== Chart =====
  setChart(e) {
    this.setData({ chartMode: e.currentTarget.dataset.mode }, () => this.drawTrend());
  },

  drawAll() {
    this.drawRings();
    this.drawTrend();
  },

  drawRings() {
    const ids = ['ring0', 'ring1', 'ring2', 'ring3'];
    const vals = [this.data.sensor.temperature, this.data.sensor.humidity, this.data.sensor.light, this.data.sensor.ppm];
    const maxs = [45, 100, 1000, 2000];
    const colors = ['#EA580C', '#5BC0DE', '#F5A623', '#34D399'];

    const sysInfo = wx.getWindowInfo();
    let dpr = (sysInfo && sysInfo.pixelRatio) || 2;

    ids.forEach((id, i) => {
      wx.createSelectorQuery().select('#' + id).fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0]) return;
        const cvs = res[0].node, ctx = cvs.getContext('2d');
        const w = res[0].width, h = res[0].height;
        if (w <= 0 || h <= 0) return;

        cvs.width = w * dpr;
        cvs.height = h * dpr;
        ctx.scale(dpr, dpr);

        const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 8, lw = 5, p = Math.min(vals[i] / maxs[i], 1);

        // Background ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#F0E6D8';
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Progress ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
    });
  },

  drawTrend() {
    const query = wx.createSelectorQuery();
    query.select('#trend').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0]) return;
      const cvs = res[0].node, ctx = cvs.getContext('2d');
      const W = res[0].width, H = 200;
      if (W <= 0) return;

      const sysInfo = wx.getWindowInfo();
      let dpr = (sysInfo && sysInfo.pixelRatio) || 2;

      cvs.width = W * dpr;
      cvs.height = H * dpr;
      ctx.scale(dpr, dpr);

      const data = this.data.history;
      const mode = this.data.chartMode;
      if (data.length < 2) return;

      const pad = { t: 10, r: 10, b: 28, l: 36 };
      const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = '#F0E6D8';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 3; i++) {
        const y = pad.t + (i / 3) * ch;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      }

      if (mode === 'th') {
        this.curve(ctx, data, 'temperature', '#EA580C', pad, cw, ch, false);
        this.curve(ctx, data, 'humidity', '#5BC0DE', pad, cw, ch, true);
      } else if(mode === 'hight') {
        this.curve(ctx, data, 'light', '#F5A623', pad, cw, ch, false);
      } else {
        this.curve(ctx, data, 'ppm', '#EA580C', pad, cw, ch, false);
      }

      // X labels
      ctx.fillStyle = '#9E8E80';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const step = Math.floor(data.length / 6);
      for (let i = 0; i < data.length; i += step || 1) {
        const x = pad.l + (i / (data.length - 1)) * cw;
        const d = new Date(data[i].timestamp);
        ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:00`, x, H - 6);
      }

      // Y labels
      ctx.textAlign = 'right';
      ctx.fillStyle = '#B8A99A';
      if (mode === 'th') {
        const temps = data.map(d => d.temperature);
        const tMin = Math.min(...temps) * 0.95, tMax = Math.max(...temps) * 1.05;
        for (let i = 0; i <= 3; i++) {
          const y = pad.t + (i / 3) * ch;
          ctx.fillText(`${(tMax - (tMax - tMin) * (i / 3)).toFixed(0)}°`, pad.l - 4, y + 3);
        }
      } else if(mode === 'light') {
        const lights = data.map(d => d.light);
        const lMin = Math.min(...lights) * 0.95, lMax = Math.max(...lights) * 1.05;
        for (let i = 0; i <= 3; i++) {
          const y = pad.t + (i / 3) * ch;
          ctx.fillText(Math.round(lMax - (lMax - lMin) * (i / 3)), pad.l - 4, y + 3);
        }
      } else {
        const ppms = data.map(d => d.ppm);
        const pMin = Math.min(...ppms) * 0.95, pMax = Math.max(...ppms) * 1.05;
        for (let i = 0; i <= 3; i++) {
          const y = pad.t + (i / 3) * ch;
          ctx.fillText(Math.round(pMax - (pMax - pMin) * (i / 3)), pad.l - 4, y + 3);
        }
      }
    });
  },

  curve(ctx, data, key, color, pad, cw, ch, dash) {
    const vals = data.map(d => d[key]);
    const min = Math.min(...vals) * 0.95;
    const max = Math.max(...vals) * 1.05;
    const range = max - min || 1;
    const pts = vals.map((v, i) => ({
      x: pad.l + (i / (vals.length - 1)) * cw,
      y: pad.t + ch - ((v - min) / range) * ch
    }));

    // Fill
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      ctx.bezierCurveTo(p.x + (c.x - p.x) * 0.4, p.y, p.x + (c.x - p.x) * 0.6, c.y, c.x, c.y);
    }
    ctx.lineTo(pts[pts.length - 1].x, pad.t + ch);
    ctx.lineTo(pts[0].x, pad.t + ch);
    ctx.closePath();
    ctx.fillStyle = color + '18';
    ctx.fill();

    // Stroke
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      ctx.bezierCurveTo(p.x + (c.x - p.x) * 0.4, p.y, p.x + (c.x - p.x) * 0.6, c.y, c.x, c.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash(dash ? [4, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  // ===== Network / Backend Integration =====
  getApiBase() {
    const app = getApp();
    return (app && app.globalData && app.globalData.apiBaseUrl) || '';
  },

  fetchLatest() {
    const base = this.getApiBase();
    if (!base) return;
    wx.request({
      url: `${base}/api/latest`,
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.code === 200 && res.data.data) {
          const d = res.data.data;
          this.setData({
            sensor: {
              temperature: d.temperature,
              humidity: d.humidity,
              light: d.light,
              ppm: d.mq2_ppm || this.data.sensor.ppm
            },
            lastUpdate: new Date(d.timestamp).toLocaleString(),
            fanOn: !!d.fan_on,
            ledOn: !!d.led_on,
            buzzerOn: !!d.buzzer_on
          });
          this.drawAll();
        }
      }
    });
  },

  fetchHistory(deviceId = 'esp32_001', start, end) {
    const base = this.getApiBase();
    if (!base) return;
    const data = { device_id: deviceId };
    if (start) data.start = start;
    if (end) data.end = end;
    wx.request({
      url: `${base}/api/history`,
      method: 'GET',
      data: data,
      success: (res) => {
        if (res.data && res.data.code === 200) {
          const raw = res.data.data || [];
          const norm = [];
          let prev = {
            temperature: (this.data.sensor && this.data.sensor.temperature) || 25,
            humidity: (this.data.sensor && this.data.sensor.humidity) || 50,
            light: (this.data.sensor && this.data.sensor.light) || 100,
            ppm: (this.data.sensor && this.data.sensor.ppm) || 100
          };
          raw.forEach((it) => {
            const t = Number(it.temperature);
            const h = Number(it.humidity);
            const l = Number(it.light ?? it.light);
            const p = Number(it.ppm ?? it.mq2_ppm ?? it.ppm);
            const ts = it.timestamp || new Date().toISOString();
            const nt = Number.isFinite(t) ? t : prev.temperature;
            const nh = Number.isFinite(h) ? h : prev.humidity;
            const nl = Number.isFinite(l) ? l : prev.light;
            const np = Number.isFinite(p) ? p : prev.ppm;
            norm.push({ temperature: nt, humidity: nh, light: nl, ppm: np, timestamp: ts });
            prev = { temperature: nt, humidity: nh, light: nl, ppm: np };
          });
          let finalData = norm;
          if(norm.length > 200){
            const step = Math.floor(norm.length / 200);
            finalData = norm.filter((_, i) => i % step === 0);
          }
          this.setData({ history: finalData });
          this.drawTrend();
        }
      },
      fail: () => {}
    });
  },

  fetchAIAdvice({ device_id='esp32_001', temperature, humidity, light }, cb) {
    const base = this.getApiBase();
    if (!base) return;
    wx.request({
      url: `${base}/api/ai/advice`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { device_id, temperature, humidity, light },
      success: (res) => {
        if (res.data && res.data.code === 200 && res.data.data) {
          if (typeof cb === 'function') cb(null, res.data.data);
        } else {
          if (typeof cb === 'function') cb(new Error('no data'));
        }
      },
      fail: (err) => { if (typeof cb === 'function') cb(err); }
    });
  },

  fetchDeviceList(cb) {
    const base = this.getApiBase();
    if (!base) return;
    wx.request({
      url: `${base}/api/device/list`,
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.code === 200) {
          if (typeof cb === 'function') cb(null, res.data.data);
        } else {
          if (typeof cb === 'function') cb(new Error('no data'));
        }
      },
      fail: (err) => { if (typeof cb === 'function') cb(err); }
    });
  },

  controlDevice(target, action) {
    const base = this.getApiBase();
    if (!base) return;
    wx.request({
      url: `${base}/api/device/control`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { device_id: 'esp32_001', target, action },
      success: (res) => {
        if (!(res.data && res.data.code === 200)) {
          wx.showToast({ title: '控制命令发送失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '网络错误，控制失败', icon: 'none' })
    });
  },

  // ===== Chat =====
  quick(e) { this.sendChatMessage(e.currentTarget.dataset.t); },

  onInput(e) { this.setData({ chatInp: e.detail.value }); },

  sendChat() {
    const text = this.data.chatInp.trim();
    if (!text) return;
    this.sendChatMessage(text);
    this.setData({ chatInp: '' });
  },

  sendChatMessage(text) {
    const userMsg = { role: 'user', content: text };
    // 只追加新消息，不再全量更新
    const newMsgIndex = this.data.msgs.length; // 用户消息的索引
    this.setData({
      [`msgs[${newMsgIndex}]`]: userMsg,
      chatLoading: true
    });
    this.scrollToBottom();
  
    const base = this.getApiBase();
    if (!base) {
      setTimeout(() => {
        const aiMsg = { role: 'ai', content: this.generateReply(text) };
        const aiIndex = this.data.msgs.length;
        this.setData({
          [`msgs[${aiIndex}]`]: aiMsg,
          chatLoading: false
        });
        this.scrollToBottom();
      }, 400);
      return;
    }
  
    wx.request({
      url: `${base}/api/ai/chat`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { device_id: 'esp32_001', question: text },
      success: (res) => {
        const answer = res.data && res.data.data && res.data.data.answer
          ? res.data.data.answer
          : (res.data && res.data.data ? JSON.stringify(res.data.data) : '抱歉，未收到回复');
        const aiIndex = this.data.msgs.length;
        this.setData({
          [`msgs[${aiIndex}]`]: { role: 'ai', content: answer },
          chatLoading: false
        });
        this.scrollToBottom();
      },
      fail: () => {
        const aiIndex = this.data.msgs.length;
        this.setData({
          [`msgs[${aiIndex}]`]: { role: 'ai', content: '网络错误，稍后重试' },
          chatLoading: false
        });
        this.scrollToBottom();
      }
    });
  },
  

  generateReply(text) {
    const { temperature: t, humidity: h, light: l } = this.data.sensor;
    const lower = text.toLowerCase();
    if (lower.includes('风扇') || lower.includes('降温') || lower.includes('热'))
      return t > 26 ? `当前室温${t}°C，建议开启风扇或空调降温，保持舒适环境。` : `当前室温${t}°C，体感较为舒适，不需要额外降温。`;
    if (lower.includes('睡觉') || lower.includes('睡眠') || lower.includes('休息'))
      return `室温${t}°C，湿度${h}%，${t > 27 || l > 100 ? '建议调暗灯光并降温后再休息。' : '环境适宜，祝您有个好梦。'}`;
    if (lower.includes('光') || lower.includes('亮') || lower.includes('看书') || lower.includes('阅读'))
      return `当前光照强度${l}lux，${l > 300 ? '室内明亮，非常适合阅读。' : '光线较暗，建议补充照明。'}`;
    if (lower.includes('湿'))
      return `当前湿度${h}%，${h > 65 ? '略显潮湿，建议开启除湿。' : h < 40 ? '较为干燥，注意补水。' : '湿度适宜，体感舒适。'}`;
    return `收到您的询问。当前环境：温度${t}°C，湿度${h}%，光照${l}lux。整体环境${t > 27 || h > 70 ? '需要适当调节' : '较为舒适'}。`;
  },

  scrollToBottom() {
    this.setData({ scrollTop: this.data.scrollTop + 999 });
  }
});
