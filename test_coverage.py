import os
import re
import pdfplumber
from collections import Counter

def find_missing_items():
    pdf_files = []
    for root, dirs, files in os.walk('files'):
        for file in files:
            if file.endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
    
    # 15 files is enough to see the recurring missing items
    sample_files = pdf_files[:15]
    missing_items_counter = Counter()
    
    print(f"Buscando em {len(sample_files)} arquivos PDF na amostragem rápida...")
    
    for idx, pdf_path in enumerate(sample_files):
        try:
            with pdfplumber.open(pdf_path) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() + "\n"
            
            lines = text.split('\n')
            for line in lines:
                line_lower = line.lower()
                
                # Exclude known captures
                if "energia ativa" in line_lower or "demanda ativa" in line_lower or "energia reativa" in line_lower:
                    continue
                if "energia elétrica" in line_lower:
                    continue
                if "imposto retido" in line_lower or "imposto pispasep" in line_lower:
                    continue
                if "juros" in line_lower and "mora" in line_lower:
                    continue
                if "multa" in line_lower and "atraso" in line_lower:
                    continue
                if "débito var ipca" in line_lower or "debito var ipca" in line_lower:
                    continue
                if "contrib" in line_lower and "ilum" in line_lower:
                    continue
                    
                match = re.search(r'^([A-Z][a-zA-Zçãáéíóú\s/.-]+?)\s+(?:[-R$]*[\d.,]+\s+)*?(-?\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)', line)
                if match:
                    desc_candidate = match.group(1).strip()
                    if len(desc_candidate) < 5 or "Total" in desc_candidate or "Saldo" in desc_candidate or "ICMS" in desc_candidate or "PIS" in desc_candidate or "COFINS" in desc_candidate:
                        continue
                    if "Acesso em" in desc_candidate or "Conta Contrato" in desc_candidate or "Protocolo" in line or "Vencimento" in line:
                        continue
                    if desc_candidate.isupper() and len(desc_candidate) > 25:
                        continue
                        
                    missing_items_counter[desc_candidate] += 1
                    print(f"ENCONTRADO: {desc_candidate}")
        except Exception as e:
            pass

    print("\n--- RESUMO ---")
    for item, count in missing_items_counter.most_common(20):
        print(f"- {item} : {count} ocorrências")

if __name__ == "__main__":
    find_missing_items()
