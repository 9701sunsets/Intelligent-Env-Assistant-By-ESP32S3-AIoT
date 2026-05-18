from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, BigInteger
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class SensorData(Base):
    '''传感器数据表结构定义'''
    __tablename__ = "sensor_data"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(String(128), nullable=False)
    temperature = Column(Float)
    humidity = Column(Float)
    light = Column(Integer)
    comfort = Column(String(64))
    timestamp = Column(DateTime, nullable=False)

class DeviceInfo(Base):
    '''设备信息表结构定义'''
    __tablename__ = "device_info"
    device_id = Column(String(128), nullable=False)
    firmware_version = Column(String(64), nullable=True)
    status = Column(String(256), nullable=True)
    last_seen = Column(DateTime, nullable=False)