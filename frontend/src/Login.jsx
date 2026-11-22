import { useState } from "react";
import { useAuth } from "./AuthContext";
import API_URL from "./config";
import { Alert, Field, Icon, useToast } from "./components";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const notify = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isRegistering) {
      try {
        const res = await fetch(`${API_URL}/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, secret: secret || undefined }),
        });
        const data = await res.json();
        if (res.ok) {
          notify(data.message || "Conta criada. Agora é só entrar.");
          setIsRegistering(false);
          setSecret("");
        } else {
          setError(data.detail || "Não foi possível criar a conta.");
        }
      } catch {
        setError("Servidor indisponível. Tente novamente em alguns instantes.");
      }
    } else {
      const result = await login(username, password);
      if (!result.success) setError(result.error);
    }
    setLoading(false);
  };

  const toggle = () => { setIsRegistering(!isRegistering); setError(""); };

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark"><Icon name="bolt" size={18} strokeWidth={2} /></span>
          <span>
            <span className="brand-name">UFRJ Energia</span><br />
            <span className="brand-sub">Gestão de faturas de energia</span>
          </span>
        </div>
        <div>
          <h1>As contas de luz da UFRJ, organizadas e auditáveis.</h1>
          <p>Importação automática das faturas da Light, análise de custos por unidade e identificação de cobranças evitáveis no Grupo A.</p>
          <ul className="auth-points">
            <li><Icon name="check" /> Leitura das faturas em PDF, com conferência opcional por IA</li>
            <li><Icon name="check" /> Reativo excedente, ultrapassagem e demanda contratada por instalação</li>
            <li><Icon name="check" /> Histórico mensal e ranking das unidades que mais custam</li>
          </ul>
        </div>
        <span className="auth-foot">Trabalho de Conclusão de Curso · Engenharia Elétrica · Escola Politécnica/UFRJ</span>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="brand-mark"><Icon name="bolt" size={18} strokeWidth={2} /></span>
            <strong>UFRJ Energia</strong>
          </div>
          <h2>{isRegistering ? "Criar conta" : "Entrar"}</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {isRegistering ? "Contas novas têm acesso de leitura." : "Acesse com seu usuário e senha."}
          </p>

          <form onSubmit={handleSubmit}>
            {error && <Alert>{error}</Alert>}
            <Field label="Usuário">
              <input className="input" required autoComplete="username" autoFocus
                value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Senha">
              <input type="password" className="input" required
                autoComplete={isRegistering ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {isRegistering && (
              <Field label="Código de administrador (opcional)" hint="Só necessário para quem vai importar e editar faturas.">
                <input type="password" className="input" value={secret} onChange={(e) => setSecret(e.target.value)} />
              </Field>
            )}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? "Aguarde..." : isRegistering ? "Criar conta" : "Entrar"}
            </button>
          </form>

          <p className="auth-switch">
            {isRegistering ? "Já tem conta? " : "Ainda não tem acesso? "}
            <button className="link-btn" onClick={toggle}>{isRegistering ? "Entrar" : "Criar conta"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}
