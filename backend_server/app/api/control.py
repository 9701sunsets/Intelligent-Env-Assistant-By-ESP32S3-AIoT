from flask import Blueprint, request, jsonify
from werkzeug.exceptions import BadRequest

bp = Blueprint('control', __name__, url_prefix='/api')

# 在应用中应注入 mqtt_client 实例，例如 app.config['MQTT_CLIENT']
def init_routes(app):
    app.register_blueprint(bp)
    # expect mqtt client stored as app.config['MQTT_CLIENT']

@bp.route('/control', methods=['POST'])
def send_control():
    mqtt_client = bp.root_path  # placeholder to satisfy linters if static analysis; real app should use app context
    # proper retrieval:
    from flask import current_app
    mqtt_client = current_app.config.get('MQTT_CLIENT')
    if not mqtt_client:
        return jsonify({"error": "MQTT client not configured"}), 500

    try:
        body = request.get_json(force=True)
    except BadRequest:
        return jsonify({"error": "invalid json"}), 400

    device_id = body.get('device_id')
    command = body.get('command')
    if command is None:
        return jsonify({"error": "missing `command`"}), 400

    ok = mqtt_client.publish_control(device_id=device_id, command=command)
    if ok:
        return jsonify({"status": "sent"}), 200
    else:
        return jsonify({"status": "failed"}), 500