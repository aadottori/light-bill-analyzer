import sys
import json
from backend.parser import parse_pdf
import pdfplumber

def test_file(path):
    print(f"--- Parsing {path} ---")
    data = parse_pdf(path)
    print(json.dumps(data, indent=2, ensure_ascii=False))

    print("\n\n--- EXTRACTED TEXT ---")
    with pdfplumber.open(path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() + "\n"
        print(text[:2000])

if __name__ == "__main__":
    test_file("files/2025-01/2025-01-38.pdf")
