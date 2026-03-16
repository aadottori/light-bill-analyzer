import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function BillDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetch(`http://localhost:8000/bills/${id}`, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBill(data.data);
        } else {
          setError(data.detail || "Error fetching bill details.");
        }
      })
      .catch(err => setError("Failed to communicate with the server."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="dashboard-section"><p>Loading bill #{id}...</p></div>;
  if (error) return <div className="dashboard-section"><p className="error-message">{error}</p></div>;
  if (!bill) return <div className="dashboard-section"><p>Bill not found.</p></div>;

  return (
    <div className="validation-section">
      <div className="dashboard-header" style={{marginBottom: "1rem", border: "none"}}>
         <h2>Bill Details #{bill.id}</h2>
         <div style={{display: 'flex', gap: '0.5rem'}}>
           <button className="btn btn-secondary btn-small" onClick={() => navigate('/')}>&larr; Back to Dashboard</button>
           {user?.role === 'admin' && (
             <button className="btn btn-primary btn-small" onClick={() => navigate(`/bill/${bill.id}/edit`)}>Edit Bill</button>
           )}
         </div>
      </div>
      
      <div className="data-grid header-grid">
        <div className="data-group">
          <label className="data-label">INSTALLATION CODE (LIGHT)</label>
          <div className="data-value">{bill.installation_code || "-"}</div>
        </div>
        <div className="data-group">
          <label className="data-label">CONTRACT ACCOUNT (LIGHT)</label>
          <div className="data-value">{bill.contract_account || "-"}</div>
        </div>
        <div className="data-group">
            <span className="data-label">LINKED UNIT</span>
            <p style={{fontSize: "1.1rem", fontWeight: "600"}}>{bill.unit_name || "N/A"}</p>
        </div>
        <div className="data-group">
            <span className="data-label">REFERENCE MONTH</span>
            <p style={{fontSize: "1.1rem", fontWeight: "600"}}>{bill.reference_month || "N/A"}</p>
        </div>
        <div className="data-group">
            <span className="data-label">DUE DATE</span>
            <p style={{fontSize: "1.1rem", fontWeight: "600"}}>{bill.due_date || "N/A"}</p>
        </div>
      </div>

      <div style={{marginTop: "2rem", marginBottom: "1rem", backgroundColor: "#f8fafc", padding: "1rem", borderRadius: "8px"}}>
        <h4 style={{margin: "0 0 0.5rem 0", color: "#64748b", fontSize: "0.85rem", textTransform: "uppercase"}}>Import Metadata</h4>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", fontSize: "0.9rem"}}>
            <div><span style={{fontWeight: 600, color: "#475569"}}>Original File:</span> <br/>{bill.original_file_name || "Unknown"}</div>
            <div><span style={{fontWeight: 600, color: "#475569"}}>Imported By:</span> <br/>{bill.imported_by || "Unknown"}</div>
            <div><span style={{fontWeight: 600, color: "#475569"}}>Import Date:</span> <br/>{bill.imported_at ? new Date(bill.imported_at).toLocaleString() : "Unknown"}</div>
        </div>
      </div>

      <div style={{marginTop: "2rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
        <h3 className="section-subtitle">Extracted Items</h3>
        <h3 style={{color: "var(--primary-color)"}}>
          Total: {bill.total_amount ? bill.total_amount.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : "N/A"}
        </h3>
      </div>

      <div className="items-table-container">
        <table className="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Subtotal (R$)</th>
            </tr>
          </thead>
          <tbody>
            {bill.items && bill.items.map((item, index) => (
              <tr key={index}>
                <td style={{fontWeight: "500"}}>{item.description}</td>
                <td>{item.quantity ? item.quantity.toLocaleString('pt-BR') : '-'}</td>
                <td>{item.unit_price ? item.unit_price.toLocaleString('pt-BR', {minimumFractionDigits: 4}) : '-'}</td>
                <td style={{fontWeight: "600"}}>{item.amount.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
