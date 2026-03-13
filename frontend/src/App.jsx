import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Not actually used but keeping imports aligned

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

  const handleItemChange = (index, field, value) => {
    const newItems = [...extractedData.itens];
    newItems[index][field] = value;
    setExtractedData(prev => ({
      ...prev,
      itens: newItems
    }));
  };

  const handleFieldChange = (field, value) => {
    setExtractedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addItemRow = () => {
    setExtractedData(prev => ({
      ...prev,
      itens: [...prev.itens, { descricao: "Novo Item", quantidade: null, preco_unitario: null, valor: "0,00" }]
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:8000/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extractedData),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`Dados salvos com sucesso no Banco de Dados sob ID: ${data.id}! Redirecionando para o Dashboard...`);
        setExtractedData(null);
        setFile(null);
        navigate('/');
      } else {
        setError("Erro ao tentar salvar no banco de dados.");
      }
    } catch (err) {
      setError("Falha de comunicação ao tentar salvar os dados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-container">
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
            <p className="validation-instruction">Revise o cabeçalho e os itens extraídos da fatura. Você pode editar os valores ou adicionar novas linhas antes de salvar.</p>
            
            <div className="data-grid header-grid">
              <div className="data-group">
                 <label className="data-label">CONTA CONTRATO (Amarrará ao Prédio)</label>
                 <input type="text" className="data-input" value={extractedData.conta_contrato || ""} onChange={e => handleFieldChange("conta_contrato", e.target.value)} />
              </div>
              <div className="data-group">
                 <label className="data-label">MÊS DE REFERÊNCIA</label>
                 <input type="text" className="data-input" value={extractedData.mes_referencia || ""} onChange={e => handleFieldChange("mes_referencia", e.target.value)} />
              </div>
              <div className="data-group">
                 <label className="data-label">VENCIMENTO</label>
                 <input type="text" className="data-input" value={extractedData.vencimento || ""} onChange={e => handleFieldChange("vencimento", e.target.value)} />
              </div>
              <div className="data-group">
                 <label className="data-label">VALOR TOTAL FATURA (R$)</label>
                 <input type="text" className="data-input" value={extractedData.valor_total || ""} onChange={e => handleFieldChange("valor_total", e.target.value)} />
              </div>
            </div>

            <h3 className="section-subtitle">Itens Detalhados da Fatura</h3>
            <div className="items-table-container">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Quantidade</th>
                    <th>Preço Un.</th>
                    <th>Valor Parcial (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedData.itens && extractedData.itens.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <input className="table-input" value={item.descricao || ""} onChange={e => handleItemChange(index, "descricao", e.target.value)} />
                      </td>
                      <td>
                         <input className="table-input" placeholder="-" value={item.quantidade || ""} onChange={e => handleItemChange(index, "quantidade", e.target.value)} />
                      </td>
                      <td>
                         <input className="table-input" placeholder="-" value={item.preco_unitario || ""} onChange={e => handleItemChange(index, "preco_unitario", e.target.value)} />
                      </td>
                      <td>
                         <input className="table-input value-highlight" value={item.valor || ""} onChange={e => handleItemChange(index, "valor", e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-secondary btn-small mt-3" onClick={addItemRow}>+ Adicionar Linha Manual</button>
            </div>
            
            <div className="actions">
               <button className="btn btn-secondary" onClick={() => setExtractedData(null)}>Cancelar</button>
               <button className="btn btn-primary" onClick={handleSave}>Confirmar e Salvar no Banco</button>
            </div>
          </div>
        )}
    </div>
  )
}

export default App
