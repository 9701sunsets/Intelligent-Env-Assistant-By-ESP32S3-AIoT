# backend_server/test/conftest.py
import sys
from pathlib import Path

# __file__ 位于 backend_server/test/, parents[1] 指向 backend_server 根
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))