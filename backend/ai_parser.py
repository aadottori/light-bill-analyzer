"""
Módulo de Integração com Google AI Studio (Gemini) para Leitura Estruturada de Faturas de Energia Elétrica.
"""

import os
import json
import re
from typing import Dict, Any, Optional, List
import pdfplumber
from dotenv import load_dotenv

load_dotenv()

# Modelos recomendados no Google AI Studio
DEFAULT_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-1.5-flash"

SYSTEM_PROMPT = """Você é um Engenheiro Eletricista especialista em tarifação do Grupo A e B da concessionária Light S.A. e regulação da ANEEL (Resolução Normativa nº 1.000/2021).
Sua missão é extrair com precisão cirúrgica e absoluta integridade todos os dados de faturamento da fatura de energia elétrica da UFRJ (Universidade Federal do Rio de Janeiro).

Instruções Críticas para a Concessionária Light:
1. installation_code: O Código da Instalação da Light costuma ter 9 a 10 dígitos (ex: 400103438 ou 0020007122). Não confunda com Código do Cliente ou CNPJ.
2. contract_account: A Conta Contrato normalmente possui 11 dígitos e começa com 700... (ex: 70000007581).
3. reference_month: Mês e ano de competência no formato MMM/AAAA (ex: JAN/2025).
4. due_date: Data de vencimento no formato DD/MM/AAAA (ex: 10/03/2025).
5. total_amount: Valor Total a pagar da fatura no formato decimal brasileiro (ex: "30.329,39").
6. building_name: Nome do prédio, instituto ou instalação da UFRJ. Muitas vezes aparece no rodapé da fatura ou cabeçalho (ex: "Residência Estudantil", "Centro de Tecnologia", "HUCFF").
7. items: Extraia TODAS as linhas da tabela "Itens de fatura", sem omitir nenhuma:
   - Demanda Ativa kW (HFP / Único ou Ponta) com Quantidade, Preço Unitário e Valor.
   - Demanda de Ultrapassagem (se houver).
   - Energia Ativa kWh (Fora Ponta - HFP e Ponta - HP).
   - Energia Reativa Excedente (ERE em kWh/kVArh).
   - Custo de Disponibilidade (se aplicável).
   - Adicionais de Bandeiras Tarifárias (Amarela, Vermelha, etc.).
   - Contribuição de Iluminação Pública Municipal (CIP/COSIP).
   - Débitos/Créditos de Variação IPCA.
   - Cobranças adicionais de FECP / ICMS retroativo.
   - Tributos Retidos (IRPJ, PIS, COFINS, CSLL) com valor negativo conforme discriminado.
   - Multas e Juros de Mora.

IMPORTANTE: Retorne APENAS um JSON estritamente válido seguindo o formato solicitado, sem explicações adicionais ou markdown fora do bloco json.
"""

JSON_SCHEMA_EXAMPLE = {
    "installation_code": "400103438",
    "contract_account": "70000007581",
    "reference_month": "JAN/2025",
    "due_date": "10/03/2025",
    "total_amount": "30.329,39",
    "building_name": "Residência Estudantil",
    "items": [
        {
            "description": "Demanda Ativa kW HFP/Único",
            "quantity": "98",
            "unit_price": "28,61378799",
            "amount": "2.804,15"
        },
        {
            "description": "Energia Ativa kWh HFP/Único",
            "quantity": "39.204",
            "unit_price": "0,52088319",
            "amount": "20.420,70"
        }
    ]
}

def get_api_key(override_key: Optional[str] = None) -> Optional[str]:
    """Obtém a chave da API do Google AI Studio."""
    return (
        override_key 
        or os.getenv("GEMINI_API_KEY") 
        or os.getenv("GOOGLE_API_KEY")
    )

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extrai o texto completo de todas as páginas do PDF via pdfplumber."""
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            full_text += f"--- PÁGINA {i+1} ---\n{text}\n\n"
    return full_text.strip()

def parse_pdf_ai(pdf_path: str, api_key: Optional[str] = None, model_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Realiza a extração estruturada do PDF utilizando a API Gemini do Google AI Studio.
    """
    key = get_api_key(api_key)
    if not key:
        return {
            "success": False,
            "error": "Chave da API do Google AI Studio não configurada. Defina GEMINI_API_KEY ou informe sua chave.",
            "data": None
        }

    raw_text = extract_text_from_pdf(pdf_path)
    if not raw_text:
        return {
            "success": False,
            "error": "Não foi possível extrair texto do PDF para envio à IA.",
            "data": None
        }

    user_prompt = f"""Extraia todos os dados da seguinte fatura de energia elétrica da Light / UFRJ:

{raw_text}

Retorne um objeto JSON estrito com os campos:
- installation_code (string ou null)
- contract_account (string ou null)
- reference_month (string ex: 'JAN/2025' ou null)
- due_date (string ex: '10/03/2025' ou null)
- total_amount (string ex: '30.329,39' ou null)
- building_name (string ou null)
- items (lista de objetos com 'description', 'quantity', 'unit_price', 'amount')
"""

    model_to_use = model_name or DEFAULT_MODEL

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key)

        response = client.models.generate_content(
            model=model_to_use,
            contents=[SYSTEM_PROMPT, user_prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        
        response_text = response.text.strip()
        # Limpar eventuais blocos markdown ```json ... ``` se existirem
        if response_text.startswith("```"):
            response_text = re.sub(r"^```[a-zA-Z]*\n?", "", response_text)
            response_text = re.sub(r"\n?```$", "", response_text)
            response_text = response_text.strip()

        parsed_json = json.loads(response_text)
        
        # Validação básica e normalização da estrutura
        result_data = {
            "installation_code": parsed_json.get("installation_code"),
            "contract_account": parsed_json.get("contract_account"),
            "reference_month": parsed_json.get("reference_month"),
            "due_date": parsed_json.get("due_date"),
            "total_amount": parsed_json.get("total_amount"),
            "building_name": parsed_json.get("building_name"),
            "items": []
        }
        
        for item in parsed_json.get("items", []):
            desc = str(item.get("description", "")).strip()
            amount = item.get("amount")
            if desc and amount is not None:
                result_data["items"].append({
                    "description": desc,
                    "quantity": str(item.get("quantity")) if item.get("quantity") is not None else None,
                    "unit_price": str(item.get("unit_price")) if item.get("unit_price") is not None else None,
                    "amount": str(amount).strip()
                })

        return {
            "success": True,
            "model": model_to_use,
            "data": result_data
        }

    except Exception as e:
        # Tenta fallback para requests direto via REST API caso ocorra erro no SDK
        return _fallback_rest_api(key, user_prompt, model_to_use, str(e))

def _fallback_rest_api(api_key: str, prompt: str, model: str, original_error: str) -> Dict[str, Any]:
    """Fallback direto via chamada REST HTTP caso o SDK encontre alguma incompatibilidade."""
    import requests
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": SYSTEM_PROMPT},
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1
        }
    }
    
    try:
        resp = requests.post(url, json=payload, timeout=40)
        if resp.status_code != 200:
            return {
                "success": False,
                "error": f"Erro na API Google AI Studio ({resp.status_code}): {resp.text}",
                "original_sdk_error": original_error,
                "data": None
            }
            
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return {"success": False, "error": "Nenhuma resposta gerada pelo modelo Gemini.", "data": None}
            
        text_out = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        if text_out.startswith("```"):
            text_out = re.sub(r"^```[a-zA-Z]*\n?", "", text_out)
            text_out = re.sub(r"\n?```$", "", text_out)
            text_out = text_out.strip()
            
        parsed_json = json.loads(text_out)
        return {
            "success": True,
            "model": f"{model} (REST)",
            "data": parsed_json
        }
    except Exception as ex:
        return {
            "success": False,
            "error": f"Falha na comunicação com Google AI Studio: {str(ex)} (Original: {original_error})",
            "data": None
        }
