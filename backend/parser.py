import pdfplumber
import re
from typing import Dict, Any, List

def parse_moeda(val_str: str) -> float:
    if not val_str: return 0.0
    val_str = val_str.replace('.', '').replace(',', '.')
    try:
        return float(val_str)
    except:
        return 0.0

def format_moeda(val_num: float) -> str:
    if val_num == 0.0: return "0,00"
    s = f"{val_num:.2f}".replace('.', ',')
    parts = s.split(',')
    int_part = parts[0]
    res_int = ''
    while len(int_part) > 3:
        res_int = '.' + int_part[-3:] + res_int
        int_part = int_part[:-3]
    res_int = int_part + res_int
    if res_int.startswith('-.'):
        res_int = '-' + res_int[2:]
    return f"{res_int},{parts[1]}"

def parse_pdf(pdf_path: str) -> Dict[str, Any]:
    """Extrai os dados da conta de luz usando pdfplumber."""
    data: Dict[str, Any] = {
        "installation_code": None,
        "contract_account": None,
        "reference_month": None,
        "due_date": None,
        "total_amount": None,
        "items": [] # Nova lista dinâmica One-to-Many
    }
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages:
                text += page.extract_text() + "\n"
        
        # 1. Conta Contrato
        cc_match = re.search(r"Conta Contrato:\s*(\d+)", text, re.IGNORECASE)
        if cc_match:
            data["contract_account"] = cc_match.group(1)
            
        # 1b. Código da Instalação (Instalações da Light costumam ser 9 dígitos ou marcadas com 'Instalação')
        # O usuário notou que 10 dígitos perto do CEP é o 'Código do Cliente' e não a 'Instalação'.
        inst_explicit = re.search(r"Instala[çc][ãa]o\s*[:\-]?\s*(\d{9,10})", text, re.IGNORECASE)
        if inst_explicit:
            data["installation_code"] = inst_explicit.group(1)
        else:
            # Fallback: procura o primeiro número de exatos 9 dígitos isolado na parte superior do PDF
            inst_implicit = re.search(r"(?<![\d/.-])(\d{9})(?![\d/.-])", text[:1000])
            if inst_implicit:
                data["installation_code"] = inst_implicit.group(1)
            
        # 2. Mes de referência, Vencimento e Valor Total
        val_match = re.search(r"([A-Z]{3}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+R\$\s*([\d.,]+)", text)
        if val_match:
            data["reference_month"] = val_match.group(1)
            data["due_date"] = val_match.group(2)
            data["total_amount"] = val_match.group(3)

        # Helper method for adding items
        def add_item(desc, quant=None, preco=None, valor=None):
            if valor is not None:
                data["items"].append({
                    "description": desc,
                    "quantity": quant,
                    "unit_price": preco,
                    "amount": valor
                })
            
        # 3. Demanda Ativa
        demanda_match = re.search(r"Demanda Ativa\s+kW\s+HFP/Único\s+kW\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if demanda_match:
            add_item("Demanda Ativa", demanda_match.group(1), demanda_match.group(2), demanda_match.group(3))
            
        # 3b. Energia Elétrica (Simples)
        energia_simples_match = re.search(r"Energia El[ée]trica\s+(?:kWh\s+){1,2}([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_simples_match:
            add_item("Energia Elétrica", energia_simples_match.group(1), energia_simples_match.group(2), energia_simples_match.group(3))

        # 4. Energia Ativa - Fora Ponta
        energia_hfp_match = re.search(r"Energia Ativa\s+kWh\s+HFP/Único\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_hfp_match:
             add_item("Energia Ativa Fora Ponta", energia_hfp_match.group(1), energia_hfp_match.group(2), energia_hfp_match.group(3))
            
        # 5. Energia Ativa - Ponta
        energia_hp_match = re.search(r"Energia Ativa\s+kWh\s+HP\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_hp_match:
             add_item("Energia Ativa Ponta", energia_hp_match.group(1), energia_hp_match.group(2), energia_hp_match.group(3))
            
        # 6. Energia Reativa
        energia_reativa_match = re.search(r"Energia Reativa\s+kWh\s+HFP/Único\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_reativa_match:
            add_item("Energia Reativa", energia_reativa_match.group(1), energia_reativa_match.group(2), energia_reativa_match.group(3))

        # 7. Impostos Retidos e Outros
        impostos = {
            "Imposto Retido IRPJ (Demanda)": r"Imposto Retido IRPJ - Demanda\s+([-\d.,]+)",
            "Imposto Retido PIS (Demanda)": r"Imposto Retido PIS - Demanda\s+([-\d.,]+)",
            "Imposto Retido COFINS (Demanda)": r"Imposto Retido COFINS\s*-?\s*Demanda\s+([-\d.,]+)",
            "Imposto Retido CSLL (Demanda)": r"Imposto Retido CSLL - Demanda\s+([-\d.,]+)",
            "Imposto Retido IRPJ (Energia)": r"Imposto Retido IRPJ - Energia\s+([-\d.,]+)",
            "Imposto Retido PIS (Energia)": r"Imposto Retido PIS - Energia\s+([-\d.,]+)",
            "Imposto Retido COFINS (Energia)": r"Imposto Retido COFINS\s*-?\s*Energia\s+([-\d.,]+)",
            "Imposto Retido CSLL (Energia)": r"Imposto Retido CSLL - Energia\s+([-\d.,]+)",
            "Contribuição Iluminação Pública": r"Contrib Ilum Pública Municipal\s+([\d.,]+)",
            "Débito Var IPCA": r"D[ÉE]BITO VAR IPCA\s+([-\d.,]+)",
        }
        for desc, regex in impostos.items():
            match = re.search(regex, text)
            if match:
                add_item(desc, None, None, match.group(1))
                
        # 8. Multas e Juros
        multas_juros_total = 0.0
        juros_matches = re.findall(r"Juros\s+mora[^R]*R\$\s*[\d.,]+\s+([\d.,]+)", text)
        for m in juros_matches:
            multas_juros_total += parse_moeda(m)
            
        multa_matches = re.findall(r"Multa\s+.*?R\$\s*[\d.,]+\s+([\d.,]+)", text)
        for m in multa_matches:
            multas_juros_total += parse_moeda(m)
            
        if multas_juros_total > 0:
            add_item("Multas e Juros", None, None, format_moeda(multas_juros_total))
            
        return data
        
    except Exception as e:
        print(f"Erro ao extrair PDF {pdf_path}: {e}")
        return data
