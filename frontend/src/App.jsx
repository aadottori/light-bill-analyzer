import { useState } from 'react'

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
      setExtractedData(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (data.success) {
        setExtractedData(data.data);
      } else {
        setError(data.error || "Erro ao processar fatura.");
      }
    } catch (err) {
      setError("Falha na comunicação com o backend FastAPI. Verifique se ele está rodando na porta 8000.");
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setExtractedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    // Aqui irá a lógica de salvar no PostgreSQL futuramente
    console.log("Saving validated data:", extractedData);
    alert("Dados validados com sucesso!");
    setExtractedData(null);
    setFile(null);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>UFRJ - Validador de Faturas (Energia)</h1>
        <p className="subtitle">Extrator automatizado de PDFs com Inteligência e validação manual</p>
      </header>
      
      <main className="main-content">
        {!extractedData ? (
          <div className="upload-section">
            <h2>Upload de Fatura PDF</h2>
            <div className="upload-box">
              <input type="file" accept=".pdf" onChange={handleFileChange} />
              <button className="btn btn-primary btn-large" onClick={handleUpload} disabled={!file || loading}>
                {loading ? "Processando..." : "Extrair Dados"}
              </button>
            </div>
            {error && <p className="error-message">{error}</p>}
          </div>
        ) : (
          <div className="validation-section">
            <h2>Validação de Dados Extraídos</h2>
            <p className="validation-instruction">Revise os valores extraídos automaticamente da fatura. Você pode editar os valores que não foram extraídos corretamente antes de salvar no banco de dados.</p>
            
            <div className="data-grid">
              {Object.entries(extractedData).map(([key, value]) => (
                <div className="data-group" key={key}>
                  <label className="data-label">{key.replace(/_/g, ' ').toUpperCase()}</label>
                  <input 
                    type="text" 
                    className="data-input" 
                    value={value || ""} 
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder="Não extraído / Não encontrado"
                  />
                </div>
              ))}
            </div>
            
            <div className="actions">
               <button className="btn btn-secondary" onClick={() => setExtractedData(null)}>Cancelar</button>
               <button className="btn btn-primary" onClick={handleSave}>Confirmar e Salvar</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
