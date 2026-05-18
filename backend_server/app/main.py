# 创建app实例，注册路由，由run.py启动
from flask import Flask

app = Flask(__name__)

# 导入并注册API蓝图
from app.api.control import init_routes as init_control_routes
init_control_routes(app)

# 导入MQTT客户端类，创建实例并存储在app配置中
from app.mqtt.mqtt_client import MQTTClient
from app.mqtt.handlers import on_upload, on_status
mqtt_client = MQTTClient(on_status=on_status, on_upload=on_upload)
app.config['MQTT_CLIENT'] = mqtt_client

# 在应用启动时连接MQTT服务器
@app.before_first_request
def start_mqtt():
    mqtt_client.start()

# 在应用关闭时断开MQTT连接
@app.teardown_appcontext
def stop_mqtt(exception):
    mqtt_client.stop()
