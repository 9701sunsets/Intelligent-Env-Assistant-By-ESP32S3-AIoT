import pytest
from flask import Flask
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.sensor import init_routes
from app.database.model import Base, SensorData

@pytest.fixture
def app():
    app = Flask(__name__)
    init_routes(app)

    engine = create_engine('sqlite:///:memory:')
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    session = SessionLocal()
    t0 = datetime.fromisoformat("2026-05-17T10:00:00Z")
    rows = [
        SensorData(device_id="esp32_001", temperature=25.5, humidity=55, light=100, comfort="ok", timestamp=t0),
        SensorData(device_id="esp32_001", temperature=26.1, humidity=57, light=120, comfort="ok", timestamp=t0 + timedelta(minutes=5)),
        SensorData(device_id="esp32_002", temperature=22.0, humidity=50, light=80, comfort="ok", timestamp=t0),
    ]
    session.add_all(rows)
    session.commit()
    session.close()

    app.config['DATABASE_SESSION'] = SessionLocal
    return app

def test_history_by_device(app):
    client = app.test_client()
    resp = client.get('/api/history?device_id=esp32_001')
    assert resp.status_code == 200
    j = resp.get_json()
    assert j["code"] == 200
    assert isinstance(j["data"], list)
    assert len(j["data"]) == 2
    assert j["data"][0]["temperature"] == 25.5

def test_history_with_time_range(app):
    client = app.test_client()
    # start after first entry, should return only second
    resp = client.get('/api/history?device_id=esp32_001&start=2026-05-17T10:03:00Z')
    assert resp.status_code == 200
    j = resp.get_json()
    assert len(j["data"]) == 1
    assert j["data"][0]["temperature"] == 26.1

def test_history_invalid_time(app):
    client = app.test_client()
    resp = client.get('/api/history?device_id=esp32_001&start=not-a-time')
    assert resp.status_code == 400
    j = resp.get_json()
    assert j["code"] == 400