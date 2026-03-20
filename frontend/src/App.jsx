import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import API_URL from './config';

export default function App() {
  const { user } = useAuth();
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedDataList, setExtractedDataList] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);
  const [descricoesSugeridas, setDescricoesSugeridas] = useState([]);
  const [autoSave, setAutoSave] = useState(false);
  const [autoSaveProgress, setAutoSaveProgress] = useState(null); // String to show progress e.g "Saving 1 of 5"
  const navigate = useNavigate();

  // Buscar descrições já existentes para popular o datalist
  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/bill-items/descriptions`, {
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
      const response = await fetch(`${API_URL}/upload`, {
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
        if (autoSave) {
          // AUTO-SAVE FLOW
          await processAutoSave(successResults);
          if (errorResults.length > 0) {
            const fileNames = errorResults.map(r => r.filename).join(", ");
            alert(`Auto-save partially complete. The following files failed to parse: ${fileNames}`);
          }
        } else {
          // MANUAL REVIEW FLOW
          setExtractedDataList(successResults);
          setCurrentIndex(0);
          if (errorResults.length > 0) {
            const fileNames = errorResults.map(r => r.filename).join(", ");
            alert(`Warning: Failed to process the following files: ${fileNames}`);
          }
        }
      } else {
        setError("No files could be processed.");
        if (errorResults.length > 0) {
          const fileNames = errorResults.map(r => r.filename).join(", ");
          alert(`Failed to process all files: ${fileNames}`);
        }
      }
      
    } catch (err) {
      setError("Failed to communicate with the FastAPI backend. Make sure it's running on port 8000.");
    } finally {
      if (!autoSave) {
          setLoading(false);
      }
    }
  };

  const processAutoSave = async (parsedBills) => {
    let savedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < parsedBills.length; i++) {
        setAutoSaveProgress(`Saving bill ${i + 1} of ${parsedBills.length}...`);
        const bill = parsedBills[i];
        
        try {
            let endpoint = `${API_URL}/bills`;
            let method = "POST";
            
            // Check if it already exists to overwrite it instead of duplicating
            if (bill.installation_code && bill.reference_month) {
                const checkRes = await fetch(`${API_URL}/bills/check?installation_code=${bill.installation_code}&reference_month=${encodeURIComponent(bill.reference_month)}`, {
                    headers: { "Authorization": `Bearer ${user.token}` }
                });
                const checkData = await checkRes.json();
                if (checkData.success && checkData.exists) {
                    endpoint = `${API_URL}/bills/${checkData.bill_id}`;
                    method = "PUT";
                }
            }

            const response = await fetch(endpoint, {
                method: method,
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${user.token}`
                },
                body: JSON.stringify(bill),
            });
            const data = await response.json();
            if (data.success) {
                savedCount++;
            } else {
                failedCount++;
            }
        } catch (e) {
            failedCount++;
        }
    }
    
    setLoading(false);
    setAutoSaveProgress(null);
    setFiles(null);
    alert(`Auto-save finished! ${savedCount} saved successfully. ${failedCount > 0 ? failedCount + ' failed.' : ''}`);
    navigate('/');
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
        const checkRes = await fetch(`${API_URL}/bills/check?installation_code=${currentData.installation_code}&reference_month=${encodeURIComponent(currentData.reference_month)}`, {
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

      const endpoint = isReplace ? `${API_URL}/bills/${replaceId}` : `${API_URL}/bills`;
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
          <div className="upload-section" style={{maxWidth: "600px", margin: "0 auto", textAlign: "center", padding: "3rem 2rem", background: "#fff", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.05)"}}>
            <h2 style={{marginTop: 0, color: "var(--primary-color)"}}>Batch Bill Upload</h2>
            <p style={{color: "#64748b", marginBottom: "2rem"}}>Select one or more Light PDF bills to securely import them into your database.</p>
            
            <div className="upload-box" style={{border: "2px dashed #cbd5e1", borderRadius: "12px", padding: "3rem 1rem", background: "#f8fafc", transition: "all 0.3s", position: "relative", marginBottom: "2rem"}}>
              <svg style={{width: "48px", height: "48px", color: "#94a3b8", marginBottom: "1rem"}} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <h3 style={{fontSize: "1.1rem", margin: "0 0 0.5rem 0", color: "#334155"}}>Drag & Drop your PDFs here</h3>
              <p style={{fontSize: "0.9rem", color: "#94a3b8", margin: "0 0 1.5rem 0"}}>or click the button below to browse</p>
              
              <input 
                type="file" 
                accept=".pdf" 
                multiple 
                onChange={handleFileChange} 
                style={{
                  opacity: 0, width: "100%", height: "100%", position: "absolute", top: 0, left: 0, cursor: "pointer"
                }}
              />
              <span className="btn btn-secondary" style={{pointerEvents: "none"}}>Browse Files</span>
            </div>

            {files && files.length > 0 && (
              <div style={{background: "#f1f5f9", padding: "0.8rem", borderRadius: "8px", marginBottom: "2rem", fontSize: "0.9rem", color: "#334155"}}>
                <strong style={{color: "var(--primary-color)"}}>{files.length}</strong> {files.length === 1 ? 'file' : 'files'} selected ready for extraction.
              </div>
            )}

            <div style={{display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center"}}>
                <label style={{display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "1rem", color: "#475569", userSelect: "none"}}>
                    <input 
                        type="checkbox" 
                        checked={autoSave} 
                        onChange={(e) => setAutoSave(e.target.checked)} 
                        style={{width: "18px", height: "18px", cursor: "pointer"}}
                    />
                    <strong>Fast Track Mode</strong> (Auto-Save valid bills immediately)
                </label>

                <button className="btn btn-primary btn-large" style={{width: "100%", marginTop: "1rem"}} onClick={handleUpload} disabled={!files || loading}>
                    {loading ? (autoSaveProgress || "Extracting data...") : "Start Import"}
                </button>
            </div>
            
            {error && <p className="error-message" style={{marginTop: "2rem"}}>{error}</p>}
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
