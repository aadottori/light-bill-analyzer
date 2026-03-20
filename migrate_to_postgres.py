"""
Migrate all data from local SQLite (ufrj_energia_mock.db) to Supabase PostgreSQL.
This script:
1. Creates tables on PostgreSQL via SQLAlchemy
2. Reads all data from SQLite
3. Inserts into PostgreSQL preserving IDs and relationships
"""
import sqlite3
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

SQLITE_PATH = "ufrj_energia_mock.db"
PG_URL = os.getenv("DATABASE_URL")

if not PG_URL:
    raise RuntimeError("DATABASE_URL not set in .env")

# Import models to ensure tables are created
from backend.database import Base
from backend.models import User, Unit, Bill, BillItem

# Create PostgreSQL engine
pg_engine = create_engine(PG_URL)

# Create all tables
print("Creating tables on PostgreSQL...")
Base.metadata.create_all(bind=pg_engine)
print("Tables created.\n")

# Connect to SQLite
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row

PgSession = sessionmaker(bind=pg_engine)
pg_session = PgSession()

# --- Migrate Users ---
print("Migrating users...")
rows = sqlite_conn.execute("SELECT * FROM users").fetchall()
for r in rows:
    existing = pg_session.execute(text("SELECT id FROM users WHERE username = :u"), {"u": r["username"]}).fetchone()
    if existing:
        print(f"  SKIP user '{r['username']}' (already exists)")
        continue
    pg_session.execute(
        text("INSERT INTO users (id, username, hashed_password, role, is_active) VALUES (:id, :username, :hashed_password, :role, :is_active)"),
        {"id": r["id"], "username": r["username"], "hashed_password": r["hashed_password"], "role": r["role"], "is_active": bool(r["is_active"])}
    )
    print(f"  INSERT user '{r['username']}' (id={r['id']})")
pg_session.commit()
print(f"  Total: {len(rows)} users.\n")

# --- Migrate Units ---
print("Migrating units...")
rows = sqlite_conn.execute("SELECT * FROM units").fetchall()
for r in rows:
    existing = pg_session.execute(text("SELECT id FROM units WHERE installation_code = :c"), {"c": r["installation_code"]}).fetchone()
    if existing:
        print(f"  SKIP unit '{r['name']}' (already exists)")
        continue
    pg_session.execute(
        text("INSERT INTO units (id, name, installation_code) VALUES (:id, :name, :installation_code)"),
        {"id": r["id"], "name": r["name"], "installation_code": r["installation_code"]}
    )
pg_session.commit()
print(f"  Total: {len(rows)} units.\n")

# --- Migrate Bills ---
print("Migrating bills...")
rows = sqlite_conn.execute("SELECT * FROM bills").fetchall()
for r in rows:
    existing = pg_session.execute(text("SELECT id FROM bills WHERE id = :id"), {"id": r["id"]}).fetchone()
    if existing:
        continue
    pg_session.execute(
        text("""INSERT INTO bills (id, installation_code, contract_account, reference_month, due_date, total_amount, unit_id, imported_at, imported_by, original_file_name)
                VALUES (:id, :installation_code, :contract_account, :reference_month, :due_date, :total_amount, :unit_id, :imported_at, :imported_by, :original_file_name)"""),
        {
            "id": r["id"],
            "installation_code": r["installation_code"],
            "contract_account": r["contract_account"],
            "reference_month": r["reference_month"],
            "due_date": r["due_date"],
            "total_amount": r["total_amount"],
            "unit_id": r["unit_id"],
            "imported_at": r["imported_at"],
            "imported_by": r["imported_by"],
            "original_file_name": r["original_file_name"]
        }
    )
pg_session.commit()
print(f"  Total: {len(rows)} bills.\n")

# --- Migrate Bill Items ---
print("Migrating bill items...")
rows = sqlite_conn.execute("SELECT * FROM bill_items").fetchall()
batch = []
for r in rows:
    batch.append({
        "id": r["id"],
        "bill_id": r["bill_id"],
        "description": r["description"],
        "quantity": r["quantity"],
        "unit_price": r["unit_price"],
        "amount": r["amount"]
    })

# Insert in batches of 500
for i in range(0, len(batch), 500):
    chunk = batch[i:i+500]
    for item in chunk:
        pg_session.execute(
            text("""INSERT INTO bill_items (id, bill_id, description, quantity, unit_price, amount)
                    VALUES (:id, :bill_id, :description, :quantity, :unit_price, :amount)
                    ON CONFLICT DO NOTHING"""),
            item
        )
    pg_session.commit()
    print(f"  Inserted batch {i//500 + 1} ({len(chunk)} items)")

print(f"  Total: {len(rows)} bill items.\n")

# --- Reset sequences to avoid ID conflicts ---
print("Resetting PostgreSQL sequences...")
for table_name in ["users", "units", "bills", "bill_items"]:
    pg_session.execute(text(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), COALESCE((SELECT MAX(id) FROM {table_name}), 1))"))
pg_session.commit()
print("Sequences reset.\n")

sqlite_conn.close()
pg_session.close()

print("=" * 60)
print("  MIGRATION COMPLETE!")
print("=" * 60)
