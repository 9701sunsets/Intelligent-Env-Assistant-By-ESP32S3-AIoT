from sqlalchemy import create_engine, Column, BigInteger, Integer, Float, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from app.database.model import SensorData, DeviceInfo

Base = declarative_base()


def init_db(database_uri):
    '''初始化数据库连接，创建表结构'''
    engine = create_engine(database_uri, pool_pre_ping=True)# 创建数据库引擎
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)# 创建会话工厂
    Base.metadata.create_all(engine)
    return engine, SessionLocal

def save_sensor_data(session, payload):
    '''保存传感器数据到数据库，payload为MQTT消息解析后的字典'''
    # payload: dict from MQTT JSON
    ts = payload.get("timestamp")
    if isinstance(ts, (int, float)):
        ts_dt = datetime.fromtimestamp(ts)
    elif isinstance(ts, str):
        try:
            ts_dt = datetime.fromisoformat(ts)
        except Exception:
            ts_dt = datetime.utcnow()
    else:
        ts_dt = datetime.utcnow()

    row = SensorData(
        device_id = payload.get("device_id") or payload.get("dev") or "unknown",
        temperature = payload.get("temperature"),
        humidity = payload.get("humidity"),
        light = payload.get("light"),
        comfort = payload.get("comfort"),
        timestamp = ts_dt
    )
    session.add(row)
    session.commit()
    return row.id

def save_device_info(session, payload):
    '''保存设备信息到数据库，payload为MQTT消息解析后的字典'''
    # payload: dict from MQTT JSON
    ts = payload.get("timestamp")
    if isinstance(ts, (int, float)):
        ts_dt = datetime.fromtimestamp(ts)
    elif isinstance(ts, str):
        try:
            ts_dt = datetime.fromisoformat(ts)
        except Exception:
            ts_dt = datetime.utcnow()
    else:
        ts_dt = datetime.utcnow()

    row = DeviceInfo(
        device_id = payload.get("device_id") or payload.get("dev") or "unknown",
        firmware_version = payload.get("firmware_version"),
        status = payload.get("status"),
        last_seen = ts_dt
    )
    session.add(row)
    session.commit()
    return row.id