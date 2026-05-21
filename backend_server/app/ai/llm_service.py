import os
import json
import requests
import logging
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
        # 若配置了 deepseek key，优先调用 DeepSeek
        logger.info("generate_advice: deepseek_key=%s", bool(self.deepseek_key))
        if self.deepseek_key:
            try:
                ds = self._call_deepseek(data)
                if isinstance(ds, dict) and "advice" in ds and "level" in ds:
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
    
    def _call_deepseek(self, data):
        """
        使用 DeepSeek 的 OpenAI-compatible SDK 调用 chat completion。
        要求：安装 openai 包 (pip install openai)，并确保 self.deepseek_endpoint 为 base_url（如 "https://api.deepseek.com"）。
        返回 dict {"advice": str, "level": "ok"|"warning"|"critical"}
        """
        # 准备消息：要求模型严格返回 JSON 结构，便于解析
        system_msg = (
            "You are an expert IoT Environmental Analyst. Given sensor readings, "
            "return a JSON object with keys: 'advice' (short Chinese advice) and 'level' ('ok'|'warning'|'critical')."
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

        # 首选使用 OpenAI-compatible SDK provided by openai package (class OpenAI)
        try:
            from openai import OpenAI
        except Exception as e:
            raise RuntimeError("OpenAI SDK not installed. Install with: pip install openai") from e

        base_url = (self.deepseek_endpoint or "").rstrip('/')
        if base_url.endswith("/v1"):
            base_url = base_url.rstrip("/v1").rstrip('/')

        client = OpenAI(api_key=self.deepseek_key, base_url=base_url)

        # model name per DeepSeek sample
        model_name = "deepseek-v4-pro"

        try:
            resp = client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=False,
                reasoning_effort="high",
                extra_body={"thinking": {"type": "enabled"}}
            )
            # DeepSeek SDK response: response.choices[0].message.content (string)
            text = ""
            try:
                text = resp.choices[0].message.content
            except Exception:
                # fallback: try attribute access
                text = getattr(resp.choices[0], "message", {}).get("content", "") if resp.choices else ""

            logger.info("DeepSeek SDK reply (truncated): %s", (text or "")[:1000])

            # 忽略多余输出，尝试解析为 JSON
            try:
                parsed = json.loads(text)
                advice = parsed.get("advice", "")
                level = parsed.get("level", "ok")
                return {"advice": advice, "level": level}
            except Exception:
                # 如果不是 JSON，作为 freeform 文本处理，返回为 advice
                return {"advice": (text or "").strip(), "level": "ok"}
        except Exception as e:
            logger.exception("DeepSeek SDK request failed")
            raise