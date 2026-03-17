from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Bill, Unit, UnitCreate, User
from backend.auth import get_current_admin_user, get_current_user

router = APIRouter()


@router.get("/units")
async def list_units(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    units = db.query(Unit).all()
    return {"success": True, "data": [{"id": p.id, "name": p.name, "installation_code": p.installation_code} for p in units]}

@router.post("/units")
async def create_unit(unit_in: UnitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = Unit(name=unit_in.name, installation_code=unit_in.installation_code)
    db.add(db_unit)
    db.commit()
    db.refresh(db_unit)
    
    # Auto-link existing bills
    if unit_in.installation_code:
        db.query(Bill).filter(Bill.installation_code == unit_in.installation_code).update({Bill.unit_id: db_unit.id})
        db.commit()
        
    return {"success": True, "id": db_unit.id}

@router.put("/units/{unit_id}")
async def update_unit(unit_id: int, unit_in: UnitCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    old_code = db_unit.installation_code
    db_unit.name = unit_in.name
    db_unit.installation_code = unit_in.installation_code
    db.commit()
    
    # Auto-linking logic on update
    if old_code != unit_in.installation_code:
        db.query(Bill).filter(Bill.unit_id == unit_id, Bill.installation_code != unit_in.installation_code).update({Bill.unit_id: None})
        db.query(Bill).filter(Bill.installation_code == unit_in.installation_code).update({Bill.unit_id: unit_id})
        db.commit()
        
    db.refresh(db_unit)
    return {"success": True, "id": db_unit.id}

@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin_user)):
    db_unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    if db_unit.bills:
        for f in db_unit.bills:
            f.unit_id = None
            
    db.delete(db_unit)
    db.commit()
    return {"success": True, "message": "Unit deleted successfully"}
