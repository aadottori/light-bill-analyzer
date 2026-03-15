import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function App() {
  const { user } = useAuth();
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedDataList, setExtractedDataList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);
  const [descricoesSugeridas, setDescricoesSugeridas] = useState([]);
  const navigate = useNavigate();

  // Buscar descrições já existentes para popular o datalist
  useEffect(() => {
    if (!user) return;
    fetch("http://localhost:8000/bill-items/descriptions", {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if(data.success) {
          setDescricoesSugeridas(data.data);
        }
      })
      .catch(err => console.error("Error loading descriptions:", err));
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setError("");
      setExtractedDataList([]);
      setCurrentIndex(0);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError("");
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("http://localhost:8000/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.token}`
        },
        body: formData,
      });
      const data = await response.json();
      
      const successResults = data.results.filter(r => r.success).map(r => r.data);
      const errorResults = data.results.filter(r => !r.success);
      
      if (successResults.length > 0) {
        setExtractedDataList(successResults);
        setCurrentIndex(0);
      } else {
        setError("No files could be processed.");
      }

      if (errorResults.length > 0) {
        const fileNames = errorResults.map(r => r.filename).join(", ");
        alert(`Warning: Failed to process the following files: ${fileNames}`);
      }
      
    } catch (err) {
      setError("Failed to communicate with the FastAPI backend. Make sure it's running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  const currentData = extractedDataList[currentIndex];

  const handleItemChange = (index, field, value) => {
    const newList = [...extractedDataList];
    newList[currentIndex].items[index][field] = value;
    setExtractedDataList(newList);
  };

  const handleFieldChange = (field, value) => {
    const newList = [...extractedDataList];
    newList[currentIndex][field] = value;
    setExtractedDataList(newList);
  };

  const addItemRow = () => {
    const newList = [...extractedDataList];
    newList[currentIndex].items.push({ description: "New Item", quantity: null, unit_price: null, amount: "0,00" });
    setExtractedDataList(newList);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      let isReplace = false;
      let replaceId = null;
      if (currentData.installation_code && currentData.reference_month) {
        const checkRes = await fetch(`http://localhost:8000/bills/check?installation_code=${currentData.installation_code}&reference_month=${encodeURIComponent(currentData.reference_month)}`, {
          headers: { "Authorization": `Bearer ${user.token}` }
        });
        const checkData = await checkRes.json();
        
        if (checkData.success && checkData.exists) {
          const confirmReplace = window.confirm(`Warning: A bill already exists for Installation ${currentData.installation_code} in month ${currentData.reference_month}. Do you want to overwrite it?`);
          if (!confirmReplace) {
            setLoading(false);
            return;
          }
          isReplace = true;
          replaceId = checkData.bill_id;
        }
      }

      const endpoint = isReplace ? `http://localhost:8000/bills/${replaceId}` : "http://localhost:8000/bills";
      const method = isReplace ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method: method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`
        },
        body: JSON.stringify(currentData),
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (currentIndex < extractedDataList.length - 1) {
          alert(`Bill saved (ID: ${data.id})! Loading next in queue...`);
          setCurrentIndex(prev => prev + 1);
        } else {
          alert(`All bills have been successfully saved! Redirecting to Dashboard...`);
          setExtractedDataList([]);
          setFiles(null);
          navigate('/');
        }
      } else {
        setError("Error saving to database.");
      }
    } catch (err) {
      setError("Communication failure while saving data.");
    } finally {
      setLoading(false);
    }
  };

  const handlePular = () => {
    if (currentIndex < extractedDataList.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setExtractedDataList([]);
      setFiles(null);
    }
  };

  return (
    <div className="upload-container">
        <datalist id="descricoesSugeridas">
          {descricoesSugeridas.map((desc, i) => (
             <option key={i} value={desc} />
          ))}
        </datalist>

        {extractedDataList.length === 0 ? (
          <div className="upload-section">
            <h2>Batch PDF Bill Upload</h2>
            <div className="upload-box">
              <input type="file" accept=".pdf" multiple onChange={handleFileChange} />
              <button className="btn btn-primary btn-large" onClick={handleUpload} disabled={!files || loading}>
                {loading ? "Processing..." : "Extract Data"}
              </button>
            </div>
            {error && <p className="error-message">{error}</p>}
          </div>
        ) : (
          <div className="validation-section">
            <div className="dashboard-header" style={{borderBottom: 'none', marginBottom: '0.5rem'}}>
              <h2>
                Data Validation 
                <span style={{fontSize: '1rem', color: '#64748b', marginLeft: '1rem'}}>
                  (Bill {currentIndex + 1} of {extractedDataList.length})
                </span>
              </h2>
            </div>
            <p className="validation-instruction">Review the extracted header and items. You can edit values or manually add rows before saving.</p>
            
            <div className="data-grid header-grid">
              <div className="data-group">
                 <label className="data-label">INSTALLATION CODE (Light)</label>
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
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-secondary btn-small mt-3" onClick={addItemRow}>+ Add Manual Row</button>
            </div>
            
            <div className="actions">
               <button className="btn btn-secondary" onClick={handlePular}>
                 {currentIndex < extractedDataList.length - 1 ? "Skip Bill" : "Cancel Batch"}
               </button>
               <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                 {loading ? "Saving..." : "Confirm & Save to Database"}
               </button>
            </div>
          </div>
        )}
    </div>
  )
}
