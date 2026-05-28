from flask import Blueprint, jsonify, current_app, request
from app.database.model import SensorData, DeviceInfo
from sqlalchemy import desc
from datetime import datetime
import time

bp = Blueprint('sensor', __name__, url_prefix='/api')

def init_routes(app):
    app.register_blueprint(bp)

@bp.route('/latest', methods=['GET'])
def latest_sensor():
    """
    返回最近一条传感器数据（全局最新）
    Response:
    {
      "code": 200,
      "data": {
        "device_id": "esp32_001",
        "temperature": 26.5,
        "humidity": 58.2,
        "light": 430,
        "comfort": "comfortable",
        "mq2_ppm": 100.0,
        "mq2_alarm": 0,
        "timestamp": "2024-06-01T12:34:56Z"
      }
    }
    """
    SessionLocal = current_app.config.get('DATABASE_SESSION')
    if not SessionLocal:
        return jsonify({"code": 500, "error": "database not configured"}), 500

    session = SessionLocal()
    try:
        row = session.query(SensorData).order_by(desc(SensorData.timestamp)).first()
        if not row:
            return jsonify({"code": 404, "error": "no data"}), 404

        data = {
            "device_id": row.device_id,
            "temperature": row.temperature,
            "humidity": row.humidity,
            "light": row.light,
            "comfort": row.comfort,
            "mq2_ppm": row.mq2_ppm,
            "mq2_alarm": bool(row.mq2_alarm) if row.mq2_alarm is not None else None,
            "timestamp": row.timestamp.isoformat() if row.timestamp is not None else None
        }
        return jsonify({"code": 200, "data": data}), 200
    finally:
        session.close()

def _parse_iso(dt_s):
    if not dt_s:
        return None
    # 支持带 Z 的 UTC 表示
    if dt_s.endswith("Z"):
        dt_s = dt_s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(dt_s)
    except Exception:
        return None
    
@bp.route('/history', methods=['GET'])
def history_sensor():
    """
    GET /api/history
    Query: device_id, start (ISO), end (ISO)
    返回指定设备和时间范围内的传感器历史（按时间升序）
    """
    device_id = request.args.get('device_id')
    start_s = request.args.get('start')
    end_s = request.args.get('end')

    start_dt = _parse_iso(start_s)
    end_dt = _parse_iso(end_s)
    if (start_s and not start_dt) or (end_s and not end_dt):
        return jsonify({"code": 400, "error": "invalid start/end format"}), 400

    SessionLocal = current_app.config.get('DATABASE_SESSION')
    if not SessionLocal:
        return jsonify({"code": 500, "error": "database not configured"}), 500

    session = SessionLocal()
    try:
        q = session.query(SensorData)
        if device_id:
            q = q.filter(SensorData.device_id == device_id)
        if start_dt:
            q = q.filter(SensorData.timestamp >= start_dt)
        if end_dt:
            q = q.filter(SensorData.timestamp <= end_dt)
        rows = q.order_by(SensorData.timestamp.asc()).all()

        out = []
        for r in rows:
            ts = r.timestamp
            ts_s = ts.isoformat() + "Z" if ts is not None and ts.tzinfo is None else (ts.isoformat() if ts is not None else None)
            out.append({
                "temperature": r.temperature,
                "humidity": r.humidity,
                "light": r.light,
                "comfort": r.comfort,
                "mq2_ppm": r.mq2_ppm,
                "mq2_alarm": bool(r.mq2_alarm) if r.mq2_alarm is not None else None,
                "timestamp": ts_s
            })
        return jsonify({"code": 200, "data": out}), 200
    finally:
        session.close()

@bp.route('/device/list', methods=['GET'])
def device_list():
    """
    返回设备在线列表
    Response:
    {
      "code": 200,
      "data": [
        {
          "device_id": "esp32_001",
          "status": "online",
          "last_seen": "2026-06-01T12:34:56Z"
        },
        {
          "device_id": "esp32_002",
          "status": "online",
          "last_seen": "2026-06-01T12:34:56Z"
        }
      ]
    }
    """
    SessionLocal = current_app.config.get('DATABASE_SESSION')
    data = []

    if SessionLocal:
        session = SessionLocal()
        try:
            rows = session.query(DeviceInfo).order_by(desc(DeviceInfo.last_seen)).all()
            for row in rows:
                data.append({
                    "device_id": row.device_id,
                    "status": row.status or "unknown",
                    "last_seen": row.last_seen.isoformat() if row.last_seen is not None else None
                })
        finally:
            session.close()

    # 如果 DB 没有数据或为空，使用内存中最近上传的记录回退
    if not data:
        latest = current_app.config.get("LATEST_UPLOADS", {})
        for dev_id, entry in latest.items():
            data.append({
                "device_id": dev_id,
                "status": entry.get("data", {}).get("status", "online"),
                "last_seen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(entry.get("ts", time.time())))
            })

    if not data:
        return jsonify({"code": 404, "error": "no data"}), 404

    return jsonify({"code": 200, "data": data}), 200