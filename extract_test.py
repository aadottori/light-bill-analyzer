import pdfplumber
import sys
import json

pdf_path = sys.argv[1]

try:
    with pdfplumber.open(pdf_path) as pdf:
        first_page = pdf.pages[0]
        text = first_page.extract_text()
        tables = first_page.extract_tables()
        
        print("--- EXTRACTED TEXT ---")
        print(text)
        print("\n--- EXTRACTED TABLES ---")
        # Just print the number of tables and maybe the first one if it exists
        print(f"Number of tables: {len(tables)}")
        if tables:
            print("First table preview:")
            for row in tables[0][:5]:
                print(row)
except Exception as e:
    print(f"Error reading PDF: {e}")
