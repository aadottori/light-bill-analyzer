import { Badge, Card, Field, Icon } from "./components";
import { formatBRL, itemCategory, parseBR } from "./format";

const HEADER_FIELDS = [
  ["installation_code", "Código da instalação"],
  ["contract_account", "Conta contrato"],
  ["reference_month", "Mês de referência", "Ex.: JAN/2025"],
  ["due_date", "Vencimento", "DD/MM/AAAA"],
  ["total_amount", "Valor total (R$)"],
];

const DEMAND_FIELDS = [
  ["contracted_demand_kw", "Demanda contratada (kW)", "Fora de ponta ou única"],
  ["measured_demand_kw", "Demanda medida (kW)", "Fora de ponta ou única"],
  ["contracted_demand_peak_kw", "Contratada na ponta (kW)", "Só modalidade Azul"],
  ["measured_demand_peak_kw", "Medida na ponta (kW)", "Só modalidade Azul"],
];

// Formulário de cabeçalho + itens, usado na validação da importação e na edição.
export default function BillForm({ data, onField, onItem, onAddItem, onRemoveItem, suggestions = [], showBuilding = false }) {
  const items = data.items || [];
  const itemsSum = items.reduce((s, it) => s + (parseBR(it.amount) || 0), 0);
  const total = parseBR(data.total_amount);
  const diff = total !== null ? itemsSum - total : null;
  const closes = diff !== null && Math.abs(diff) < 1;

  return (
    <>
      <datalist id="descricoes-sugeridas">
        {suggestions.map((d) => <option key={d} value={d} />)}
      </datalist>

      <Card title="Cabeçalho" className="mb-16">
        <div className="form-grid">
          {HEADER_FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input className="input" value={data[key] || ""} onChange={(e) => onField(key, e.target.value)} />
            </Field>
          ))}
          {showBuilding && (
            <Field label="Nome do prédio (no PDF)" hint="Usado só como referência">
              <input className="input" value={data.building_name || ""} onChange={(e) => onField("building_name", e.target.value)} />
            </Field>
          )}
        </div>
      </Card>

      <Card title="Modalidade e demanda" subtitle="Usadas na análise de ultrapassagem e de demanda contratada ociosa." className="mb-16">
        <div className="form-grid">
          <Field label="Modalidade tarifária">
            <select className="select" value={data.tariff_modality || ""} onChange={(e) => onField("tariff_modality", e.target.value || null)}>
              <option value="">Não identificada</option>
              <option value="Verde">A4 Verde</option>
              <option value="Azul">A4 Azul</option>
            </select>
          </Field>
          {DEMAND_FIELDS.map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input className="input input-num" inputMode="decimal" value={data[key] || ""} onChange={(e) => onField(key, e.target.value)} />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Itens da fatura" subtitle="Valores no formato brasileiro (ex.: 1.234,56). Descontos e retenções entram como valores negativos."
        actions={diff !== null && <Badge tone={closes ? "good" : "warn"}>{closes ? "Soma confere com o total" : `Diferença de ${formatBRL(diff)}`}</Badge>}
        padded={false}>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table table-edit">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Descrição</th>
                <th>Categoria</th>
                <th className="num">Quantidade</th>
                <th className="num">Preço unitário</th>
                <th className="num">Valor (R$)</th>
                <th className="actions-cell"><span className="sr-only">Remover</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const cat = itemCategory(item.description);
                return (
                  <tr key={i}>
                    <td><input className="input table-input" list="descricoes-sugeridas" value={item.description || ""} onChange={(e) => onItem(i, "description", e.target.value)} /></td>
                    <td><Badge tone={cat.tone}>{cat.label}</Badge></td>
                    <td><input className="input table-input input-num" placeholder="—" value={item.quantity ?? ""} onChange={(e) => onItem(i, "quantity", e.target.value)} /></td>
                    <td><input className="input table-input input-num" placeholder="—" value={item.unit_price ?? ""} onChange={(e) => onItem(i, "unit_price", e.target.value)} /></td>
                    <td><input className="input table-input input-num" style={{ fontWeight: 600 }} value={item.amount ?? ""} onChange={(e) => onItem(i, "amount", e.target.value)} /></td>
                    <td className="actions-cell">
                      {onRemoveItem && (
                        <button className="icon-btn danger" title="Remover item" onClick={() => onRemoveItem(i)}><Icon name="trash" size={16} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Soma dos itens</td>
                <td className="num">{formatBRL(itemsSum)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="card-body">
          <button className="btn btn-secondary btn-sm" onClick={onAddItem}><Icon name="plus" size={15} /> Adicionar item</button>
        </div>
      </Card>
    </>
  );
}
