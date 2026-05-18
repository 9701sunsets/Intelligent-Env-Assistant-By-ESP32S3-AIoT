# TODO: 完善API控制接口的单元测试，覆盖更多的输入场景和错误处理逻辑
import json
import pytest
from flask import Flask

from app.api.control import init_routes

class DummyMQTT:
    def __init__(self):
        self.last = None
    def publish_control(self, device_id, command):
        self.last = (device_id, command)
        return True

@pytest.fixture
def app():
    app = Flask(__name__)
    init_routes(app)
    app.config['MQTT_CLIENT'] = DummyMQTT()
    return app

def test_send_control_ok(app):
    client = app.test_client()
    res = client.post('/api/control', json={"device_id":"d1", "command":{"p":1}})
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "sent"