from sqlalchemy import create_engine, Column, BigInteger, Integer, Float, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from app.database.model import SensorData, DeviceInfo, Base
from app.mqtt.handlers import _to_float

ADC_TO_LUX = 411800

def _normalize_timestamp(ts):
    """返回 UTC 的 datetime；若 DB 需要 naive UTC，可调用 .replace(tzinfo=None) 再存。"""
    if ts is None:
        return datetime.utcnow().replace(tzinfo=timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(ts, str):
        s = ts.strip()
        # 支持末尾 z 或 Z 表示 UTC
        if s.endswith('z') or s.endswith('Z'):
            s = s[:-1] + '+00:00'
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            # 若可用，尝试用 dateutil 解析更宽松的格式（可选依赖）
            try:
                from dateutil import parser
                dt = parser.isoparse(s)
            except Exception:
                return datetime.utcnow().replace(tzinfo=timezone.utc)
        # 统一为 timezone-aware UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    return datetime.utcnow().replace(tzinfo=timezone.utc)

def init_db(database_uri):
    '''初始化数据库连接，创建表结构'''
    engine = create_engine(database_uri, pool_pre_ping=True)# 创建数据库引擎
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)# 创建会话工厂
    Base.metadata.create_all(engine)
    return engine, SessionLocal

def save_sensor_data(session, payload):
    '''保存传感器数据到数据库，payload为MQTT消息解析后的字典'''
    # payload: dict from MQTT JSON
    dt = _normalize_timestamp(payload.get("timestamp"))
    ts_dt = dt.replace(tzinfo=None)
    
    # 在构造 row 之前进行范围校验
    def _valid_temperature(t):
        return t is None or (-50.0 <= t <= 85.0)

    def _valid_humidity(h):
        return h is None or (0.0 <= h <= 100.0)

    temp = payload.get("temperature")
    hum = payload.get("humidity")
    if not _valid_temperature(temp):
        temp = None
    if not _valid_humidity(hum):
        hum = None

    mq2 = payload.get("mq2") if isinstance(payload.get("mq2"), dict) else {}
    mq2_ppm = _to_float(mq2.get("ppm_est") or payload.get("ppm_est"))
    mq2_alarm = mq2.get("alarm")
    if mq2_alarm is None:
        mq2_alarm = 1 if mq2_alarm else 0
    else:
        try:
            mq2_alarm = int(mq2_alarm) if mq2_alarm is not None else None
        except Exception:
            mq2_alarm = None

    row = SensorData(
        device_id = payload.get("device_id") or payload.get("dev") or "unknown",
        temperature = temp,
        humidity = hum,
        light = ADC_TO_LUX // payload.get("light"),
        comfort = payload.get("comfort"),
        mq2_ppm = mq2_ppm,
        mq2_alarm = mq2_alarm,
        timestamp = ts_dt
    )
    session.add(row)
    session.commit()
    return row.id

def save_device_info(session, payload):
    '''保存设备信息到数据库，payload为MQTT消息解析后的字典'''
    # payload: dict from MQTT JSON
    dt = _normalize_timestamp(payload.get("timestamp"))
    ts_dt = dt.replace(tzinfo=None)


    device_id = payload.get("device_id") or payload.get("dev") or "unknown"
    firmware_version = payload.get("firmware_version")
    status = payload.get("status")

    try:
        existing = session.get(DeviceInfo, device_id)
        if existing:
            existing.firmware_version = firmware_version
            existing.status = status
            existing.last_seen = ts_dt
            session.add(existing)
            session.commit()
            return existing.device_id
        else:
            row = DeviceInfo(
                device_id=device_id,
                firmware_version=firmware_version,
                status=status,
                last_seen=ts_dt
            )
            session.add(row)
            session.commit()
            return row.device_id
    except Exception:
        session.rollback()
        raise