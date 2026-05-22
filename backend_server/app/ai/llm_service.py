import os
import json
import requests
import logging
import math
try:
    import openai
except ImportError:
    openai = None

logger = logging.getLogger(__name__)

class LLMService:
    """
    封装与语言模型交互的逻辑，提供统一接口
    generate_advice(data) -> {"advice": str, "level": "ok"|"warning"|"critical"}
    """
    def __init__(self, openai_model="gpt-3.5-turbo", deepseek_endpoint=None, deepseek_key=None):
        self.model = openai_model
        self.api_key = os.environ.get("OPENAI_API_KEY")
        # DeepSeek 配置：优先从构造参数，再从环境变量读取
        self.deepseek_endpoint = deepseek_endpoint or os.environ.get("DEEPSEEK_ENDPOINT", "https://api.deepseek.com")
        self.deepseek_key = deepseek_key or os.environ.get("DEEPSEEK_API_KEY")
        if self.api_key and openai:
            openai.api_key = self.api_key

    def generate_advice(self, data):
        """
        data: dict with keys device_id, temperature, humidity, light
        返回 dict: {"advice": "...", "level": "..."}
        """

        def _is_valid_number(v):
            try:
                f = float(v)
                return math.isfinite(f)
            except Exception:
                return False

        is_chat = "question" in data and data.get("question")
        if not is_chat:
            if not (_is_valid_number(data.get("temperature")) and _is_valid_number(data.get("humidity")) and _is_valid_number(data.get("light"))):
                logger.warning("Invalid sensor inputs for device %s: %s", data.get("device_id"), data)
                return {"advice": "传感器数据缺失，请检查设备连接。", "level": "critical"}

        # 若配置了 deepseek key，优先调用 DeepSeek
        logger.info("generate_advice: deepseek_key=%s", bool(self.deepseek_key))
        if self.deepseek_key:
            try:
                ds = self._call_deepseek(data, mode="chat" if is_chat else "advice")
                if isinstance(ds, dict):
                    if is_chat and ds.get("answer"):
                        return ds
                    if ds.get("advice") and ds.get("level"):
                        return ds
            except Exception as e:
                # 出错则回退到 OpenAI 或规则引擎
                logger.error("Error occurred while calling DeepSeek: %s", e)
        logger.info("generate_advice: deepseek_key=%s", bool(self.deepseek_key))

        # 之后尝试 OpenAI（原有逻辑）
        if self.api_key and openai:
            try:
                # ... existing openai call code ...
                pass
            except Exception as e:
                logger.error("Error occurred while calling OpenAI: %s", e)

        return self._rule_engine_advice(data)

    def _rule_engine_advice(self, d):
        try:
            t = float(d.get("temperature", 0))
        except Exception as e:
            logger.error("Error occurred while parsing temperature value: %s", e)
            t = 0.0
        try:
            h = float(d.get("humidity", 0))
        except Exception as e:
            logger.error("Error occurred while parsing humidity value: %s", e)
            h = 0.0
        try:
            l = float(d.get("light", 0))
        except Exception as e:
            logger.error("Error occurred while parsing light value: %s", e)
            l = 0.0

        # 简单阈值策略（可按需调整）
        if (t >= 35) or (h >= 90):
            return {"advice": "室内温度/湿度极高，请立即处理（通风/制冷/除湿）。", "level": "critical"}
        if (t >= 30 and h >= 75) or (h >= 80):
            return {"advice": "室内较闷热潮湿，建议开启空调除湿或通风。", "level": "warning"}
        if (t >= 28) or (h >= 70):
            return {"advice": "室内偏热潮，建议检查通风或降低温度。", "level": "warning"}
        return {"advice": "环境良好，无需特别操作。", "level": "ok"}
    
    def _call_deepseek(self, data, mode="advice"):
        """
        使用 DeepSeek 的 OpenAI-compatible SDK 调用 chat completion。
        要求：安装 openai 包 (pip install openai)，并确保 self.deepseek_endpoint 为 base_url（如 "https://api.deepseek.com"）。
        返回 dict {"advice": str, "level": "ok"|"warning"|"critical"}
        """

        try:
            from openai import OpenAI
        except Exception as e:
            raise RuntimeError("OpenAI SDK not installed. Install with: pip install openai") from e

        base_url = (self.deepseek_endpoint or "").rstrip('/')
        if base_url.endswith("/v1"):
            base_url = base_url.rstrip("/v1").rstrip('/')

        client = OpenAI(api_key=self.deepseek_key, base_url=base_url)
        model_name = "deepseek-v4-pro"

        # 构造消息
        if mode == "chat":
            system_msg = (
                "你是一名专业的物联网环境陪伴助手，使用中文回答用户问题。"
                "给定传感器读数与用户提问，返回严格的 JSON：{\"answer\": \"...\"}，不要输出其它内容。"
            )
            user_payload = {
                "device_id": data.get("device_id"),
                "temperature": data.get("temperature"),
                "humidity": data.get("humidity"),
                "light": data.get("light"),
                "question": data.get("question")
            }
            user_msg = json.dumps(user_payload, ensure_ascii=False)
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": f"Sensor+Question: {user_msg}\nRespond with JSON only."}
            ]
        else:
            # 以前的 advice 模式（保持原有 prompt）
            system_msg = (
                "你是一名专业的物联网环境分析师，根据传感器读数，"
                "return a JSON object {\"advice\": str, \"level\": \"ok\"|\"warning\"|\"critical\"}."
                " Do not output any extra text."
            )
            user_msg = json.dumps({
                "device_id": data.get("device_id"),
                "temperature": data.get("temperature"),
                "humidity": data.get("humidity"),
                "light": data.get("light")
            }, ensure_ascii=False)
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": f"Sensor data: {user_msg}\nRespond with JSON only."}
            ]

        text = ""
        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=False,
                reasoning_effort="high",
                extra_body={"thinking": {"type": "enabled"}}
            )
            # Safe extraction of response text
            try:
                text = resp.choices[0].message.content
            except Exception:
                # fallback for different response shapes
                try:
                    choice0 = resp.choices[0] if resp.choices else None
                    msg = getattr(choice0, "message", None) or (choice0.get("message") if isinstance(choice0, dict) else None)
                    if isinstance(msg, dict):
                        text = msg.get("content", "") or ""
                    else:
                        text = str(msg or "")
                except Exception:
                    text = ""
        except Exception:
            logger.exception("DeepSeek SDK request failed")
            raise

        text = (text or "").strip()
        logger.info("DeepSeek SDK reply (truncated): %s", text[:1000])

        # 尝试解析 JSON；若失败尝试抽取 {...} 子串
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1 and end > start:
                try:
                    parsed = json.loads(text[start:end+1])
                except Exception:
                    parsed = None

        if isinstance(parsed, dict):
            if mode == "chat" and parsed.get("answer"):
                return {"answer": parsed.get("answer", "").strip()}
            if parsed.get("advice") and parsed.get("level"):
                return {"advice": parsed.get("advice", "").strip(), "level": parsed.get("level", "ok")}

        # plain text handling: 根据关键词提升严重等级
        lower = text.lower()
        critical_keywords = ["缺失", "异常", "请检查设备", "sensor error", "no data"]
        if any(k in lower for k in critical_keywords):
            if mode == "chat":
                return {"answer": text, "level": "critical"}
            return {"advice": text, "level": "critical"}

        # 兜底返回
        if mode == "chat":
            return {"answer": text, "level": "ok"}
        return {"advice": text, "level": "ok"}