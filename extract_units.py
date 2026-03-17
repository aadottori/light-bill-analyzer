"""
Re-scans PDFs in files/2025-01 using the updated parser (which now extracts building_name
from the footer) and updates all unit names in the database.
"""
import os
import sqlite3
from backend.parser import parse_pdf

def main():
    folder = 'files/2025-01'
    pdf_files = sorted([f for f in os.listdir(folder) if f.endswith('.pdf')])
    
    # Map: installation_code -> building_name
    code_to_name = {}
    
    print(f"Scanning {len(pdf_files)} PDFs for building names...\n")
    
    for fname in pdf_files:
        pdf_path = os.path.join(folder, fname)
        try:
            parsed = parse_pdf(pdf_path)
            inst_code = parsed.get('installation_code')
            bldg_name = parsed.get('building_name')
            
            if inst_code and bldg_name and inst_code not in code_to_name:
                code_to_name[inst_code] = bldg_name
                
        except Exception as e:
            print(f"  ERROR {fname}: {e}")
    
    print(f"Found {len(code_to_name)} building names.\n")
    
    # Update database
    db_path = 'ufrj_energia_mock.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    updated = 0
    for code, name in sorted(code_to_name.items()):
        cursor.execute("SELECT id, name FROM units WHERE installation_code = ?", (code,))
        row = cursor.fetchone()
        if row:
            old_name = row[1]
            if old_name != name:
                cursor.execute("UPDATE units SET name = ? WHERE id = ?", (name, row[0]))
                print(f"  UPDATE {code}: '{old_name}' -> '{name}'")
                updated += 1
            else:
                print(f"  OK     {code}: '{name}' (unchanged)")
        else:
            print(f"  SKIP   {code}: not in DB")
    
    conn.commit()
    conn.close()
    
    print(f"\nDone! Updated {updated} unit names.")

if __name__ == "__main__":
    main()
