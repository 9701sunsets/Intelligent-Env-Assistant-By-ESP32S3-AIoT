import json
import os
import time
import logging
from flask import current_app
from app.database.db import save_sensor_data, save_device_info

logger = logging.getLogger(__name__)

def _to_float(v):
    try:
        return float(v)
    except Exception:
        return None

def _sanitize_payload(payload, last_entry=None):
    p = dict(payload)  # shallow copy
    t = _to_float(p.get("temperature"))
    h = _to_float(p.get("humidity"))
    light = p.get("light") or 0
    # 规则：若同时为 0 且光照合理（设备在场），则认为读数异常
    if (t == 0 or t is None) and (h == 0 or h is None) and (light and int(light) > 50):
        # 若有上次有效值则回退到上次值
        if last_entry and isinstance(last_entry.get("data"), dict):
            prev = last_entry["data"]
            p["temperature"] = prev.get("temperature")
            p["humidity"] = prev.get("humidity")
            p["_suspicious_zero"] = True
        else:
            p["temperature"] = None
            p["humidity"] = None
            p["_suspicious_zero"] = True
    else:
        # 确保类型正确
        if t is not None:
            p["temperature"] = t
        if h is not None:
            p["humidity"] = h
    return p

def on_upload(data):
    # 简单校验
    device_id = data.get("device_id")
    if not isinstance(data, dict):
        logger.warning("upload payload invalid: %s", data)
        return
    
    t = data.get("temperature")
    h = data.get("humidity")
    if t == 0 and h == 0 and (data.get("light") or 0) > 0:
        logger.warning("Suspicious zero temp/humidity from %s, skipping save: %s", device_id, data)
        return  # 或者把 temperature/humidity 设为 None 再存

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
    last_entry = latest.get(key)
    cleaned = _sanitize_payload(data, last_entry)
    # 如果想要跳过写 DB 当可疑，则根据需要决定；这里用 cleaned 写入 DB（若值为 None，DB 字段会保存 NULL）
    session = SessionLocal()
    try:
        save_sensor_data(session, cleaned)
    finally:
        session.close()
    # 更新内存中的最近一次上报（用于 HTTP 接口）
    entry = {"ts": time.time(), "device_id": device_id, "data": cleaned}
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