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
    this.setData({ history: genTrendData() });
  },

  onReady() {
    setTimeout(() => this.drawAll(), 300);
  },

  // ===== Device Controls =====
  toggleFan() {
    const v = !this.data.fanOn;
    this.setData({ fanOn: v });
    wx.showToast({ title: v ? '风扇已开启' : '风扇已关闭', icon: 'none', duration: 800 });
  },

  toggleLed() {
    const v = !this.data.ledOn;
    this.setData({ ledOn: v });
    wx.showToast({ title: v ? 'LED已开启' : 'LED已关闭', icon: 'none', duration: 800 });
  },

  toggleBuzzer() {
    const v = !this.data.buzzerOn;
    this.setData({ buzzerOn: v });
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

    let dpr = 2;
    try { const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null; dpr = info && info.pixelRatio ? info.pixelRatio : 2; } catch (e) { dpr = 2; }

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

      let dpr = 2;
      try { const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null; dpr = info && info.pixelRatio ? info.pixelRatio : 2; } catch (e) { dpr = 2; }

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
    const msgs = [...this.data.msgs, { role: 'user', content: text }];
    this.setData({ msgs, chatLoading: true });
    this.scrollToBottom();

    setTimeout(() => {
      this.setData({
        msgs: [...msgs, { role: 'ai', content: this.generateReply(text) }],
        chatLoading: false
      });
      this.scrollToBottom();
    }, 600);
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
