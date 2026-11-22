from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Example: postgresql://user:password@localhost:5432/ufrj_energia
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ufrj_energia_mock.db") # Fallback to SQLite for easy local dev if Postgres isn't up yet

def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    # O pooler do Supabase em modo transação (porta 6543) não suporta prepared
    # statements; o psycopg 3 os cria automaticamente, então são desativados.
    if make_url(url).get_driver_name() == "psycopg":
        return {"prepare_threshold": None}
    return {}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=_connect_args(SQLALCHEMY_DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def add_missing_columns():
    """Adiciona colunas novas a tabelas já existentes (create_all não altera tabelas).

    Idempotente; funciona em SQLite e PostgreSQL.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name not in existing:
                    col_type = column.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}'))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
