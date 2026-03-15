from jose import jwt
from datetime import datetime, timedelta
import os

# Configurações de Segurança do JWT (copiadas do auth.py)
SECRET_KEY = "b339f4e2f9d51e7fb2a9d9c2a382e8f1bb8242b9d88ab2956cfef"
ALGORITHM = "HS256"

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Gerar token para o usuário 'admin' com role 'admin'
token = create_access_token(data={"sub": "admin", "role": "admin"})
print(token)
