# backend/ota_oss.py
import os, hashlib, time
from flask import Flask, jsonify, request
import oss2

app = Flask(__name__)

# 从环境变量读取 AK/SK/endpoint/bucket
OSS_ENDPOINT = os.environ['OSS_ENDPOINT']
OSS_ACCESS_KEY_ID = os.environ['OSS_ACCESS_KEY_ID']
OSS_ACCESS_KEY_SECRET = os.environ['OSS_ACCESS_KEY_SECRET']
OSS_BUCKET = os.environ['OSS_BUCKET']

auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
bucket = oss2.Bucket(auth, OSS_ENDPOINT, OSS_BUCKET)

def sha256_file(path):
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            h.update(chunk)
    return h.hexdigest()

@app.route('/upload_firmware', methods=['POST'])
def upload_firmware():
    # POST JSON: {"local_path": "...", "object_name": "...", "expire": 3600}
    data = request.json
    local_path = data['local_path']
    object_name = data.get('object_name', os.path.basename(local_path))
    expire = int(data.get('expire', 3600))
    # 上传
    bucket.put_object_from_file(object_name, local_path)
    # 生成签名 URL（GET）
    signed_url = bucket.sign_url('GET', object_name, expire)
    digest = sha256_file(local_path)
    size = os.path.getsize(local_path)
    return jsonify({
        "object": object_name,
        "url": signed_url,
        "expire_seconds": expire,
        "sha256": digest,
        "size": size
    })

@app.route('/get_firmware_for_device', methods=['GET'])
def get_firmware_for_device():
    # 生产环境设备鉴权并根据设备型号返回对应 object
    object_name = request.args.get('object')
    expire = int(request.args.get('expire', 600))
    signed_url = bucket.sign_url('GET', object_name, expire)
    # 可从 OSS 或本地维护一个 manifest 存储版本/sha256等
    return jsonify({"url": signed_url, "expire": expire})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)