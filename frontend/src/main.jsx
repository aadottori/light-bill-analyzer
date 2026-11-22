import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import BillDetails from "./BillDetails.jsx";
import BillEdit from "./BillEdit.jsx";
import Units from "./Units.jsx";
import Login from "./Login.jsx";
import Analytics from "./Analytics.jsx";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { Icon, ToastProvider } from "./components.jsx";
import "./index.css";

const ROLE_LABEL = { admin: "Administrador", viewer: "Somente leitura" };

function Sidebar({ open, onNavigate }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const link = ({ isActive }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <NavLink to="/" className="brand" onClick={onNavigate}>
        <span className="brand-mark"><Icon name="bolt" size={18} strokeWidth={2} /></span>
        <span>
          <span className="brand-name">UFRJ Energia</span><br />
          <span className="brand-sub">Gestão de faturas de energia</span>
        </span>
      </NavLink>

      <nav className="nav" onClick={onNavigate}>
        <span className="nav-section">Consulta</span>
        <NavLink to="/" end className={link}><Icon name="list" /> Faturas</NavLink>
        <NavLink to="/analytics" className={link}><Icon name="chart" /> Análises</NavLink>
        {isAdmin && (
          <>
            <span className="nav-section">Administração</span>
            <NavLink to="/upload" className={link}><Icon name="upload" /> Importar faturas</NavLink>
            <NavLink to="/units" className={link}><Icon name="building" /> Unidades</NavLink>
          </>
        )}
      </nav>

      {user && (
        <div className="sidebar-footer">
          <div className="user">
            <span className="avatar">{user.username?.slice(0, 2)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user.username}</div>
              <div className="user-role">{ROLE_LABEL[user.role] || user.role}</div>
            </div>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function ProtectedRoute({ children, reqRole }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (reqRole && user.role !== reqRole) return <Navigate to="/" replace />;
  return children;
}

function Shell({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className="shell">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="content">
        <div className="topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu"><Icon name="menu" /></button>
          <strong>UFRJ Energia</strong>
        </div>
        <main className="content-inner">{children}</main>
      </div>
    </div>
  );
}

function Layout() {
  const { user } = useAuth();
  const page = (el, role) => <ProtectedRoute reqRole={role}><Shell>{el}</Shell></ProtectedRoute>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={page(<Dashboard />)} />
      <Route path="/analytics" element={page(<Analytics />)} />
      <Route path="/upload" element={page(<App />, "admin")} />
      <Route path="/units" element={page(<Units />, "admin")} />
      <Route path="/bill/:id" element={page(<BillDetails />)} />
      <Route path="/bill/:id/edit" element={page(<BillEdit />, "admin")} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Layout />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
