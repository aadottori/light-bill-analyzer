// Central API configuration
// In production, set VITE_API_URL in your .env or deployment environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default API_URL;
