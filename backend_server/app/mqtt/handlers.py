import json
import os
import time
import logging
from flask import current_app
from app.database.db import save_sensor_data, save_device_info

logger = logging.getLogger(__name__)

def on_upload(data):
    # 简单校验
    device_id = data.get("device_id")
    if not isinstance(data, dict):
        logger.warning("upload payload invalid: %s", data)
        return

    # 持久化到文件（可替换为DB）
    SessionLocal = current_app.config.get('DATABASE_SESSION')
    if SessionLocal is None:
        return
    session = SessionLocal()
    try:
        save_sensor_data(session, data)
    finally:
        session.close()
    entry = {"ts": time.time(), "device_id": device_id, "data": data}

    # 更新内存中的最近一次上报（用于HTTP接口）
    latest = current_app.config.setdefault("LATEST_UPLOADS", {})
    key = device_id or "_unknown"
    latest[key] = entry

    logger.info("Processed upload from %s", key)

def on_status(data):
    # 校验并更新设备状态（可扩展：写DB、触发告警）
    device_id = data.get("device_id")
    if not isinstance(data, dict):
        logger.warning("status payload invalid: %s", data)
        return

    SessionLocal = current_app.config.get('DATABASE_SESSION')
    if SessionLocal is None:
        return
    session = SessionLocal()
    try:
        save_device_info(session, data)
    finally:
        session.close()
    entry = {"ts": time.time(), "device_id": device_id, "data": data}

    # 更新内存中的最近一次上报（用于HTTP接口）
    latest = current_app.config.setdefault("LATEST_UPLOADS", {})
    key = device_id or "_unknown"
    latest[key] = entry

    logger.info("Updated status for %s: %s", device_id, data)