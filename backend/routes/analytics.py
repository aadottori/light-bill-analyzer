from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db
from backend.models import Bill, BillItem, Unit, User
from backend.auth import get_current_user
from typing import Optional
from datetime import date

router = APIRouter()


# --- Helper Functions ---

def parse_month_date(m_str: str) -> date:
    if not m_str: return date.min
    months = {"JAN":1, "FEV":2, "MAR":3, "ABR":4, "MAI":5, "JUN":6, "JUL":7, "AGO":8, "SET":9, "OUT":10, "NOV":11, "DEZ":12}
    parts = m_str.split('/')
    if len(parts) == 2 and parts[0].upper() in months:
        try:
            return date(int(parts[1]), months[parts[0].upper()], 1)
        except:
            return date.min
    return date.min

def get_valid_bill_ids(db: Session, start_month: Optional[str] = None, end_month: Optional[str] = None, unit_id: Optional[int] = None) -> list:
    query = db.query(Bill)
    if unit_id:
        query = query.filter(Bill.unit_id == unit_id)
    bills = query.all()
    
    start_d = parse_month_date(start_month) if start_month else date.min
    end_d = parse_month_date(end_month) if end_month else date.max
    
    valid_ids = []
    for b in bills:
        bd = parse_month_date(b.reference_month)
        if start_d <= bd <= end_d:
            valid_ids.append(b.id)
    return valid_ids if valid_ids else [-1]


# --- Analytics Endpoints ---

@router.get("/analytics/kpis")
async def get_analytics_kpis(
    start_month: Optional[str] = None,
    end_month: Optional[str] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    valid_ids = get_valid_bill_ids(db, start_month, end_month, unit_id)

    fines_total = db.query(func.sum(BillItem.amount)).filter(
        BillItem.bill_id.in_(valid_ids),
        (BillItem.description.ilike("%Multa%") | BillItem.description.ilike("%Juros%"))
    ).scalar() or 0.0

    reactive_total = db.query(func.sum(BillItem.amount)).filter(
        BillItem.bill_id.in_(valid_ids),
        BillItem.description.ilike("%Reativ%")
    ).scalar() or 0.0
    
    peak_cost = db.query(func.sum(BillItem.amount)).filter(
        BillItem.bill_id.in_(valid_ids),
        (BillItem.description.ilike("%Ponta%") & ~BillItem.description.ilike("%Fora%"))
    ).scalar() or 0.0
    
    off_peak_cost = db.query(func.sum(BillItem.amount)).filter(
        BillItem.bill_id.in_(valid_ids),
        BillItem.description.ilike("%Fora Ponta%")
    ).scalar() or 0.0

    energy_sum = db.query(func.sum(BillItem.amount)).filter(
        BillItem.bill_id.in_(valid_ids),
        (BillItem.description.ilike("%Energia Elétrica%") | BillItem.description.ilike("%Energia Ativa%"))
    ).scalar() or 0.0
    
    energy_qty = db.query(func.sum(BillItem.quantity)).filter(
        BillItem.bill_id.in_(valid_ids),
        (BillItem.description.ilike("%Energia Elétrica%") | BillItem.description.ilike("%Energia Ativa%"))
    ).scalar() or 0.0
    
    avg_tariff = (float(energy_sum) / float(energy_qty)) if energy_qty and energy_qty > 0 else 0.0

    return {
        "success": True, 
        "data": {
            "total_fines": float(fines_total),
            "total_reactive": float(reactive_total),
            "peak_cost": float(peak_cost),
            "off_peak_cost": float(off_peak_cost),
            "average_tariff": float(avg_tariff)
        }
    }

@router.get("/analytics/trends")
async def get_analytics_trends(
    start_month: Optional[str] = None,
    end_month: Optional[str] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    valid_ids = get_valid_bill_ids(db, start_month, end_month, unit_id)

    trends = db.query(
        Bill.reference_month,
        func.sum(Bill.total_amount).label('total')
    ).filter(Bill.id.in_(valid_ids)).group_by(Bill.reference_month).all()

    results = []
    for month, total in trends:
        if month:
            results.append({"month": month.strip(), "total": float(total) if total else 0.0})
    
    return {"success": True, "data": results}

@router.get("/analytics/offenders")
async def get_analytics_offenders(
    start_month: Optional[str] = None,
    end_month: Optional[str] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    valid_ids = get_valid_bill_ids(db, start_month, end_month, unit_id)

    results = db.query(
        Unit.name,
        func.sum(BillItem.amount).label("fines_total")
    ).select_from(BillItem).join(Bill).join(Unit).filter(
        BillItem.bill_id.in_(valid_ids),
        (BillItem.description.ilike("%Multa%") | BillItem.description.ilike("%Juros%"))
    ).group_by(Unit.name).order_by(func.sum(BillItem.amount).desc()).limit(5).all()
    
    formatted = [{"unit": r[0] or "Unknown", "fines": float(r[1]) if r[1] else 0.0} for r in results if r[1] and r[1] > 0]
    return {"success": True, "data": formatted}

@router.get("/analytics/units/cost")
async def get_analytics_units_cost(
    start_month: Optional[str] = None,
    end_month: Optional[str] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    valid_ids = get_valid_bill_ids(db, start_month, end_month, unit_id)

    results = db.query(
        Unit.name,
        func.sum(Bill.total_amount).label('total')
    ).select_from(Bill).join(Unit).filter(
        Bill.id.in_(valid_ids)
    ).group_by(Unit.name).order_by(func.sum(Bill.total_amount).desc()).all()
    
    formatted = [{"unit": r[0] or "Unknown", "total": float(r[1]) if r[1] else 0.0} for r in results if r[1] and r[1] > 0]
    return {"success": True, "data": formatted}
