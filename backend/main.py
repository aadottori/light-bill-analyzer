from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine, Base, get_db
from backend.models import BillCreate, Bill, BillItem, Unit, UnitCreate, User
from pydantic import BaseModel
from typing import Optional
from backend.auth import get_password_hash, verify_password, create_access_token, get_current_admin_user, get_current_user
import os
import shutil
import uuid
import re
from backend.parser import parse_pdf, parse_moeda

# Criar tabelas no banco de dados
Base.metadata.create_all(bind=engine)

app = FastAPI(title="UFRJ PDF Parser API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/upload")
async def upload_pdf(files: list[UploadFile] = File(...), current_user: User = Depends(get_current_admin_user)):
    results = []
    
    for file in files:
        if not file.filename.endswith(".pdf"):
            results.append({"filename": file.filename, "success": False, "error": "Only PDF files are allowed"})
            continue
        
        file_id = str(uuid.uuid4())
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        try:
            extracted_data = parse_pdf(file_path)
            results.append({"filename": file.filename, "success": True, "data": extracted_data})
        except Exception as e:
            results.append({"filename": file.filename, "success": False, "error": str(e)})

    return {"results": results}

# Função utilitária para converter str formatada para número do banco
def db_parse_numeric(val: str):
    if not val:
        return None
    # val pode ser '2.804,15', remover pontos de milhar, trocar virgula por ponto
    clean_val = val.replace('.', '').replace(',', '.')
    try:
        return float(clean_val)
    except:
        return None

# Função utilitária para converter mes_referencia pt-BR em Date, aqui armazenaremos como string mm/yyyy
def db_parse_date(val: str):
    from datetime import datetime
    if not val:
        return None
    try:
        # Ex: "10/03/2025"
        return datetime.strptime(val, "%d/%m/%Y").date()
    except:
        return None

@app.get("/bills/check")
async def check_bill(installation_code: str, reference_month: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    existing = db.query(Bill).filter(
        Bill.installation_code == installation_code,
        Bill.reference_month == reference_month
    ).first()
    if existing:
        return {"success": True, "exists": True, "bill_id": existing.id}
    return {"success": True, "exists": False}

@app.post("/bills")
async def save_bill(bill_in: BillCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    # Lógica de auto-associação ao Prédio
    unit_id = bill_in.unit_id
    if unit_id is None and bill_in.installation_code:
        unit = db.query(Unit).filter(Unit.installation_code == bill_in.installation_code).first()
        if unit:
            unit_id = unit.id

    db_bill = Bill(
        installation_code=bill_in.installation_code,
        contract_account=bill_in.contract_account,
        reference_month=bill_in.reference_month,
        due_date=db_parse_date(bill_in.due_date),
        total_amount=db_parse_numeric(bill_in.total_amount),
        unit_id=unit_id
    )
    
    # Criar relação One-to-Many
    for item in bill_in.items:
        db_item = BillItem(
            description=item.description,
            quantity=db_parse_numeric(item.quantity),
            unit_price=db_parse_numeric(item.unit_price),
            amount=db_parse_numeric(item.amount)
        )
        db_bill.items.append(db_item)
    
    db.add(db_bill)
    db.commit()
    db.refresh(db_bill)
    
    return {"success": True, "id": db_bill.id}

@app.put("/bills/{bill_id}")
async def update_bill(bill_id: int, bill_in: BillCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not db_bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    db_bill.installation_code = bill_in.installation_code
    db_bill.contract_account = bill_in.contract_account
    db_bill.reference_month = bill_in.reference_month
    db_bill.due_date = db_parse_date(bill_in.due_date)
    db_bill.total_amount = db_parse_numeric(bill_in.total_amount)
    
    unit_id = bill_in.unit_id
    if unit_id is None and bill_in.installation_code:
        unit = db.query(Unit).filter(Unit.installation_code == bill_in.installation_code).first()
        if unit:
            unit_id = unit.id
    db_bill.unit_id = unit_id
    
    db.query(BillItem).filter(BillItem.bill_id == bill_id).delete()
    
    for item in bill_in.items:
        db_item = BillItem(
            bill_id=bill_id,
            description=item.description,
            quantity=db_parse_numeric(item.quantity),
            unit_price=db_parse_numeric(item.unit_price),
            amount=db_parse_numeric(item.amount)
        )
        db.add(db_item)
        
    db.commit()
    return {"success": True, "id": db_bill.id}

@app.delete("/bills/{bill_id}")
async def delete_bill(bill_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not db_bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    db.delete(db_bill)
    db.commit()
    return {"success": True, "message": "Bill deleted successfully"}

@app.get("/bills")
async def list_bills(
    reference_month: Optional[str] = None,
    installation_code: Optional[str] = None,
    unit_id: Optional[int] = None,
    sort_amount: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = db.query(Bill)
    
    if reference_month:
        query = query.filter(Bill.reference_month.ilike(f"%{reference_month.strip()}%"))
    if installation_code:
        query = query.filter(Bill.installation_code.ilike(f"%{installation_code.strip()}%"))
    if unit_id is not None:
        query = query.filter(Bill.unit_id == unit_id)
        
    if sort_amount == "asc":
        query = query.order_by(Bill.total_amount.asc())
    elif sort_amount == "desc":
        query = query.order_by(Bill.total_amount.desc())
        
    bills = query.all()
    # Em backend real usamos schemas de response com ORM_mode. Aqui contornamos rápido.
    result = []
    for f in bills:
        p_name = ""
        if f.unit_id:
            p = db.query(Unit).filter(Unit.id == f.unit_id).first()
            if p: p_name = p.name
            
        result.append({
            "id": f.id,
            "installation_code": f.installation_code,
            "contract_account": f.contract_account,
            "reference_month": f.reference_month,
            "due_date": str(f.due_date) if f.due_date else None,
            "total_amount": float(f.total_amount) if f.total_amount else None,
            "unit_name": p_name
        })
    return {"success": True, "data": result}
    
@app.get("/bills/{bill_id}")
async def get_bill_details(bill_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    # Carregar o nome do prédio associado (se houver)
    unit_name = None
    if bill.unit_id:
        p = db.query(Unit).filter(Unit.id == bill.unit_id).first()
        if p: unit_name = p.name
        
    return {
        "success": True,
        "data": {
            "id": bill.id,
            "installation_code": bill.installation_code,
            "contract_account": bill.contract_account,
            "reference_month": bill.reference_month,
            "due_date": str(bill.due_date) if bill.due_date else None,
            "total_amount": float(bill.total_amount) if bill.total_amount else None,
            "unit_name": unit_name,
            "items": [
                {
                    "description": item.description,
                    "quantity": float(item.quantity) if item.quantity else None,
                    "unit_price": float(item.unit_price) if item.unit_price else None,
                    "amount": float(item.amount) if item.amount else None
                } for item in bill.items
            ]
        }
    }

@app.get("/bill-items/descriptions")
async def list_distinct_descriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Busca todas as descrições únicas já salvas para Autocomplete
    descriptions = db.query(BillItem.description).distinct().all()
    # descompacta lista de tuplas [(desc1,), (desc2,)] para [desc1, desc2]
    clean_list = [desc[0] for desc in descriptions if desc[0]] 
    return {"success": True, "data": clean_list}

@app.get("/bills/months")
async def list_distinct_months(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    months = db.query(Bill.reference_month).distinct().all()
    clean_list = list(set([m[0].strip() for m in months if m[0]]))
    return {"success": True, "data": sorted(clean_list)}

@app.get("/bills/installations")
async def list_distinct_installations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    installations = db.query(Bill.installation_code).distinct().all()
    clean_list = list(set([i[0].strip() for i in installations if i[0]]))
    return {"success": True, "data": sorted(clean_list)}

@app.get("/units")
async def list_units(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    units = db.query(Unit).all()
    return {"success": True, "data": [{"id": p.id, "name": p.name, "installation_code": p.installation_code} for p in units]}

@app.post("/units")
async def create_unit(unit_in: UnitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = Unit(name=unit_in.name, installation_code=unit_in.installation_code)
    db.add(db_unit)
    db.commit()
    db.refresh(db_unit)
    return {"success": True, "id": db_unit.id}

@app.put("/units/{unit_id}")
async def update_unit(unit_id: int, unit_in: UnitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    db_unit.name = unit_in.name
    db_unit.installation_code = unit_in.installation_code
    db.commit()
    db.refresh(db_unit)
    return {"success": True, "id": db_unit.id}

@app.delete("/units/{unit_id}")
async def delete_unit(unit_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    # Check if there are related faturas, and unlink them or block
    if db_unit.bills:
        for f in db_unit.bills:
            f.unit_id = None
            
    db.delete(db_unit)
    db.commit()
    return {"success": True, "message": "Unit deleted successfully"}

# --- Auth Routes ---
class UserLogin(BaseModel):
    username: str
    password: str
    secret: Optional[str] = None

@app.post("/signup")
async def signup(user: UserLogin, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Usuário já existe")
    
    hashed = get_password_hash(user.password)
    
    role = "viewer"
    if user.secret == "tcc_admin_123":
        role = "admin"
        
    new_user = User(username=user.username, hashed_password=hashed, role=role)
    db.add(new_user)
    db.commit()
    return {"success": True, "message": f"Usuário criado com sucesso! Papel: {role}"}

@app.post("/login")
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais Inválidas")
    
    token = create_access_token(data={"sub": db_user.username, "role": db_user.role})
    return {"success": True, "access_token": token, "token_type": "bearer", "role": db_user.role, "username": db_user.username}
