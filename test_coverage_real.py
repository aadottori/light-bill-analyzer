import os
from backend.parser import parse_pdf
import json

pdf_files = []
for root, dirs, files in os.walk('files'):
    for file in files:
        if file.endswith('.pdf'):
            pdf_files.append(os.path.join(root, file))

count = 0
for pdf in pdf_files:
    try:
        data = parse_pdf(pdf)
    except:
        continue
    for item in data.get('items', []):
        if item['description'] not in ['Demanda Ativa', 'Energia Ativa Fora Ponta', 'Energia Ativa Ponta', 'Energia Reativa', 'Energia Elétrica', 'Multas e Juros']:
            print(f"{pdf} > {item['description']}: {item['amount']}")
            count += 1
            if count > 30: break
    if count > 30: break

