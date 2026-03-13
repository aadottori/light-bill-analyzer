import pdfplumber
import re
from typing import Dict, Any

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
    data = {
        "conta_contrato": None,
        "mes_referencia": None,
        "vencimento": None,
        "valor_total": None,

        "demanda_ativa_quant": None,
        "demanda_ativa_preco": None,
        "demanda_ativa_valor": None,

        "energia_ativa_ponta_quant": None,
        "energia_ativa_ponta_preco": None,
        "energia_ativa_ponta_valor": None,

        "energia_ativa_fora_ponta_quant": None,
        "energia_ativa_fora_ponta_preco": None,
        "energia_ativa_fora_ponta_valor": None,

        "energia_reativa_quant": None,
        "energia_reativa_preco": None,
        "energia_reativa_valor": None,

        "imposto_retido_irpj_demanda": None,
        "imposto_retido_pis_demanda": None,
        "imposto_retido_cofins_demanda": None,
        "imposto_retido_csll_demanda": None,

        "imposto_retido_irpj_energia": None,
        "imposto_retido_pis_energia": None,
        "imposto_retido_cofins_energia": None,
        "imposto_retido_csll_energia": None,
        
        "contrib_ilum_publica": None,
        "multas_e_juros": None,
    }
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = ""
            for page in pdf.pages:
                text += page.extract_text() + "\n"
        
        # 1. Conta Contrato
        cc_match = re.search(r"Conta Contrato:\s*(\d+)", text, re.IGNORECASE)
        if cc_match:
            data["conta_contrato"] = cc_match.group(1)
            
        # 2. Mes de referência, Vencimento e Valor Total
        val_match = re.search(r"([A-Z]{3}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s+R\$([\d.,]+)", text)
        if val_match:
            data["mes_referencia"] = val_match.group(1)
            data["vencimento"] = val_match.group(2)
            data["valor_total"] = val_match.group(3)
            
        # 3. Demanda Ativa
        demanda_match = re.search(r"Demanda Ativa\s+kW\s+HFP/Único\s+kW\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if demanda_match:
            data["demanda_ativa_quant"] = demanda_match.group(1)
            data["demanda_ativa_preco"] = demanda_match.group(2)
            data["demanda_ativa_valor"] = demanda_match.group(3)
            
        # 4. Energia Ativa - Fora Ponta
        energia_hfp_match = re.search(r"Energia Ativa\s+kWh\s+HFP/Único\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_hfp_match:
            data["energia_ativa_fora_ponta_quant"] = energia_hfp_match.group(1)
            data["energia_ativa_fora_ponta_preco"] = energia_hfp_match.group(2)
            data["energia_ativa_fora_ponta_valor"] = energia_hfp_match.group(3)
            
        # 5. Energia Ativa - Ponta
        energia_hp_match = re.search(r"Energia Ativa\s+kWh\s+HP\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_hp_match:
            data["energia_ativa_ponta_quant"] = energia_hp_match.group(1)
            data["energia_ativa_ponta_preco"] = energia_hp_match.group(2)
            data["energia_ativa_ponta_valor"] = energia_hp_match.group(3)
            
        # 6. Energia Reativa
        energia_reativa_match = re.search(r"Energia Reativa\s+kWh\s+HFP/Único\s+kWh\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)", text)
        if energia_reativa_match:
            data["energia_reativa_quant"] = energia_reativa_match.group(1)
            data["energia_reativa_preco"] = energia_reativa_match.group(2)
            data["energia_reativa_valor"] = energia_reativa_match.group(3)

        # 7. Impostos Retidos - Demanda
        impostos = {
            "imposto_retido_irpj_demanda": r"Imposto Retido IRPJ - Demanda\s+([-\d.,]+)",
            "imposto_retido_pis_demanda": r"Imposto Retido PIS - Demanda\s+([-\d.,]+)",
            "imposto_retido_cofins_demanda": r"Imposto Retido COFINS\s*-?\s*Demanda\s+([-\d.,]+)",
            "imposto_retido_csll_demanda": r"Imposto Retido CSLL - Demanda\s+([-\d.,]+)",
            "imposto_retido_irpj_energia": r"Imposto Retido IRPJ - Energia\s+([-\d.,]+)",
            "imposto_retido_pis_energia": r"Imposto Retido PIS - Energia\s+([-\d.,]+)",
            "imposto_retido_cofins_energia": r"Imposto Retido COFINS\s*-?\s*Energia\s+([-\d.,]+)",
            "imposto_retido_csll_energia": r"Imposto Retido CSLL - Energia\s+([-\d.,]+)",
            "contrib_ilum_publica": r"Contrib Ilum Pública Municipal\s+([\d.,]+)",
        }
        for k, v in impostos.items():
            match = re.search(v, text)
            if match:
                data[k] = match.group(1)
                
        # 8. Multas e Juros
        multas_juros_total = 0.0
        juros_matches = re.findall(r"Juros\s+mora[^R]*R\$\s*[\d.,]+\s+([\d.,]+)", text)
        for m in juros_matches:
            multas_juros_total += parse_moeda(m)
            
        multa_matches = re.findall(r"Multa\s+.*?R\$\s*[\d.,]+\s+([\d.,]+)", text)
        for m in multa_matches:
            multas_juros_total += parse_moeda(m)
            
        if multas_juros_total > 0:
            data["multas_e_juros"] = format_moeda(multas_juros_total)
            
        return data
        
    except Exception as e:
        print(f"Erro ao extrair PDF {pdf_path}: {e}")
        return data
