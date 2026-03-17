from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import BillCreate, Bill, BillItem, Unit, User
from backend.auth import get_current_admin_user, get_current_user
from backend.parser import parse_pdf
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

def db_parse_date(val: str):
    if not val:
        return None
    try:
        return datetime.strptime(val, "%d/%m/%Y").date()
    except:
        return None


# --- Upload ---

@router.post("/upload")
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
            extracted_data["original_file_name"] = file.filename
            results.append({"filename": file.filename, "success": True, "data": extracted_data})
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
