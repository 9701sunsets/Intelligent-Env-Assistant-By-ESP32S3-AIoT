from flask import Flask
from app.api.control import init_routes
from app.api import ai, control, sensor
from app.mqtt.mqtt_client import MQTTClient
from app.mqtt.handlers import on_upload, on_status
from app.database.db import init_db
import logging
import os
import json

logging.basicConfig(level=logging.INFO)

def create_app():
    app = Flask(__name__)
    
    # 创建并注入 MQTT 客户端
    mqtt_client = MQTTClient(broker='localhost', port=1883
                             , on_upload=on_upload, on_status=on_status)
    app.config['MQTT_CLIENT'] = mqtt_client

    # 初始化数据库连接
    app.config['DATABASE_URI'] = 'mysql+pymysql://root:1234@localhost:3306/aiot_data?charset=utf8mb4'
    engine, SessionLocal = init_db(app.config['DATABASE_URI'])
    app.config['DATABASE_ENGINE'] = engine
    app.config['DATABASE_SESSION'] = SessionLocal

    # 注册API路由
    # TODO: 统一约定注入点（app.extensions['services']）
    control.init_routes(app)
    ai.init_routes(app)
    sensor.init_routes(app)

    # 加载API密钥（可选）
    api_keys_path = os.environ.get("API_KEYS_PATH", "api_keys.json")
    if os.path.exists(api_keys_path):
        with open(api_keys_path, 'r') as f:
            for k, v in json.load(f).items():
                # 仅在未设置环境变量时写入，优先使用环境变量（更安全）
                os.environ.setdefault(k, v)

    # 启动MQTT客户端，连接MQTT服务器并开始处理消息
    mqtt_client.start()
    return app, mqtt_client

if __name__ == '__main__':
    app, mqtt_client = create_app()
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    finally:
        mqtt_client.stop()