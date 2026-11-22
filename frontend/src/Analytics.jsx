import { useState, useEffect } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import { Badge, Card, ChartTooltip, EmptyState, Field, Icon, PageHeader, Spinner, StatCard } from "./components";
import { formatBRL, formatBRLCompact, formatNumber, shortMonth, sortByMonth, sortMonths } from "./format";

// Ordem categórica fixa (diretriz de visualização): azul, laranja, verde-água, amarelo
const SERIES = {
  energy: { name: "Energia", color: "var(--s1)", hex: "#2a78d6" },
  demand: { name: "Demanda", color: "var(--s2)", hex: "#eb6834" },
  reactive: { name: "Reativo excedente", color: "var(--s3)", hex: "#1baf7a" },
  fines: { name: "Multas e juros", color: "var(--s4)", hex: "#eda100" },
};

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11.5, fill: "#6b7686" } };

function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((s) => (
        <span key={s.name} className="legend-item"><span className="swatch" style={{ background: s.hex }} />{s.name}</span>
      ))}
    </div>
  );
}

// Ranking em barras horizontais; aceita uma ou duas parcelas empilhadas por linha
function Ranking({ rows, parts, limit = 8, valueFormatter = formatBRL }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <EmptyState icon="chart" title="Sem dados no período" />;
  const max = Math.max(...rows.map((r) => r.total));
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <div className="rank">
        {shown.map((r, i) => (
          <div key={r.unit} className="rank-row" title={parts.map((p) => `${p.name}: ${formatBRL(r[p.key])}`).join(" · ")}>
            <span className="rank-pos">{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="rank-name">{r.unit}</div>
              <div className="rank-bar" style={{ display: "flex", gap: 2, background: "transparent" }}>
                {parts.map((p) => r[p.key] > 0 && (
                  <span key={p.key} style={{ width: `${(r[p.key] / max) * 100}%`, background: p.hex }} />
                ))}
              </div>
            </div>
            <span className="rank-value">{valueFormatter(r.total)}</span>
          </div>
        ))}
      </div>
      {rows.length > limit && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Mostrar todas (${rows.length})`}
        </button>
      )}
    </>
  );
}

function utilizationBadge(measured, contracted) {
  if (!measured || !contracted) return <span className="faint">—</span>;
  const u = (measured / contracted) * 100;
  const tone = u > 105 ? "bad" : u < 80 ? "warn" : "good";
  return <Badge tone={tone}>{formatNumber(u, 0)}%</Badge>;
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState([]);
  const [units, setUnits] = useState([]);
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [unitId, setUnitId] = useState("");
  const [d, setD] = useState(null);

  useEffect(() => {
    const h = { Authorization: `Bearer ${user.token}` };
    fetch(`${API_URL}/bills/months`, { headers: h }).then((r) => r.json()).then((x) => x.success && setMonths(sortMonths(x.data)));
    fetch(`${API_URL}/units`, { headers: h }).then((r) => r.json()).then((x) => x.success && setUnits(x.data));
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (startMonth) params.append("start_month", startMonth);
    if (endMonth) params.append("end_month", endMonth);
    if (unitId) params.append("unit_id", unitId);
    const qs = params.toString() ? `?${params}` : "";
    const h = { Authorization: `Bearer ${user.token}` };
    const get = (path) => fetch(`${API_URL}${path}${qs}`, { headers: h }).then((r) => r.json()).then((x) => (x.success ? x.data : [])).catch(() => []);

    Promise.all([
      get("/analytics/kpis"), get("/analytics/trends"), get("/analytics/offenders"), get("/analytics/units/cost"),
      get("/analytics/avoidable/units"), get("/analytics/demand"), get("/analytics/monthly-breakdown"),
    ]).then(([kpis, trends, offenders, unitCosts, avoidable, demand, breakdown]) => {
      setD({ kpis, trends: sortByMonth(trends), offenders, unitCosts, avoidable, demand, breakdown: sortByMonth(breakdown) });
    }).finally(() => setLoading(false));
  }, [user, startMonth, endMonth, unitId]);

  const hasFilters = startMonth || endMonth || unitId;
  const filters = (
    <div className="toolbar">
      <Field label="De">
        <select className="select" value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
          <option value="">Primeiro mês</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Até">
        <select className="select" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}>
          <option value="">Último mês</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Unidade">
        <select className="select" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Todas</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      {hasFilters && <button className="btn btn-ghost" onClick={() => { setStartMonth(""); setEndMonth(""); setUnitId(""); }}><Icon name="x" size={16} /> Limpar filtros</button>}
    </div>
  );

  const header = <PageHeader title="Análises" subtitle="Custos de energia por mês e por unidade, com destaque para as cobranças evitáveis: reativo excedente e ultrapassagem de demanda." />;

  if (loading && !d) return <>{header}{filters}<Spinner label="Calculando indicadores..." /></>;
  const k = d.kpis || {};
  const avoidable = (k.total_reactive || 0) + (k.total_overage || 0);
  const peak = k.peak_cost || 0;
  const offPeak = k.off_peak_cost || 0;
  const energyTotal = peak + offPeak;
  const breakdownSeries = Object.entries(SERIES).map(([key, s]) => ({ key, ...s }));

  return (
    <>
      {header}
      {filters}

      <div className="stats" style={{ opacity: loading ? 0.6 : 1 }}>
        <StatCard tone="bad" label="Custos evitáveis" value={formatBRLCompact(avoidable)} hint="Reativo excedente + ultrapassagem" />
        <StatCard tone="aqua" label="Reativo excedente" value={formatBRLCompact(k.total_reactive)} hint="Energia e demanda reativas (FP < 0,92)" />
        <StatCard tone="orange" label="Ultrapassagem de demanda" value={formatBRLCompact(k.total_overage)} hint="Medida > 105% da contratada" />
        <StatCard tone="warn" label="Multas e juros por atraso" value={formatBRLCompact(k.total_fines)} hint="Pagamento fora do prazo" />
        <StatCard tone="primary" label="Tarifa média de energia" value={`R$ ${formatNumber(k.average_tariff, 4)}`} hint="por kWh, sem tributos" />
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Card title="Composição do custo por mês" subtitle="Tributos e retenções ficam de fora da composição.">
          {d.breakdown.length === 0 ? <EmptyState icon="chart" title="Sem dados no período" /> : (
            <>
              <Legend items={breakdownSeries} />
              <div className="chart">
                <ResponsiveContainer>
                  <BarChart data={d.breakdown} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke="#eef1f5" />
                    <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
                    <YAxis tickFormatter={formatBRLCompact} width={78} {...axisProps} />
                    <Tooltip content={<ChartTooltip labelFormatter={(m) => m} />} cursor={{ fill: "rgba(15,27,45,0.04)" }} />
                    {breakdownSeries.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.hex} stroke="#fff" strokeWidth={1}
                        radius={i === breakdownSeries.length - 1 ? [4, 4, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>

        <Card title="Energia na ponta e fora de ponta" subtitle="O kWh na ponta custa cerca de três vezes mais.">
          {energyTotal === 0 ? <EmptyState icon="chart" title="Sem dados no período" /> : (
            <>
              <div className="split" aria-hidden="true">
                <span style={{ width: `${(peak / energyTotal) * 100}%`, background: SERIES.demand.hex }} />
                <span style={{ width: `${(offPeak / energyTotal) * 100}%`, background: SERIES.energy.hex }} />
              </div>
              <div className="split-rows">
                <div className="split-row"><span className="swatch" style={{ background: SERIES.demand.hex }} /> Ponta <span className="value">{formatBRL(peak)}</span><span className="share">{formatNumber((peak / energyTotal) * 100, 0)}%</span></div>
                <div className="split-row"><span className="swatch" style={{ background: SERIES.energy.hex }} /> Fora de ponta <span className="value">{formatBRL(offPeak)}</span><span className="share">{formatNumber((offPeak / energyTotal) * 100, 0)}%</span></div>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: "18px 0 0" }}>
                Deslocar carga para fora do horário de ponta (3 horas no fim da tarde, em dias úteis) reduz o custo sem reduzir o consumo.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title="Valor faturado por mês" className="mb-16">
        {d.trends.length === 0 ? <EmptyState icon="chart" title="Sem dados no período" /> : (
          <div className="chart chart-sm">
            <ResponsiveContainer>
              <LineChart data={d.trends} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef1f5" />
                <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
                <YAxis tickFormatter={formatBRLCompact} width={78} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#cdd4de", strokeDasharray: "3 3" }} />
                <Line type="monotone" dataKey="total" name="Valor faturado" stroke={SERIES.energy.hex} strokeWidth={2}
                  dot={{ r: 3, fill: SERIES.energy.hex, strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <Card title="Custos evitáveis por unidade" subtitle="Onde concentrar bancos de capacitores e revisão de contrato.">
          <Legend items={[SERIES.reactive, { name: "Ultrapassagem", hex: SERIES.demand.hex }]} />
          <Ranking rows={d.avoidable} parts={[{ key: "reactive", ...SERIES.reactive }, { key: "overage", name: "Ultrapassagem", hex: SERIES.demand.hex }]} />
        </Card>

        <Card title="Custo total por unidade">
          <Ranking rows={d.unitCosts} parts={[{ key: "total", name: "Valor faturado", hex: SERIES.energy.hex }]} valueFormatter={formatBRLCompact} />
        </Card>
      </div>

      <Card title="Demanda contratada e medida" subtitle="Médias mensais no período. Utilização abaixo de 80% indica contrato com folga; acima de 105%, ultrapassagem." padded={false} className="mb-16">
        {d.demand.length === 0 ? <EmptyState icon="chart" title="Sem dados de demanda no período" /> : (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th className="num">Contratada (kW)</th>
                  <th className="num">Medida (kW)</th>
                  <th className="num">Utilização</th>
                  <th className="num">Custo de demanda</th>
                  <th className="num">Faturas</th>
                </tr>
              </thead>
              <tbody>
                {d.demand.map((r) => (
                  <tr key={r.unit}>
                    <td className="strong">{r.unit}</td>
                    <td className="num">{formatNumber(r.avg_contracted_kw)}</td>
                    <td className="num">{formatNumber(r.avg_measured_kw)}</td>
                    <td className="num">{utilizationBadge(r.avg_measured_kw, r.avg_contracted_kw)}</td>
                    <td className="num strong">{formatBRL(r.total_cost)}</td>
                    <td className="num">{r.bills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Multas e juros por atraso" subtitle="Decorrem do pagamento fora do prazo, não de grandezas elétricas.">
        <Ranking rows={d.offenders.map((o) => ({ ...o, total: o.fines }))} parts={[{ key: "fines", ...SERIES.fines }]} limit={5} />
      </Card>
    </>
  );
}
