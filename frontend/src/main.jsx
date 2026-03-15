import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'
import BillDetails from './BillDetails.jsx'
import BillEdit from './BillEdit.jsx'
import Units from './Units.jsx'
import Login from './Login.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import './index.css'

function Header() {
  const { user, logout } = useAuth();
  
  return (
    <header className="header" style={{ position: 'relative' }}>
      <h1 style={{margin: 0, fontSize: '1.5rem', color: 'var(--primary-color)'}}>UFRJ Energia</h1>
      <nav className="header-nav">
        <Link to="/" className="nav-link">History Dashboard</Link>
        {user?.role === 'admin' && (
          <>
            <Link to="/upload" className="nav-link">New Bill</Link>
            <Link to="/units" className="nav-link">Linked Units</Link>
          </>
        )}
      </nav>
      <div className="auth-status">
        {user ? (
          <>
            <span className="auth-role-badge">{user.role}</span>
            <button onClick={logout} style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline'}}>Log out</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary" style={{padding: '0.4rem 1rem', fontSize: '0.9rem'}}>Log In</Link>
        )}
      </div>
    </header>
  );
}

function ProtectedRoute({ children, reqRole }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (reqRole && user.role !== reqRole) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function Layout() {
  return (
    <div className="app-container">
      <Header />
      
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/login" element={<Login />} />
          <Route path="/upload" element={<ProtectedRoute reqRole="admin"><App /></ProtectedRoute>} />
          <Route path="/units" element={<ProtectedRoute reqRole="admin"><Units /></ProtectedRoute>} />
          <Route path="/bill/:id" element={<ProtectedRoute><BillDetails /></ProtectedRoute>} />
          <Route path="/bill/:id/edit" element={<ProtectedRoute reqRole="admin"><BillEdit /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
