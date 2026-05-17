from flask import Flask
from app.api.control import init_routes
from app.mqtt.mqtt_client import MQTTClient
import logging

logging.basicConfig(level=logging.INFO)

def create_app():
    app = Flask(__name__)
    init_routes(app)
    # 创建并注入 MQTT 客户端
    mqtt_client = MQTTClient(broker='localhost', port=1883)
    app.config['MQTT_CLIENT'] = mqtt_client
    mqtt_client.start()
    return app, mqtt_client

if __name__ == '__main__':
    app, mqtt_client = create_app()
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    finally:
        mqtt_client.stop()