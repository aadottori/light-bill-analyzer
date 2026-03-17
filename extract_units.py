"""
Scans PDFs in files/2025-01 and extracts installation_code + address (as building name).
Then inserts all new units into the SQLite database and auto-links existing bills.
"""
import os
import re
import pdfplumber
import sqlite3
from backend.parser import parse_pdf
from collections import defaultdict

def extract_address(text):
    """Extract address/building name from Line 4 of the PDF."""
    lines = text.split('\n')
    if len(lines) < 5:
        return None
    
    # The address is on line index 4 (5th line), clean it
    addr = lines[4].strip()
    
    # Remove NOTA FISCAL suffix that sometimes gets appended
    addr = re.sub(r'\s*NOTA\s*FISCAL.*', '', addr, flags=re.IGNORECASE).strip()
    
    # For NF3e compressed format, try to add spaces before capital letters
    if ' ' not in addr[:10] and len(addr) > 15:
        # It's compressed. Try to decompress.
        addr = re.sub(r'([a-z])([A-Z])', r'\1 \2', addr)
        addr = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', addr)
    
    if not addr or len(addr) < 3:
        return None
        
    return addr

def main():
    folder = 'files/2025-01'
    pdf_files = sorted([f for f in os.listdir(folder) if f.endswith('.pdf')])
    
    # Dict: installation_code -> address
    units_map = {}
    
    print(f"Scanning {len(pdf_files)} PDFs in {folder}...\n")
    
    for fname in pdf_files:
        pdf_path = os.path.join(folder, fname)
        try:
            parsed = parse_pdf(pdf_path)
            inst_code = parsed.get('installation_code')
            
            if not inst_code:
                print(f"  SKIP {fname}: no installation_code")
                continue
            
            with pdfplumber.open(pdf_path) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() + "\n"
            
            addr = extract_address(text)
            
            if inst_code not in units_map:
                units_map[inst_code] = addr or f"Unit {inst_code}"
                
        except Exception as e:
            print(f"  ERROR {fname}: {e}")
    
    # Print final table
    print(f"\n{'='*80}")
    print(f"  FOUND {len(units_map)} UNIQUE INSTALLATION CODES")
    print(f"{'='*80}\n")
    print(f"  {'CODE':<15} {'NAME/ADDRESS'}")
    print(f"  {'-'*15} {'-'*60}")
    for code in sorted(units_map.keys()):
        print(f"  {code:<15} {units_map[code]}")
    
    # Now insert into database
    print(f"\n{'='*80}")
    print(f"  INSERTING INTO DATABASE...")
    print(f"{'='*80}\n")
    
    db_path = 'ufrj_energia_mock.db'
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    skipped = 0
    
    for code, name in sorted(units_map.items()):
        # Check if already exists
        cursor.execute("SELECT id FROM units WHERE installation_code = ?", (code,))
        existing = cursor.fetchone()
        if existing:
            print(f"  SKIP {code} - already exists (id={existing[0]})")
            skipped += 1
        else:
            cursor.execute("INSERT INTO units (name, installation_code) VALUES (?, ?)", (name, code))
            new_id = cursor.lastrowid
            # Auto-link bills
            cursor.execute("UPDATE bills SET unit_id = ? WHERE installation_code = ?", (new_id, code))
            linked = cursor.rowcount
            print(f"  INSERT {code} -> '{name}' (id={new_id}, linked {linked} bills)")
            inserted += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n  Done! Inserted {inserted} new units, skipped {skipped} existing ones.")

if __name__ == "__main__":
    main()
