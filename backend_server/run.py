from flask import Flask
from flask_cors import CORS
from app.api.control import init_routes
from app.api import ai, control, sensor
from app.mqtt.mqtt_client import MQTTClient
from app.mqtt.handlers import on_upload, on_status
from app.database.db import init_db
from app.ai.llm_service import LLMService
import logging
import os
import json

logging.basicConfig(level=logging.INFO)

def create_app():
    app = Flask(__name__)
    CORS(app)  # 允许跨域请求，前端可以访问API
    
    # 创建并注入 MQTT 客户端
    mqtt_client = MQTTClient(
        broker=os.environ.get("MQTT_BROKER", "192.168.57.159"),
        port=os.environ.get("MQTT_PORT", 1883),
        on_upload=on_upload,
        on_status=on_status,
        flask_app=app
    )
    app.config['MQTT_CLIENT'] = mqtt_client

    # 加载API密钥
    api_keys_path = os.environ.get("API_KEYS_PATH", "secrets.json")
    if os.path.exists(api_keys_path):
        with open(api_keys_path, 'r') as f:
            for k, v in json.load(f).items():
                os.environ.setdefault(k, v)

    # 创建并注入 LLM 服务
    llm_service = LLMService(
        deepseek_endpoint=os.environ.get("DEEPSEEK_ENDPOINT"),
        deepseek_key=os.environ.get("DEEPSEEK_API_KEY")
    )
    app.logger.info("LLMService deepseek_key present=%s endpoint=%s", bool(llm_service.deepseek_key), llm_service.deepseek_endpoint)
    app.config['LLM_SERVICE'] = llm_service

    # 初始化数据库连接
    app.config['DATABASE_URI'] = os.environ.get(
        "DATABASE_URI", 
        "mysql+pymysql://aiot:aiotpass@127.0.0.1:3307/aiot_data?charset=utf8mb4"
    )
    engine, SessionLocal = init_db(app.config['DATABASE_URI'])
    app.config['DATABASE_ENGINE'] = engine
    app.config['DATABASE_SESSION'] = SessionLocal

    # 注册API路由
    # TODO: 统一约定注入点（app.extensions['services']）
    control.init_routes(app)
    ai.init_routes(app)
    sensor.init_routes(app)

    # 启动MQTT客户端，连接MQTT服务器并开始处理消息
    mqtt_client.start()
    return app, mqtt_client

if __name__ == '__main__':
    app, mqtt_client = create_app()
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    finally:
        mqtt_client.stop()