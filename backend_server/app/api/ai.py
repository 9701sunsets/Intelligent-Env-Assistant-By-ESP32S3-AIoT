from flask import Blueprint, request, jsonify, current_app
from werkzeug.exceptions import BadRequest

# 这个模块定义了控制命令的HTTP接口，接收来自前端的控制请求，并通过MQTT客户端发布到设备
bp = Blueprint('ai', __name__, url_prefix='/api')

# 在应用中应注入 mqtt_client 实例，例如 app.config['MQTT_CLIENT']
def init_routes(app):
    app.register_blueprint(bp)

@bp.route('/api/ai/advice', methods=['POST'])
def ai_advice():
    '''
    接收AI建议并通过MQTT发布
    请求体JSON格式示例:
    {
        "device_id": "esp32_001",
        "temperature": 25.5,
        "humidity": 60,
        "light": 300,
    }
    '''
    try:
        body = request.get_json(force=True)
    except BadRequest:
        return jsonify({"code": 400, "error": "invalid json"}), 400

    device_id = body.get('device_id')
    temperature = body.get('temperature')
    humidity = body.get('humidity')
    light = body.get('light')

    if device_id is None:
        return jsonify({"code": 404, "error": "missing `device_id`"}), 404
    if temperature is None or humidity is None or light is None:
        return jsonify({"code": 400, "error": "missing `temperature`/`humidity`/`light`"}), 400

    llm_service = current_app.config.get('LLM_SERVICE')
    if not llm_service:
        return jsonify({"code": 500, "error": "LLM service not configured"}), 500

    try:
        result = llm_service.generate_advice({
            "device_id": device_id,
            "temperature": temperature,
            "humidity": humidity,
            "light": light
        })
    except Exception:
        return jsonify({"code": 500, "error": "LLM service error"}), 500