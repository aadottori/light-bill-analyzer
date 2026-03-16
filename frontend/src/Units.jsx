import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

export default function Units() {
  const { user } = useAuth();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [name, setName] = useState("");
  const [installationCode, setInstallationCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit states
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = () => {
    if (!user) return;
    setLoading(true);
    fetch("http://localhost:8000/units", {
      headers: { "Authorization": `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUnits(data.data);
        } else {
          setError("Error loading units.");
        }
      })
      .catch(() => setError("Failed to connect to API."))
      .finally(() => setLoading(false));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !installationCode) {
      alert("Please fill in the unit name and Installation Code.");
      return;
    }

    if (!user || user.role !== 'admin') {
      alert("Permission denied. Only admins can register units.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("http://localhost:8000/units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`
        },
        body: JSON.stringify({ name, installation_code: installationCode })
      });
      const data = await response.json();

      if (data.success) {
        setName("");
        setInstallationCode("");
        fetchUnits(); // Refresh the list
      } else {
        alert("Error creating unit: " + data.error);
      }
    } catch (err) {
      alert("Connection failure.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditCode(p.installation_code);
  };

  const handleUpdate = async (id) => {
    if (!editName || !editCode) return alert("Fill in the name and code.");

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/units/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${user.token}` },
        body: JSON.stringify({ name: editName, installation_code: editCode })
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        fetchUnits();
      } else {
        alert("Error editing unit.");
        setLoading(false);
      }
    } catch (e) {
      alert("Connection failure.");
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this unit? Associated bills will lose this link.")) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/units/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchUnits();
      } else {
        alert("Error deleting unit.");
        setLoading(false);
      }
    } catch (e) {
      alert("Connection failure.");
      setLoading(false);
    }
  };

  return (
    <div className="validation-section">
      <div className="dashboard-header" style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', paddingBottom: '1rem' }}>
        <h2>Manage Registered Units</h2>
      </div>

      <div style={{ marginBottom: "2rem", backgroundColor: "#f8fafc", padding: "1.5rem", borderRadius: "8px" }}>
        <h3 className="section-subtitle">Register New Unit</h3>
        <p style={{ marginBottom: "1rem", color: "#64748b" }}>
          Link an Installation Code to a building name. Future bills will be automatically associated with this unit.
        </p>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="data-label">UNIT NAME</label>
            <input type="text" className="data-input" value={name} onChange={e => setName(e.target.value)} placeholder="E.g.: CT, CCMN..." />
          </div>
          <div>
            <label className="data-label">INSTALLATION CODE (Light)</label>
            <input type="text" className="data-input" value={installationCode} onChange={e => setInstallationCode(e.target.value)} placeholder="E.g.: 0020007122" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Register"}
          </button>
        </form>
      </div>

      {loading ? (
        <p>Loading units...</p>
      ) : error ? (
        <p className="error-message">{error}</p>
      ) : (
        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Unit Name</th>
                <th>Linked Installation Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty-state">No units registered yet.</td>
                </tr>
              ) : (
                units.map(p => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    {editingId === p.id ? (
                      <>
                        <td><input type="text" className="data-input" style={{ padding: "0.2rem" }} value={editName} onChange={e => setEditName(e.target.value)} /></td>
                        <td><input type="text" className="data-input" style={{ padding: "0.2rem" }} value={editCode} onChange={e => setEditCode(e.target.value)} /></td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button className="btn btn-primary btn-small" onClick={() => handleUpdate(p.id)}>Save</button>
                            <button className="btn btn-secondary btn-small" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: "600" }}>{p.name}</td>
                        <td>{p.installation_code}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button className="btn btn-secondary btn-small" onClick={() => startEdit(p)}>Edit</button>
                            <button className="btn btn-secondary btn-small" style={{ color: "red", borderColor: "red" }} onClick={() => handleDelete(p.id)}>Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
