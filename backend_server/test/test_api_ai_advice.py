import json
import pytest
from flask import Flask

from app.api.ai import init_routes

class DummyLLM:
    def __init__(self, advice="室内较闷热潮湿，建议开启空调除湿。", level="warning"):
        self.advice = advice
        self.level = level
    def generate_advice(self, data):
        # 返回固定结构，模拟 DeepSeek / LLM 返回
        return {"advice": self.advice, "level": self.level}

@pytest.fixture
def app():
    app = Flask(__name__)
    init_routes(app)
    return app

def test_ai_advice_ok(app):
    # 注入假 LLM 服务
    app.config['LLM_SERVICE'] = DummyLLM()
    client = app.test_client()

    payload = {
        "device_id": "esp32_001",
        "temperature": 30,
        "humidity": 82,
        "light": 200
    }
    resp = client.post('/api/ai/advice', json=payload)
    assert resp.status_code == 200
    j = resp.get_json()
    assert j["code"] == 200
    assert "data" in j
    assert j["data"]["advice"].startswith("室内")
    assert j["data"]["level"] in ("ok", "warning", "critical")

def test_ai_advice_missing_measurement(app):
    app.config['LLM_SERVICE'] = DummyLLM()
    client = app.test_client()

    payload = {
        "device_id": "esp32_001",
        # missing temperature/humidity/light
    }
    resp = client.post('/api/ai/advice', json=payload)
    assert resp.status_code == 400
    j = resp.get_json()
    assert j["code"] == 400

def test_ai_no_llm_configured(app):
    # 不注入 LLM_SERVICE，检查 500 错误返回
    client = app.test_client()
    payload = {
        "device_id": "esp32_001",
        "temperature": 25,
        "humidity": 50,
        "light": 300
    }
    resp = client.post('/api/ai/advice', json=payload)
    assert resp.status_code == 500
    j = resp.get_json()
    assert j["code"] == 500