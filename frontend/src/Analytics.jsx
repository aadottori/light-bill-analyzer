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
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const monthMap = {"JAN": 0, "FEV": 1, "MAR": 2, "ABR": 3, "MAI": 4, "JUN": 5, "JUL": 6, "AGO": 7, "SET": 8, "OUT": 9, "NOV": 10, "DEZ": 11};

  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8000/bills/months", { headers: { "Authorization": `Bearer ${user.token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
            const sorted = data.data.sort((a,b) => {
                const [mA, yA] = a.split('/');
                const [mB, yB] = b.split('/');
                if (yA !== yB) return yA - yB;
                return monthMap[mA] - monthMap[mB];
            });
            setAvailableMonths(sorted);
        }
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let queryParams = "";
    if (startMonth || endMonth) {
      const params = new URLSearchParams();
      if (startMonth) params.append("start_month", startMonth);
      if (endMonth) params.append("end_month", endMonth);
      queryParams = `?${params.toString()}`;
    }

    Promise.all([
      fetch(`http://localhost:8000/analytics/kpis${queryParams}`, { headers: { "Authorization": `Bearer ${user.token}` } }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/trends${queryParams}`, { headers: { "Authorization": `Bearer ${user.token}` } }).then(res => res.json()),
      fetch(`http://localhost:8000/analytics/offenders${queryParams}`, { headers: { "Authorization": `Bearer ${user.token}` } }).then(res => res.json())
    ]).then(([kpiData, trendData, offenderData]) => {
      if (kpiData.success) setKpis(kpiData.data);
      if (trendData.success) {
         const sorted = trendData.data.sort((a,b) => {
            const [mA, yA] = a.month.split('/');
            const [mB, yB] = b.month.split('/');
            if (yA !== yB) return yA - yB;
            return monthMap[mA] - monthMap[mB];
         });
         setTrends(sorted);
      }
      if (offenderData.success) setOffenders(offenderData.data);
    }).finally(() => setLoading(false));

  }, [user]);

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
  const COLORS = ['#d90429', '#3f88c5']; // Red for peak, Blue for off-peak

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
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-secondary" onClick={() => { setStartMonth(""); setEndMonth(""); }}>Clear Filters</button>
          </div>
        </div>
      </div>

      <div className="data-grid" style={{marginBottom: "3rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"}}>
         <div style={{background: "#fff1f2", padding: "1.5rem", borderRadius: "12px", border: "1px solid #ffe4e6"}}>
            <h4 style={{margin: "0 0 0.5rem 0", color: "#e11d48", fontSize: "0.9rem", textTransform: "uppercase"}}>Total Fines & Interest</h4>
            <h2 style={{margin: 0, color: "#be123c", fontSize: "2rem"}}>{kpis.total_fines.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</h2>
         </div>
         <div style={{background: "#f0fdfa", padding: "1.5rem", borderRadius: "12px", border: "1px solid #ccfbf1"}}>
            <h4 style={{margin: "0 0 0.5rem 0", color: "#0d9488", fontSize: "0.9rem", textTransform: "uppercase"}}>Total Reactive Penalties</h4>
            <h2 style={{margin: 0, color: "#0f766e", fontSize: "2rem"}}>{kpis.total_reactive.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</h2>
         </div>
         <div style={{background: "#f8fafc", padding: "1.5rem", borderRadius: "12px", border: "1px solid #cbd5e1"}}>
            <h4 style={{margin: "0 0 0.5rem 0", color: "#475569", fontSize: "0.9rem", textTransform: "uppercase"}}>Average Energy Tariff</h4>
            <h2 style={{margin: 0, color: "#334155", fontSize: "2rem"}}>R$ {kpis.average_tariff.toLocaleString('pt-BR', {minimumFractionDigits: 4})} <span style={{fontSize: "1rem", color: "#94a3b8"}}>/kWh</span></h2>
         </div>
      </div>

      <div style={{display: "flex", flexWrap: "wrap", gap: "2rem", marginBottom: "3rem"}}>
          
          <div style={{flex: "1 1 500px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Historical Spend Trend</h3>
            <div style={{width: "100%", height: 350}}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{fontSize: 12}} />
                        <YAxis tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} />
                        <Legend />
                        <Line type="monotone" dataKey="total" name="Total Bill Amount" stroke="var(--primary-color)" strokeWidth={3} activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
          </div>

          <div style={{flex: "1 1 350px", minWidth: 0, background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
            <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Peak vs Off-Peak Cost</h3>
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
                            <Tooltip formatter={(value) => value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
          </div>
      </div>

      <div style={{background: "#fff", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)"}}>
        <h3 style={{marginTop: 0, color: "var(--primary-color)"}}>Top 5 Offenders: Highest Fines Accumulated</h3>
        <div className="table-responsive">
            <table className="dashboard-table">
                <thead>
                    <tr>
                        <th>Linked Unit</th>
                        <th style={{textAlign: "right"}}>Sum of Fines & Interest</th>
                    </tr>
                </thead>
                <tbody>
                    {offenders.length === 0 ? (
                        <tr><td colSpan={2} style={{textAlign: "center", color: "#94a3b8"}}>No fines detected in the system!</td></tr>
                    ) : (
                        offenders.map((off, idx) => (
                            <tr key={idx}>
                                <td style={{fontWeight: 600}}>{off.unit}</td>
                                <td style={{textAlign: "right", color: "#e11d48", fontWeight: "bold"}}>
                                    {off.fines.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

    </div>
  );
}
