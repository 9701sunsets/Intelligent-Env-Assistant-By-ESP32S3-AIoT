import { useState, useEffect, useRef } from "react";
import TrendChart from "./components/TrendChart";
import { SensorData, HistoryItem, DeviceInfo, AIAdviceResponse, ChatMessage } from "./types";
import {
  Thermometer,
  Droplets,
  Sun,
  Activity,
  Wifi,
  WifiOff,
  Power,
  Send,
  Cpu,
  RefreshCw,
  Sliders,
  MessageSquare,
  Volume2,
  Info,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  SlidersHorizontal,
  Lightbulb,
  Fan,
  VolumeX,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function App() {
  // IoT & Sensor States
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("esp32_001");
  const [devicesList, setDevicesList] = useState<DeviceInfo[]>([]);
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  
  // AI Advice & Chat States
  const [aiAdvice, setAiAdvice] = useState<AIAdviceResponse | null>(null);
  const [adviceLoading, setAdviceLoading] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "ai",
      text: "您好！我是您的 AIoT 智能空间管家。我已接入当前 ESP32-S3 微感知单元，能根据实时采集的温湿度与环境光照度，为您提供场景推荐、健康建议并执行元器件控制。请问有什么需要协助的？",
      timestamp: new Date().toISOString()
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Connection & System states
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "offline">("connecting");
  const [pollerTick, setPollerTick] = useState<number>(0);
  const [activeConsoleLog, setActiveConsoleLog] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] ESP32-S3 Core system pre-initialization starting...`,
    `[${new Date().toLocaleTimeString()}] WiFi interface loaded. Awaiting handshake...`
  ]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll chat window
  useEffect(() => {
    // if (!chatEndRef.current) return;
    // if (chatMessages.length === 0) return;

    // const last = chatMessages[chatMessages.length - 1];
    // // 只有当最后一条消息是 AI 的，或正在等待 AI 返回（chatLoading），才自动滚动
    // if (last.sender === "ai" || chatLoading) {
    //   chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    // }
  }, [chatMessages, chatLoading]);

  // Append customized messages to our terminal simulation log on the board card
  const addConsoleLog = (text: string) => {
    setActiveConsoleLog(prev => {
      const logs = [...prev, `[${new Date().toLocaleTimeString()}] ${text}`];
      if (logs.length > 8) logs.shift();
      return logs;
    });
  };

  // 1. Fetch Master Devices list on mount
  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/device/list`);
      const json = await res.json();
      if (json.code === 200) {
        setDevicesList(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch devices list:", err);
    }
  };

  // 2. Fetch Latest Sensor Data
  const fetchLatestSensorData = async (deviceId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/latest?device_id=${deviceId}`);
      const json = await res.json();
      if (json.code === 200) {
        setLatestData(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch latest readings:", err);
    }
  };

  // 3. Fetch History Data points for curves
  const fetchHistory = async (deviceId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/history?device_id=${deviceId}`);
      const json = await res.json();
      if (json.code === 200) {
        setHistoryData(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch history curves:", err);
    }
  };

  // 4. Generate AI Health advice using API
  const generateNewAIAdvice = async () => {
    if (!latestData) return;
    setAdviceLoading(true);
    addConsoleLog("Requesting premium Deepseek analysis on current parameters...");
    try {
      const res = await fetch(`${API_BASE}/api/ai/advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: selectedDeviceId,
          temperature: latestData.temperature,
          humidity: latestData.humidity,
          light: latestData.light
        })
      });
      const json = await res.json();
      if (json.code === 200) {
        setAiAdvice(json.data);
        addConsoleLog("Deepseek smart environmental advice parsed successfully!");
      }
    } catch (err) {
      console.error("Failed to fetch advice:", err);
      addConsoleLog("Connect failure for Deepseek cloud advice: using fallback analyzer rules");
    } finally {
      setAdviceLoading(false);
    }
  };

  // Initialize data on mount or when device swapping occurs
  useEffect(() => {
    fetchDevices();
    fetchLatestSensorData(selectedDeviceId);
    fetchHistory(selectedDeviceId);
  }, [selectedDeviceId]);

  // 周期性轮询兜底，双重保障实时可视化图表与数据实时同步
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLatestSensorData(selectedDeviceId);
      // Fetch history less frequently
      if (pollerTick % 3 === 0) {
        fetchHistory(selectedDeviceId);
        fetchDevices();
      }
      setPollerTick(prev => prev + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedDeviceId, pollerTick]);

  // Load first AI advice on initial data receipt
  useEffect(() => {
    if (latestData && !aiAdvice) {
      generateNewAIAdvice();
    }
  }, [latestData]);

  // Create real-time WebSocket connection to the Express server
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    setWsStatus("connecting");
    addConsoleLog(`Establishing live WS socket stream to: /ws`);

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus("connected");
        addConsoleLog(`WS Handshake approved. Listening in low-latency streams.`);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "sensor_update" && payload.device_id === selectedDeviceId) {
            setLatestData({
              device_id: payload.device_id,
              temperature: payload.temperature,
              humidity: payload.humidity,
              light: payload.light,
              comfort: calculateLocalComfort(payload.temperature, payload.humidity),
              timestamp: payload.timestamp
            });

            // Refresh device states in real-time
            fetchDevices();
          }
        } catch {
          // Silent JSON catch
        }
      };

      socket.onerror = () => {
        setWsStatus("offline");
      };

      socket.onclose = () => {
        setWsStatus("offline");
        addConsoleLog("WebSocket channel closed. Switching automatically to high-frequency polling thread.");
      };
    } catch {
      setWsStatus("offline");
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [selectedDeviceId]);

  // Calculate local comfort rating
  const calculateLocalComfort = (temp: number, hum: number): "comfortable" | "uncomfortable" | "alert" => {
    if (temp >= 18 && temp <= 27 && hum >= 40 && hum <= 65) {
      return "comfortable";
    } else if (temp < 15 || temp > 32 || hum < 30 || hum > 80) {
      return "alert";
    }
    return "uncomfortable";
  };

  // Hardware toggle relays handler
  const toggleHardwareRelay = async (target: "led" | "buzzer" | "fan", currentAction: "on" | "off") => {
    const targetAction = currentAction === "on" ? "off" : "on";
    addConsoleLog(`Writing GP18 output: setting terminal relay [${target}] to [${targetAction.toUpperCase()}]`);

    try {
      const res = await fetch(`${API_BASE}/api/device/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: selectedDeviceId,
          target,
          action: targetAction
        })
      });

      const json = await res.json();
      if (json.code === 200) {
        addConsoleLog(`Acknowledge: [${target}] status synchronized in ESP32 cluster.`);
        // Refresh local models
        fetchDevices();
        fetchLatestSensorData(selectedDeviceId);
      }
    } catch {
      addConsoleLog(`I/O exception: failed to transmit relay control packet to Node`);
    }
  };

  // AI Chat query execution handler
  const triggerAIChat = async (presetQuestion?: string) => {
    const questionText = presetQuestion || chatInput;
    if (!questionText.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: "usr_" + Date.now(),
      sender: "user",
      text: questionText,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: selectedDeviceId,
          question: questionText
        })
      });

      const json = await res.json();
      if (json.code === 200) {
        const aiMessage: ChatMessage = {
          id: "ai_" + Date.now(),
          sender: "ai",
          text: json.data.answer,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, aiMessage]);
      }
    } catch {
      const errMessage: ChatMessage = {
        id: "err_" + Date.now(),
        sender: "ai",
        text: "抱歉，无法连线至 AIoT 云端网关。请检查网络后重试。",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // Get current active device details
  const activeDeviceDetails = devicesList.find(d => d.device_id === selectedDeviceId);
  const activeState = activeDeviceDetails?.state || { led: "off", buzzer: "off", fan: "off" };

  // Generate description strings based on ambient environment lux levels
  const getLightLevelText = (lux: number) => {
    if (lux < 20) return "暗室 (无光照)";
    if (lux < 100) return "昏暗 (建议补光)";
    if (lux < 350) return "温和 (温馨柔和)";
    if (lux < 650) return "理想 (适宜办公学习)";
    return "强光 (户外强光或直射)";
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#322013] font-sans pb-12 flex flex-col antialiased selection:bg-amber-100 selection:text-amber-900">
      
      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#FCFAF7]/95 backdrop-blur-md border-b border-[#EFE9DF] py-4 px-6 md:px-12 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#F6EEDF] border border-[#EADBC8] rounded-2xl shadow-inner text-amber-700">
              <Cpu className="w-5.5 h-5.5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-sans tracking-tight text-[#2B1B10] flex items-center gap-2">
                AIoT 智能微环境监测系统
                <span className="text-[10px] tracking-widest font-mono uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                  ESP32-S3 CORE
                </span>
              </h1>
              <p className="text-xs text-stone-400 mt-0.5">
                基于边缘 AI 舒适度拟合算法与大语言模型云端协同分析的室内空气保障闭环终端
              </p>
            </div>
          </div>

          {/* Quick status cluster */}
          <div className="flex items-center flex-wrap gap-2.5">
            <div className="flex items-center gap-1.5 bg-white border border-[#EFE9DF] px-3 py-1.5 rounded-xl text-xs font-mono font-medium shadow-[0_2px_8px_rgba(235,225,210,0.05)]">
              <Activity className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-stone-500">同步机制:</span>
              {wsStatus === "connected" ? (
                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                  实时 WS 双工
                </span>
              ) : wsStatus === "connecting" ? (
                <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded animate-pulse">
                  握手中...
                </span>
              ) : (
                <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                  轮询守护进程
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-[#EFE9DF] px-3 py-1.5 rounded-xl text-xs font-mono font-medium shadow-[0_2px_8px_rgba(235,225,210,0.05)]">
              {latestData ? (
                <span className="text-amber-800 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                  LIVE: 1S
                </span>
              ) : (
                <span className="text-stone-400">OFFLINE</span>
              )}
            </div>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-4 md:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Left column - 8 cols width in desktop: devices selector, metrics dashboard, curves and control board */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* 2. Device switching list (Warm lifestyle selector buttons) */}
          <div className="bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-[#ECE0D1] bg-gradient-to-tr from-[#FCFAF7] to-[#FAF5EC] rounded-2xl shadow-[0_4px_16px_rgba(224,210,190,0.12)]">
            <div className="flex items-center gap-2">
              <Sliders className="w-4.5 h-4.5 text-amber-800" />
              <div className="text-sm font-semibold text-[#322013]">节点切换控制</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {devicesList.map((dev) => {
                const isActive = dev.device_id === selectedDeviceId;
                return (
                  <button
                    key={dev.device_id}
                    onClick={() => setSelectedDeviceId(dev.device_id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all duration-300 shadow-sm flex items-center gap-2 ${
                      isActive
                        ? "bg-[#8B5E34] text-white border border-[#8B5E34] scale-102"
                        : "bg-white text-[#5C4535] border border-[#E9DFD3] hover:bg-[#F3EFE9]"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dev.status === "online" ? "bg-emerald-500" : "bg-stone-300"}`}></span>
                    {dev.name}
                    <span className="opacity-60 font-mono font-medium text-[9px] uppercase">{dev.device_id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Dynamic Gauges Matrix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Card Temperature */}
            <div className="bg-white border border-[#EFE9DF] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-[0_8px_32px_rgba(215,200,185,0.12)] shadow-[0_4px_20px_rgba(215,200,185,0.06)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-semibold tracking-wide">环境空气温度</span>
                <span className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                  <Thermometer className="w-4 h-4" />
                </span>
              </div>
              
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl md:text-5xl font-mono font-bold text-stone-800 tracking-tight">
                  {latestData ? latestData.temperature : "25.0"}
                </span>
                <span className="text-xl text-stone-400 font-medium">°C</span>
              </div>

              {/* Progress visualizer */}
              <div className="mt-4">
                <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.max(10, Math.min(100, ((latestData?.temperature || 25) / 45) * 100))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono font-medium mt-1.5">
                  <span>0°C (极度寒冷)</span>
                  <span>45°C (酷热高温)</span>
                </div>
              </div>
            </div>

            {/* Card Humidity */}
            <div className="bg-white border border-[#EFE9DF] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-[0_8px_32px_rgba(215,200,185,0.12)] shadow-[0_4px_20px_rgba(215,200,185,0.06)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-semibold tracking-wide">环境相对空气湿度</span>
                <span className="p-2 bg-[#EEF8FC] text-sky-600 rounded-xl">
                  <Droplets className="w-4 h-4" />
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl md:text-5xl font-mono font-bold text-stone-800 tracking-tight">
                  {latestData ? latestData.humidity : "55.0"}
                </span>
                <span className="text-xl text-stone-400 font-medium">%</span>
              </div>

              {/* Progress visualizer */}
              <div className="mt-4">
                <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.max(10, Math.min(100, (latestData?.humidity || 55)))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono font-medium mt-1.5">
                  <span>干旱 (10%)</span>
                  <span>潮湿 (100%)</span>
                </div>
              </div>
            </div>

            {/* Card Ambient light */}
            <div className="bg-white border border-[#EFE9DF] rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:shadow-[0_8px_32px_rgba(215,200,185,0.12)] shadow-[0_4px_20px_rgba(215,200,185,0.06)] sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-semibold tracking-wide">环境数字光照度</span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Sun className="w-4 h-4" />
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-5xl font-mono font-bold text-stone-800 tracking-tight">
                    {latestData ? latestData.light : "380"}
                  </span>
                  <span className="text-xl text-stone-400 font-medium">lx</span>
                </div>
                <span className="text-stone-400 text-xs font-semibold leading-none mt-1">
                  {getLightLevelText(latestData?.light || 380)}
                </span>
              </div>

              {/* Progress visualizer */}
              <div className="mt-4.5">
                <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.max(5, Math.min(100, ((latestData?.light || 380) / 1000) * 100))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono font-medium mt-1.5">
                  <span>暗室</span>
                  <span>1000 lx</span>
                </div>
              </div>
            </div>

          </div>

          {/* Comfort evaluation alert board */}
          <div className="bg-white border border-[#EFE9DF] rounded-3xl p-6 shadow-[0_4px_20px_rgba(215,200,185,0.06)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-amber-50 rounded-2xl text-amber-800">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-stone-400 font-semibold uppercase tracking-wider">本地算法拟合评估</div>
                <div className="text-lg font-bold text-[#322013] mt-0.5">综合环境温湿度适宜评度</div>
                <p className="text-stone-400 text-xs mt-0.5">ESP32 内核依靠感知矩阵推断综合温室效应指数</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-stone-400 font-medium">当前评估</div>
                <div className="text-base font-bold text-stone-800 mt-0.5">
                  {latestData?.comfort === "comfortable" && "清爽舒适・利于工作休息"}
                  {latestData?.comfort === "uncomfortable" && "稍欠舒适・建议手动调节"}
                  {latestData?.comfort === "alert" && "健康警告・需尽快改善空气"}
                  {!latestData && "读取中..."}
                </div>
              </div>

              <div className="flex-shrink-0">
                {latestData?.comfort === "comfortable" ? (
                  <span className="inline-flex px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold font-mono shadow-sm">
                    HEALTHY
                  </span>
                ) : latestData?.comfort === "uncomfortable" ? (
                  <span className="inline-flex px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-bold font-mono shadow-sm">
                    ADJUSTABLE
                  </span>
                ) : (
                  <span className="inline-flex px-4 py-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-full text-xs font-bold font-mono shadow-sm">
                    CRITICAL
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Elegant Interactive Virtual Board Card */}
          <div className="bg-white border border-[#EFE9DF] rounded-3xl p-6 shadow-[0_4px_24px_rgba(215,200,185,0.06)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-[#322013] font-sans font-medium text-lg tracking-tight flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-600 rounded-full inline-block"></span>
                  ESP32-S3 核心仿真及遥控面板
                </h3>
                <p className="text-stone-400 text-xs mt-0.5">硬件芯片搭载温湿度传感器与发光元器件执行器</p>
              </div>

              {/* Status node */}
              <div className="flex items-center gap-2.5 bg-stone-50 border border-stone-100 hover:border-[#E8DFD3] transition-colors rounded-2xl p-2.5">
                <div className="text-left">
                  <div className="text-[10px] text-stone-400 leading-none">目标端状态码</div>
                  <div className="text-xs font-mono font-bold text-stone-700 mt-1 uppercase">esp32_001 (ACTIVE)</div>
                </div>
              </div>
            </div>

            {/* Simulated Motherboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              {/* Virtual physical ESP32 layout - 5 cols in MD */}
              <div className="md:col-span-5 bg-[#1F2721] rounded-2xl p-5 border border-amber-500/20 shadow-2xl relative select-none overflow-hidden flex flex-col items-center">
                {/* Board grid tracer pattern in base */}
                <div className="absolute inset-0 bg-radial-gradient opacity-10 pointer-events-none"></div>

                {/* Micro Antenna */}
                <div className="w-10 h-7 bg-stone-600 border border-stone-500 rounded flex items-center justify-center font-mono text-[9px] text-stone-300 font-semibold tracking-wider">
                  ANT
                </div>

                {/* S3 Chip */}
                <div className="w-24 h-24 bg-[#2D332F] rounded-xl border border-amber-500/30 flex flex-col items-center justify-center gap-2.5 shadow-lg mt-4 shadow-black/40">
                  <Cpu className="w-8 h-8 text-amber-500/80" />
                  <div className="text-center">
                    <div className="font-mono text-[9px] font-bold text-amber-500 leading-none tracking-widest">ESP32-S3</div>
                    <div className="font-mono text-[8px] text-stone-400 leading-none tracking-tight mt-1">Dual Core AI SoC</div>
                  </div>
                </div>

                {/* Interactive modules layout */}
                <div className="flex items-center justify-center gap-6 mt-6 w-full px-2">
                  
                  {/* Digital LED module */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="text-[8px] font-mono text-stone-400 uppercase">GPIO12 L-LED</div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      activeState.led === "on"
                        ? "bg-emerald-500/20 border-2 border-emerald-500 ring-4 ring-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        : "bg-stone-800 border-2 border-stone-700 text-stone-600"
                    }`}>
                      <Lightbulb className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Fan relay module */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="text-[8px] font-mono text-stone-400 uppercase">GPIO18 Fan</div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      activeState.fan === "on"
                        ? "bg-orange-500/20 border-2 border-orange-500 ring-4 ring-orange-500/10 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.5)]"
                        : "bg-stone-800 border-2 border-stone-700 text-stone-600"
                    }`}>
                      <Fan className={`w-4 h-4 ${activeState.fan === "on" ? "animate-spin-slow" : ""}`} />
                    </div>
                  </div>

                  {/* Buzzer Module */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="text-[8px] font-mono text-stone-400 uppercase">GPIO15 Alert</div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      activeState.buzzer === "on"
                        ? "bg-rose-500/20 border-2 border-rose-500 ring-4 ring-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.5)]"
                        : "bg-stone-800 border-2 border-stone-700 text-stone-600"
                    }`}>
                      <Volume2 className={`w-4 h-4 ${activeState.buzzer === "on" ? "animate-bounce" : ""}`} />
                    </div>
                  </div>

                </div>

                {/* Wire lines decals */}
                <div className="w-full text-center mt-5">
                  <span className="text-[8px] font-mono text-amber-500/40 uppercase tracking-widest leading-none">
                    Printed PCB Golden Traces
                  </span>
                </div>

              </div>

              {/* Hardware logs & Toggles - 7 cols in MD */}
              <div className="md:col-span-7 flex flex-col gap-5">
                
                {/* Terminal simulation log */}
                <div className="bg-[#1C1814] border border-stone-800 rounded-2xl p-4 shadow-inner">
                  <div className="font-mono text-[10px] text-stone-400 pb-2 border-b border-stone-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#B26B1E]">
                      <span className="w-1.5 h-1.5 bg-[#B26B1E] rounded-full animate-ping"></span>
                      ESP32_001 TERMINAL LOGS
                    </span>
                    <span className="text-[9px] uppercase">GP12 / GP15 / GP18</span>
                  </div>

                  {/* Print log details */}
                  <div className="mt-3 flex flex-col gap-1.5 h-28 overflow-y-auto pr-1">
                    {activeConsoleLog.map((log, idx) => (
                      <div key={idx} className="font-mono text-[9px] leading-tight text-white/70">
                        {log}
                      </div>
                    ))}
                    <div className="font-mono text-[9px] text-[#B26B1E] animate-pulse">
                      &gt; listening for remote dynamic requests...
                    </div>
                  </div>
                </div>

                {/* Toggles controllers grid */}
                <div className="grid grid-cols-3 gap-3">
                  
                  {/* LED Button */}
                  <button
                    onClick={() => toggleHardwareRelay("led", activeState.led)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all duration-300 ${
                      activeState.led === "on"
                        ? "bg-emerald-50 border-emerald-300/60 text-emerald-800"
                        : "bg-stone-50 border-[#E9DFD3] text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    <Lightbulb className="w-5 h-5 mb-1.5" />
                    <span className="text-[11px] font-bold leading-none">板载 L-LED</span>
                    <span className="text-[9px] font-mono mt-1 opacity-75">{activeState.led === "on" ? "开启" : "关闭"}</span>
                  </button>

                  {/* Fan Button */}
                  <button
                    onClick={() => toggleHardwareRelay("fan", activeState.fan)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all duration-300 ${
                      activeState.fan === "on"
                        ? "bg-orange-50 border-orange-300/60 text-orange-800 animate-pulse"
                        : "bg-stone-50 border-[#E9DFD3] text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    <Fan className="w-5 h-5 mb-1.5" />
                    <span className="text-[11px] font-bold leading-none">降温小风扇</span>
                    <span className="text-[9px] font-mono mt-1 opacity-75">{activeState.fan === "on" ? "转动中" : "静止"}</span>
                  </button>

                  {/* Buzzer Button */}
                  <button
                    onClick={() => toggleHardwareRelay("buzzer", activeState.buzzer)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border text-center transition-all duration-300 ${
                      activeState.buzzer === "on"
                        ? "bg-rose-50 border-rose-300/60 text-rose-800"
                        : "bg-stone-50 border-[#E9DFD3] text-stone-500 hover:bg-stone-100"
                    }`}
                  >
                    <Volume2 className="w-5 h-5 mb-1.5" />
                    <span className="text-[11px] font-bold leading-none">声光扬声器</span>
                    <span className="text-[9px] font-mono mt-1 opacity-75">{activeState.buzzer === "on" ? "警报中" : "静音"}</span>
                  </button>

                </div>

              </div>
            </div>

          </div>

          {/* 5. Custom Interactive Dynamic Chart Component */}
          <div className="w-full">
            <TrendChart history={historyData} />
          </div>

        </div>

        {/* Right Column - 4 cols width: Deepseek Advisor module, and AI bot message canvas */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* 6. Deepseek Core Advisor Box */}
          <div className="bg-gradient-to-br from-[#FCFAF7] to-[#FAF3E8] border border-[#E8DFC8] rounded-3xl p-6 shadow-[0_4px_24px_rgba(215,200,185,0.06)] relative overflow-hidden">
            
            {/* Background ambient lighting */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 blur-3xl rounded-full"></div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-[#F6ECCB] text-amber-800 rounded-xl">
                  <TrendingUp className="w-4 h-4 animate-bounce" />
                </span>
                <div>
                  <h3 className="text-[#322013] font-bold text-sm tracking-tight leading-none">云端大模型综合调控</h3>
                  <span className="text-[9px] text-[#A67C52] font-mono tracking-widest block uppercase mt-0.5">Deepseek Diagnostic</span>
                </div>
              </div>

              <button
                onClick={generateNewAIAdvice}
                disabled={adviceLoading || !latestData}
                className="p-1.5 bg-white hover:bg-stone-50 border border-[#E9DFD3] hover:border-amber-400 rounded-lg text-amber-800 transition-all active:scale-95 disabled:opacity-40"
                title="询问 AI 重新分析当前数据"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adviceLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* AI Response Card Output */}
            <div className="bg-white/80 border border-[#FFFBF7] rounded-2xl p-4 shadow-sm">
              {adviceLoading ? (
                <div className="py-8 flex flex-col items-center justify-center">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 border-2 border-amber-200 border-t-[#B26B1E] rounded-full animate-spin"></div>
                  </div>
                  <span className="text-xs text-stone-500 font-mono mt-3">Deepseek-v4 实时空气分析中...</span>
                </div>
              ) : aiAdvice ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-stone-400 font-mono font-medium">诊断评级</span>
                    
                    {aiAdvice.level === "normal" ? (
                      <span className="inline-flex px-2 py-0.5 bg-emerald-50 border border-emerald-200/50 text-emerald-800 rounded-md text-[9px] font-bold flex items-center gap-1">
                        <Info className="w-2.5 h-2.5" /> 正常平稳
                      </span>
                    ) : aiAdvice.level === "warning" ? (
                      <span className="inline-flex px-2 py-0.5 bg-amber-50 border border-amber-200/50 text-amber-800 rounded-md text-[9px] font-bold flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5 animate-pulse" /> 舒适警告
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 bg-sky-50 border border-sky-200/50 text-sky-800 rounded-md text-[9px] font-bold flex items-center gap-1">
                        <Info className="w-2.5 h-2.5" /> 提示小建议
                      </span>
                    )}
                  </div>

                  <p className="text-[#4C3B2F] text-xs font-sans font-medium leading-relaxed tracking-wide text-justify">
                    {aiAdvice.advice}
                  </p>

                  <div className="text-[9px] text-stone-400 text-right font-mono mt-0.5 border-t border-stone-100/60 pt-2 leading-none">
                    分析耗时: ~0.4s • ESP32 微参数输入并拟合
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <span className="text-stone-400 text-xs">暂无智能建议，请点击刷新重新获取</span>
                </div>
              )}
            </div>
            
          </div>

          {/* 7. Advanced Smart Room Companion Chatbot */}
          <div className="bg-white border border-[#EFE9DF] rounded-3xl p-5 shadow-[0_4px_24px_rgba(215,200,185,0.06)] flex flex-col h-[480px]">
            
            {/* Companion Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#F7F2EB] mb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-50 rounded-xl text-amber-800">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#322013]">AI 语音/文本交互助手</h3>
                  <p className="text-[10px] text-stone-400Leading-none mt-0.5">对接 Deepseek-v4 智能多模大模型</p>
                </div>
              </div>

              <span className="font-mono text-[9px] px-2 py-0.5 bg-stone-100 rounded text-stone-500 font-semibold uppercase">
                Offline Supported
              </span>
            </div>

            {/* Quick preset questions selector to make user interactions easy */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => triggerAIChat("当前适合睡觉吗？")}
                className="text-[10px] bg-stone-50 border border-[#ECE0D1] hover:border-amber-500 transition-colors px-2.5 py-1.5 rounded-lg text-stone-600 font-medium active:scale-95"
              >
                适合睡觉吗？
              </button>
              <button
                onClick={() => triggerAIChat("现在房间光照看书合适吗？")}
                className="text-[10px] bg-stone-50 border border-[#ECE0D1] hover:border-amber-500 transition-colors px-2.5 py-1.5 rounded-lg text-stone-600 font-medium active:scale-95"
              >
                光强适合看书吗？
              </button>
              <button
                onClick={() => triggerAIChat("推荐一首合适当前环境氛围的白噪音旋律吗？")}
                className="text-[10px] bg-stone-50 border border-[#ECE0D1] hover:border-amber-500 transition-colors px-2.5 py-1.5 rounded-lg text-stone-600 font-medium active:scale-95"
              >
                推荐白噪音环境
              </button>
            </div>

            {/* Scrollable messages dialogue canvas */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 scroll-smooth max-h-[290px]">
              {chatMessages.map(msg => {
                const isAI = msg.sender === "ai";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[85%] ${isAI ? "self-start items-start" : "self-end items-end"}`}
                  >
                    {/* Message Bubble */}
                    <div className={`p-3 rounded-2xl text-xs font-sans leading-relaxed tracking-wide shadow-sm text-justify ${
                      isAI
                        ? "bg-[#FAF7F2] text-[#4C3626] border border-[#FAF1E6] rounded-tl-none"
                        : "bg-[#8B5E34] text-white rounded-tr-none"
                    }`}>
                      {msg.text}
                    </div>
                    {/* Bubble Timestamp */}
                    <span className="text-[9px] text-stone-400 font-mono mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString("zh-CN", { hour12: false, hour: "numeric", minute: "numeric" })}
                    </span>
                  </div>
                );
              })}

              {/* Loader Typing bubble animation when active */}
              {chatLoading && (
                <div className="self-start flex flex-col items-start gap-1">
                  <div className="bg-[#FAF7F2] text-[#4C3626] border border-[#FAF1E6] p-3 rounded-2xl rounded-tl-none flex items-center gap-1 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-[#B26B1E] rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-[#B26B1E] rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 bg-[#B26B1E] rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Lower chat text Input frame */}
            <form
              onSubmit={(e) => { e.preventDefault(); triggerAIChat(); }}
              className="mt-3 pt-3 border-t border-[#F7F2EB] flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="发送提问或控制指令..."
                maxLength={400}
                className="flex-1 bg-stone-50 border border-[#EFE9DF] focus:border-amber-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs outline-none transition-all duration-300"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="p-2.5 bg-[#8B5E34] hover:bg-[#724C28] disabled:opacity-40 rounded-xl text-white transition-all duration-300 active:scale-95 flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>

        </div>

      </main>
      
      {/* Decorative premium footer */}
      <footer className="mt-12 text-center text-[10px] text-stone-400 font-mono max-w-7xl mx-auto w-full px-8 pb-4">
        <div className="border-t border-[#EFE8DE] pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            © 2026 AIoT Intelligent Space Project Frontend • ESP32-S3 AI Accelerated Edge
          </span>
          <span className="bg-amber-50 uppercase text-[#8B5E34] px-2.5 py-1 rounded-full font-bold">
            Secure Full-Stack Node Cluster
          </span>
        </div>
      </footer>

    </div>
  );
}
