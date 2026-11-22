import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import { Card, EmptyState, Field, Icon, PageHeader, Spinner, StatCard, useToast } from "./components";
import { formatBRL, formatBRLCompact, formatDate, sortMonths } from "./format";

export default function Dashboard() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const [bills, setBills] = useState([]);
  const [units, setUnits] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCodes, setAvailableCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingExport, setLoadingExport] = useState(false);

  const [filterMonth, setFilterMonth] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [sortAmount, setSortAmount] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const headers = useMemo(() => ({ Authorization: `Bearer ${user?.token}` }), [user]);

  const buildUrl = useCallback((path) => {
    const url = new URL(`${API_URL}${path}`);
    if (filterMonth) url.searchParams.append("reference_month", filterMonth);
    if (filterCode) url.searchParams.append("installation_code", filterCode);
    if (filterUnit) url.searchParams.append("unit_id", filterUnit);
    if (sortAmount) url.searchParams.append("sort_amount", sortAmount);
    return url;
  }, [filterMonth, filterCode, filterUnit, sortAmount]);

  const fetchBills = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetch(buildUrl("/bills"), { headers })
      .then((res) => res.json())
      .then((data) => data.success && setBills(data.data))
      .catch(() => notify("Não foi possível carregar as faturas.", "error"))
      .finally(() => setLoading(false));
  }, [user, headers, buildUrl, notify]);

  useEffect(() => { fetchBills(); }, [fetchBills]);
  useEffect(() => { setPage(0); }, [filterMonth, filterCode, filterUnit, sortAmount]);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/units`, { headers }).then((r) => r.json()).then((d) => d.success && setUnits(d.data));
    fetch(`${API_URL}/bills/months`, { headers }).then((r) => r.json()).then((d) => d.success && setAvailableMonths(sortMonths(d.data)));
    fetch(`${API_URL}/bills/installations`, { headers }).then((r) => r.json()).then((d) => d.success && setAvailableCodes(d.data));
  }, [user, headers]);

  const handleDelete = async (e, bill) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir a fatura de ${bill.reference_month} da instalação ${bill.installation_code || "sem código"}? Os itens também serão apagados.`)) return;
    try {
      const res = await fetch(`${API_URL}/bills/${bill.id}`, { method: "DELETE", headers });
      const data = await res.json();
      if (data.success) { notify("Fatura excluída."); fetchBills(); }
      else notify("Não foi possível excluir a fatura.", "error");
    } catch {
      notify("Falha de comunicação com o servidor.", "error");
    }
  };

  const handleExport = async () => {
    setLoadingExport(true);
    try {
      const res = await fetch(buildUrl("/bills/export"), { headers });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const href = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "faturas_ufrj.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(href);
    } catch {
      notify("Não foi possível exportar a planilha.", "error");
    } finally {
      setLoadingExport(false);
    }
  };

  const clearFilters = () => { setFilterMonth(""); setFilterCode(""); setFilterUnit(""); setSortAmount(""); };
  const hasFilters = filterMonth || filterCode || filterUnit;

  const total = bills.reduce((s, b) => s + (b.total_amount || 0), 0);
  const unlinked = bills.filter((b) => !b.unit_name).length;
  const nInstallations = new Set(bills.map((b) => b.installation_code).filter(Boolean)).size;

  return (
    <>
      <PageHeader
        title="Faturas"
        subtitle="Faturas de energia elétrica importadas e validadas, por instalação e mês de referência."
        actions={
          <>
            <button className="btn btn-secondary" onClick={handleExport} disabled={loadingExport || bills.length === 0}>
              {loadingExport ? <span className="spinner" /> : <Icon name="download" />} Exportar Excel
            </button>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => navigate("/upload")}>
                <Icon name="plus" /> Importar faturas
              </button>
            )}
          </>
        }
      />

      <div className="stats">
        <StatCard tone="primary" label={hasFilters ? "Valor faturado (filtro)" : "Valor faturado"} value={formatBRLCompact(total)} hint={formatBRL(total)} />
        <StatCard label="Faturas" value={bills.length.toLocaleString("pt-BR")} hint={`${nInstallations} instalações`} />
        <StatCard tone={unlinked ? "warn" : "default"} label="Sem unidade vinculada" value={unlinked.toLocaleString("pt-BR")}
          hint={unlinked ? (isAdmin ? <Link to="/units">Cadastrar unidades</Link> : "Ficam fora das análises por unidade") : "Todas vinculadas"} />
      </div>

      <div className="toolbar">
        <Field label="Mês de referência">
          <select className="select" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
            <option value="">Todos</option>
            {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Unidade">
          <select className="select" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)}>
            <option value="">Todas</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Instalação">
          <select className="select" value={filterCode} onChange={(e) => setFilterCode(e.target.value)}>
            <option value="">Todas</option>
            {availableCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {(hasFilters || sortAmount) && (
          <button className="btn btn-ghost" onClick={clearFilters}><Icon name="x" size={16} /> Limpar filtros</button>
        )}
      </div>

      <Card padded={false}>
        {loading ? (
          <Spinner label="Carregando faturas..." />
        ) : bills.length === 0 ? (
          <EmptyState title={hasFilters ? "Nenhuma fatura com esses filtros" : "Nenhuma fatura importada ainda"}>
            {hasFilters ? "Tente remover algum filtro." : isAdmin ? <Link to="/upload">Importar as primeiras faturas</Link> : "Peça a um administrador para importar as faturas."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Instalação</th>
                  <th>Referência</th>
                  <th>Vencimento</th>
                  <th className="num">
                    <button className="th-sort" onClick={() => setSortAmount(sortAmount === "desc" ? "asc" : "desc")}
                      aria-label="Ordenar por valor">
                      Valor total <Icon name="sort" size={14} />
                    </button>
                  </th>
                  <th className="actions-cell"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {bills.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((bill) => (
                  <tr key={bill.id} className="clickable" onClick={() => navigate(`/bill/${bill.id}`)}>
                    <td className="strong">{bill.unit_name || <span className="faint">Não vinculada</span>}</td>
                    <td className="num" style={{ textAlign: "left" }}>{bill.installation_code || "—"}</td>
                    <td>{bill.reference_month || "—"}</td>
                    <td>{formatDate(bill.due_date)}</td>
                    <td className="num strong">{formatBRL(bill.total_amount)}</td>
                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" title="Ver detalhes" onClick={() => navigate(`/bill/${bill.id}`)}><Icon name="eye" /></button>
                      {isAdmin && (
                        <>
                          <button className="icon-btn" title="Editar" onClick={() => navigate(`/bill/${bill.id}/edit`)}><Icon name="edit" /></button>
                          <button className="icon-btn danger" title="Excluir" onClick={(e) => handleDelete(e, bill)}><Icon name="trash" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bills.length > PAGE_SIZE && (
              <div className="row spread card-body" style={{ borderTop: "1px solid var(--border)", paddingTop: 12, paddingBottom: 12 }}>
                <span className="muted">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, bills.length)} de {bills.length} faturas
                </span>
                <div className="row">
                  <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <Icon name="chevronLeft" size={15} /> Anterior
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={(page + 1) * PAGE_SIZE >= bills.length} onClick={() => setPage(page + 1)}>
                    Próxima <Icon name="chevronRight" size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
