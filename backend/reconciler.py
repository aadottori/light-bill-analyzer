"""
Módulo de Reconciliação e Comparação entre o Interpretador Local (Regex) e a IA (Google AI Studio).
"""

from typing import Dict, Any, List, Optional
from backend.parser import parse_moeda, format_moeda

def evaluate_extraction_quality(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Avalia a completude e consistência matemática de uma extração.
    Retorna pontuação de 0 a 100 e diagnóstico dos critérios.
    """
    if not data:
        return {"score": 0, "math_valid": False, "items_sum": 0.0, "total": 0.0, "details": ["Nenhum dado extraído."]}

    score = 0
    details = []

    # 1. Cabeçalho básico (60 pontos possíveis)
    inst = data.get("installation_code")
    if inst and len(str(inst).strip()) >= 8:
        score += 20
        details.append("Código da Instalação identificado (+20)")
    else:
        details.append("Código da Instalação ausente ou incompleto")

    ref = data.get("reference_month")
    if ref and "/" in str(ref):
        score += 15
        details.append("Mês de Referência válido (+15)")
    else:
        details.append("Mês de Referência ausente")

    due = data.get("due_date")
    if due and "/" in str(due):
        score += 15
        details.append("Data de Vencimento válida (+15)")
    else:
        details.append("Data de Vencimento ausente")

    tot_str = data.get("total_amount")
    total_val = parse_moeda(str(tot_str)) if tot_str else 0.0
    if total_val > 0:
        score += 15
        details.append("Valor Total válido (+15)")
    else:
        details.append("Valor Total ausente ou zerado")

    if data.get("contract_account"):
        score += 10
        details.append("Conta Contrato identificada (+10)")

    if data.get("building_name"):
        score += 5
        details.append("Nome do Prédio/Instalação identificado (+5)")

    # 2. Itens e Fechamento Matemático (40 pontos possíveis)
    items = data.get("items", [])
    items_count = len(items)
    
    if items_count > 0:
        # Pontuação pela quantidade de itens discriminados (até 15 pontos)
        score += min(items_count * 2, 15)
        details.append(f"{items_count} itens discriminados (+{min(items_count * 2, 15)})")

        # Soma algébrica dos itens
        items_sum = sum(parse_moeda(str(it.get("amount", "0"))) for it in items)
        
        # Teste de fechamento contábil:
        # Na fatura, o valor total deve bater exatamente com a soma dos itens (considerando deduções de tributos retidos)
        diff = abs(items_sum - total_val)
        math_valid = False

        if total_val > 0:
            if diff <= 0.10: # Fechamento exato com centavos
                score += 25
                math_valid = True
                details.append(f"Fechamento contábil EXATO: soma dos itens (R$ {format_moeda(items_sum)}) igual ao total (+25)")
            elif diff <= 2.00 or (diff / total_val) <= 0.02: # Diferença desprezível de arredondamento
                score += 15
                math_valid = True
                details.append(f"Fechamento contábil aproximado: margem residual de R$ {format_moeda(diff)} (+15)")
            else:
                details.append(f"Divergência contábil: soma dos itens (R$ {format_moeda(items_sum)}) difere do total (R$ {format_moeda(total_val)}) em R$ {format_moeda(diff)}")
    else:
        items_sum = 0.0
        math_valid = False
        details.append("Nenhum item de fatura extraído")

    final_score = min(max(score, 0), 100)
    return {
        "score": final_score,
        "math_valid": math_valid,
        "items_count": items_count,
        "items_sum": items_sum,
        "total": total_val,
        "details": details
    }

def reconcile_extractions(regex_data: Dict[str, Any], ai_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compara os dados do interpretador Regex com a extração da IA.
    Determina o vencedor e sintetiza os pontos divergentes.
    """
    regex_eval = evaluate_extraction_quality(regex_data)
    ai_eval = evaluate_extraction_quality(ai_data) if ai_data else {"score": 0, "math_valid": False, "items_count": 0, "items_sum": 0.0, "total": 0.0, "details": []}

    # Critério de desempate:
    # 1. Maior pontuação de completude e fechamento contábil
    # 2. Se pontuação similar (+-5 pts), prefere quem fechou o somatório dos itens exatamente
    # 3. Em caso de empate absoluto, prefere IA se tiver mais itens, senão Regex
    if not ai_data or ai_eval["score"] == 0:
        winner = "regex"
    elif ai_eval["math_valid"] and not regex_eval["math_valid"]:
        winner = "ai"
    elif regex_eval["math_valid"] and not ai_eval["math_valid"]:
        winner = "regex"
    elif ai_eval["score"] > regex_eval["score"]:
        winner = "ai"
    elif regex_eval["score"] > ai_eval["score"]:
        winner = "regex"
    else:
        # Empate
        winner = "ai" if ai_eval["items_count"] >= regex_eval["items_count"] else "regex"

    # Levantar divergências de cabeçalho
    header_diffs = []
    fields = [
        ("installation_code", "Código da Instalação"),
        ("contract_account", "Conta Contrato"),
        ("reference_month", "Mês de Referência"),
        ("due_date", "Data de Vencimento"),
        ("total_amount", "Valor Total (R$)"),
        ("building_name", "Nome do Prédio")
    ]

    for field, label in fields:
        val_regex = regex_data.get(field)
        val_ai = ai_data.get(field) if ai_data else None
        
        is_diff = str(val_regex or "").strip() != str(val_ai or "").strip()
        header_diffs.append({
            "field": field,
            "label": label,
            "regex_value": val_regex,
            "ai_value": val_ai,
            "divergent": is_diff,
            "chosen_value": val_ai if winner == "ai" else val_regex
        })

    # Analisar itens detectados por um e não pelo outro
    regex_descs = {it.get("description", "").lower().strip() for it in regex_data.get("items", [])}
    ai_descs = {it.get("description", "").lower().strip() for it in (ai_data.get("items", []) if ai_data else [])}
    
    only_in_ai = [it for it in (ai_data.get("items", []) if ai_data else []) if it.get("description", "").lower().strip() not in regex_descs]
    only_in_regex = [it for it in regex_data.get("items", []) if it.get("description", "").lower().strip() not in ai_descs]

    # Dados ativos (o vencedor assume a dianteira)
    chosen_data = ai_data if winner == "ai" else regex_data

    # Clonar para não mutar original e anexar metadados da comparação
    active_data = dict(chosen_data)
    active_data["_reconciliation"] = {
        "winner": winner,
        "winner_label": "Inteligência Artificial (Google AI Studio)" if winner == "ai" else "Interpretador Local (Regex)",
        "score_ai": ai_eval["score"],
        "score_regex": regex_eval["score"],
        "regex_items_count": regex_eval["items_count"],
        "ai_items_count": ai_eval["items_count"],
        "header_diffs": header_diffs,
        "extra_items_found_by_ai": len(only_in_ai),
        "only_in_ai_descriptions": [it.get("description") for it in only_in_ai],
        "only_in_regex_descriptions": [it.get("description") for it in only_in_regex],
        "math_check_ai": ai_eval,
        "math_check_regex": regex_eval
    }

    return {
        "winner": winner,
        "winner_label": "Inteligência Artificial" if winner == "ai" else "Interpretador Local",
        "scores": {
            "ai": ai_eval["score"],
            "regex": regex_eval["score"]
        },
        "active_data": active_data,
        "regex_data": regex_data,
        "ai_data": ai_data,
        "header_diffs": header_diffs,
        "only_in_ai": only_in_ai,
        "only_in_regex": only_in_regex
    }
