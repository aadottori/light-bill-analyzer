from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine, Base, get_db
from backend.models import FaturaCreate, Fatura, FaturaItem, Predio, PredioCreate
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
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        return {"error": "Only PDF files are allowed"}
    
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        extracted_data = parse_pdf(file_path)
        return {"success": True, "data": extracted_data}
    except Exception as e:
        return {"success": False, "error": str(e)}

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

@app.post("/faturas")
async def save_fatura(fatura_in: FaturaCreate, db: Session = Depends(get_db)):
    # Lógica de auto-associação ao Prédio
    predio_id = fatura_in.predio_id
    if predio_id is None and fatura_in.conta_contrato:
        predio = db.query(Predio).filter(Predio.conta_contrato == fatura_in.conta_contrato).first()
        if predio:
            predio_id = predio.id

    db_fatura = Fatura(
        conta_contrato=fatura_in.conta_contrato,
        mes_referencia=fatura_in.mes_referencia,
        vencimento=db_parse_date(fatura_in.vencimento),
        valor_total=db_parse_numeric(fatura_in.valor_total),
        predio_id=predio_id
    )
    
    # Criar relação One-to-Many
    for item in fatura_in.itens:
        db_item = FaturaItem(
            descricao=item.descricao,
            quantidade=db_parse_numeric(item.quantidade),
            preco_unitario=db_parse_numeric(item.preco_unitario),
            valor=db_parse_numeric(item.valor)
        )
        db_fatura.itens.append(db_item)
    
    db.add(db_fatura)
    db.commit()
    db.refresh(db_fatura)
    
    return {"success": True, "id": db_fatura.id}

@app.get("/faturas")
async def list_faturas(db: Session = Depends(get_db)):
    faturas = db.query(Fatura).all()
    # Em backend real usamos schemas de response com ORM_mode. Aqui contornamos rápido.
    result = []
    for f in faturas:
        p_nome = ""
        if f.predio_id:
            p = db.query(Predio).filter(Predio.id == f.predio_id).first()
            if p: p_nome = p.nome
            
        result.append({
            "id": f.id,
            "conta_contrato": f.conta_contrato,
            "mes_referencia": f.mes_referencia,
            "vencimento": str(f.vencimento) if f.vencimento else None,
            "valor_total": float(f.valor_total) if f.valor_total else None,
            "predio_nome": p_nome
        })
    return {"success": True, "data": result}
    
@app.get("/predios")
async def list_predios(db: Session = Depends(get_db)):
    predios = db.query(Predio).all()
    return {"success": True, "data": [{"id": p.id, "nome": p.nome, "conta_contrato": p.conta_contrato} for p in predios]}

@app.post("/predios")
async def create_predio(predio_in: PredioCreate, db: Session = Depends(get_db)):
    db_predio = Predio(nome=predio_in.nome, conta_contrato=predio_in.conta_contrato)
    db.add(db_predio)
    db.commit()
    db.refresh(db_predio)
    return {"success": True, "id": db_predio.id}
