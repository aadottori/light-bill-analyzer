import { createContext, useCallback, useContext, useState } from "react";
import { formatBRL } from "./format";

// --- Ícones (traço 1.75, 20px) ---
const paths = {
  bolt: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  upload: "M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  building: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3",
  logout: "M15 17l5-5-5-5M20 12H9M12 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  download: "M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 20h16",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16v4Z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  arrowLeft: "M19 12H5m0 0 6-6m-6 6 6 6",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z",
  key: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h2v-2h2l2.1-2.1A4 4 0 0 1 15 7Zm1.5 2.5h.01",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  sort: "M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  menu: "M4 6h16M4 12h16M4 18h16",
};

export function Icon({ name, size = 18, className = "", strokeWidth = 1.75 }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// --- Estrutura de página ---
export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <div className="page-header">
      <div>
        {back}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "", padded = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={padded ? "card-body" : ""}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "default" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyState({ icon = "file", title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Carregando..." }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Alert({ tone = "error", title, children }) {
  return (
    <div className={`alert alert-${tone}`} role="alert">
      <Icon name={tone === "success" ? "check" : "alert"} size={18} />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

export function Modal({ title, children, footer, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

// --- Tooltip padrão dos gráficos (Recharts) ---
export function ChartTooltip({ active, payload, label, formatter = formatBRL, labelFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      {label !== undefined && <div className="chart-tooltip-label">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tooltip-row">
          <span className="swatch" style={{ background: p.color || p.fill }} />
          <span className="chart-tooltip-name">{p.name}</span>
          <span className="chart-tooltip-value">{formatter(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// --- Notificações ---
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === "error" ? "alert" : "check"} size={18} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
