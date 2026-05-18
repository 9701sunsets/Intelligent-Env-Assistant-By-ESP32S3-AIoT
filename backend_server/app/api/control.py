from flask import Blueprint, request, jsonify
from werkzeug.exceptions import BadRequest

# 这个模块定义了控制命令的HTTP接口，接收来自前端的控制请求，并通过MQTT客户端发布到设备
bp = Blueprint('control', __name__, url_prefix='/api')

# 在应用中应注入 mqtt_client 实例，例如 app.config['MQTT_CLIENT']
def init_routes(app):
    app.register_blueprint(bp)
    # expect mqtt client stored as app.config['MQTT_CLIENT']

@bp.route('/device/control', methods=['POST'])
def send_control():
    '''
    接收控制命令并通过MQTT发布
    请求体JSON格式示例：
    {
        "device_id": "esp32_001",
        "target": "led",
        "action": {
            "state": "on",
            "color": "red",
            "value": 1
        }
    }
    '''
    mqtt_client = bp.root_path  # 用于满足静态代码检查工具的占位内容；实际应用程序应使用应用上下文
    # 精准获取 MQTT 客户端实例:
    from flask import current_app
    mqtt_client = current_app.config.get('MQTT_CLIENT')
    if not mqtt_client:
        return jsonify({"code": 500, "error": "MQTT client not configured"}), 500

    try:
        body = request.get_json(force=True)
    except BadRequest:
        return jsonify({"code": 400, "error": "invalid json"}), 400

    device_id = body.get('device_id')
    target = body.get('target')
    action = body.get('action')
    # 设备不存在
    if device_id is None:
        return jsonify({"code": 404, "error": "missing `device_id`"}), 404
    if target is None or action is None:
        return jsonify({"code": 400, "error": "missing `target` or `action`"}), 400

    ok = mqtt_client.publish_control(device_id=device_id, target=target, action=action) # 将控制命令发布到MQTT服务器，mqtt_client负责将其转发给设备
    if ok:
        return jsonify({"code": 200, "message": "Control command sent successfully"}), 200
    else:
        return jsonify({"code": 500, "message": "Failed to send control command"}), 500