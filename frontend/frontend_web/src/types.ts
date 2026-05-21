export interface SensorData {
  device_id: string;
  temperature: number;
  humidity: number;
  light: number;
  comfort: "comfortable" | "uncomfortable" | "alert";
  timestamp: string;
}

export interface HistoryItem {
  temperature: number;
  humidity: number;
  light: number;
  timestamp: string;
}

export interface DeviceInfo {
  device_id: string;
  name: string;
  status: "online" | "offline";
  last_seen: string;
  state: {
    led: "on" | "off";
    buzzer: "on" | "off";
    fan: "on" | "off";
  };
}

export interface AIAdviceResponse {
  advice: string;
  level: "normal" | "warning" | "info";
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}
