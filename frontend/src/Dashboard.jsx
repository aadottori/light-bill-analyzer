import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [faturas, setFaturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("http://localhost:8000/faturas")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setFaturas(data.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard-section">
      <div className="dashboard-header">
        <h2>Últimas Faturas Processadas</h2>
        <button className="btn btn-primary" onClick={() => navigate('/upload')}>
          + Nova Fatura
        </button>
      </div>

      {loading ? (
        <p>Carregando histórico...</p>
      ) : faturas.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma fatura validada ainda.</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Prédio</th>
                <th>Conta Contrato</th>
                <th>Mês Referência</th>
                <th>Vencimento</th>
                <th>Valor Total (R$)</th>
              </tr>
            </thead>
            <tbody>
              {faturas.map(fat => (
                <tr key={fat.id}>
                  <td>#{fat.id}</td>
                  <td>{fat.predio_nome || 'Não vinculado'}</td>
                  <td>{fat.conta_contrato}</td>
                  <td>{fat.mes_referencia}</td>
                  <td>{fat.vencimento}</td>
                  <td>
                    {fat.valor_total 
                      ? fat.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '-'}
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
