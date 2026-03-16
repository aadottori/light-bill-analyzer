from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.database import Base
from pydantic import BaseModel
from typing import Optional, List
from datetime import date

# --- SQLAlchemy DB Models ---

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="viewer") # "admin" or "viewer"
    is_active = Column(Boolean, default=True)

class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    installation_code = Column(String, unique=True, index=True)
    
    bills = relationship("Bill", back_populates="unit")


class Bill(Base):
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True)
    installation_code = Column(String, index=True)
    contract_account = Column(String, index=True)
    reference_month = Column(String)
    due_date = Column(Date, nullable=True)
    total_amount = Column(Numeric(12, 2))
    
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    imported_at = Column(String, nullable=True)
    imported_by = Column(String, nullable=True)
    original_file_name = Column(String, nullable=True)
    
    unit = relationship("Unit", back_populates="bills")
    items = relationship("BillItem", back_populates="bill", cascade="all, delete-orphan")


class BillItem(Base):
    __tablename__ = "bill_items"

    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(Integer, ForeignKey("bills.id"))
    description = Column(String, index=True)
    quantity = Column(Numeric(12, 2), nullable=True)
    unit_price = Column(Numeric(12, 4), nullable=True)
    amount = Column(Numeric(12, 2))
    
    bill = relationship("Bill", back_populates="items")


# --- Pydantic Schemas for Input Validation ---

class BillItemCreate(BaseModel):
    description: str
    quantity: Optional[str] = None
    unit_price: Optional[str] = None
    amount: str

class BillCreate(BaseModel):
    installation_code: Optional[str] = None
    contract_account: Optional[str] = None
    reference_month: Optional[str] = None
    due_date: Optional[str] = None
    total_amount: Optional[str] = None
    unit_id: Optional[int] = None
    original_file_name: Optional[str] = None
    items: List[BillItemCreate] = []

class UnitCreate(BaseModel):
    name: str
    installation_code: str
