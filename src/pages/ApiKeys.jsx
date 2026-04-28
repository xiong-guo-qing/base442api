import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import LoginCard from '@/components/apikeys/LoginCard';
import Dashboard from '@/components/apikeys/Dashboard';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ApiKeysPage() {
  const [adminToken, setAdminToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('admin_token_hash');
    if (saved) setAdminToken(saved);
    setLoading(false);
  }, []);

  const handleLogin = useCallback(async (password) => {
    setLoginError('');
    try {
      const hash = await sha256(password);
      // Verify by calling admin list
      const res = await base44.functions.invoke('admin', { action: 'list', adminToken: hash });
      if (res.data?.error) {
        setLoginError('密码错误');
        return;
      }
      localStorage.setItem('admin_token_hash', hash);
      setAdminToken(hash);
    } catch {
      setLoginError('登录失败，请重试');
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('admin_token_hash');
    setAdminToken(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {!adminToken ? (
        <LoginCard onLogin={handleLogin} error={loginError} />
      ) : (
        <Dashboard adminToken={adminToken} onLogout={handleLogout} sha256={sha256} />
      )}
    </div>
  );
}