import pytest
from flask import Flask
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.sensor import init_routes
from app.database.model import Base, SensorData

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
    sample = SensorData(
        device_id="esp32_001",
        temperature=26.5,
        humidity=58.2,
        light=430,
        comfort="comfortable",
        timestamp=datetime.fromisoformat("2026-05-17T14:30:25")
    )
    session.add(sample)
    session.commit()
    session.close()

    app.config['DATABASE_SESSION'] = SessionLocal
    return app

def test_latest_sensor_ok(app):
    client = app.test_client()
    resp = client.get('/api/latest')
    assert resp.status_code == 200
    j = resp.get_json()
    assert j["code"] == 200
    d = j["data"]
    assert d["device_id"] == "esp32_001"
    assert abs(d["temperature"] - 26.5) < 1e-6
    assert abs(d["humidity"] - 58.2) < 1e-6
    assert d["light"] == 430
    assert d["comfort"] == "comfortable"
    assert d["timestamp"].startswith("2026-05-17T14:30:25")