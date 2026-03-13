from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Example: postgresql://user:password@localhost:5432/ufrj_energia
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ufrj_energia_mock.db") # Fallback to SQLite for easy local dev if Postgres isn't up yet

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
