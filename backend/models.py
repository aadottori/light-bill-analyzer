from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
from pydantic import BaseModel
from typing import Optional, List
from datetime import date

# --- SQLAlchemy DB Models ---

class Predio(Base):
    __tablename__ = "predios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, index=True)
    conta_contrato = Column(String, unique=True, index=True)
    
    faturas = relationship("Fatura", back_populates="predio")


class Fatura(Base):
    __tablename__ = "faturas"

    id = Column(Integer, primary_key=True, index=True)
    conta_contrato = Column(String, index=True)
    mes_referencia = Column(String)
    vencimento = Column(Date, nullable=True)
    valor_total = Column(Numeric(12, 2))
    
    predio_id = Column(Integer, ForeignKey("predios.id"), nullable=True)
    
    predio = relationship("Predio", back_populates="faturas")
    itens = relationship("FaturaItem", back_populates="fatura", cascade="all, delete")


class FaturaItem(Base):
    __tablename__ = "fatura_itens"

    id = Column(Integer, primary_key=True, index=True)
    fatura_id = Column(Integer, ForeignKey("faturas.id"))
    descricao = Column(String, index=True)
    quantidade = Column(Numeric(12, 2), nullable=True)
    preco_unitario = Column(Numeric(12, 4), nullable=True)
    valor = Column(Numeric(12, 2))
    
    fatura = relationship("Fatura", back_populates="itens")


# --- Pydantic Schemas for Input Validation ---

class FaturaItemCreate(BaseModel):
    descricao: str
    quantidade: Optional[str] = None
    preco_unitario: Optional[str] = None
    valor: str

class FaturaCreate(BaseModel):
    conta_contrato: Optional[str] = None
    mes_referencia: Optional[str] = None
    vencimento: Optional[str] = None
    valor_total: Optional[str] = None
    predio_id: Optional[int] = None
    itens: List[FaturaItemCreate] = []

class PredioCreate(BaseModel):
    nome: str
    conta_contrato: str
