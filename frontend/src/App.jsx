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
  const [autoSaveProgress, setAutoSaveProgress] = useState(null);
  const navigate = useNavigate();

  // --- Estados de Integração com IA (Google AI Studio) ---
  const [useAiInBatch, setUseAiInBatch] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showDiffs, setShowDiffs] = useState(false);

  // Buscar descrições já existentes para popular o datalist e checar chave da IA
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

    // Checar se o servidor já possui chave configurada
    fetch(`${API_URL}/ai/config`, {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.has_key && !geminiApiKey) {
          // Servidor já tem chave configurada no backend
          setGeminiApiKey("configured-on-server");
        }
      })
      .catch(err => console.warn("Could not check server AI key:", err));
  }, []);

  const handleSaveApiKey = async () => {
    const key = tempApiKey.trim();
    if (!key) return;
    localStorage.setItem("gemini_api_key", key);
    setGeminiApiKey(key);

    try {
      await fetch(`${API_URL}/ai/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`
        },
        body: JSON.stringify({ api_key: key })
      });
    } catch (e) {
      console.warn("Could not persist key to server .env:", e);
    }
    setShowKeyModal(false);
    setTempApiKey("");
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setError("");
      setExtractedDataList([]);
      setCurrentIndex(0);
      setAiError(null);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) return;
    setLoading(true);
    setError("");
    setAiError(null);
    
    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });

    const aiParam = useAiInBatch ? `?use_ai=true${geminiApiKey && geminiApiKey !== 'configured-on-server' ? `&api_key=${encodeURIComponent(geminiApiKey)}` : ''}` : '';

    try {
      const response = await fetch(`${API_URL}/upload${aiParam}`, {
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
          await processAutoSave(successResults);
          if (errorResults.length > 0) {
            const fileNames = errorResults.map(r => r.filename).join(", ");
            alert(`Auto-save partially complete. The following files failed to parse: ${fileNames}`);
          }
        } else {
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

  // --- Função Chave: Ler e Comparar com IA (Google AI Studio) ---
  const handleAnalyzeWithAi = async () => {
    if (!currentData) return;
    
    // Se o usuário não tiver chave configurada nem local nem no backend
    if (!geminiApiKey) {
      setTempApiKey("");
      setShowKeyModal(true);
      return;
    }

    setLoadingAi(true);
    setAiError(null);

    try {
      const payload = {
        file_path: currentData._file_path,
        original_file_name: currentData.original_file_name,
        api_key: geminiApiKey !== "configured-on-server" ? geminiApiKey : null,
        model_name: "gemini-2.5-flash"
      };

      const res = await fetch(`${API_URL}/bills/compare-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`
        },
        body: JSON.stringify(payload)
      });

      const jsonRes = await res.json();
      if (!jsonRes.success) {
        setAiError(jsonRes.error || "Erro ao consultar a IA.");
        return;
      }

      const rec = jsonRes.reconciliation;
      if (rec) {
        // Atualiza os dados da fatura atual com o resultado reconciliado
        const newList = [...extractedDataList];
        const winnerData = rec.active_data;
        winnerData._file_path = currentData._file_path;
        winnerData.original_file_name = currentData.original_file_name;
        winnerData._reconciliation = rec;

        newList[currentIndex] = winnerData;
        setExtractedDataList(newList);
        setShowDiffs(true);
      }
    } catch (e) {
      setAiError(`Falha de comunicação: ${e.message}`);
    } finally {
      setLoadingAi(false);
    }
  };

  // Alternar manualmente entre versão do Regex e versão da IA
  const handleSwitchSource = (sourceType) => {
    const rec = currentData?._reconciliation;
    if (!rec) return;

    const newList = [...extractedDataList];
    const targetData = sourceType === 'ai' ? rec.ai_data : rec.regex_data;
    if (targetData) {
      const updated = { ...targetData };
      updated._file_path = currentData._file_path;
      updated.original_file_name = currentData.original_file_name;
      updated._reconciliation = rec;
      updated._manualSource = sourceType;
      newList[currentIndex] = updated;
      setExtractedDataList(newList);
    }
  };

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
          setAiError(null);
          setShowDiffs(false);
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
      setAiError(null);
      setShowDiffs(false);
    } else {
      setExtractedDataList([]);
      setFiles(null);
    }
  };

  const rec = currentData?._reconciliation;

  return (
    <div className="upload-container">
        <datalist id="descricoesSugeridas">
          {descricoesSugeridas.map((desc, i) => (
             <option key={i} value={desc} />
          ))}
        </datalist>

        {/* --- Modal de Configuração de Chave do Google AI Studio --- */}
        {showKeyModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '1rem'
          }}>
            <div style={{
              background: '#fff', borderRadius: '16px', maxWidth: '520px', width: '100%',
              padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}>
              <h3 style={{marginTop: 0, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <span>✨</span> Chave do Google AI Studio (Gemini)
              </h3>
              <p style={{fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5}}>
                Para permitir a leitura com Inteligência Artificial, informe sua chave de API gratuita do Google AI Studio. As chamadas nos modelos Flash possuem cotas gratuitas mensais generosas.
              </p>
              <div style={{background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.85rem'}}>
                💡 <strong>Como obter:</strong> Acesse <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{color: '#6366f1', fontWeight: 600}}>Google AI Studio (Get API Key)</a>, faça login com sua conta Google e crie sua chave em 1 minuto.
              </div>
              
              <label style={{display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem'}}>
                GEMINI_API_KEY:
              </label>
              <input 
                type="password" 
                placeholder="AIzaSy..." 
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '0.95rem', marginBottom: '1.5rem', boxSizing: 'border-box'
                }}
              />

              <div style={{display: 'flex', justifyContent: 'flex-end', gap: '0.75rem'}}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowKeyModal(false)}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveApiKey}
                  disabled={!tempApiKey.trim()}
                  style={{background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)'}}
                >
                  Salvar Chave
                </button>
              </div>
            </div>
          </div>
        )}

        {extractedDataList.length === 0 ? (
          <div className="upload-section" style={{maxWidth: "640px", margin: "0 auto", textAlign: "center", padding: "3rem 2rem", background: "#fff", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.05)"}}>
            <h2 style={{marginTop: 0, color: "var(--primary-color)"}}>Importação de Faturas (PDF)</h2>
            <p style={{color: "#64748b", marginBottom: "2rem"}}>Selecione uma ou mais contas de luz da Light para extrair dados contratuais e tarifas.</p>
            
            <div className="upload-box" style={{border: "2px dashed #cbd5e1", borderRadius: "12px", padding: "3rem 1rem", background: "#f8fafc", transition: "all 0.3s", position: "relative", marginBottom: "1.5rem"}}>
              <svg style={{width: "48px", height: "48px", color: "#94a3b8", marginBottom: "1rem"}} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              <h3 style={{fontSize: "1.1rem", margin: "0 0 0.5rem 0", color: "#334155"}}>Arraste e solte seus PDFs aqui</h3>
              <p style={{fontSize: "0.9rem", color: "#94a3b8", margin: "0 0 1.5rem 0"}}>ou clique no botão abaixo para navegar</p>
              
              <input 
                type="file" 
                accept=".pdf" 
                multiple 
                onChange={handleFileChange} 
                style={{
                  opacity: 0, width: "100%", height: "100%", position: "absolute", top: 0, left: 0, cursor: "pointer"
                }}
              />
              <span className="btn btn-secondary" style={{pointerEvents: "none"}}>Selecionar Arquivos</span>
            </div>

            {files && files.length > 0 && (
              <div style={{background: "#f1f5f9", padding: "0.8rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.9rem", color: "#334155"}}>
                <strong style={{color: "var(--primary-color)"}}>{files.length}</strong> {files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'} pronto(s) para extração.
              </div>
            )}

            <div style={{display: "flex", flexDirection: "column", gap: "0.8rem", alignItems: "flex-start", background: '#f8fafc', padding: '1.2rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'left'}}>
                <label style={{display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.95rem", color: "#334155", userSelect: "none"}}>
                    <input 
                        type="checkbox" 
                        checked={autoSave} 
                        onChange={(e) => setAutoSave(e.target.checked)} 
                        style={{width: "18px", height: "18px", cursor: "pointer"}}
                    />
                    <span><strong>Modo Fast Track</strong> (Salvar automaticamente no banco sem revisão manual)</span>
                </label>

                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                  <label style={{display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontSize: "0.95rem", color: "#334155", userSelect: "none"}}>
                      <input 
                          type="checkbox" 
                          checked={useAiInBatch} 
                          onChange={(e) => setUseAiInBatch(e.target.checked)} 
                          style={{width: "18px", height: "18px", cursor: "pointer"}}
                      />
                      <span><strong>✨ Dual-Engine IA (Google AI Studio)</strong> — Confrontar Regex vs Gemini</span>
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setShowKeyModal(true)}
                    style={{fontSize: '0.8rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline'}}
                  >
                    {geminiApiKey ? '🔑 Chave IA salva' : '⚙️ Configurar chave IA'}
                  </button>
                </div>
            </div>

            <button className="btn btn-primary btn-large" style={{width: "100%"}} onClick={handleUpload} disabled={!files || loading}>
                {loading ? (autoSaveProgress || "Extraindo dados...") : "Iniciar Processamento"}
            </button>
            
            {error && <p className="error-message" style={{marginTop: "1.5rem", color: '#ef4444'}}>{error}</p>}
          </div>
        ) : (
          <div className="validation-section">
            <div className="dashboard-header" style={{borderBottom: 'none', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'}}>
              <div>
                <h2 style={{margin: 0}}>
                  Validação de Fatura 
                  <span style={{fontSize: '1rem', color: '#64748b', marginLeft: '1rem'}}>
                    (Fatura {currentIndex + 1} de {extractedDataList.length})
                  </span>
                </h2>
                <div style={{fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.3rem'}}>
                  Arquivo: <strong>{currentData.original_file_name || "PDF da fatura"}</strong>
                </div>
              </div>

              {/* --- BOTÃO DE CHAMADA DA IA --- */}
              <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                <button 
                  className="btn" 
                  onClick={handleAnalyzeWithAi}
                  disabled={loadingAi}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.5rem",
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    color: "#fff", border: "none", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
                  }}
                >
                  {loadingAi ? "Consultando Google AI Studio..." : "✨ Ler / Comparar com IA (Gemini)"}
                </button>
                <button 
                  onClick={() => setShowKeyModal(true)} 
                  title="Configurar Chave do Google AI Studio"
                  style={{background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.55rem 0.8rem', cursor: 'pointer', fontSize: '1rem'}}
                >
                  ⚙️
                </button>
              </div>
            </div>

            {aiError && (
              <div style={{background: '#fee2e2', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '8px', margin: '0.5rem 0 1rem 0', fontSize: '0.9rem'}}>
                ⚠️ <strong>Erro na leitura com IA:</strong> {aiError}
              </div>
            )}

            {/* --- PAINEL DE RECONCILIAÇÃO / CONFRONTO IA vs REGEX --- */}
            {rec && (
              <div style={{
                background: rec.winner === 'ai' ? '#f5f3ff' : '#f0fdf4',
                border: `1px solid ${rec.winner === 'ai' ? '#c4b5fd' : '#bbf7d0'}`,
                borderRadius: '12px', padding: '1.2rem', marginBottom: '1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                    <span style={{fontSize: '1.5rem'}}>{rec.winner === 'ai' ? '🏆' : '⚖️'}</span>
                    <div>
                      <div style={{fontWeight: 700, fontSize: '1.05rem', color: rec.winner === 'ai' ? '#5b21b6' : '#166534'}}>
                        {rec.winner === 'ai' ? 'Inteligência Artificial (Google AI Studio) Apresentou a Melhor Leitura!' : 'Interpretador Local Apresentou Maior Precisão!'}
                      </div>
                      <div style={{fontSize: '0.85rem', color: '#64748b'}}>
                        Score de Qualidade: <strong>IA ({rec.scores.ai}%)</strong> vs <strong>Regex Local ({rec.scores.regex}%)</strong>
                        {rec.extra_items_found_by_ai > 0 && ` • IA identificou +${rec.extra_items_found_by_ai} itens não lidos pelo regex.`}
                      </div>
                    </div>
                  </div>

                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button 
                      type="button"
                      onClick={() => handleSwitchSource('ai')}
                      style={{
                        padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', cursor: 'pointer',
                        border: '1px solid #7c3aed', background: currentData._manualSource === 'ai' || (!currentData._manualSource && rec.winner === 'ai') ? '#7c3aed' : '#fff',
                        color: currentData._manualSource === 'ai' || (!currentData._manualSource && rec.winner === 'ai') ? '#fff' : '#7c3aed',
                        fontWeight: 600
                      }}
                    >
                      Usar Dados da IA
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleSwitchSource('regex')}
                      style={{
                        padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', cursor: 'pointer',
                        border: '1px solid #059669', background: currentData._manualSource === 'regex' || (!currentData._manualSource && rec.winner === 'regex') ? '#059669' : '#fff',
                        color: currentData._manualSource === 'regex' || (!currentData._manualSource && rec.winner === 'regex') ? '#fff' : '#059669',
                        fontWeight: 600
                      }}
                    >
                      Usar Dados do Regex
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowDiffs(!showDiffs)}
                      style={{
                        padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', cursor: 'pointer',
                        border: '1px solid #cbd5e1', background: '#fff', color: '#475569'
                      }}
                    >
                      {showDiffs ? "Ocultar Detalhes" : "Ver Diferenças"}
                    </button>
                  </div>
                </div>

                {/* Detalhes de divergências */}
                {showDiffs && (
                  <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: '0.85rem'}}>
                    <h4 style={{margin: '0 0 0.5rem 0', color: '#334155'}}>Confronto de Campos do Cabeçalho:</h4>
                    <table style={{width: '100%', borderCollapse: 'collapse', marginBottom: '1rem'}}>
                      <thead>
                        <tr style={{textAlign: 'left', borderBottom: '1px solid #cbd5e1', color: '#64748b'}}>
                          <th style={{padding: '4px 8px'}}>Campo</th>
                          <th style={{padding: '4px 8px'}}>Interpretador Local (Regex)</th>
                          <th style={{padding: '4px 8px'}}>Google AI Studio (Gemini)</th>
                          <th style={{padding: '4px 8px'}}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rec.header_diffs && rec.header_diffs.map((d, i) => (
                          <tr key={i} style={{borderBottom: '1px solid #f1f5f9', background: d.divergent ? '#fef3c7' : 'transparent'}}>
                            <td style={{padding: '4px 8px', fontWeight: 600}}>{d.label}</td>
                            <td style={{padding: '4px 8px'}}>{d.regex_value || <span style={{color: '#94a3b8'}}>(vazio)</span>}</td>
                            <td style={{padding: '4px 8px'}}>{d.ai_value || <span style={{color: '#94a3b8'}}>(vazio)</span>}</td>
                            <td style={{padding: '4px 8px'}}>
                              {d.divergent ? <span style={{color: '#d97706', fontWeight: 600}}>⚠️ Divergente</span> : <span style={{color: '#16a34a'}}>✓ Coincide</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {rec.only_in_ai && rec.only_in_ai.length > 0 && (
                      <div style={{marginBottom: '0.5rem'}}>
                        <strong style={{color: '#7c3aed'}}>Itens adicionais capturados pela IA:</strong>
                        <ul style={{margin: '0.3rem 0 0 1.2rem', padding: 0}}>
                          {rec.only_in_ai.map((it, idx) => (
                            <li key={idx}><strong>{it.description}</strong>: R$ {it.amount} {it.quantity ? `(Qtd: ${it.quantity})` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="validation-instruction">Revise o cabeçalho e os itens de fatura extraídos. Você pode editar valores diretamente ou adicionar linhas manuais antes de salvar.</p>
            
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
              <div className="data-group">
                 <label className="data-label">BUILDING NAME</label>
                 <input type="text" className="data-input" value={currentData.building_name || ""} onChange={e => handleFieldChange("building_name", e.target.value)} />
              </div>
            </div>

            <h3 className="section-subtitle">Itens Detalhados da Fatura</h3>
            <div className="items-table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Quantidade</th>
                    <th>Preço Unitário (R$)</th>
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
              <button className="btn btn-secondary btn-small mt-3" onClick={addItemRow}>+ Adicionar Linha Manual</button>
            </div>
            
            <div className="actions">
               <button className="btn btn-secondary" onClick={handlePular}>
                 {currentIndex < extractedDataList.length - 1 ? "Pular Fatura" : "Cancelar Lote"}
               </button>
               <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                 {loading ? "Salvando..." : "Confirmar e Gravar no Banco"}
               </button>
            </div>
          </div>
        )}
    </div>
  )
}
