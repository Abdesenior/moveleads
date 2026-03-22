import { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const API_URL = BASE_URL.endsWith('/api') ? BASE_URL : `${BASE_URL}/api`;
  // SOCKET_URL is always the bare origin — no /api suffix, no string surgery on API_URL
  const SOCKET_URL = API_URL.replace(/\/api$/, '');

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          headers: { 'x-auth-token': token }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setToken(null);
          localStorage.removeItem('token');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [token]);

  const login = (jwtToken, userData) => {
    localStorage.setItem('token', jwtToken);
    setToken(jwtToken);
    setUser(userData);
  };

  const impersonate = (targetToken, targetUser) => {
    localStorage.setItem('adminToken', token);
    localStorage.setItem('token', targetToken);
    setToken(targetToken);
    setUser(targetUser);
  };

  const stopImpersonating = () => {
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken) {
      localStorage.setItem('token', adminToken);
      localStorage.removeItem('adminToken');
      setToken(adminToken);
      // fetchUser hook will handle the user update
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/me`, { headers: { 'x-auth-token': token } });
      if (res.ok) setUser(await res.json());
    } catch (err) {
      console.error('refreshUser error:', err);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    setToken(null);
    setUser(null);
  };

  const isImpersonating = !!localStorage.getItem('adminToken');

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, impersonate, stopImpersonating,
      isImpersonating, API_URL, SOCKET_URL, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};
