import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

export default function Analytics() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [trends, setTrends] = useState([]);
  const [offenders, setOffenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [units, setUnits] = useState([]);
  const [unitCosts, setUnitCosts] = useState([]);
  const [reactiveUnits, setReactiveUnits] = useState([]);
  const [demandData, setDemandData] = useState([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState([]);
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [unitId, setUnitId] = useState("");

  const monthMap = {"JAN": 0, "FEV": 1, "MAR": 2, "ABR": 3, "MAI": 4, "JUN": 5, "JUL": 6, "AGO": 7, "SET": 8, "OUT": 9, "NOV": 10, "DEZ": 11};

  const sortMonths = (arr, monthKey = "month") => {
    return [...arr].sort((a,b) => {
      const [mA, yA] = a[monthKey].split('/');
      const [mB, yB] = b[monthKey].split('/');
      if (yA !== yB) return yA - yB;
      return monthMap[mA] - monthMap[mB];
    });
  };

  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8000/bills/months", { headers: { "Authorization": `Bearer ${user.token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
            setAvailableMonths(sortMonths(data.data.map(m => ({month: m}))).map(x => x.month));
        }
      });
    
    fetch("http://localhost:8000/units", { headers: { "Authorization": `Bearer ${user.token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success) setUnits(data.data);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let queryParams = "";
    if (startMonth || endMonth || unitId) {
      const params = new URLSearchParams();
      if (startMonth) params.append("start_month", startMonth);
      if (endMonth) params.append("end_month", endMonth);
      if (unitId) params.append("unit_id", unitId);
      queryParams = `?${params.toString()}`;
    }

    const h = { "Authorization": `Bearer ${user.token}` };

    Promise.all([
      fetch(`http://localhost:8000/analytics/kpis${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/trends${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/offenders${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/units/cost${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/reactive/units${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/demand${queryParams}`, { headers: h }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/monthly-breakdown${queryParams}`, { headers: h }).then(res => res.json()),
    ]).then(([kpiData, trendData, offenderData, costData, reactiveData, demandResp, breakdownResp]) => {
      if (kpiData.success) setKpis(kpiData.data);
      if (trendData.success) setTrends(sortMonths(trendData.data));
      if (offenderData.success) setOffenders(offenderData.data);
      if (costData && costData.success) setUnitCosts(costData.data);
      if (reactiveData && reactiveData.success) setReactiveUnits(reactiveData.data);
      if (demandResp && demandResp.success) setDemandData(demandResp.data);
      if (breakdownResp && breakdownResp.success) setMonthlyBreakdown(sortMonths(breakdownResp.data));
    }).finally(() => setLoading(false));

  }, [user, startMonth, endMonth, unitId]);

  if (loading || !kpis) {
      return (
          <div className="dashboard-section" style={{textAlign: "center", padding: "4rem"}}>
              <h2>Loading Analytics...</h2>
          </div>
      )
  }

  const pieData = [
    { name: 'Peak (Ponta)', value: kpis.peak_cost },
    { name: 'Off-Peak (Fora Ponta)', value: kpis.off_peak_cost }
  ];
  const COLORS = ['#d90429', '#3f88c5'];

  const formatBRL = (value) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});

  const CardStyle = (bg, border, headColor, valColor) => ({
    card: {background: bg, padding: "1.5rem", borderRadius: "12px", border: `1px solid ${border}`},
    head: {margin: "0 0 0.5rem 0", color: headColor, fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 600},
    val: {margin: 0, color: valColor, fontSize: "1.8rem", fontWeight: 700}
  });

  const c1 = CardStyle("#fff1f2", "#ffe4e6", "#e11d48", "#be123c");
  const c2 = CardStyle("#f0fdfa", "#ccfbf1", "#0d9488", "#0f766e");
  const c3 = CardStyle("#f8fafc", "#cbd5e1", "#475569", "#334155");
  const c4 = CardStyle("#fefce8", "#fef08a", "#a16207", "#854d0e");
  const c5 = CardStyle("#eff6ff", "#bfdbfe", "#2563eb", "#1e40af");

  return (
    <div className="dashboard-section">
      <div className="dashboard-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: "1.5rem" }}>
        <div>
            <h2>Energy Analytics & Efficiency</h2>
            <p className="subtitle" style={{color: "#64748b"}}>Insights across all validated bills</p>
        </div>
        
        <div className="filters-bar" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "8px", width: "100%" }}>
          <div>
            <label className="data-label">Start Month</label>
            <select className="data-input" value={startMonth} onChange={e => setStartMonth(e.target.value)}>
              <option value="">None (Beginning)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="data-label">End Month</label>
            <select className="data-input" value={endMonth} onChange={e => setEndMonth(e.target.value)}>
              <option value="">None (Present)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="data-label">Linked Unit</label>
            <select className="data-input" value={unitId} onChange={e => setUnitId(e.target.value)}>
              <option value="">All Units...</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => { setStartMonth(""); setEndMonth(""); setUnitId(""); }}>Clear Filters</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="data-grid" style={{marginBottom: "2.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))"}}>
         <div style={c1.card}>
            <h4 style={c1.head}>Total Fines & Interest</h4>
            <h2 style={c1.val}>{formatBRL(kpis.total_fines)}</h2>
         </div>
         <div style={c2.card}>
            <h4 style={c2.head}>Total Reactive Penalties</h4>
            <h2 style={c2.val}>{formatBRL(kpis.total_reactive)}</h2>
         </div>
         <div style={c3.card}>
            <h4 style={c3.head}>Average Energy Tariff</h4>
            <h2 style={c3.val}>R$ {kpis.average_tariff.toLocaleString('pt-BR', {minimumFractionDigits: 4})} <span style={{fontSize: "0.9rem", color: "#94a3b8"}}>/kWh</span></h2>
         </div>
         <div style={c4.card}>
            <h4 style={c4.head}>Peak Energy Cost</h4>
            <h2 style={c4.val}>{formatBRL(kpis.peak_cost)}</h2>
         </div>
         <div style={c5.card}>
            <h4 style={c5.head}>Off-Peak Energy Cost</h4>
            <h2 style={c5.val}>{formatBRL(kpis.off_peak_cost)}</h2>
         </div>
      </div>

      {/* Row 1: Monthly Breakdown Stacked Bar */}
      <div style={{display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "2.5rem"}}>
        <div style={{flex: "1 1 700px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
          <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Monthly Cost Breakdown</h3>
          <p style={{color: "#94a3b8", fontSize: "0.85rem", margin: "-0.5rem 0 1rem"}}>Energy · Demand · Reactive · Taxes · Flags · Fines</p>
          {monthlyBreakdown.length === 0 ? (
            <p style={{fontStyle: "italic", color: "#94a3b8", textAlign: "center", marginTop: "3rem"}}>No breakdown data available.</p>
          ) : (
            <div style={{width: "100%", height: 400}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyBreakdown} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize: 11}} />
                  <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => formatBRL(value)} />
                  <Legend />
                  <Bar dataKey="energy" name="Energia" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="demand" name="Demanda" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="reactive" name="Reativo" stackId="a" fill="#06b6d4" />
                  <Bar dataKey="taxes" name="Impostos" stackId="a" fill="#6b7280" />
                  <Bar dataKey="flags" name="Bandeiras" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="fines" name="Multas/Juros" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Total Cost Per Unit + Historical Trend */}
      <div style={{display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "2.5rem"}}>
          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Total Cost per Unit</h3>
            {(!unitCosts || unitCosts.length === 0) ? (
                <p style={{fontStyle: "italic", color: "#94a3b8", textAlign: "center", marginTop: "4rem"}}>No cost data available.</p>
            ) : (
                <div style={{width: "100%", height: 350}}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={unitCosts} margin={{ top: 20, right: 30, left: 20, bottom: 65 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="unit" tick={{fontSize: 10}} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value) => formatBRL(value)} />
                            <Bar dataKey="total" name="Total Energy Cost" fill="var(--primary-color)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
          </div>

          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Historical Spend Trend</h3>
            <div style={{width: "100%", height: 350}}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{fontSize: 12}} />
                        <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value) => formatBRL(value)} />
                        <Legend />
                        <Line type="monotone" dataKey="total" name="Total Bill Amount" stroke="var(--primary-color)" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
          </div>
      </div>

      {/* Row 3: Reactive per Unit + Demand Analysis */}
      <div style={{display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "2.5rem"}}>
          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "#0d9488"}}>⚡ Reactive Energy Cost per Unit</h3>
            <p style={{color: "#94a3b8", fontSize: "0.85rem", margin: "-0.5rem 0 1rem"}}>Buildings with the highest reactive energy penalties</p>
            {(!reactiveUnits || reactiveUnits.length === 0) ? (
                <p style={{fontStyle: "italic", color: "#94a3b8", textAlign: "center", marginTop: "3rem"}}>No reactive costs detected.</p>
            ) : (
                <div style={{width: "100%", height: 350}}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reactiveUnits} margin={{ top: 20, right: 30, left: 20, bottom: 65 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="unit" tick={{fontSize: 10}} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(1)}k`} />
                            <Tooltip formatter={(value) => formatBRL(value)} />
                            <Bar dataKey="reactive" name="Reactive Energy Cost" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
          </div>

          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "#7c3aed"}}>📊 Demand Cost per Unit</h3>
            <p style={{color: "#94a3b8", fontSize: "0.85rem", margin: "-0.5rem 0 1rem"}}>Total demand-related costs by building (avg contracted kW shown on hover)</p>
            {(!demandData || demandData.length === 0) ? (
                <p style={{fontStyle: "italic", color: "#94a3b8", textAlign: "center", marginTop: "3rem"}}>No demand data available.</p>
            ) : (
                <div style={{width: "100%", height: 350}}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={demandData} margin={{ top: 20, right: 30, left: 20, bottom: 65 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="unit" tick={{fontSize: 10}} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                            <Tooltip content={({active, payload}) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <div style={{background: "#fff", border: "1px solid #e2e8f0", padding: "0.75rem", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)"}}>
                                    <p style={{fontWeight: 700, margin: "0 0 0.25rem"}}>{d.unit}</p>
                                    <p style={{margin: "0.15rem 0", color: "#7c3aed"}}>Demand Cost: {formatBRL(d.total_cost)}</p>
                                    <p style={{margin: "0.15rem 0", color: "#475569"}}>Avg Contracted: {d.avg_contracted_kw} kW</p>
                                    <p style={{margin: "0.15rem 0", color: "#94a3b8", fontSize: "0.8rem"}}>{d.bills} bills</p>
                                  </div>
                                );
                              }
                              return null;
                            }} />
                            <Bar dataKey="total_cost" name="Demand Cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
          </div>
      </div>

      {/* Row 4: Peak vs Off-Peak Pie + Offenders Table */}
      <div style={{display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "2.5rem"}}>
          <div style={{flex: "1 1 350px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Peak vs Off-Peak Cost</h3>
            <p style={{color: "#94a3b8", fontSize: "0.85rem", margin: "-0.5rem 0 1rem"}}>Compares energy costs billed at peak hours vs off-peak hours</p>
            {kpis.peak_cost === 0 && kpis.off_peak_cost === 0 ? (
                <p style={{fontStyle: "italic", color: "#94a3b8", textAlign: "center", marginTop: "4rem"}}>No peak data available.</p>
            ) : (
                <div style={{width: "100%", height: 350}}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            fill="#8884d8"
                            paddingAngle={5}
                            dataKey="value"
                            label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                            {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                            </Pie>
                            <Tooltip formatter={(value) => formatBRL(value)} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
          </div>

          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "#e11d48"}}>🏢 Top 5 Offenders: Highest Fines Accumulated</h3>
            <div className="table-responsive">
                <table className="dashboard-table">
                    <thead>
                        <tr>
                            <th>Unit</th>
                            <th style={{textAlign: "right"}}>Sum of Fines & Interest</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offenders.length === 0 ? (
                            <tr><td colSpan={2} style={{textAlign: "center", color: "#94a3b8"}}>No fines detected!</td></tr>
                        ) : (
                            offenders.map((off, idx) => (
                                <tr key={idx}>
                                    <td style={{fontWeight: 600}}>{off.unit}</td>
                                    <td style={{textAlign: "right", color: "#e11d48", fontWeight: "bold"}}>
                                        {formatBRL(off.fines)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>
      </div>

    </div>
  );
}
