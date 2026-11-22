import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import { Alert, Card, EmptyState, Field, Icon, PageHeader, Spinner, useToast } from "./components";

export default function Units() {
  const { user } = useAuth();
  const notify = useToast();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` };

  const fetchUnits = useCallback(() => {
    fetch(`${API_URL}/units`, { headers: { Authorization: `Bearer ${user.token}` } })
      .then((r) => r.json())
      .then((d) => (d.success ? setUnits(d.data) : setError("Não foi possível carregar as unidades.")))
      .catch(() => setError("Falha de comunicação com o servidor."))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/units`, { method: "POST", headers, body: JSON.stringify({ name: name.trim(), installation_code: code.trim() }) });
      const d = await r.json();
      if (d.success) {
        notify(`Unidade "${name.trim()}" cadastrada.`);
        setName(""); setCode("");
        fetchUnits();
      } else {
        notify(d.error || d.detail || "Não foi possível cadastrar a unidade.", "error");
      }
    } catch {
      notify("Falha de comunicação com o servidor.", "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => { setEditingId(u.id); setEditName(u.name); setEditCode(u.installation_code); };

  const handleUpdate = async (id) => {
    if (!editName.trim() || !editCode.trim()) return;
    try {
      const r = await fetch(`${API_URL}/units/${id}`, { method: "PUT", headers, body: JSON.stringify({ name: editName.trim(), installation_code: editCode.trim() }) });
      const d = await r.json();
      if (d.success) { notify("Unidade atualizada."); setEditingId(null); fetchUnits(); }
      else notify("Não foi possível atualizar a unidade.", "error");
    } catch {
      notify("Falha de comunicação com o servidor.", "error");
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Excluir a unidade "${u.name}"? As faturas dela continuam no banco, mas ficam sem unidade vinculada.`)) return;
    try {
      const r = await fetch(`${API_URL}/units/${u.id}`, { method: "DELETE", headers });
      const d = await r.json();
      if (d.success) { notify("Unidade excluída."); fetchUnits(); }
      else notify("Não foi possível excluir a unidade.", "error");
    } catch {
      notify("Falha de comunicação com o servidor.", "error");
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? units.filter((u) => u.name?.toLowerCase().includes(q) || u.installation_code?.includes(q)) : units;

  return (
    <>
      <PageHeader title="Unidades" subtitle="Cada unidade liga um código de instalação da Light a um prédio ou centro da UFRJ. Faturas novas com esse código são vinculadas automaticamente." />

      <Card title="Cadastrar unidade" className="mb-16">
        <form onSubmit={handleCreate} className="toolbar" style={{ marginBottom: 0 }}>
          <Field label="Nome da unidade">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Centro de Tecnologia" />
          </Field>
          <Field label="Código da instalação">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex.: 400103438" />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim() || !code.trim()}>
            {saving ? <span className="spinner" /> : <Icon name="plus" />} Cadastrar
          </button>
        </form>
      </Card>

      <Card title="Unidades cadastradas" subtitle={`${units.length} unidades`} padded={false}
        actions={
          <div style={{ width: 240 }}>
            <input className="input" placeholder="Buscar por nome ou código" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar unidade" />
          </div>
        }>
        <div style={{ marginTop: 14 }}>
          {loading ? <Spinner label="Carregando unidades..." /> : error ? (
            <div className="card-body"><Alert>{error}</Alert></div>
          ) : shown.length === 0 ? (
            <EmptyState icon="building" title={q ? "Nenhuma unidade encontrada" : "Nenhuma unidade cadastrada"}>
              {q ? "Tente outro termo de busca." : "Cadastre a primeira unidade no formulário acima."}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Unidade</th><th>Código da instalação</th><th className="actions-cell"><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {shown.map((u) => editingId === u.id ? (
                    <tr key={u.id}>
                      <td><input className="input table-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus /></td>
                      <td><input className="input table-input" value={editCode} onChange={(e) => setEditCode(e.target.value)} /></td>
                      <td className="actions-cell">
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleUpdate(u.id)}>Salvar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id}>
                      <td className="strong">{u.name}</td>
                      <td className="num" style={{ textAlign: "left" }}>{u.installation_code}</td>
                      <td className="actions-cell">
                        <button className="icon-btn" title="Editar" onClick={() => startEdit(u)}><Icon name="edit" /></button>
                        <button className="icon-btn danger" title="Excluir" onClick={() => handleDelete(u)}><Icon name="trash" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
