from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.database import get_db
from backend.models import User
from backend.auth import get_password_hash, verify_password, create_access_token

router = APIRouter()


class UserLogin(BaseModel):
    username: str
    password: str
    secret: Optional[str] = None

@router.post("/signup")
async def signup(user: UserLogin, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Usuário já existe")
    
    hashed = get_password_hash(user.password)
    
    role = "viewer"
    if user.secret == "tcc":
        role = "admin"
        
    new_user = User(username=user.username, hashed_password=hashed, role=role)
    db.add(new_user)
    db.commit()
    return {"success": True, "message": f"Usuário criado com sucesso! Papel: {role}"}

@router.post("/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais Inválidas")
    
    token = create_access_token(data={"sub": db_user.username, "role": db_user.role})
    return {"success": True, "access_token": token, "token_type": "bearer", "role": db_user.role, "username": db_user.username}
