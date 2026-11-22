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
        "building_name": None,
        # Modalidade tarifária e grandezas de demanda (kW). Na modalidade Verde só há
        # demanda única, guardada nos campos sem sufixo "_peak".
        "tariff_modality": None,
        "contracted_demand_kw": None,
        "contracted_demand_peak_kw": None,
        "measured_demand_kw": None,
        "measured_demand_peak_kw": None,
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
            # Fallback 1: procura o primeiro número de exatos 9 dígitos isolado na parte superior do PDF
            inst_implicit = re.search(r"(?<![\d/.-])(\d{9})(?![\d/.-])", text[:1000])
            if inst_implicit:
                data["installation_code"] = inst_implicit.group(1)
            else:
                # Fallback 2: Light NF3e often puts the Meter Number before 'Energia Ativa'
                meter_match = re.search(r"(\d{8,12})\s+Energia\s*Ativa", text, re.IGNORECASE)
                if meter_match:
                    data["installation_code"] = meter_match.group(1)
            
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
            
        # Linha de item no padrão "<rótulo> <unid> <quantidade> <preço unitário> <valor>"
        ITEM_NUMS = r"\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)"
        HFP = r"HFP\s*/\s*[ÚU]nico"

        # 2b. Modalidade tarifária (ex.: "Grupo A4 / A4 - Verde")
        mod_match = re.search(r"A\d\w*\s*-\s*(Verde|Azul)", text, re.IGNORECASE)
        if mod_match:
            data["tariff_modality"] = mod_match.group(1).capitalize()

        # 3. Demanda Ativa
        demanda_match = re.search(r"Demanda\s*Ativa\s*kWe?[\s\w/-]*?(\d+[\d.,]*)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
        if demanda_match:
            add_item("Demanda Ativa", demanda_match.group(1), demanda_match.group(2), demanda_match.group(3))

        # 3a. Demanda Ativa de ponta (só existe na modalidade Azul)
        demanda_hp_match = re.search(r"Demanda\s*Ativa\s*kW\s*HP\s*kW" + ITEM_NUMS, text, re.IGNORECASE)
        if demanda_hp_match:
            add_item("Demanda Ativa Ponta", *demanda_hp_match.groups())

        # 3b. Ultrapassagem de demanda (REN 1.000/2021, art. 301), por posto tarifário
        ult_hfp = re.search(r"Ultrapassagem\s*kW\s*" + HFP + r"\s*kW" + ITEM_NUMS, text, re.IGNORECASE)
        if ult_hfp:
            add_item("Ultrapassagem de Demanda Fora Ponta", *ult_hfp.groups())
        ult_hp = re.search(r"Ultrapassagem\s*kW\s*HP\s*kW" + ITEM_NUMS, text, re.IGNORECASE)
        if ult_hp:
            add_item("Ultrapassagem de Demanda Ponta", *ult_hp.groups())

        # 3c. Demanda contratada: quadro lateral "Demanda 98,00" (Verde) ou
        # "Demanda Fora Ponta 136,00" / "Demanda Ponta 77,00" (Azul). O número precisa
        # ser positivo e fechar a linha, o que exclui "Imposto Retido ... - Demanda -182,71".
        contr_unica = re.search(r"Demanda\s+([\d.]+,\d{2})\s*$", text, re.MULTILINE)
        contr_hfp = re.search(r"Demanda\s*Fora\s*Ponta\s+([\d.]+,\d{2})\s*$", text, re.MULTILINE)
        contr_hp = re.search(r"Demanda\s*Ponta\s+([\d.]+,\d{2})\s*$", text, re.MULTILINE)
        if contr_hfp:
            data["contracted_demand_kw"] = contr_hfp.group(1)
        elif contr_unica:
            data["contracted_demand_kw"] = contr_unica.group(1)
        if contr_hp:
            data["contracted_demand_peak_kw"] = contr_hp.group(1)

        # 3d. Demanda medida: quadro do medidor, última coluna (ex.:
        # "9245187 Demanda Ativa-Kw Único 2.434 2.493 1,4237 84")
        # Linhas com constante do medidor 0,0000 (sem número de medidor, leituras zeradas)
        # aparecem em algumas faturas e não representam a demanda consumida: são ignoradas.
        MEDIDOR = r"\s+[\d.,]+\s+[\d.,]+\s+(?!0,0+\s)[\d.,]+\s+([\d.,]+)\s*$"
        med_hfp = re.search(r"Demanda\s*Ativa\s*-\s*Kw\s*(?:[ÚU]nico|Fora\s*Ponta)" + MEDIDOR, text, re.IGNORECASE | re.MULTILINE)
        med_hp = re.search(r"Demanda\s*Ativa\s*-\s*Kw\s*Ponta" + MEDIDOR, text, re.IGNORECASE | re.MULTILINE)
        if med_hfp:
            data["measured_demand_kw"] = med_hfp.group(1)
        if med_hp:
            data["measured_demand_peak_kw"] = med_hp.group(1)

        # 3b. Energia Elétrica (Simples)
        energia_simples_match = re.search(r"Energia El[ée]trica\s+(?:kWh\s+){1,2}([\d.,]+)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
        if energia_simples_match:
            add_item("Energia Elétrica", energia_simples_match.group(1), energia_simples_match.group(2), energia_simples_match.group(3))

        # 4. Energia Ativa - Fora Ponta
        energia_hfp_match = re.search(r"Energia\s*Ativa[\s\w/-]*?HFP[\s\w/-]*?(\d+[\d.,]*)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
        if energia_hfp_match:
             add_item("Energia Ativa Fora Ponta", energia_hfp_match.group(1), energia_hfp_match.group(2), energia_hfp_match.group(3))
            
        # 5. Energia Ativa - Ponta
        energia_hp_match = re.search(r"Energia\s*Ativa[\s\w/-]*?(?<!H)HP[\s\w/-]*?(\d+[\d.,]*)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
        if energia_hp_match:
             add_item("Energia Ativa Ponta", energia_hp_match.group(1), energia_hp_match.group(2), energia_hp_match.group(3))
            
        # 6. Energia Reativa Excedente, separada por posto tarifário. Os rótulos de item
        # ("Energia Reativa kWh HP") não têm hífen, ao contrário das linhas do medidor
        # ("Energia Reativa-Kwh Ponta"), que ficam de fora.
        ere_hfp = re.search(r"Energia\s*Reativa\s*kWh\s*" + HFP + r"\s*kWh" + ITEM_NUMS, text, re.IGNORECASE)
        ere_hp = re.search(r"Energia\s*Reativa\s*kWh\s*HP\s*kWh" + ITEM_NUMS, text, re.IGNORECASE)
        if ere_hfp:
            add_item("Energia Reativa Fora Ponta", *ere_hfp.groups())
        if ere_hp:
            add_item("Energia Reativa Ponta", *ere_hp.groups())
        if not (ere_hfp or ere_hp):
            # Layout sem posto tarifário explícito: mantém a leitura genérica
            energia_reativa_match = re.search(r"Energia\s*Reativa[\s\w/-]*?(\d+[\d.,]*)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
            if energia_reativa_match:
                add_item("Energia Reativa", energia_reativa_match.group(1), energia_reativa_match.group(2), energia_reativa_match.group(3))

        # 6a. Demanda Reativa Excedente (DRE), por posto tarifário
        dre_hfp = re.search(r"Demanda\s*Reativa\s*kW\s*" + HFP + r"\s*kW" + ITEM_NUMS, text, re.IGNORECASE)
        dre_hp = re.search(r"Demanda\s*Reativa\s*kW\s*HP\s*kW" + ITEM_NUMS, text, re.IGNORECASE)
        if dre_hfp:
            add_item("Demanda Reativa Excedente Fora Ponta", *dre_hfp.groups())
        if dre_hp:
            add_item("Demanda Reativa Excedente Ponta", *dre_hp.groups())

        # 6.b Custo de Disponibilidade
        custo_disp_match = re.search(r"Custo\s*de\s*Disponibilidade[\s\w/-]*?(\d+[\d.,]*)\s+([\d.,]+)\s+([\d.,]+,\d{2})(?!\d)", text, re.IGNORECASE)
        if custo_disp_match:
            add_item("Custo de Disponibilidade kWh", custo_disp_match.group(1), custo_disp_match.group(2), custo_disp_match.group(3))

        # 7. Impostos Retidos e Outros
        impostos = {
            "Imposto Retido IRPJ (Demanda)": r"Imposto\s*Retido\s*IRPJ\s*-\s*Demanda.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido PIS (Demanda)": r"Imposto\s*Retido\s*PIS\s*-\s*Demanda.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido COFINS (Demanda)": r"Imposto\s*Retido\s*COFINS\s*-?\s*Demanda.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido CSLL (Demanda)": r"Imposto\s*Retido\s*CSLL\s*-\s*Demanda.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido IRPJ (Energia)": r"Imposto\s*Retido\s*IRPJ\s*-\s*Energia.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido PIS (Energia)": r"Imposto\s*Retido\s*PIS\s*-\s*Energia.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido COFINS (Energia)": r"Imposto\s*Retido\s*COFINS\s*-?\s*Energia.*?([-\d.,]+,\d{2})(?!\d)",
            "Imposto Retido CSLL (Energia)": r"Imposto\s*Retido\s*CSLL\s*-\s*Energia.*?([-\d.,]+,\d{2})(?!\d)",
            "Contribuição Iluminação Pública": r"Contrib\s*Ilum\s*P[úu]blica\s*(?:Municipal)?.*?([\d.,]+,\d{2})(?!\d)",
            "Débito Var IPCA": r"D[ÉE]BITO\s*VAR\s*IPCA.*?([-\d.,]+,\d{2})(?!\d)",
            # Bandeiras tarifárias não entram como item: a fatura as mostra num quadro
            # informativo ("Adicional Bandeiras - Já incluído no Valor a Pagar"), com o
            # valor já embutido nos itens de energia. Somá-las contaria o custo duas vezes.
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

        # 9. Nome do prédio (extrair do rodapé da fatura)
        # Formato: "Fatura 01 Residência Estudantil (5140657) SEI 23079..."
        building_match = re.search(r"Fatura\s+\d+\s+(.+?)\s*\(\d+\)", text)
        if building_match:
            data["building_name"] = building_match.group(1).strip()
            
        return data
        
    except Exception as e:
        print(f"Erro ao extrair PDF {pdf_path}: {e}")
        return data
