from flask import Flask
from app.api.control import init_routes
from app.mqtt.mqtt_client import MQTTClient
from app.mqtt.handlers import on_upload, on_status
from app.database import init_db
import logging

logging.basicConfig(level=logging.INFO)

def create_app():
    app = Flask(__name__)
    init_routes(app)
    # 创建并注入 MQTT 客户端
    mqtt_client = MQTTClient(broker='localhost', port=1883
                             , on_upload=on_upload, on_status=on_status)
    app.config['MQTT_CLIENT'] = mqtt_client
    app.config['DATABASE_URI'] = 'mysql+pymysql://user:password@3306/esp_db?charset=utf8mb4'
    engine, SessionLocal = init_db(app.config['DATABASE_URI'])
    app.config['DATABASE_ENGINE'] = engine
    app.config['DATABASE_SESSION'] = SessionLocal
    mqtt_client.start()
    return app, mqtt_client

if __name__ == '__main__':
    app, mqtt_client = create_app()
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    finally:
        mqtt_client.stop()