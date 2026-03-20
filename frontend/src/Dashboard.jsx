import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import API_URL from './config';

export default function Dashboard() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [units, setUnits] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCodes, setAvailableCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingExport, setLoadingExport] = useState(false);
  const navigate = useNavigate();

  // Filters state
  const [filterMonth, setFilterMonth] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [sortAmount, setSortAmount] = useState("");

  const fetchBills = useCallback(() => {
    if (!user) return;
    setLoading(true);
    let url = new URL(`${API_URL}/bills`);
    if (filterMonth) url.searchParams.append("reference_month", filterMonth);
    if (filterCode) url.searchParams.append("installation_code", filterCode);
    if (filterUnit) url.searchParams.append("unit_id", filterUnit);
    if (sortAmount) url.searchParams.append("sort_amount", sortAmount);

    fetch(url, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBills(data.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [user, filterMonth, filterCode, filterUnit, sortAmount]);

  const fetchUnits = useCallback(() => {
    if (!user) return;
    fetch(`${API_URL}/units`, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setUnits(data.data);
      });
  }, [user]);

  const fetchFilters = useCallback(() => {
    if (!user) return;
    fetch(`${API_URL}/bills/months`, { headers: { "Authorization": `Bearer ${user.token}` } })
      .then(res => res.json())
      .then(data => data.success && setAvailableMonths(data.data));

    fetch(`${API_URL}/bills/installations`, { headers: { "Authorization": `Bearer ${user.token}` } })
      .then(res => res.json())
      .then(data => data.success && setAvailableCodes(data.data));
  }, [user]);

  useEffect(() => {
    fetchBills();
    fetchUnits();
    fetchFilters();
  }, [fetchBills, fetchUnits, fetchFilters]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this bill and all its items?")) return;

    try {
      const res = await fetch(`${API_URL}/bills/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchBills();
      } else {
        alert("Error deleting bills.");
      }
    } catch (e) {
      alert("Communication failure.");
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setLoadingExport(true);
    let url = new URL(`${API_URL}/bills/export`);
    if (filterMonth) url.searchParams.append("reference_month", filterMonth);
    if (filterCode) url.searchParams.append("installation_code", filterCode);
    if (filterUnit) url.searchParams.append("unit_id", filterUnit);
    if (sortAmount) url.searchParams.append("sort_amount", sortAmount);

    try {
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${user.token}` }
      });
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "bills_extract.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert("Failed to export Excel file.");
    } finally {
      setLoadingExport(false);
    }
  };

  return (
    <div className="dashboard-section">
      <div className="dashboard-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <h2>Latest Processed Bills</h2>
          {user?.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>
              + New Bill
            </button>
          )}
        </div>

        <div className="filters-bar" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", padding: "1rem", backgroundColor: "#f8fafc", borderRadius: "8px", width: "100%" }}>
          <div>
            <label className="data-label">Reference Month</label>
            <select className="data-input" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="">All months...</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="data-label">Installation Code</label>
            <select className="data-input" value={filterCode} onChange={e => setFilterCode(e.target.value)}>
              <option value="">All installations...</option>
              {availableCodes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="data-label">Linked Unit</label>
            <select className="data-input" value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
              <option value="">All units...</option>
              {units.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "1rem" }}>
            <button className="btn btn-secondary" onClick={() => { setFilterMonth(""); setFilterCode(""); setFilterUnit(""); setSortAmount(""); }}>Clear Filters</button>
            <button className="btn btn-primary" onClick={handleExport} disabled={loadingExport}>
              {loadingExport ? "Exporting..." : "Export to Excel"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading history...</p>
      ) : bills.length === 0 ? (
        <div className="empty-state">
          <p>No bills validated yet.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Inst. Code</th>
                <th>Linked Unit</th>
                <th>Ref. Month</th>
                <th>Due Date</th>
                <th style={{ cursor: "pointer", color: "var(--primary-color)" }} onClick={() => setSortAmount(sortAmount === "desc" ? "asc" : "desc")}>
                  Total Amount {sortAmount === "desc" ? "↓" : sortAmount === "asc" ? "↑" : "↕"}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td>{bill.installation_code || "-"}</td>
                  <td>
                    {bill.unit_name || 'Not linked'}
                  </td>
                  <td>{bill.reference_month}</td>
                  <td>{bill.due_date}</td>
                  <td style={{ fontWeight: "600" }}>
                    {bill.total_amount
                      ? bill.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '-'}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-secondary btn-small" onClick={() => navigate(`/bill/${bill.id}`)}>Details</button>
                      {user?.role === 'admin' && (
                        <>
                          <button className="btn btn-primary btn-small" onClick={() => navigate(`/bill/${bill.id}/edit`)}>Edit</button>
                          <button className="btn btn-secondary btn-small" style={{ color: "red", borderColor: "red" }} onClick={() => handleDelete(bill.id)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
