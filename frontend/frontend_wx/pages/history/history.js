// pages/history/history.js

// Generate 24h of hourly mock data for the chart
function genHistoryData() {
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
      timestamp: new Date(t).toISOString(),
    });
  }
  return data;
}

Page({
  data: {
    avgTemp: '25.4',
    avgHum: '59',
    avgLight: '285',
    chartMode: 'th',
    history: [],
    display: [
      { label: '22:30', temperature: '26.5', humidity: '58', light: '320', comfort: '舒适' },
      { label: '21:00', temperature: '26.2', humidity: '60', light: '150', comfort: '舒适' },
      { label: '20:00', temperature: '27.0', humidity: '55', light: '80', comfort: '稍高' },
      { label: '18:00', temperature: '27.5', humidity: '53', light: '450', comfort: '异常' },
      { label: '12:30', temperature: '25.1', humidity: '62', light: '380', comfort: '舒适' },
      { label: '08:00', temperature: '23.8', humidity: '65', light: '120', comfort: '舒适' },
      { label: '04:00', temperature: '23.5', humidity: '68', light: '0', comfort: '舒适' },
      { label: '00:00', temperature: '24.2', humidity: '64', light: '0', comfort: '舒适' }
    ],
    comfortH: 18,
    summary: '整体环境优良，注意午后通风降温'
  },

  onLoad() {
    const history = genHistoryData();
    this.setData({ history });
  },

  onReady() {
    setTimeout(() => this.drawChart(), 300);
  },

  // 切换图表模式
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ chartMode: mode });
    this.drawChart();
  },

  // ===== Canvas Chart Drawing =====
  drawChart() {
    const query = wx.createSelectorQuery();
    query.select('#hChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');

      const width = res[0].width;
      const height = 200; // 400rpx ≈ 200px
      if (width <= 0 || height <= 0) return;

      // Get DPR safely
      let dpr = 2;
      try {
        const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
        dpr = info && info.pixelRatio ? info.pixelRatio : 2;
      } catch (e) { dpr = 2; }

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const data = this.data.history;
      if (data.length < 2) return;

      const pad = { t: 10, r: 10, b: 28, l: 36 };
      const cw = width - pad.l - pad.r;
      const ch = height - pad.t - pad.b;
      const mode = this.data.chartMode;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#F0E6D8';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 3; i++) {
        const y = pad.t + (i / 3) * ch;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(width - pad.r, y);
        ctx.stroke();
      }

      if (mode === 'th') {
        this.drawCurve(ctx, data, 'temperature', '#EA580C', pad, cw, ch, false);
        this.drawCurve(ctx, data, 'humidity', '#5BC0DE', pad, cw, ch, true);
      } else {
        this.drawCurve(ctx, data, 'light', '#F5A623', pad, cw, ch, false);
      }

      // X-axis labels
      ctx.fillStyle = '#9E8E80';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const step = Math.floor(data.length / 6);
      for (let i = 0; i < data.length; i += step || 1) {
        const x = pad.l + (i / (data.length - 1)) * cw;
        const d = new Date(data[i].timestamp);
        ctx.fillText(`${String(d.getHours()).padStart(2, '0')}:00`, x, height - 6);
      }

      // Y-axis labels
      ctx.textAlign = 'right';
      ctx.fillStyle = '#B8A99A';
      if (mode === 'th') {
        const temps = data.map(d => d.temperature);
        const tMin = Math.min(...temps) * 0.95;
        const tMax = Math.max(...temps) * 1.05;
        for (let i = 0; i <= 3; i++) {
          const y = pad.t + (i / 3) * ch;
          const val = (tMax - (tMax - tMin) * (i / 3)).toFixed(0);
          ctx.fillText(`${val}°`, pad.l - 4, y + 3);
        }
      } else {
        const lights = data.map(d => d.light);
        const lMin = Math.min(...lights) * 0.95;
        const lMax = Math.max(...lights) * 1.05;
        for (let i = 0; i <= 3; i++) {
          const y = pad.t + (i / 3) * ch;
          const val = Math.round(lMax - (lMax - lMin) * (i / 3));
          ctx.fillText(val, pad.l - 4, y + 3);
        }
      }
    });
  },

  drawCurve(ctx, data, key, color, pad, cw, ch, dash) {
    const vals = data.map(d => d[key]);
    const min = Math.min(...vals) * 0.95;
    const max = Math.max(...vals) * 1.05;
    const range = max - min || 1;

    // Points
    const pts = vals.map((v, i) => ({
      x: pad.l + (i / (vals.length - 1)) * cw,
      y: pad.t + ch - ((v - min) / range) * ch
    }));

    // Fill area
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      const cx1 = p.x + (c.x - p.x) * 0.4;
      const cx2 = p.x + (c.x - p.x) * 0.6;
      ctx.bezierCurveTo(cx1, p.y, cx2, c.y, c.x, c.y);
    }
    ctx.lineTo(pts[pts.length - 1].x, pad.t + ch);
    ctx.lineTo(pts[0].x, pad.t + ch);
    ctx.closePath();
    ctx.fillStyle = color + '18';
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], c = pts[i];
      const cx1 = p.x + (c.x - p.x) * 0.4;
      const cx2 = p.x + (c.x - p.x) * 0.6;
      ctx.bezierCurveTo(cx1, p.y, cx2, c.y, c.x, c.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash([4, 3]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
});
