from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import BillCreate, Bill, BillItem, Unit, User, AiCompareRequest, AiConfigInput, BILL_DEMAND_FIELDS
from backend.auth import get_current_admin_user, get_current_user
from backend.parser import parse_pdf
from backend.ai_parser import parse_pdf_ai, get_api_key
from backend.reconciler import reconcile_extractions
from typing import Optional
from datetime import datetime
import os
import shutil
import uuid
import io
import pandas as pd

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# --- Utility functions ---

def db_parse_numeric(val: str):
    if not val:
        return None
    clean_val = val.replace('.', '').replace(',', '.')
    try:
        return float(clean_val)
    except:
        return None

def apply_demand_fields(db_bill: Bill, bill_in: BillCreate):
    db_bill.tariff_modality = bill_in.tariff_modality
    for field in BILL_DEMAND_FIELDS:
        setattr(db_bill, field, db_parse_numeric(getattr(bill_in, field)))

def demand_fields_out(bill: Bill) -> dict:
    out = {"tariff_modality": bill.tariff_modality}
    for field in BILL_DEMAND_FIELDS:
        val = getattr(bill, field)
        # Formato brasileiro, como os demais campos editáveis, para o round-trip do PUT
        out[field] = f"{float(val):.2f}".replace(".", ",") if val is not None else None
    return out

def db_parse_date(val: str):
    if not val:
        return None
    try:
        return datetime.strptime(val, "%d/%m/%Y").date()
    except:
        return None


# --- Upload ---

@router.post("/upload")
async def upload_pdf(
    files: list[UploadFile] = File(...), 
    use_ai: bool = Query(False),
    api_key: Optional[str] = Query(None),
    current_user: User = Depends(get_current_admin_user)
):
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
            # 1. Interpretação padrão pelo parser local (regex)
            regex_data = parse_pdf(file_path)
            regex_data["original_file_name"] = file.filename
            regex_data["_file_path"] = file_path
            
            final_data = regex_data
            reconciliation_result = None
            
            # 2. Se a opção de IA estiver ativa, realiza extração paralela no Google AI Studio
            if use_ai:
                ai_res = parse_pdf_ai(file_path, api_key=api_key)
                if ai_res.get("success") and ai_res.get("data"):
                    reconciliation = reconcile_extractions(regex_data, ai_res["data"])
                    final_data = reconciliation["active_data"]
                    final_data["original_file_name"] = file.filename
                    final_data["_file_path"] = file_path
                    reconciliation_result = reconciliation

            results.append({
                "filename": file.filename, 
                "success": True, 
                "data": final_data,
                "reconciliation": reconciliation_result
            })
        except Exception as e:
            results.append({"filename": file.filename, "success": False, "error": str(e)})

    return {"results": results}


# --- CRUD Bills ---

@router.get("/bills/check")
async def check_bill(installation_code: str, reference_month: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    existing = db.query(Bill).filter(
        Bill.installation_code == installation_code,
        Bill.reference_month == reference_month
    ).first()
    if existing:
        return {"success": True, "exists": True, "bill_id": existing.id}
    return {"success": True, "exists": False}

@router.post("/bills")
async def save_bill(bill_in: BillCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
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
        unit_id=unit_id,
        imported_at=datetime.utcnow().isoformat(),
        imported_by=current_user.username,
        original_file_name=bill_in.original_file_name
    )
    apply_demand_fields(db_bill, bill_in)

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

@router.put("/bills/{bill_id}")
async def update_bill(bill_id: int, bill_in: BillCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not db_bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
    db_bill.installation_code = bill_in.installation_code
    db_bill.contract_account = bill_in.contract_account
    db_bill.reference_month = bill_in.reference_month
    db_bill.due_date = db_parse_date(bill_in.due_date)
    db_bill.total_amount = db_parse_numeric(bill_in.total_amount)
    apply_demand_fields(db_bill, bill_in)

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

@router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not db_bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    db.delete(db_bill)
    db.commit()
    return {"success": True, "message": "Bill deleted successfully"}

@router.get("/bills")
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
    
@router.get("/bills/export")
async def export_bills(
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
    
    data_list = []
    
    for f in bills:
        p_name = ""
        if f.unit_id:
            p = db.query(Unit).filter(Unit.id == f.unit_id).first()
            if p: p_name = p.name
            
        row = {
            "ID": f.id,
            "Installation Code": f.installation_code,
            "Contract Account": f.contract_account,
            "Linked Unit": p_name,
            "Reference Month": f.reference_month,
            "Due Date": str(f.due_date) if f.due_date else None,
            "Total Amount": float(f.total_amount) if f.total_amount else None
        }
        
        for item in f.items:
            if item.description:
                col_name = item.description
                amount_val = float(item.amount) if item.amount else 0.0
                if col_name in row:
                    try:
                        current_val = float(row[col_name]) if row[col_name] is not None else 0.0
                        row[col_name] = current_val + amount_val
                    except (ValueError, TypeError):
                        pass
                else:
                    row[col_name] = amount_val
                    
        data_list.append(row)
        
    df = pd.DataFrame(data_list)
    
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Bills Extract')
    
    buffer.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="bills_extract.xlsx"'
    }
    return StreamingResponse(buffer, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers=headers)

@router.get("/bills/months")
async def list_distinct_months(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    months = db.query(Bill.reference_month).distinct().all()
    clean_list = list(set([m[0].strip() for m in months if m[0]]))
    return {"success": True, "data": sorted(clean_list)}

@router.get("/bills/installations")
async def list_distinct_installations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    installations = db.query(Bill.installation_code).distinct().all()
    clean_list = list(set([i[0].strip() for i in installations if i[0]]))
    return {"success": True, "data": sorted(clean_list)}

@router.get("/bills/{bill_id}")
async def get_bill_details(bill_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
        
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
            "imported_at": bill.imported_at,
            "imported_by": bill.imported_by,
            "original_file_name": bill.original_file_name,
            **demand_fields_out(bill),
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

@router.get("/bill-items/descriptions")
async def list_distinct_descriptions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    descriptions = db.query(BillItem.description).distinct().all()
    clean_list = [desc[0] for desc in descriptions if desc[0]] 
    return {"success": True, "data": clean_list}


# --- Integração com IA (Google AI Studio / Gemini) ---

@router.post("/bills/compare-ai")
async def compare_bill_with_ai(
    req: AiCompareRequest, 
    current_user: User = Depends(get_current_admin_user)
):
    """
    Executa a leitura da fatura pelo Google AI Studio e realiza o confronto (reconciliação)
    com o interpretador local existente, determinando a melhor leitura e detalhando divergências.
    """
    target_path = None
    if req.file_path and os.path.exists(req.file_path):
        target_path = req.file_path
    elif req.original_file_name:
        for fname in os.listdir(UPLOAD_DIR):
            if fname.endswith(req.original_file_name):
                target_path = os.path.join(UPLOAD_DIR, fname)
                break
                
    if not target_path or not os.path.exists(target_path):
        raise HTTPException(
            status_code=404, 
            detail="Arquivo PDF da fatura não foi encontrado no servidor para reanálise."
        )

    # 1. Leitura pelo interpretador local (Regex)
    regex_data = parse_pdf(target_path)
    regex_data["original_file_name"] = req.original_file_name
    regex_data["_file_path"] = target_path

    # 2. Leitura por IA (Google AI Studio)
    ai_res = parse_pdf_ai(target_path, api_key=req.api_key, model_name=req.model_name)
    if not ai_res.get("success"):
        return {
            "success": False,
            "error": ai_res.get("error", "Erro ao comunicar com Google AI Studio."),
            "regex_data": regex_data,
            "ai_data": None
        }

    ai_data = ai_res["data"]
    ai_data["original_file_name"] = req.original_file_name
    ai_data["_file_path"] = target_path

    # 3. Bate os dados das duas abordagens e calcula o vencedor
    reconciliation = reconcile_extractions(regex_data, ai_data)
    
    return {
        "success": True,
        "model": ai_res.get("model"),
        "reconciliation": reconciliation
    }

@router.get("/ai/config")
async def get_ai_config(current_user: User = Depends(get_current_user)):
    """Informa se a chave da API do Google AI Studio está configurada."""
    key = get_api_key()
    masked = f"{key[:4]}...{key[-4:]}" if key and len(key) >= 8 else None
    return {
        "success": True,
        "has_key": bool(key),
        "masked_key": masked,
        "default_model": "gemini-2.5-flash"
    }

@router.post("/ai/config")
async def set_ai_config(config_in: AiConfigInput, current_user: User = Depends(get_current_admin_user)):
    """Permite configurar ou atualizar a GEMINI_API_KEY dinamicamente."""
    new_key = config_in.api_key.strip()
    if not new_key:
        raise HTTPException(status_code=400, detail="Chave de API não pode ser vazia.")
        
    os.environ["GEMINI_API_KEY"] = new_key
    
    # Salvar em .env local se existir ou criar
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(backend_dir, ".env")
    try:
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        lines = [l for l in lines if not l.startswith("GEMINI_API_KEY=")]
        lines.append(f"GEMINI_API_KEY={new_key}\n")
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
    except Exception as e:
        print(f"Aviso ao salvar .env: {e}")
        
    return {"success": True, "message": "Chave da API do Google AI Studio configurada com sucesso!"}

