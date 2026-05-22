from flask import Blueprint, request, jsonify, current_app
from werkzeug.exceptions import BadRequest

# 这个模块定义了控制命令的HTTP接口，接收来自前端的控制请求，并通过MQTT客户端发布到设备
bp = Blueprint('ai', __name__, url_prefix='/api')

# 在应用中应注入 mqtt_client 实例，例如 app.config['MQTT_CLIENT']
def init_routes(app):
    app.register_blueprint(bp)

@bp.route('/ai/advice', methods=['POST'])
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
        return jsonify({"code": 200, "data": result}), 200
    except Exception:
        return jsonify({"code": 500, "error": "LLM service error"}), 500
    
@bp.route('/ai/chat', methods=['POST'])
def ai_chat():
    '''
    接收AI聊天消息并通过MQTT发布
    请求体JSON格式示例:
    {
        "device_id": "esp32_001",
        "question": "现在适合睡觉吗？"
    }
    '''
    try:
        body = request.get_json(force=True)
    except BadRequest:
        return jsonify({"code": 400, "error": "invalid json"}), 400

    device_id = body.get('device_id')
    question = body.get('question')

    if device_id is None:
        return jsonify({"code": 404, "error": "missing `device_id`"}), 404
    if question is None:
        return jsonify({"code": 400, "error": "missing `question`"}), 400

    llm_service = current_app.config.get('LLM_SERVICE')
    if not llm_service:
        return jsonify({"code": 500, "error": "LLM service not configured"}), 500

    # 尝试获取该设备最新的传感器数据
    temperature = humidity = light = None
    SessionLocal = current_app.config.get('DATABASE_SESSION')
    try:
        if SessionLocal:
            session = SessionLocal()
            try:
                from app.database.model import SensorData
                from sqlalchemy import desc
                row = session.query(SensorData).filter(SensorData.device_id == device_id).order_by(desc(SensorData.timestamp)).first()
                if row:
                    temperature = row.temperature
                    humidity = row.humidity
                    light = row.light
            finally:
                session.close()
    except Exception:
        # 忽略 DB 查询错误，使用回退
        current_app.logger.exception("Failed to load latest sensor data from DB")

    if temperature is None or humidity is None or light is None:
        latest = current_app.config.get("LATEST_UPLOADS", {})
        entry = latest.get(device_id) or {}
        data = entry.get("data", {})
        temperature = temperature if temperature is not None else data.get("temperature")
        humidity = humidity if humidity is not None else data.get("humidity")
        light = light if light is not None else data.get("light")

    # 构建传入 LLM 的 payload（包含 question 与可用的传感器上下文）
    payload = {
        "device_id": device_id,
        "question": question,
        "temperature": temperature,
        "humidity": humidity,
        "light": light
    }
    try:
        result = llm_service.generate_advice(payload)
        
        # 处理多种可能的返回结构，确保前端收到 data.answer 字段
        if isinstance(result, dict):
            answer = result.get("answer") or result.get("advice") or result.get("text") or ""
            return jsonify({"code": 200, "data": {"answer": answer}}), 200
        else:
            return jsonify({"code": 200, "data": {"answer": str(result)}}), 200
    except Exception as e:
        current_app.logger.exception("LLM chat error")
        return jsonify({"code": 500, "error": "LLM service error"}), 500