import json
import logging
import threading
import time
import sys
try:
    import paho.mqtt.client as mqtt
except Exception:
    mqtt = sys.modules.get('paho.mqtt.client')
    if mqtt is None:
        import types
        def _no_client(*args, **kwargs):
            raise RuntimeError("paho-mqtt not available")
        mqtt = types.SimpleNamespace(Client=_no_client, MQTT_ERR_SUCCESS=0)

logger = logging.getLogger(__name__)

'''
ESP设备通过MQTT上传数据和状态，订阅控制命令。
- 设备上传数据：topic "aiot/device/upload", payload JSON dict
- 设备状态：topic "aiot/device/status", payload JSON dict
- 控制命令：topic "aiot/device/control", payload JSON dict
'''
class MQTTClient:
    def __init__(self, broker='localhost', port=1883, client_id=None,
                 on_upload=None, on_status=None):
        self.broker = broker
        self.port = port
        self.client = mqtt.Client(client_id=client_id)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.on_upload = on_upload
        self.on_status = on_status
        self._connected = threading.Event()

    def start(self):
        '''开始连接MQTT服务器并处理消息'''
        self.client.connect(self.broker, self.port, keepalive=60)
        self.client.loop_start()
        # 等待连接成功，超时后继续（可能服务器不可达）
        if not self._connected.wait(timeout=5):
            logger.warning("MQTT connection timeout")

    def stop(self):
        '''停止MQTT客户端并断开连接'''
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass

    def _on_connect(self, client, userdata, flags, rc):
        '''MQTT连接回调，订阅相关主题'''
        logger.info("MQTT connected rc=%s", rc)
        self._connected.set()
        # 订阅设备上传和状态主题
        self.client.subscribe("aiot/device/upload")
        self.client.subscribe("aiot/device/status")

    def _on_message(self, client, userdata, msg):
        '''MQTT消息回调，处理不同主题的消息'''
        try:
            payload = msg.payload.decode('utf-8')
            data = json.loads(payload)
        except Exception as e:
            logger.exception("Invalid JSON on topic %s: %s", msg.topic, e)
            return

        if msg.topic == "aiot/device/upload":
            self._handle_upload(data)
        elif msg.topic == "aiot/device/status":
            self._handle_status(data)
        else:
            logger.debug("Unhandled topic %s", msg.topic)

    def _handle_upload(self, data):
        '''处理设备上传数据'''
        if not isinstance(data, dict):
            logger.warning("upload payload not dict")
            return
        logger.info("Received device upload: %s", data)
        if callable(self.on_upload):
            try:
                self.on_upload(data)
            except Exception:
                logger.exception("on_upload handler error")

    def _handle_status(self, data):
        '''处理设备状态消息'''
        if not isinstance(data, dict):
            logger.warning("status payload not dict")
            return
        logger.info("Received device status: %s", data)
        if callable(self.on_status):
            try:
                self.on_status(data)
            except Exception:
                logger.exception("on_status handler error")

    def publish_control(self, device_id, command):
        """
        向设备发布控制命令
        device_id: string or None. If None, broadcast.
        command: dict
        """
        topic = "aiot/device/control"
        payload = {"device_id": device_id, "command": command}
        try:
            payload_s = json.dumps(payload)
        except Exception:
            logger.exception("Failed to serialize control payload")
            return False
        result = self.client.publish(topic, payload_s, qos=1)
        # 可选地检查发布结果
        return result.rc == mqtt.MQTT_ERR_SUCCESS