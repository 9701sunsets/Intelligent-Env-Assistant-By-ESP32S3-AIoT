import os
import json
import requests
try:
    import openai
except ImportError:
    openai = None

class LLMService:
    """
    简单封装：优先使用 OpenAI（通过 OPENAI_API_KEY），否则使用规则引擎回退。
    generate_advice(data) -> {"advice": str, "level": "ok"|"warning"|"critical"}
    """
    def __init__(self, openai_model="gpt-3.5-turbo", deepseek_endpoint=None, deepseek_key=None):
        self.model = openai_model
        self.api_key = os.environ.get("OPENAI_API_KEY")
        # DeepSeek 配置：优先从构造参数，再从环境变量读取
        self.deepseek_endpoint = deepseek_endpoint or os.environ.get("DEEPSEEK_ENDPOINT", "https://api.deepseek.example/v1/infer")
        self.deepseek_key = deepseek_key or os.environ.get("DEEPSEEK_API_KEY")
        if self.api_key and openai:
            openai.api_key = self.api_key

    def generate_advice(self, data):
        """
        data: dict with keys device_id, temperature, humidity, light
        返回 dict: {"advice": "...", "level": "..."}
        """
        # 若配置了 deepseek key，优先调用 DeepSeek
        if self.deepseek_key:
            try:
                ds = self._call_deepseek(data)
                if isinstance(ds, dict) and "advice" in ds and "level" in ds:
                    return ds
            except Exception:
                # 出错则回退到 OpenAI 或规则引擎
                pass

        # 之后尝试 OpenAI（原有逻辑）
        if self.api_key and openai:
            try:
                # ... existing openai call code ...
                pass
            except Exception:
                pass

        return self._rule_engine_advice(data)

    def _rule_engine_advice(self, d):
        try:
            t = float(d.get("temperature", 0))
        except Exception:
            t = 0.0
        try:
            h = float(d.get("humidity", 0))
        except Exception:
            h = 0.0
        try:
            l = float(d.get("light", 0))
        except Exception:
            l = 0.0

        # 简单阈值策略（可按需调整）
        if (t >= 35) or (h >= 90):
            return {"advice": "室内温度/湿度极高，请立即处理（通风/制冷/除湿）。", "level": "critical"}
        if (t >= 30 and h >= 75) or (h >= 80):
            return {"advice": "室内较闷热潮湿，建议开启空调除湿或通风。", "level": "warning"}
        if (t >= 28) or (h >= 70):
            return {"advice": "室内偏热潮，建议检查通风或降低温度。", "level": "warning"}
        return {"advice": "环境良好，无需特别操作。", "level": "ok"}
    
    def _call_deepseek(self, data):
        """
        向 DeepSeek API 发起请求，期望返回 JSON 包含 "advice" 和 "level" 字段。
        data: dict 包含 device_id, temperature, humidity, light
        返回: dict {"advice": str, "level": "ok"|"warning"|"critical"}
        """
        headers = {
            "Authorization": f"Bearer {self.deepseek_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "input": {
                "device_id": data.get("device_id"),
                "temperature": data.get("temperature"),
                "humidity": data.get("humidity"),
                "light": data.get("light")
            },
            # 根据 DeepSeek API 要求可加入更多参数，比如模型名、response format 等
            "output_format": {"type": "json", "schema": {"advice": "string", "level": "string"}}
        }
        resp = requests.post(self.deepseek_endpoint, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        j = resp.json()
        # 根据 DeepSeek 的实际返回结构适配解析，例如结果可能在 j["result"] 或 j["data"]
        # 这里示例按可能的结构解析
        if "result" in j and isinstance(j["result"], dict):
            return {"advice": j["result"].get("advice", ""), "level": j["result"].get("level", "ok")}
        if "data" in j and isinstance(j["data"], dict):
            return {"advice": j["data"].get("advice", ""), "level": j["data"].get("level", "ok")}
        # 若直接返回目标结构
        if "advice" in j and "level" in j:
            return {"advice": j["advice"], "level": j["level"]}
        raise ValueError("unexpected deepseek response format")