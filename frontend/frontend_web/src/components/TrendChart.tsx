import React, { useState } from "react";
import { HistoryItem } from "../types";
import { Thermometer, Droplets, Sun, Calendar, Clock } from "lucide-react";

interface TrendChartProps {
  history: HistoryItem[];
}

export default function TrendChart({ history }: TrendChartProps) {
  const [activeMetric, setActiveMetric] = useState<"temp_hum" | "light">("temp_hum");
  const [hoveredPoint, setHoverPoint] = useState<{ item: HistoryItem; x: number; y1: number; y2: number; index: number } | null>(null);

  if (!history || history.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-stone-50/50 border border-stone-100 rounded-2xl">
        <Clock className="w-8 h-8 text-amber-500/40 animate-pulse mb-2" />
        <span className="text-stone-400 text-sm">暂无历史曲线数据</span>
      </div>
    );
  }

  // Margins & Dimensions for our SVG coordinate mapper
  const paddingX = 40;
  const paddingY = 30;
  const svgWidth = 720;
  const svgHeight = 220;

  // Max-Min thresholds for coordinates mapping
  const temperatures = history.map(h => h.temperature);
  const humidities = history.map(h => h.humidity);
  const lights = history.map(h => h.light);

  const maxTemp = Math.max(...temperatures, 35);
  const minTemp = Math.min(...temperatures, 10);
  const maxHum = Math.max(...humidities, 85);
  const minHum = Math.min(...humidities, 20);
  const maxLight = Math.max(...lights, 1000);
  const minLight = Math.min(...lights, 0);

  // Map arbitrary values to SVG canvas pixels
  const getX = (index: number) => {
    if (history.length <= 1) return paddingX;
    return paddingX + (index / (history.length - 1)) * (svgWidth - paddingX * 2);
  };

  const getYValue = (val: number, min: number, max: number) => {
    const range = max - min || 1;
    return svgHeight - paddingY - ((val - min) / range) * (svgHeight - paddingY * 2);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const innerWidth = svgWidth - paddingX * 2;
    const step = innerWidth / (history.length - 1);
    
    let index = Math.round((clientX - paddingX) / step);
    index = Math.max(0, Math.min(history.length - 1, index));

    const item = history[index];
    if (item) {
      const x = getX(index);
      let y1 = 0;
      let y2 = 0;
      if (activeMetric === "temp_hum") {
        y1 = getYValue(item.temperature, minTemp, maxTemp);
        y2 = getYValue(item.humidity, minHum, maxHum);
      } else {
        y1 = getYValue(item.light, minLight, maxLight);
      }
      setHoverPoint({ item, x, y1, y2, index });
    }
  };

  const handleMouseLeave = () => {
    setHoverPoint(null);
  };

  // Build grid lines
  const gridRows = 4;
  const gridLinesY = Array.from({ length: gridRows + 1 }).map((_, i) => {
    return paddingY + (i / gridRows) * (svgHeight - paddingY * 2);
  });

  // Polyline generator assistant
  const getPolylinePoints = (metric: "temp" | "hum" | "light") => {
    return history.map((h, i) => {
      const x = getX(i);
      let y = 0;
      if (metric === "temp") y = getYValue(h.temperature, minTemp, maxTemp);
      if (metric === "hum") y = getYValue(h.humidity, minHum, maxHum);
      if (metric === "light") y = getYValue(h.light, minLight, maxLight);
      return `${x},${y}`;
    }).join(" ");
  };

  // Convert time to HH:MM format
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString("zh-CN", { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return "00:00";
    }
  };

  return (
    <div className="bg-white border border-[#EFE9DF] rounded-2xl p-6 shadow-[0_4px_24px_rgba(215,200,185,0.08)]">
      {/* Header Selector bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-[#322013] font-sans font-medium text-lg tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-4 bg-amber-600 rounded-full inline-block"></span>
            环境历史趋势
          </h3>
          <p className="text-stone-400 text-xs mt-0.5">ESP32-S3 实务感知温湿度及光强波动走势</p>
        </div>

        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl w-fit self-start">
          <button
            onClick={() => { setActiveMetric("temp_hum"); setHoverPoint(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium tracking-tight transition-all duration-300 flex items-center gap-1.5 ${
              activeMetric === "temp_hum"
                ? "bg-white text-amber-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            温度 & 湿度
          </button>
          <button
            onClick={() => { setActiveMetric("light"); setHoverPoint(null); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium tracking-tight transition-all duration-300 flex items-center gap-1.5 ${
              activeMetric === "light"
                ? "bg-white text-amber-900 shadow-sm"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            环境光照度
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative">
        <svg
          className="w-full h-auto cursor-crosshair select-none overflow-visible"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y Axis Grid lines */}
          {gridLinesY.map((y, idx) => {
            let leftLabel = "";
            let rightLabel = "";
            
            if (activeMetric === "temp_hum") {
              const fraction = 1 - idx / gridRows;
              leftLabel = `${Math.round(minTemp + fraction * (maxTemp - minTemp))}°C`;
              rightLabel = `${Math.round(minHum + fraction * (maxHum - minHum))}%`;
            } else {
              const fraction = 1 - idx / gridRows;
              leftLabel = `${Math.round(minLight + fraction * (maxLight - minLight))} lx`;
            }

            return (
              <React.Fragment key={idx}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={svgWidth - paddingX}
                  y2={y}
                  stroke="#F3EDE3"
                  strokeWidth="1"
                  strokeDasharray={idx === gridRows ? "0" : "5,5"}
                />
                <text
                  x={paddingX - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="font-mono text-[9px] fill-stone-400 font-medium"
                >
                  {leftLabel}
                </text>
                {activeMetric === "temp_hum" && (
                  <text
                    x={svgWidth - paddingX + 8}
                    y={y + 4}
                    textAnchor="start"
                    className="font-mono text-[9px] fill-stone-400 font-medium"
                  >
                    {rightLabel}
                  </text>
                )}
              </React.Fragment>
            );
          })}

          {/* Area Gradients */}
          {activeMetric === "temp_hum" ? (
            <>
              {/* Temp Area Gradient */}
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EA580C" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="humGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={`M ${getX(0)},${svgHeight - paddingY} L ${getPolylinePoints("temp")} L ${getX(history.length - 1)},${svgHeight - paddingY} Z`}
                fill="url(#tempGradient)"
              />
              <path
                d={`M ${getX(0)},${svgHeight - paddingY} L ${getPolylinePoints("hum")} L ${getX(history.length - 1)},${svgHeight - paddingY} Z`}
                fill="url(#humGradient)"
              />
            </>
          ) : (
            <>
              <defs>
                <linearGradient id="lightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D97706" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#D97706" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={`M ${getX(0)},${svgHeight - paddingY} L ${getPolylinePoints("light")} L ${getX(history.length - 1)},${svgHeight - paddingY} Z`}
                fill="url(#lightGradient)"
              />
            </>
          )}

          {/* Line paths */}
          {activeMetric === "temp_hum" ? (
            <>
              <path
                d={`M ${getPolylinePoints("temp")}`}
                fill="none"
                stroke="#EA580C"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="transition-all duration-300"
              />
              <path
                d={`M ${getPolylinePoints("hum")}`}
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ opacity: 0.8 }}
                className="transition-all duration-300"
              />
            </>
          ) : (
            <path
              d={`M ${getPolylinePoints("light")}`}
              fill="none"
              stroke="#D97706"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          )}

          {/* Horizontal Bottom Time markings */}
          {history.length > 1 && [0, Math.floor(history.length / 4), Math.floor(history.length / 2), Math.floor(history.length * 0.75), history.length - 1].map((pointIndex, index) => {
            const item = history[pointIndex];
            if (!item) return null;
            return (
              <text
                key={index}
                x={getX(pointIndex)}
                y={svgHeight - paddingY + 16}
                textAnchor="middle"
                className="font-mono text-[9px] fill-stone-400 font-medium"
              >
                {formatTime(item.timestamp)}
              </text>
            );
          })}

          {/* Interactive cursor line on mouseover */}
          {hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                y1={paddingY}
                x2={hoveredPoint.x}
                y2={svgHeight - paddingY}
                stroke="#B26B1E"
                strokeWidth="1.2"
                strokeDasharray="3,3"
                className="pointer-events-none"
              />
              {activeMetric === "temp_hum" ? (
                <>
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y1}
                    r="4.5"
                    fill="#EA580C"
                    stroke="#FFF"
                    strokeWidth="1.5"
                    className="pointer-events-none shadow"
                  />
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y2}
                    r="4.5"
                    fill="#0284C7"
                    stroke="#FFF"
                    strokeWidth="1.5"
                    className="pointer-events-none shadow"
                  />
                </>
              ) : (
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y1}
                  r="4.5"
                  fill="#D97706"
                  stroke="#FFF"
                  strokeWidth="1.5"
                  className="pointer-events-none shadow"
                />
              )}
            </>
          )}
        </svg>

        {/* Dynamic Hover Tooltip inside HTML overlay */}
        {hoveredPoint && (
          <div
            className="absolute z-20 pointer-events-none bg-stone-900/95 backdrop-blur-sm border border-stone-800 text-white rounded-xl p-3 shadow-xl text-xs font-sans flex flex-col gap-1"
            style={{
              left: `${Math.min(svgWidth - 170, Math.max(10, (hoveredPoint.x / svgWidth) * 100))}%`,
              transform: `translate(-50%, -105%)`,
              top: `${Math.min(svgHeight / 2 - 20, 100)}px`,
            }}
          >
            <div className="text-stone-400 font-mono text-[10px] pb-1 border-b border-stone-800 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-stone-500" />
                采样时刻
              </span>
              <span>{new Date(hoveredPoint.item.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</span>
            </div>
            
            {activeMetric === "temp_hum" ? (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between gap-5">
                  <span className="flex items-center gap-1.5 text-stone-300">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    当前湿度
                  </span>
                  <span className="font-mono font-semibold text-orange-400">{hoveredPoint.item.temperature}°C</span>
                </div>
                <div className="flex items-center justify-between gap-5">
                  <span className="flex items-center gap-1.5 text-stone-300">
                    <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                    空气湿度
                  </span>
                  <span className="font-mono font-semibold text-sky-400">{hoveredPoint.item.humidity}%</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-5 mt-1">
                <span className="flex items-center gap-1.5 text-stone-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  环境光强
                </span>
                <span className="font-mono font-semibold text-amber-300">{hoveredPoint.item.light} lx</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend values */}
      <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-[#F7F2EB]">
        {activeMetric === "temp_hum" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-[#EA580C] rounded-full inline-block"></span>
              <span className="text-stone-500 text-xs">环境温度 (正常：18°C ~ 27°C)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-[#0284C7] rounded-full inline-block"></span>
              <span className="text-stone-500 text-xs">相对湿度 (范围：40% ~ 65%)</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#D97706] rounded-full inline-block"></span>
            <span className="text-stone-500 text-xs">数字光敏光强 (lx)</span>
          </div>
        )}
      </div>
    </div>
  );
}
