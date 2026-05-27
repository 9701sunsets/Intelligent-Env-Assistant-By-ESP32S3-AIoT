import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import type { SensorData, HistoryPoint, AIAdvice, ChatMessage, DeviceStatus, WebSocketUpdate, FanState } from './src/types';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

// ====== In-Memory State ======
const DEVICE_ID = 'esp32_001';
let currentSensor: SensorData = {
  device_id: DEVICE_ID,
  temperature: 26.5,
  humidity: 58.2,
  light: 430,
  comfort: 'comfortable',
  timestamp: new Date().toISOString(),
};

const history: HistoryPoint[] = [];
const fanState: FanState = { on: false, since: 0 };
let ledState = false;
let buzzerState = false;

// Generate initial history (last 24 hours, every 5 minutes)
const now = Date.now();
for (let i = 288; i >= 0; i--) {
  const t = now - i * 5 * 60 * 1000;
  const hour = new Date(t).getHours();
  const tempBase = 24 + Math.sin((hour - 6) * Math.PI / 12) * 4;
  history.push({
    temperature: Math.round((tempBase + (Math.random() - 0.5) * 2) * 10) / 10,
    humidity: Math.round(52 + Math.sin((hour - 12) * Math.PI / 12) * 12 + (Math.random() - 0.5) * 4),
    light: hour >= 6 && hour <= 18
      ? Math.round(150 + Math.sin((hour - 6) * Math.PI / 12) * 300)
      : Math.round(10 + Math.random() * 20),
    timestamp: new Date(t).toISOString(),
  });
}

// ====== Comfort Calculator ======
function calculateComfort(temp: number, hum: number): 'comfortable' | 'warning' | 'danger' {
  if (temp >= 22 && temp <= 28 && hum >= 40 && hum <= 65) return 'comfortable';
  if (temp > 32 || temp < 12 || hum > 80 || hum < 25) return 'danger';
  return 'warning';
}

// ====== 15-Category Health Logic Engine ======
function localAIAdvice(temp: number, hum: number, light: number): AIAdvice {
  const comfort = calculateComfort(temp, hum);
  if (comfort === 'comfortable') {
    if (light >= 300 && light <= 600) {
      return { advice: '当前环境温湿度适宜，光照柔和，是阅读与工作的理想状态。建议保持现状，享受此刻的舒适。', level: 'comfortable' };
    }
    return { advice: '室内温湿度处于最佳区间。如长时间用眼，建议适时远眺窗外，让眼睛得到放松。', level: 'comfortable' };
  }

  // Temperature issues
  if (temp > 30 && hum > 70) {
    return { advice: '室内较闷热潮湿，体感不舒适。建议立即开启空调除湿模式，并适当开窗通风，防止霉菌滋生。', level: 'danger' };
  }
  if (temp > 30) {
    return { advice: '室温偏高，建议开启降温设备。多饮用温水补充水分，避免午后烈日直射导致中暑。', level: 'warning' };
  }
  if (temp < 18) {
    return { advice: '室温偏低，建议适当增加衣物或使用暖气。可以泡一杯热茶，让身体暖和起来。', level: 'warning' };
  }

  // Humidity issues
  if (hum > 75) {
    return { advice: '空气湿度较高，体感粘腻。建议开启除湿功能，衣物收纳注意防潮，可适当使用干燥剂。', level: 'warning' };
  }
  if (hum < 35) {
    return { advice: '空气较为干燥，皮肤与呼吸道可能感到不适。建议开启加湿器，或在室内放置一盆清水。', level: 'warning' };
  }

  // Light issues
  if (light < 100) {
    return { advice: '光照不足，长时间处于暗光环境易致视觉疲劳。建议开启辅助照明，或移至窗边利用自然光。', level: 'warning' };
  }
  if (light > 800) {
    return { advice: '光照强烈，请注意防晒与护眼。如为直射阳光，建议拉上纱帘柔化光线，避免家具褪色。', level: 'warning' };
  }

  return { advice: '环境参数略有波动，建议留意变化趋势，适时调整室内条件以保持舒适。', level: 'comfortable' };
}

// ====== AI Chat Responses ======
function localAIChat(question: string, temp: number, hum: number, light: number): string {
  const q = question.toLowerCase();
  const comfort = calculateComfort(temp, hum);

  if (q.includes('睡') || q.includes('休息')) {
    if (comfort === 'comfortable' && light < 200) {
      return `当前室温 ${temp}°C、湿度 ${hum}%，光线柔和，非常适合入睡。建议保持安静，祝您有个好梦。`;
    }
    if (light > 300) {
      return `现在光线较强（${light} lux），建议拉上窗帘或调暗灯光，营造更适合休息的暗光环境。`;
    }
    return `当前环境${comfort === 'comfortable' ? '总体舒适' : '略有偏差'}，入睡${comfort === 'comfortable' ? '应该' : '前建议适当调节'}。`;
  }

  if (q.includes('书') || q.includes('读') || q.includes('工作')) {
    if (light >= 300 && light <= 600 && comfort === 'comfortable') {
      return `光照 ${light} lux 恰到好处，温湿度也处于理想区间。这是专注阅读或高效工作的黄金时段。`;
    }
    if (light < 300) {
      return `光线偏暗（${light} lux），阅读容易疲劳。建议开启台灯，将桌面照度提升至 500 lux 以上。`;
    }
    return `当前环境${comfort === 'comfortable' ? '适合' : '基本可以'}阅读，${comfort !== 'comfortable' ? '但建议先调节温湿度至舒适区间。' : '保持专注即可。'}`;
  }

  if (q.includes('风扇') || q.includes('降温') || q.includes('冷')) {
    if (temp > 26) {
      return `室温 ${temp}°C 稍高，建议开启风扇或空调降温。已为您准备控制按钮，一键开启即可感受清凉。`;
    }
    return `当前 ${temp}°C 温度适中，如仍感觉热，可开启风扇促进空气流通，增强体感舒适度。`;
  }

  if (q.includes('湿') || q.includes('潮')) {
    if (hum > 65) return `湿度 ${hum}% 偏高，体感粘腻。建议开启除湿模式，将湿度控制在 40%-60% 的舒适区间。`;
    if (hum < 40) return `湿度 ${hum}% 偏低，空气干燥。建议开启加湿器，或放置水培植物增加空气湿度。`;
    return `湿度 ${hum}% 处于适宜范围，无需特别调节。`;
  }

  if (q.includes('光') || q.includes('亮') || q.includes('暗')) {
    if (light < 150) return `当前光照 ${light} lux 偏暗，建议补充照明。长时间在暗光环境下用眼易致疲劳。`;
    if (light > 700) return `光照较强（${light} lux），如需避免眩光，建议调整窗帘角度或使用遮阳设施。`;
    return `光照 ${light} lux 适中，既能满足日常活动需求，又不会造成视觉疲劳。`;
  }

  if (q.includes('怎么样') || q.includes('如何') || q.includes('状态')) {
    return `当前环境：温度 ${temp}°C，湿度 ${hum}%，光照 ${light} lux。${localAIAdvice(temp, hum, light).advice}`;
  }

  // Default response
  return `收到您的问题。当前环境数据：温度 ${temp}°C，湿度 ${hum}%，光照 ${light} lux。作为您的居家环境助手，我随时为您提供健康建议。请问还有什么可以帮助您的？`;
}

// ====== Sensor Simulation Engine ======
function updateSensors() {
  const prev = currentSensor;
  let newTemp = prev.temperature + (Math.random() - 0.5) * 0.4;
  const newHum = Math.max(25, Math.min(85, prev.humidity + Math.floor((Math.random() - 0.5) * 3)));
  let newLight = Math.max(0, Math.min(1000, prev.light + Math.floor((Math.random() - 0.5) * 20)));

  // Fan physics: if fan is on, gradually cool down
  if (fanState.on) {
    const elapsed = (Date.now() - fanState.since) / 1000;
    const coolingEffect = Math.min(elapsed / 30, 1) * 3; // max 3°C cooling over 30s
    newTemp -= 0.05 + (coolingEffect * 0.02);
  } else {
    // Slowly return to ambient when fan off
    newTemp += (26.5 - newTemp) * 0.01;
  }

  newTemp = Math.round(newTemp * 10) / 10;

  // Time-based light variation
  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 18) {
    const expectedLight = 150 + Math.sin((hour - 6) * Math.PI / 12) * 300;
    newLight += (expectedLight - newLight) * 0.1;
  } else {
    newLight = Math.max(10, newLight * 0.95);
  }
  newLight = Math.round(newLight);

  const comfort = calculateComfort(newTemp, newHum);

  currentSensor = {
    device_id: DEVICE_ID,
    temperature: newTemp,
    humidity: newHum,
    light: newLight,
    comfort,
    timestamp: new Date().toISOString(),
  };

  // Add to history
  history.push({
    temperature: newTemp,
    humidity: newHum,
    light: newLight,
    timestamp: currentSensor.timestamp,
  });

  // Keep only last 24 hours (288 points at 5-min intervals)
  while (history.length > 288) history.shift();

  // Broadcast via WebSocket
  const update: WebSocketUpdate = {
    type: 'sensor_update',
    device_id: DEVICE_ID,
    temperature: newTemp,
    humidity: newHum,
    light: newLight,
    comfort,
    fan_on: fanState.on,
    led_on: ledState,
    buzzer_on: buzzerState,
    timestamp: currentSensor.timestamp,
  };

  broadcast(update);
}

function broadcast(data: WebSocketUpdate) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Run simulation every 4 seconds
setInterval(updateSensors, 4000);

// ====== API Routes ======

// CORS
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Get latest sensor data
app.get('/api/latest', (_req, res) => {
  res.json({ code: 200, data: currentSensor });
});

// Get history
app.get('/api/history', (req, res) => {
  const { start, end } = req.query;
  let data = [...history];
  if (start && end) {
    const s = new Date(start as string).getTime();
    const e = new Date(end as string).getTime();
    data = data.filter((d) => {
      const t = new Date(d.timestamp).getTime();
      return t >= s && t <= e;
    });
  }
  res.json({ code: 200, data });
});

// Get AI advice
app.post('/api/ai/advice', (req, res) => {
  const { temperature, humidity, light } = req.body;
  const advice = localAIAdvice(temperature || currentSensor.temperature, humidity || currentSensor.humidity, light || currentSensor.light);
  res.json({ code: 200, data: advice });
});

// AI Chat
const chatHistory: ChatMessage[] = [];
app.post('/api/ai/chat', (req, res) => {
  const { question } = req.body;
  const answer = localAIChat(question, currentSensor.temperature, currentSensor.humidity, currentSensor.light);

  chatHistory.push({ role: 'user', content: question, timestamp: new Date().toISOString() });
  chatHistory.push({ role: 'ai', content: answer, timestamp: new Date().toISOString() });

  // Keep last 50 messages
  while (chatHistory.length > 50) chatHistory.shift();

  res.json({ code: 200, data: { answer } });
});

// Device control
app.post('/api/device/control', (req, res) => {
  const { target, action } = req.body;

  if (target === 'fan') {
    fanState.on = action === 'on';
    fanState.since = action === 'on' ? Date.now() : 0;
  } else if (target === 'led') {
    ledState = action === 'on';
  } else if (target === 'buzzer') {
    buzzerState = action === 'on';
    // Auto-off buzzer after 3 seconds
    if (action === 'on') {
      setTimeout(() => { buzzerState = false; }, 3000);
    }
  }

  res.json({ code: 200, message: 'success' });
});

// Device list
app.get('/api/device/list', (_req, res) => {
  const devices: DeviceStatus[] = [{
    device_id: DEVICE_ID,
    status: 'online',
    last_seen: currentSensor.timestamp,
  }];
  res.json({ code: 200, data: devices });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
}

// ====== WebSocket Handling ======
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send current state immediately
  const update: WebSocketUpdate = {
    type: 'sensor_update',
    device_id: DEVICE_ID,
    temperature: currentSensor.temperature,
    humidity: currentSensor.humidity,
    light: currentSensor.light,
    comfort: currentSensor.comfort,
    fan_on: fanState.on,
    led_on: ledState,
    buzzer_on: buzzerState,
    timestamp: currentSensor.timestamp,
  };
  ws.send(JSON.stringify(update));

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// ====== Start Server ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] ESP32-S3 AIoT Backend running on http://localhost:${PORT}`);
  console.log(`[WS]   WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[API]  Latest:    GET  http://localhost:${PORT}/api/latest`);
  console.log(`[API]  History:   GET  http://localhost:${PORT}/api/history`);
  console.log(`[API]  AI Advice: POST http://localhost:${PORT}/api/ai/advice`);
  console.log(`[API]  AI Chat:   POST http://localhost:${PORT}/api/ai/chat`);
  console.log(`[API]  Control:   POST http://localhost:${PORT}/api/device/control`);
});
