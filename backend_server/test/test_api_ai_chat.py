import json
import pytest
from flask import Flask

from app.api.ai import init_routes

class DummyLLM:
    def __init__(self, data={"answer": "当前环境温度适宜，湿度较高，建议开启除湿功能。"}):
        self.data = data
    def generate_advice(self, data):
        # 返回固定结构，模拟 DeepSeek / LLM 返回
        return self.data

@pytest.fixture
def app():
    app = Flask(__name__)
    init_routes(app)
    return app

def test_ai_chat_ok(app):
    # 注入假 LLM 服务
    app.config['LLM_SERVICE'] = DummyLLM()
    client = app.test_client()

    payload = {
        "device_id": "esp32_001",
        "question": "现在适合睡觉吗？"
    }
    resp = client.post('/api/ai/chat', json=payload)
    assert resp.status_code == 200
    j = resp.get_json()
    assert j["code"] == 200
    assert "data" in j
    assert j["data"]["answer"].startswith("当前环境")

def test_ai_chat_missing_input(app):
    app.config['LLM_SERVICE'] = DummyLLM()
    client = app.test_client()

    payload = {
        "device_id": "esp32_001",
        # missing question
    }
    resp = client.post('/api/ai/chat', json=payload)
    assert resp.status_code == 400
    j = resp.get_json()
    assert j["code"] == 400

def test_ai_no_llm_configured(app):
    # 不注入 LLM_SERVICE，检查 500 错误返回
    client = app.test_client()
    payload = {
        "device_id": "esp32_001",
        "question": "现在适合睡觉吗？"
    }
    resp = client.post('/api/ai/chat', json=payload)
    assert resp.status_code == 500
    j = resp.get_json()
    assert j["code"] == 500