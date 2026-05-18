# TODO: 增加真实数据库的测试
import pytest
from flask import Flask
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.sensor import init_routes
from app.database.model import Base, DeviceInfo

@pytest.fixture
def app():
    app = Flask(__name__)
    init_routes(app)

    # in-memory sqlite for testing
    engine = create_engine('sqlite:///:memory:')
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    # insert a sample row
    session = SessionLocal()
    sample = [ 
        DeviceInfo(device_id="esp32_001",status="online",last_seen=datetime.fromisoformat("2026-05-17T14:30:25")),
        DeviceInfo(device_id="esp32_002",status="offline",last_seen=datetime.fromisoformat("2026-05-17T13:20:00"))
    ]
    session.add_all(sample)
    session.commit()
    session.close()

    app.config['DATABASE_SESSION'] = SessionLocal
    return app

def test_device_list_ok(app):
    client = app.test_client()
    resp = client.get('/api/device/list')
    assert resp.status_code == 200
    j = resp.get_json()
    assert j["code"] == 200
    d = j["data"]
    assert d[0]["device_id"] == "esp32_001"
    assert d[0]["status"] == "online"
    # API 目前返回的时间可能带有 "+00:00" 或不带时区，断言前缀更稳健
    assert d[0]["last_seen"].startswith("2026-05-17T14:30:25")