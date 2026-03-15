import { useState } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isRegistering) {
      try {
        const res = await fetch('http://localhost:8000/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, secret: secret || undefined })
        });
        const data = await res.json();
        
        if (res.ok) {
          alert("Account created! You can now log in.");
          setIsRegistering(false);
        } else {
          setError(data.detail || "Registration error");
        }
      } catch (err) {
        setError("Connection error");
      }
    } else {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh'}}>
      <div className="upload-section" style={{maxWidth: '400px', width: '100%'}}>
        <h2 style={{textAlign: 'center', marginBottom: '2rem'}}>
          {isRegistering ? 'Create Account' : 'Restricted Area'}
        </h2>
        
        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          <div>
            <label className="data-label">Username</label>
            <input 
              type="text" 
              className="data-input" 
              required
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>
          <div>
            <label className="data-label">Password</label>
            <input 
              type="password" 
              className="data-input" 
              required
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
          {isRegistering && (
            <div>
              <label className="data-label">Admin Secret Key (Optional)</label>
              <input 
                type="password" 
                className="data-input" 
                placeholder="For full access..."
                value={secret} 
                onChange={e => setSecret(e.target.value)} 
              />
            </div>
          )}
          
          {error && <p className="error-message" style={{margin: 0}}>{error}</p>}
          
          <button type="submit" className="btn btn-primary" disabled={loading} style={{marginTop: '1rem'}}>
             {loading ? 'Please wait...' : (isRegistering ? 'Register Administrator' : 'Log In')}
          </button>
        </form>
        
        <p style={{textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem'}}>
          {isRegistering ? 'Already have an account? ' : 'Don\'t have access yet? '}
          <button 
             onClick={() => setIsRegistering(!isRegistering)}
             style={{background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline'}}
          >
            {isRegistering ? 'Log In' : 'Create Account (Required for Uploads)'}
          </button>
        </p>
      </div>
    </div>
  );
}
