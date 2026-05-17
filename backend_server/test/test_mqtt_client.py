import json

import sys, types
sys.modules.setdefault('paho', types.ModuleType('paho'))
sys.modules.setdefault('paho.mqtt', types.ModuleType('paho.mqtt'))

import pytest
from types import SimpleNamespace

# 对 paho.mqtt 客户端进行猴子补丁替换，改为可捕获回调函数的模拟客户端
class FakeClient:
    def __init__(self, *args, **kwargs):
        self.on_connect = None
        self.on_message = None
        self._subs = []
        self.published = []

    def connect(self, host, port, keepalive=60):
        return 0

    def loop_start(self):
        # simulate immediate connect
        if self.on_connect:
            self.on_connect(self, None, None, 0)

    def loop_stop(self):
        pass

    def disconnect(self):
        pass

    def subscribe(self, topic):
        self._subs.append(topic)

    def publish(self, topic, payload, qos=0):
        self.published.append((topic, payload, qos))
        return SimpleNamespace(rc=0)

def test_on_upload_and_status(monkeypatch):
    monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', __import__('types'))
    # 相反，直接修改客户端构造函数的模块属性
    import paho.mqtt.client as mqtt_real
    # monkeypatch the Client class
    from types import SimpleNamespace
    class Module:
        Client = FakeClient
        MQTT_ERR_SUCCESS = 0
    monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

    from app.mqtt.mqtt_client import MQTTClient

    received = {"upload": None, "status": None}
    def on_upload(data):
        received["upload"] = data

    def on_status(data):
        received["status"] = data

    client = MQTTClient(broker='dummy', on_upload=on_upload, on_status=on_status)
    client.start()
    # simulate messages by directly calling handler
    fake_msg1 = SimpleNamespace(topic="aiot/device/upload", payload=json.dumps({"t": "upload", "v": 1}).encode())
    client._on_message(None, None, fake_msg1)
    fake_msg2 = SimpleNamespace(topic="aiot/device/status", payload=json.dumps({"t": "status", "ok": True}).encode())
    client._on_message(None, None, fake_msg2)

    assert received["upload"]["t"] == "upload"
    assert received["status"]["ok"] is True

def test_publish_control(monkeypatch):
    class PubFake(FakeClient):
        pass
    Module = type("M", (), {"Client": PubFake, "MQTT_ERR_SUCCESS": 0})
    monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

    from app.mqtt.mqtt_client import MQTTClient
    client = MQTTClient(broker='dummy')
    client.start()
    ok = client.publish_control(device_id="dev1", command={"act": "on"})
    assert ok is True