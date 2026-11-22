import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import BillForm from "./BillForm";
import { Alert, Icon, PageHeader, Spinner, useToast } from "./components";

// A API devolve números JS (2804.15), mas grava esperando o formato brasileiro
// ("2804,15"): o ponto seria lido como separador de milhar. Converte ao carregar.
const toBR = (v) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 8 }) : v;

export default function BillEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useToast();

  const [data, setData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    const headers = { Authorization: `Bearer ${user.token}` };
    fetch(`${API_URL}/bills/${id}`, { headers })
      .then((res) => res.json())
      .then((d) => {
        if (!d.success) return setError(d.detail || "Fatura não encontrada.");
        const b = d.data;
        setData({
          ...b,
          total_amount: toBR(b.total_amount),
          due_date: b.due_date ? b.due_date.split("-").reverse().join("/") : "",
          items: (b.items || []).map((it) => ({
            description: it.description,
            quantity: toBR(it.quantity),
            unit_price: toBR(it.unit_price),
            amount: toBR(it.amount ?? 0),
          })),
        });
      })
      .catch(() => setError("Falha de comunicação com o servidor."))
      .finally(() => setLoading(false));

    fetch(`${API_URL}/bill-items/descriptions`, { headers })
      .then((res) => res.json())
      .then((d) => d.success && setSuggestions(d.data));
  }, [id, user]);

  const onField = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
  const onItem = (i, key, value) =>
    setData((prev) => ({ ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, [key]: value } : it)) }));
  const onAddItem = () =>
    setData((prev) => ({ ...prev, items: [...prev.items, { description: "", quantity: null, unit_price: null, amount: "0,00" }] }));
  const onRemoveItem = (i) => setData((prev) => ({ ...prev, items: prev.items.filter((_, j) => j !== i) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/bills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(data),
      });
      const d = await res.json();
      if (d.success) {
        notify("Fatura atualizada.");
        navigate(`/bill/${id}`);
      } else {
        notify("Não foi possível salvar a fatura.", "error");
      }
    } catch {
      notify("Falha de comunicação com o servidor.", "error");
    } finally {
      setSaving(false);
    }
  };

  const back = <button className="back-link" onClick={() => navigate(`/bill/${id}`)}><Icon name="arrowLeft" size={15} /> Voltar à fatura</button>;

  if (loading) return <Spinner label="Carregando fatura..." />;
  if (error || !data) return <><PageHeader back={back} title="Editar fatura" /><Alert>{error}</Alert></>;

  return (
    <>
      <PageHeader back={back} title="Editar fatura"
        subtitle={`${data.unit_name || "Instalação " + (data.installation_code || "—")} · ${data.reference_month || ""}`} />

      <BillForm data={data} onField={onField} onItem={onItem} onAddItem={onAddItem} onRemoveItem={onRemoveItem} suggestions={suggestions} />

      <div className="sticky-actions">
        <button className="btn btn-secondary" onClick={() => navigate(`/bill/${id}`)}>Cancelar</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving && <span className="spinner" />} {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </>
  );
}
