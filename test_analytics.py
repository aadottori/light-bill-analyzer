import requests
import json
import sqlite3

# 1. Obter o Hash de login test_admin/admin123 (nós criamos isso antes?)
# Ou vamos simplesmente forçar um token rápido importando do backend
import sys
sys.path.append('.')
from backend.auth import create_access_token
from datetime import timedelta

token = create_access_token(data={"sub": "admin"}, expires_delta=timedelta(minutes=15))

headers = {"Authorization": f"Bearer {token}"}
print("--- TESTANDO /kpis ---")
r = requests.get("http://localhost:8000/analytics/kpis", headers=headers)
print(r.status_code, r.text)

print("\n--- TESTANDO /trends ---")
r = requests.get("http://localhost:8000/analytics/trends", headers=headers)
print(r.status_code, r.text)

