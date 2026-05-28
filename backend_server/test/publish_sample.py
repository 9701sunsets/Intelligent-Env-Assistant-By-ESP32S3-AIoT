import json, time
import paho.mqtt.client as mqtt

c = mqtt.Client()
c.connect("127.0.0.1", 1883, 60)
payload = {
  "device_id":"esp32_001",
  "temperature":26.5,
  "humidity":55.4,
  "light":380,
  "mq2": {
    "ppm_est": 120.0,
    "alarm": False
  },
  "timestamp": "2026-05-21T08:00:00Z"
}
c.publish("aiot/device/upload", json.dumps(payload), qos=1)
c.disconnect()

payload = {
  "device_id": "esp32_001",
  "firmware_version": "dev-1",
  "status": "online",
  "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
}
c.publish("aiot/device/status", json.dumps(payload), qos=1)
c.disconnect()