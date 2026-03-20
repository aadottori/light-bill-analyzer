import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import API_URL from './config';

export default function BillEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [currentData, setCurrentData] = useState(null);
  const [descricoesSugeridas, setDescricoesSugeridas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    
    // Fetch Invoice
    fetch(`${API_URL}/bills/${id}`, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCurrentData(data.data);
        } else {
          setError(data.detail || "Bill not found");
        }
      })
      .catch(() => setError("Connection error"))
      .finally(() => setLoading(false));

    // Fetch Categories
    fetch(`${API_URL}/bill-items/descriptions`, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if(data.success) setDescricoesSugeridas(data.data);
      });
  }, [id, user]);

  const handleFieldChange = (field, value) => {
    setCurrentData(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newList = { ...currentData };
    newList.items[index][field] = value;
    setCurrentData(newList);
  };

  const addItemRow = () => {
    const newList = { ...currentData };
    newList.items.push({ description: "New Item", quantity: null, unit_price: null, amount: "0,00" });
    setCurrentData(newList);
  };
  
  const removeItemRow = (index) => {
    const newList = { ...currentData };
    newList.items.splice(index, 1);
    setCurrentData(newList);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_URL}/bills/${id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`
        },
        body: JSON.stringify(currentData),
      });
      const data = await res.json();
      if (data.success) {
        alert("Bill successfully updated!");
        navigate(`/bill/${id}`);
      } else {
        alert("Error updating bill.");
      }
    } catch (err) {
      alert("Connection failure.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="validation-section"><p>Loading bill...</p></div>;
  if (error) return <div className="validation-section"><p className="error-message">{error}</p></div>;
  if (!currentData) return null;

  return (
    <div className="validation-section">
      <datalist id="descricoesSugeridas">
        {descricoesSugeridas.map((desc, i) => (
           <option key={i} value={desc} />
        ))}
      </datalist>

      <div className="dashboard-header" style={{borderBottom: 'none', marginBottom: '0.5rem'}}>
        <h2>Edit Bill #{id}</h2>
      </div>
      
      <div className="data-grid header-grid">
        <div className="data-group">
           <label className="data-label">INSTALLATION CODE</label>
           <input type="text" className="data-input" value={currentData.installation_code || ""} onChange={e => handleFieldChange("installation_code", e.target.value)} />
        </div>
        <div className="data-group">
           <label className="data-label">CONTRACT ACCOUNT (Light)</label>
           <input type="text" className="data-input" value={currentData.contract_account || ""} onChange={e => handleFieldChange("contract_account", e.target.value)} />
        </div>
        <div className="data-group">
           <label className="data-label">REFERENCE MONTH</label>
           <input type="text" className="data-input" value={currentData.reference_month || ""} onChange={e => handleFieldChange("reference_month", e.target.value)} />
        </div>
        <div className="data-group">
           <label className="data-label">DUE DATE</label>
           <input type="text" className="data-input" value={currentData.due_date || ""} onChange={e => handleFieldChange("due_date", e.target.value)} />
        </div>
        <div className="data-group">
           <label className="data-label">TOTAL AMOUNT (R$)</label>
           <input type="text" className="data-input" value={currentData.total_amount || ""} onChange={e => handleFieldChange("total_amount", e.target.value)} />
        </div>
      </div>

      <h3 className="section-subtitle">Detailed Bill Items</h3>
      <div className="items-table-container">
        <table className="items-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Subtotal (R$)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentData.items && currentData.items.map((item, index) => (
              <tr key={index}>
                <td>
                  <input className="table-input" list="descricoesSugeridas" value={item.description || ""} onChange={e => handleItemChange(index, "description", e.target.value)} />
                </td>
                <td>
                   <input className="table-input" placeholder="-" value={item.quantity || ""} onChange={e => handleItemChange(index, "quantity", e.target.value)} />
                </td>
                <td>
                   <input className="table-input" placeholder="-" value={item.unit_price || ""} onChange={e => handleItemChange(index, "unit_price", e.target.value)} />
                </td>
                <td>
                   <input className="table-input value-highlight" value={item.amount || ""} onChange={e => handleItemChange(index, "amount", e.target.value)} />
                </td>
                <td>
                   <button className="btn btn-secondary btn-small" onClick={() => removeItemRow(index)}>X</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-secondary btn-small mt-3" onClick={addItemRow}>+ Add Manual Row</button>
      </div>
      
      <div className="actions" style={{display: "flex", justifyContent: "space-between", marginTop: "2rem"}}>
         <button className="btn btn-secondary" onClick={() => navigate(`/bill/${id}`)}>
           Cancel
         </button>
         <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
           {saving ? "Saving..." : "Update Bill"}
         </button>
      </div>
    </div>
  );
}
