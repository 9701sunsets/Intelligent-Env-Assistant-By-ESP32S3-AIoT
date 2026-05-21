import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const PORT = 3000;
const app = express();
const server = http.createServer(app);

app.use(express.json());

// Memory store for devices and sensors
const devices = [
  { device_id: "esp32_001", name: "客厅主控终端", status: "online", last_seen: new Date().toISOString() },
  { device_id: "esp32_002", name: "卧室温湿节点", status: "online", last_seen: new Date().toISOString() },
  { device_id: "esp32_003", name: "书房办公助理", status: "offline", last_seen: new Date(Date.now() - 3600 * 1000).toISOString() }
];

const deviceStates: { [key: string]: { led: "on" | "off"; buzzer: "on" | "off"; fan: "on" | "off" } } = {
  esp32_001: { led: "off", buzzer: "off", fan: "off" },
  esp32_002: { led: "off", buzzer: "off", fan: "off" },
  esp32_003: { led: "off", buzzer: "off", fan: "off" }
};

// Current dynamic readings
const currentReadings: { [key: string]: { temperature: number; humidity: number; light: number; timestamp: string } } = {
  esp32_001: { temperature: 24.8, humidity: 55.4, light: 380, timestamp: new Date().toISOString() },
  esp32_002: { temperature: 22.3, humidity: 62.1, light: 150, timestamp: new Date().toISOString() },
  esp32_003: { temperature: 21.0, humidity: 50.0, light: 0, timestamp: new Date(Date.now() - 3600 * 1000).toISOString() }
};

// Seed historical readings (past 24 data points, intervals of 10 minutes)
const historicalReadings: { [key: string]: Array<{ temperature: number; humidity: number; light: number; timestamp: string }> } = {
  esp32_001: [],
  esp32_002: [],
  esp32_003: []
};

// Generate historical mock data
const initHistory = () => {
  const now = Date.now();
  const base001 = currentReadings.esp32_001;
  const base002 = currentReadings.esp32_002;

  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 10 * 60 * 1000).toISOString();

    historicalReadings.esp32_001.push({
      temperature: base001.temperature,
      humidity: base001.humidity,
      light: base001.light,
      timestamp: time
    });

    historicalReadings.esp32_002.push({
      temperature: base002.temperature,
      humidity: base002.humidity,
      light: base002.light,
      timestamp: time
    });
  }
  /* 功能已屏蔽：前端本地模拟历史数据生成逻辑，改为后端在接收到设备上传数据时动态记录并存储历史数据
  const now = Date.now();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now - i * 10 * 60 * 1000).toISOString();
    // Bedroom or living room curves
    historicalReadings.esp32_001.push({
      temperature: +(23.0 + Math.sin(i / 4) * 2.5 + Math.random() * 0.4).toFixed(1),
      humidity: +(50.0 + Math.cos(i / 5) * 8.0 + Math.random() * 1.5).toFixed(1),
      light: Math.floor(300 + Math.sin(i / 3) * 150 + Math.random() * 40),
      timestamp: time
    });
    historicalReadings.esp32_002.push({
      temperature: +(21.0 + Math.sin(i / 6) * 1.8 + Math.random() * 0.3).toFixed(1),
      humidity: +(58.0 + Math.cos(i / 4) * 6.0 + Math.random() * 1.2).toFixed(1),
      light: Math.floor(120 + Math.sin(i / 4) * 50 + Math.random() * 20),
      timestamp: time
    });
  }*/
};
initHistory();

/* 已屏蔽：前端本地模拟数据更新逻辑，改为后端动态更新以更真实地反映设备状态变化，并通过WebSocket实时推送给前端，提升整体系统的交互性和响应速度
// Dynamic update loop to make dashboard feel alive
setInterval(() => {
  // Simulate active device changes (esp32_001)
  const dev001 = currentReadings.esp32_001;
  const tempDiff = (Math.random() - 0.5) * 0.3;
  const humDiff = (Math.random() - 0.5) * 0.5;
  const lightDiff = Math.floor((Math.random() - 0.5) * 15);

  dev001.temperature = +(dev001.temperature + tempDiff).toFixed(1);
  dev001.humidity = +(dev001.humidity + humDiff).toFixed(1);
  dev001.light = Math.max(10, Math.min(1000, dev001.light + lightDiff));
  dev001.timestamp = new Date().toISOString();

  // Push to history occasionally or keep history clean
  if (Math.random() > 0.8) {
    historicalReadings.esp32_001.push({ ...dev001 });
    if (historicalReadings.esp32_001.length > 50) {
      historicalReadings.esp32_001.shift();
    }
  }

  // Simulate active device changes (esp32_002)
  const dev002 = currentReadings.esp32_002;
  dev002.temperature = +(dev002.temperature + (Math.random() - 0.5) * 0.2).toFixed(1);
  dev002.humidity = +(dev002.humidity + (Math.random() - 0.5) * 0.4).toFixed(1);
  dev002.light = Math.max(5, Math.min(800, dev002.light + Math.floor((Math.random() - 0.5) * 8)));
  dev002.timestamp = new Date().toISOString();

  if (Math.random() > 0.8) {
    historicalReadings.esp32_002.push({ ...dev002 });
    if (historicalReadings.esp32_002.length > 50) {
      historicalReadings.esp32_002.shift();
    }
  }

  // Broadcast to WebSockets
  broadcastSensorUpdate();
}, 4000);
*/

// Helper for comfort level
const calculateComfort = (temp: number, hum: number): "comfortable" | "uncomfortable" | "alert" => {
  if (temp >= 18 && temp <= 27 && hum >= 40 && hum <= 65) {
    return "comfortable";
  } else if (temp < 15 || temp > 32 || hum < 30 || hum > 80) {
    return "alert";
  }
  return "uncomfortable";
};

// Initialize Gemini Client Lazily/Safely
let aiClient: GoogleGenAI | null = null;
const getGeminiClient = (): GoogleGenAI | null => {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      console.log("Gemini Client successfully initialized on backend.");
    } catch (err) {
      console.error("Failed to initialize Gemini Client:", err);
    }
  }
  return aiClient;
};

// --- API Endpoints ---

// 1. GET /api/device/list
app.get("/api/device/list", (req, res) => {
  res.json({
    code: 200,
    data: devices.map(d => ({
      ...d,
      state: deviceStates[d.device_id] || { led: "off", buzzer: "off", fan: "off" }
    }))
  });
});

// 2. GET /api/latest
app.get("/api/latest", (req, res) => {
  const deviceId = (req.query.device_id as string) || "esp32_001";
  const readings = currentReadings[deviceId];

  if (!readings) {
    return res.status(404).json({ code: 404, message: "Device not found" });
  }

  const comfortValue = calculateComfort(readings.temperature, readings.humidity);

  res.json({
    code: 200,
    data: {
      device_id: deviceId,
      temperature: readings.temperature,
      humidity: readings.humidity,
      light: readings.light,
      comfort: comfortValue,
      timestamp: readings.timestamp
    }
  });
});

// 3. GET /api/history
app.get("/api/history", (req, res) => {
  const deviceId = (req.query.device_id as string) || "esp32_001";
  const data = historicalReadings[deviceId] || [];

  res.json({
    code: 200,
    data: data.map(item => ({
      temperature: item.temperature,
      humidity: item.humidity,
      light: item.light,
      timestamp: item.timestamp
    }))
  });
});

// 4. POST /api/ai/advice
app.post("/api/ai/advice", async (req, res) => {
  const { device_id, temperature, humidity, light } = req.body;
  const finalId = device_id || "esp32_001";
  const t = temperature != null ? Number(temperature) : 25;
  const h = humidity != null ? Number(humidity) : 55;
  const l = light != null ? Number(light) : 300;

  // Let's decide local comfort rules in case Gemini is offline/missing
  let advice = "当前室内温湿度及光照处于理想的适宜状态，氛围舒适，适合办公与休息。";
  let level = "normal";

  if (t > 29) {
    advice = "当前环境温度过高，体感炎热，建议开启空调或风扇降温，注意补充水分。";
    level = "warning";
  } else if (t < 16) {
    advice = "天气阴冷或室温过低，建议注意添衣防寒，可开启电暖气等加热设备。";
    level = "warning";
  } else if (h > 75) {
    advice = "室内空气湿度偏高，体感稍显闷热。可开启空调除湿功能，保持日常通风。";
    level = "warning";
  } else if (h < 35) {
    advice = "室内空气过于干燥，可能导致眼睛与皮肤紧绷。建议使用加湿器改善环境。";
    level = "info";
  } else if (l < 40) {
    advice = "室内光线十分昏暗。若是工作读书时间，请务必开启台灯，保护您的视力。";
    level = "info";
  } else if (l > 800) {
    advice = "室外光照非常强烈。若感觉刺眼，可拉上百叶窗或阻光窗帘，调和室内自然光。";
    level = "info";
  }

  const ai = getGeminiClient();
  if (ai) {
    try {
      const prompt = `As an expert IoT Environmental Analyst, assess the current indoor conditions:
- Temperature: ${t} °C
- Humidity: ${h} %
- Light level: ${l} lux
Give a highly personalized, practical, and premium advice (strict maximum of 40 words, in Chinese language) on how the user can improve their comfort and wellness in this room right now. Be direct and avoid stating unnecessary details. Keep instructions professional.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are the smart AI assistant for an ESP32 environmental sensing node. Keep advice warm, brief, elegant, professional, in clean Chinese.",
          temperature: 0.7,
        }
      });

      if (response.text) {
        advice = response.text.trim();
      }
    } catch (err) {
      console.warn("Gemini advice response error: using fallback rules", err);
    }
  }

  res.json({
    code: 200,
    data: {
      advice,
      level
    }
  });
});

// 5. POST /api/ai/chat
app.post("/api/ai/chat", async (req, res) => {
  const { device_id, question } = req.body;
  const finalId = device_id || "esp32_001";
  const r = currentReadings[finalId] || currentReadings.esp32_001;
  const comfortVal = calculateComfort(r.temperature, r.humidity);

  let answer = `您好！当前的客厅设备环境温度是 ${r.temperature}°C，湿度是 ${r.humidity}%，光照是 ${r.light} lx。舒适度评级为【${comfortVal === "comfortable" ? "清爽舒适" : comfortVal === "alert" ? "需要调整" : "稍欠舒适"}】。`;

  if (question) {
    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `User asks: "${question}"
Device current environment values:
- Room Temp: ${r.temperature} °C
- Room Humidity: ${r.humidity} %
- Light Level: ${r.light} lux
- Comfort appraisal: ${comfortVal}
Answer the question warmly and professionally in Chinese, strictly referencing these current room data if relevant. Keep the answer friendly, engaging, high-end, and under 150 words.`;

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: "You are a thoughtful smart IoT room companion device. Respond elegantly like a high-end appliance speaker or dynamic monitor card.",
            temperature: 0.8
          }
        });

        if (response.text) {
          answer = response.text.trim();
        }
      } catch (err) {
        console.warn("Gemini chat error: returning elegant custom rule reply", err);
        answer = `抱歉，云端大模型连接稍忙。当前房间温湿度：${r.temperature}°C, ${r.humidity}%，处于${comfortVal === "comfortable" ? "理想" : "普通"}温湿度环境。适合正常活动！`;
      }
    } else {
      // Local reply builder
      if (question.includes("睡觉") || question.includes("眠")) {
        answer = `当前温湿度：${r.temperature}°C, ${r.humidity}%。${r.temperature > 26 ? "室温有些偏高偏闷，睡觉可能发热，建议开启空调微风及定时功能。" : "温度和气候非常利于人体睡眠入睡，但光照有 ${r.light} lx，建议关灯后再躺下入睡。"}`;
      } else if (question.includes("开空调") || question.includes("热") || question.includes("冷")) {
        answer = `目前气温为 ${r.temperature}°C，湿度为 ${r.humidity}%。依据健康标准，${r.temperature > 26 ? "推荐开启制冷空调至 26 度除湿模式。" : "当下体感舒适，多开窗做自然风交互即可，无需即刻启动空调。"}`;
      } else if (question.includes("看书") || question.includes("工作") || question.includes("灯") || question.includes("学习")) {
        answer = `当前室内光敏度为 ${r.light} lx。读书与工作在 300 - 500 lx 最为合适。${r.light < 300 ? "光线可能略显昏暗，极力提议您开启桌边台灯补光防止眼睛酸痛。" : "光敏亮度十分充足，有利于沉浸式学习和长时间办公。"}`;
      } else {
        answer = `智慧管家收到！当前环境状况：温度 ${r.temperature}°C, 湿度 ${r.humidity}%, 光照 ${r.light} lx。如果您需要控制这些状态，可以点击设备遥控面板进行调节哦！`;
      }
    }
  }

  res.json({
    code: 200,
    data: {
      answer
    }
  });
});

// 6. POST /api/device/control
app.post("/api/device/control", (req, res) => {
  const { device_id, target, action } = req.body;
  const finalId = device_id || "esp32_001";

  if (!deviceStates[finalId]) {
    return res.status(404).json({ code: 404, message: "Device not found" });
  }

  if (target === "led" || target === "buzzer" || target === "fan") {
    deviceStates[finalId][target] = action === "on" ? "on" : "off";

    // Simulate sensory adjustments on device action triggers
    if (target === "fan") {
      const isOn = action === "on";
      const interval = setInterval(() => {
        const readings = currentReadings[finalId];
        if (isOn) {
          if (readings.temperature > 22) readings.temperature = +(readings.temperature - 0.1).toFixed(1);
          if (readings.humidity > 45) readings.humidity = +(readings.humidity - 0.2).toFixed(1);
        } else {
          // Slowly regress to normal
          if (readings.temperature < 24.8) readings.temperature = +(readings.temperature + 0.05).toFixed(1);
        }
      }, 1000);
      setTimeout(() => clearInterval(interval), 15000);
    }

    // Trigger instant websocket notification to sync controls in real-time
    broadcastSensorUpdate();

    return res.json({
      code: 200,
      message: "success"
    });
  }

  res.status(400).json({ code: 400, message: "Invalid target parameter" });
});


// WS Setup
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  console.log("Client connected via WebSocket to system");
  
  // Send immediate greeting and first reading
  ws.send(JSON.stringify({
    type: "connected",
    message: "Welcome to ESP32 Smart Monitoring WS API",
    device_id: "esp32_001"
  }));

  // Send latest state
  const r = currentReadings.esp32_001;
  ws.send(JSON.stringify({
    type: "sensor_update",
    device_id: "esp32_001",
    temperature: r.temperature,
    humidity: r.humidity,
    light: r.light,
    timestamp: r.timestamp
  }));
});

// Broadcast sensor updates to all connected WS clients
function broadcastSensorUpdate() {
  const msg = JSON.stringify({
    type: "sensor_update",
    device_id: "esp32_001",
    temperature: currentReadings.esp32_001.temperature,
    humidity: currentReadings.esp32_001.humidity,
    light: currentReadings.esp32_001.light,
    timestamp: currentReadings.esp32_001.timestamp,
    states: deviceStates.esp32_001
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Attach WS to our main HTTP upgrading
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});


// Combine with Vite in development, serve build in production
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched and ready at http://localhost:${PORT}`);
    console.log(`WS stream available at ws://localhost:${PORT}/ws`);
  });
}

start();
