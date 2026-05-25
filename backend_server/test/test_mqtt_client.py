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

# def test_on_upload_and_status(monkeypatch):
#     monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', __import__('types'))
#     # 相反，直接修改客户端构造函数的模块属性
#     import paho.mqtt.client as mqtt_real
#     # monkeypatch the Client class
#     from types import SimpleNamespace
#     class Module:
#         Client = FakeClient
#         MQTT_ERR_SUCCESS = 0
#     monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

#     from app.mqtt.mqtt_client import MQTTClient

#     received = {"upload": None, "status": None}
#     def on_upload(data):
#         received["upload"] = data

#     def on_status(data):
#         received["status"] = data

#     client = MQTTClient(broker='dummy', on_upload=on_upload, on_status=on_status)
#     client.start()
#     # 模拟接收上传和状态消息
#     fake_msg1 = SimpleNamespace(topic="aiot/device/upload", payload=json.dumps({"t": "upload", "v": 1}).encode())
#     client._on_message(None, None, fake_msg1)
#     fake_msg2 = SimpleNamespace(topic="aiot/device/status", payload=json.dumps({"t": "status", "ok": True}).encode())
#     client._on_message(None, None, fake_msg2)

#     assert received["upload"]["t"] == "upload"
#     assert received["status"]["ok"] is True

# def test_publish_control(monkeypatch):
#     class PubFake(FakeClient):
#         pass
#     Module = type("M", (), {"Client": PubFake, "MQTT_ERR_SUCCESS": 0})
#     monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

#     from app.mqtt.mqtt_client import MQTTClient
#     client = MQTTClient(broker='dummy')
#     client.start()
#     ok = client.publish_control(device_id="dev1", command={"act": "on"})
#     assert ok is True

def test_publish_control_payload(monkeypatch):
    # 同现有 monkeypatch 方式替换 Client 为 FakeClient
    from types import SimpleNamespace
    Module = type("M", (), {"Client": FakeClient, "MQTT_ERR_SUCCESS": 0})
    monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

    from app.mqtt.mqtt_client import MQTTClient
    client = MQTTClient(broker='dummy')
    client.start()
    # 调用 publish_control 方法，传入完整的控制数据
    ok = client.publish_control({"msg_id":"cmd_1001",
                                 "target":"led",
                                 "action":{
                                        "state":"on",
                                        "color":"red",
                                        "value": 1
                                 },
                                 "timestamp":"2026-05-17T14:30:25Z"
                                 })
    assert ok is True

    # 检查 fake client 的 published 列表里有一条 control 消息
    pub = client.client.published[-1]
    topic, payload_s, qos = pub
    assert topic == "aiot/device/control"
    payload = json.loads(payload_s)
    assert payload["msg_id"] == "cmd_1001"
    assert payload["target"] == "led"
    assert payload["action"]["state"] == "on"
    assert payload["action"]["color"] == "red"
    assert payload["action"]["value"] == 1
    assert payload["timestamp"] == "2026-05-17T14:30:25Z"

def test_upload_status_handlers(monkeypatch):
    Module = type("M", (), {"Client": FakeClient, "MQTT_ERR_SUCCESS": 0})
    monkeypatch.setitem(__import__('sys').modules, 'paho.mqtt.client', Module)

    from app.mqtt.mqtt_client import MQTTClient
    called = {}
    def on_upload(d): called['upload']=d
    def on_status(d): called['status']=d

    c = MQTTClient(on_upload=on_upload, on_status=on_status)
    c.start()
    payload_upload = {
        "device_id": "esp32_001",
        "temperature": 25.5,
        "humidity": 58.2,
        "light": 300,
        "comfort": "comfortable",
        "wifi_rssi": -70,
        "timestamp": "2026-05-17T14:30:25Z",
        }
    payload_status = {
        "device_id": "esp32_001",
        "status": "online",
        "ip": "192.168.1.100",
        "firmware_version": "1.0.0",
        "free_heap": 215000,
        "timestamp": "2026-05-17T14:30:25Z",
        }
    fake_msg_upload = SimpleNamespace(topic="aiot/device/upload", payload=json.dumps(payload_upload).encode())
    fake_msg_status = SimpleNamespace(topic="aiot/device/status", payload=json.dumps(payload_status).encode())
    c._on_message(None, None, fake_msg_upload)
    c._on_message(None, None, fake_msg_status)
    assert called['upload']["device_id"] == "esp32_001"
    assert called['upload']["temperature"] == 25.5
    assert called['upload']["humidity"] == 58.2
    assert called['upload']["light"] == 300
    assert called['upload']["comfort"] == "comfortable"
    assert called['upload']["wifi_rssi"] == -70
    assert called['status']["device_id"] == "esp32_001"
    assert called['status']["status"] == "online"
    assert called['status']["ip"] == "192.168.1.100"
    assert called['status']["firmware_version"] == "1.0.0"
    assert called['status']["free_heap"] == 215000