import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'
import './index.css'

function Layout() {
  return (
    <div className="app-container">
      <header className="header">
        <h1>UFRJ - Inteligência em Faturas</h1>
        <p className="subtitle">Extrator automatizado de PDFs e Histórico</p>
        <nav className="header-nav">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/upload" className="nav-link">Nova Fatura</Link>
        </nav>
      </header>
      
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<App />} />
        </Routes>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  </React.StrictMode>
)
