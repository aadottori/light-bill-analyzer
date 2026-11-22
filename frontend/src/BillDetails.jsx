import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import { Alert, Badge, Card, Icon, PageHeader, Spinner } from "./components";
import { formatBRL, formatDate, formatDateTime, formatNumber, itemCategory, parseBR } from "./format";

// Situação da demanda: ultrapassagem (> 5% acima da contratada), ociosa (< contratada) ou adequada
function demandStatus(measured, contracted) {
  if (!measured || !contracted) return null;
  const ratio = measured / contracted;
  if (ratio > 1.05) return { tone: "bad", label: `Ultrapassagem de ${formatNumber((ratio - 1) * 100, 0)}%` };
  if (ratio < 1) return { tone: "warn", label: `${formatNumber((1 - ratio) * 100, 0)}% da contratada sem uso` };
  return { tone: "good", label: "Dentro da tolerância" };
}

function DemandBlock({ title, measured, contracted }) {
  const m = parseBR(measured);
  const c = parseBR(contracted);
  const status = demandStatus(m, c);
  return (
    <div>
      <div className="row spread" style={{ marginBottom: 10 }}>
        <strong>{title}</strong>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>
      <dl className="dl">
        <div><dt>Contratada</dt><dd>{c !== null ? `${formatNumber(c)} kW` : "—"}</dd></div>
        <div><dt>Medida</dt><dd>{m !== null ? `${formatNumber(m)} kW` : "—"}</dd></div>
        <div><dt>Utilização</dt><dd>{m && c ? `${formatNumber((m / c) * 100, 0)}%` : "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function BillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/bills/${id}`, { headers: { Authorization: `Bearer ${user.token}` } })
      .then((res) => res.json())
      .then((data) => (data.success ? setBill(data.data) : setError(data.detail || "Fatura não encontrada.")))
      .catch(() => setError("Falha de comunicação com o servidor."))
      .finally(() => setLoading(false));
  }, [id, user]);

  const back = <button className="back-link" onClick={() => navigate("/")}><Icon name="arrowLeft" size={15} /> Faturas</button>;

  if (loading) return <Spinner label="Carregando fatura..." />;
  if (error || !bill) return <><PageHeader back={back} title="Fatura" /><Alert>{error || "Fatura não encontrada."}</Alert></>;

  const items = bill.items || [];
  const itemsSum = items.reduce((s, it) => s + (it.amount || 0), 0);
  const diff = bill.total_amount !== null ? itemsSum - bill.total_amount : null;
  const closes = diff !== null && Math.abs(diff) < 1;
  const isAzul = bill.tariff_modality === "Azul";
  const hasDemand = bill.contracted_demand_kw || bill.measured_demand_kw;

  return (
    <>
      <PageHeader
        back={back}
        title={bill.unit_name || `Instalação ${bill.installation_code || "sem código"}`}
        subtitle={`Fatura de ${bill.reference_month || "mês não identificado"} · instalação ${bill.installation_code || "—"}`}
        actions={user?.role === "admin" && (
          <button className="btn btn-primary" onClick={() => navigate(`/bill/${bill.id}/edit`)}><Icon name="edit" /> Editar fatura</button>
        )}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Card title="Dados da fatura">
          <dl className="dl">
            <div><dt>Valor total</dt><dd style={{ fontSize: 18 }}>{formatBRL(bill.total_amount)}</dd></div>
            <div><dt>Mês de referência</dt><dd>{bill.reference_month || "—"}</dd></div>
            <div><dt>Vencimento</dt><dd>{formatDate(bill.due_date)}</dd></div>
            <div><dt>Modalidade tarifária</dt><dd>{bill.tariff_modality ? `A4 ${bill.tariff_modality}` : "—"}</dd></div>
            <div><dt>Código da instalação</dt><dd>{bill.installation_code || "—"}</dd></div>
            <div><dt>Conta contrato</dt><dd>{bill.contract_account || "—"}</dd></div>
          </dl>
        </Card>
        <Card title="Importação">
          <dl className="dl" style={{ gridTemplateColumns: "1fr" }}>
            <div><dt>Arquivo original</dt><dd style={{ fontWeight: 500, wordBreak: "break-all" }}>{bill.original_file_name || "—"}</dd></div>
            <div><dt>Importada por</dt><dd style={{ fontWeight: 500 }}>{bill.imported_by || "—"}</dd></div>
            <div><dt>Data da importação</dt><dd style={{ fontWeight: 500 }}>{formatDateTime(bill.imported_at)}</dd></div>
          </dl>
        </Card>
      </div>

      {hasDemand && (
        <Card title="Demanda" subtitle="Comparação entre a demanda medida no mês e a contratada (tolerância de 5%, REN ANEEL 1.000/2021)." className="mb-16">
          <div className={isAzul ? "grid grid-2" : ""}>
            <DemandBlock title={isAzul ? "Fora de ponta" : "Demanda única"} measured={bill.measured_demand_kw} contracted={bill.contracted_demand_kw} />
            {isAzul && <DemandBlock title="Ponta" measured={bill.measured_demand_peak_kw} contracted={bill.contracted_demand_peak_kw} />}
          </div>
        </Card>
      )}

      <Card title="Itens da fatura" subtitle={`${items.length} itens extraídos`} padded={false}
        actions={diff !== null && (
          <Badge tone={closes ? "good" : "warn"}>{closes ? "Soma confere com o total" : `Diferença de ${formatBRL(diff)}`}</Badge>
        )}>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Categoria</th>
                <th className="num">Quantidade</th>
                <th className="num">Preço unitário</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const cat = itemCategory(item.description);
                return (
                  <tr key={i}>
                    <td className="strong">{item.description}</td>
                    <td><Badge tone={cat.tone}>{cat.label}</Badge></td>
                    <td className="num">{item.quantity ? formatNumber(item.quantity, Number.isInteger(item.quantity) ? 0 : 2) : "—"}</td>
                    <td className="num">{item.unit_price ? `R$ ${formatNumber(item.unit_price, 4)}` : "—"}</td>
                    <td className="num strong">{formatBRL(item.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Soma dos itens</td>
                <td className="num">{formatBRL(itemsSum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
