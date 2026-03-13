from backend.parser import parse_pdf
import json

if __name__ == "__main__":
    result = parse_pdf("files/2025-01/2025-01-1.pdf")
    print(json.dumps(result, indent=2, ensure_ascii=False))
