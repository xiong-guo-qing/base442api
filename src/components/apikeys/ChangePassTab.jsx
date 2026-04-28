import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Shield } from 'lucide-react';

export default function ChangePassTab({ adminToken, sha256, onLogout }) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPass.length < 6) { setError('新密码至少 6 位'); return; }
    if (newPass !== confirmPass) { setError('两次密码不一致'); return; }

    setLoading(true);
    const oldHash = await sha256(oldPass);
    const newHash = await sha256(newPass);

    const res = await base44.functions.invoke('admin', {
      action: 'changepass',
      adminToken,
      oldHash,
      newHash,
    });

    setLoading(false);

    if (res.data?.error) {
      setError(res.data.error.message || '旧密码错误');
    } else {
      setSuccess('密码修改成功，请重新登录');
      setTimeout(() => {
        localStorage.removeItem('admin_token_hash');
        onLogout();
      }, 1500);
    }
  };

  return (
    <div className="max-w-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-purple-400" />
          <h3 className="font-semibold text-slate-200">修改管理员密码</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: '旧密码', value: oldPass, set: setOldPass, placeholder: '输入当前密码' },
            { label: '新密码（≥6 位）', value: newPass, set: setNewPass, placeholder: '输入新密码' },
            { label: '确认新密码', value: confirmPass, set: setConfirmPass, placeholder: '再次输入新密码' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
              <input
                type="password"
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          ))}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {success && <p className="text-green-400 text-sm">{success}</p>}

          <button
            type="submit"
            disabled={loading || !oldPass || !newPass || !confirmPass}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
          >
            {loading ? '修改中...' : '确认修改'}
          </button>
        </form>
      </div>
    </div>
  );
}