import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import BillForm from "./BillForm";
import { Alert, Badge, Card, Field, Icon, Modal, PageHeader, useToast } from "./components";

// Página de importação: envio dos PDFs, validação fatura a fatura e gravação.
export default function App() {
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const auth = { Authorization: `Bearer ${user.token}` };

  const [files, setFiles] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [autoSave, setAutoSave] = useState(false);
  const [progress, setProgress] = useState(null);

  // Leitura com IA (Google AI Studio)
  const [useAi, setUseAi] = useState(false);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showDiffs, setShowDiffs] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/bill-items/descriptions`, { headers: auth })
      .then((r) => r.json()).then((d) => d.success && setSuggestions(d.data));
    fetch(`${API_URL}/ai/config`, { headers: auth })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.has_key && !geminiKey) setGeminiKey("configured-on-server"); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveKey = async () => {
    const key = tempKey.trim();
    if (!key) return;
    localStorage.setItem("gemini_api_key", key);
    setGeminiKey(key);
    try {
      await fetch(`${API_URL}/ai/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({ api_key: key }),
      });
    } catch { /* a chave fica salva no navegador mesmo sem o servidor */ }
    setShowKeyModal(false);
    setTempKey("");
    notify("Chave da IA salva.");
  };

  const pickFiles = (list) => {
    const pdfs = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return setError("Selecione arquivos PDF.");
    setFiles(pdfs);
    setError("");
    setQueue([]);
    setCurrent(0);
    setAiError(null);
  };

  const handleUpload = async () => {
    if (!files?.length) return;
    setLoading(true);
    setError("");
    setAiError(null);

    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const keyParam = geminiKey && geminiKey !== "configured-on-server" ? `&api_key=${encodeURIComponent(geminiKey)}` : "";
    const aiParam = useAi ? `?use_ai=true${keyParam}` : "";

    try {
      const res = await fetch(`${API_URL}/upload${aiParam}`, { method: "POST", headers: auth, body: form });
      const data = await res.json();
      const ok = data.results.filter((r) => r.success).map((r) => r.data);
      const failed = data.results.filter((r) => !r.success).map((r) => r.filename);

      if (ok.length === 0) {
        setError(`Nenhum arquivo pôde ser lido${failed.length ? `: ${failed.join(", ")}` : "."}`);
        setLoading(false);
        return;
      }
      if (failed.length) notify(`Não foi possível ler: ${failed.join(", ")}`, "error");

      if (autoSave) {
        await saveAll(ok);
      } else {
        setQueue(ok);
        setCurrent(0);
        setLoading(false);
      }
    } catch {
      setError("Não foi possível falar com o servidor. Verifique se o backend está no ar.");
      setLoading(false);
    }
  };

  // Procura fatura existente da mesma instalação/mês para decidir entre criar e substituir
  const findExisting = async (bill) => {
    if (!bill.installation_code || !bill.reference_month) return null;
    const r = await fetch(`${API_URL}/bills/check?installation_code=${bill.installation_code}&reference_month=${encodeURIComponent(bill.reference_month)}`, { headers: auth });
    const d = await r.json();
    return d.success && d.exists ? d.bill_id : null;
  };

  const persist = async (bill, existingId) => {
    const r = await fetch(existingId ? `${API_URL}/bills/${existingId}` : `${API_URL}/bills`, {
      method: existingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(bill),
    });
    return r.json();
  };

  const saveAll = async (bills) => {
    let saved = 0, failed = 0;
    for (let i = 0; i < bills.length; i++) {
      setProgress({ done: i, total: bills.length });
      try {
        const d = await persist(bills[i], await findExisting(bills[i]));
        d.success ? saved++ : failed++;
      } catch { failed++; }
    }
    setProgress(null);
    setLoading(false);
    setFiles(null);
    notify(`${saved} ${saved === 1 ? "fatura gravada" : "faturas gravadas"}${failed ? `, ${failed} com erro` : ""}.`, failed ? "error" : "success");
    navigate("/");
  };

  const data = queue[current];
  const rec = data?._reconciliation;

  const update = (fn) => setQueue((q) => q.map((b, i) => (i === current ? fn(b) : b)));
  const onField = (key, value) => update((b) => ({ ...b, [key]: value }));
  const onItem = (idx, key, value) => update((b) => ({ ...b, items: b.items.map((it, j) => (j === idx ? { ...it, [key]: value } : it)) }));
  const onAddItem = () => update((b) => ({ ...b, items: [...b.items, { description: "", quantity: null, unit_price: null, amount: "0,00" }] }));
  const onRemoveItem = (idx) => update((b) => ({ ...b, items: b.items.filter((_, j) => j !== idx) }));

  const next = () => {
    setAiError(null);
    setShowDiffs(false);
    if (current < queue.length - 1) setCurrent((c) => c + 1);
    else { setQueue([]); setFiles(null); }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const existingId = await findExisting(data);
      if (existingId && !window.confirm(`Já existe uma fatura da instalação ${data.installation_code} em ${data.reference_month}. Deseja substituí-la?`)) {
        setLoading(false);
        return;
      }
      const d = await persist(data, existingId);
      if (!d.success) throw new Error();
      if (current < queue.length - 1) {
        notify(`Fatura ${current + 1} de ${queue.length} gravada.`);
        next();
      } else {
        notify(queue.length === 1 ? "Fatura gravada." : "Todas as faturas do lote foram gravadas.");
        setQueue([]);
        setFiles(null);
        navigate("/");
      }
    } catch {
      notify("Não foi possível gravar a fatura.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWithAi = async () => {
    if (!geminiKey) { setTempKey(""); setShowKeyModal(true); return; }
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch(`${API_URL}/bills/compare-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
          file_path: data._file_path,
          original_file_name: data.original_file_name,
          api_key: geminiKey !== "configured-on-server" ? geminiKey : null,
          model_name: "gemini-2.5-flash",
        }),
      });
      const json = await res.json();
      if (!json.success) return setAiError(json.error || json.detail || "Erro ao consultar a IA.");
      const r = json.reconciliation;
      if (r) {
        update(() => ({ ...r.active_data, _file_path: data._file_path, original_file_name: data.original_file_name, _reconciliation: r }));
        setShowDiffs(true);
      }
    } catch (e) {
      setAiError(`Falha de comunicação: ${e.message}`);
    } finally {
      setLoadingAi(false);
    }
  };

  const switchSource = (source) => {
    const target = source === "ai" ? rec.ai_data : rec.regex_data;
    if (!target) return;
    update(() => ({ ...target, _file_path: data._file_path, original_file_name: data.original_file_name, _reconciliation: rec, _manualSource: source }));
  };
  const activeSource = data?._manualSource || rec?.winner;

  const keyModal = showKeyModal && (
    <Modal title="Chave do Google AI Studio" onClose={() => setShowKeyModal(false)}
      footer={<>
        <button className="btn btn-secondary" onClick={() => setShowKeyModal(false)}>Cancelar</button>
        <button className="btn btn-ai" onClick={handleSaveKey} disabled={!tempKey.trim()}>Salvar chave</button>
      </>}>
      <p>Para ler as faturas também com IA (Gemini), informe uma chave de API do Google AI Studio. Os modelos Flash têm cota gratuita mensal.</p>
      <Alert tone="info">
        Crie a chave em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a> com sua conta Google.
      </Alert>
      <Field label="GEMINI_API_KEY">
        <input type="password" className="input" placeholder="AIzaSy..." value={tempKey} onChange={(e) => setTempKey(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );

  // --- Etapa 1: seleção dos arquivos ---
  if (!data) {
    return (
      <>
        {keyModal}
        <PageHeader title="Importar faturas" subtitle="Envie as faturas em PDF da Light. Os dados são extraídos automaticamente e você revisa cada uma antes de gravar." />
        <div style={{ maxWidth: 720 }}>
          <Card>
            <div className={`dropzone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFiles(e.dataTransfer.files); }}>
              <input type="file" accept=".pdf" multiple onChange={(e) => pickFiles(e.target.files)} aria-label="Selecionar PDFs" />
              <div className="dropzone-icon"><Icon name="upload" size={22} /></div>
              <p className="dropzone-title">Arraste os PDFs para cá</p>
              <p className="dropzone-text">ou clique para escolher os arquivos. Dá para enviar várias faturas de uma vez.</p>
            </div>

            {files?.length > 0 && (
              <>
                <div className="row spread" style={{ marginTop: 16 }}>
                  <strong>{files.length} {files.length === 1 ? "arquivo selecionado" : "arquivos selecionados"}</strong>
                  <button className="btn btn-ghost btn-sm" onClick={() => setFiles(null)}>Limpar</button>
                </div>
                <ul className="file-list">
                  {files.map((f) => <li key={f.name}><Icon name="file" size={16} /> {f.name}</li>)}
                </ul>
              </>
            )}

            <div className="options">
              <label className="checkbox">
                <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
                <span>
                  <span className="checkbox-title">Gravar sem revisar</span>
                  <span className="checkbox-desc">Grava todas as faturas direto no banco, substituindo as que já existirem para a mesma instalação e mês.</span>
                </span>
              </label>
              <div className="row spread" style={{ alignItems: "flex-start" }}>
                <label className="checkbox" style={{ flex: 1 }}>
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  <span>
                    <span className="checkbox-title">Conferir com IA (Gemini)</span>
                    <span className="checkbox-desc">Lê cada fatura também com IA e escolhe a leitura mais consistente. Fica mais lento.</span>
                  </span>
                </label>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowKeyModal(true)}>
                  <Icon name="key" size={15} /> {geminiKey ? "Chave configurada" : "Configurar chave"}
                </button>
              </div>
            </div>

            {error && <Alert>{error}</Alert>}

            <button className="btn btn-primary btn-lg btn-block" onClick={handleUpload} disabled={!files?.length || loading}>
              {loading && <span className="spinner" />}
              {loading
                ? progress ? `Gravando ${progress.done + 1} de ${progress.total}...` : useAi ? "Lendo faturas com IA..." : "Lendo faturas..."
                : "Ler faturas"}
            </button>
            {progress && <div className="progress"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
          </Card>
        </div>
      </>
    );
  }

  // --- Etapa 2: validação fatura a fatura ---
  return (
    <>
      {keyModal}
      <PageHeader
        title="Revisar fatura"
        subtitle={<><Icon name="file" size={14} /> {data.original_file_name || "PDF da fatura"}</>}
        actions={
          <>
            <Badge tone="blue">Fatura {current + 1} de {queue.length}</Badge>
            <button className="btn btn-ai" onClick={handleAnalyzeWithAi} disabled={loadingAi}>
              {loadingAi ? <span className="spinner" /> : <Icon name="sparkles" />} {loadingAi ? "Consultando IA..." : "Comparar com IA"}
            </button>
            <button className="icon-btn" title="Configurar chave da IA" onClick={() => setShowKeyModal(true)}><Icon name="key" /></button>
          </>
        }
      />
      {queue.length > 1 && <div className="progress" style={{ marginTop: -12, marginBottom: 20 }}><span style={{ width: `${((current + 1) / queue.length) * 100}%` }} /></div>}

      {aiError && <Alert title="Erro na leitura com IA:">{aiError}</Alert>}

      {rec && (
        <div className={`recon recon-${rec.winner === "ai" ? "ai" : "regex"}`}>
          <div className="recon-head">
            <div>
              <div className="recon-title">{rec.winner === "ai" ? "A leitura da IA ficou mais completa" : "A leitura do parser local ficou mais consistente"}</div>
              <div className="recon-scores">
                Qualidade: IA {rec.scores.ai}% · parser local {rec.scores.regex}%
                {rec.extra_items_found_by_ai > 0 && ` · a IA encontrou ${rec.extra_items_found_by_ai} itens a mais`}
              </div>
            </div>
            <div className="row">
              <div className="segmented" role="group" aria-label="Fonte dos dados">
                <button className={activeSource === "regex" ? "on" : ""} onClick={() => switchSource("regex")}>Parser local</button>
                <button className={activeSource === "ai" ? "on" : ""} onClick={() => switchSource("ai")}>IA</button>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDiffs(!showDiffs)}>{showDiffs ? "Ocultar diferenças" : "Ver diferenças"}</button>
            </div>
          </div>
          {showDiffs && (
            <div style={{ marginTop: 14 }}>
              <div className="card" style={{ boxShadow: "none" }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Campo</th><th>Parser local</th><th>IA (Gemini)</th><th>Situação</th></tr></thead>
                    <tbody>
                      {rec.header_diffs?.map((d) => (
                        <tr key={d.label} className={d.divergent ? "diff-row-divergent" : ""}>
                          <td className="strong">{d.label}</td>
                          <td>{d.regex_value || <span className="faint">vazio</span>}</td>
                          <td>{d.ai_value || <span className="faint">vazio</span>}</td>
                          <td>{d.divergent ? <Badge tone="warn">Diverge</Badge> : <Badge tone="good">Igual</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {rec.only_in_ai?.length > 0 && (
                <div style={{ marginTop: 12, fontSize: 13.5 }}>
                  <strong>Itens que só a IA encontrou:</strong>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {rec.only_in_ai.map((it, i) => <li key={i}>{it.description}: R$ {it.amount}{it.quantity ? ` (quantidade ${it.quantity})` : ""}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <BillForm data={data} onField={onField} onItem={onItem} onAddItem={onAddItem} onRemoveItem={onRemoveItem} suggestions={suggestions} showBuilding />

      <div className="sticky-actions">
        <button className="btn btn-secondary" onClick={next}>
          {current < queue.length - 1 ? <>Pular esta fatura <Icon name="chevronRight" size={16} /></> : "Cancelar importação"}
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="check" />} {loading ? "Gravando..." : "Confirmar e gravar"}
        </button>
      </div>
    </>
  );
}
