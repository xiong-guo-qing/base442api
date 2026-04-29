import { useState } from 'react';
import { LogOut, Zap, Key, BarChart2, Settings, Shield, Cpu, Database } from 'lucide-react';
import EndpointPanel from './EndpointPanel';
import ApiKeysTab from './ApiKeysTab';
import ModelsTab from './ModelsTab';
import StatsTab from './StatsTab';
import UpstreamTab from './UpstreamTab';
import ChangePassTab from './ChangePassTab';
import CacheDashboardTab from './CacheDashboardTab';

const TABS = [
  { id: 'keys', label: 'API Keys', icon: Key },
  { id: 'models', label: '支持模型', icon: Cpu },
  { id: 'stats', label: '使用统计', icon: BarChart2 },
  { id: 'cache', label: '缓存仪表盘', icon: Database },
  { id: 'upstream', label: '上游配置', icon: Settings },
  { id: 'password', label: '修改密码', icon: Shield },
];

export default function Dashboard({ adminToken, onLogout, sha256 }) {
  const [activeTab, setActiveTab] = useState('keys');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent text-lg">
              AI API 代理
            </span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        {/* Endpoint panel */}
        <EndpointPanel />

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'keys' && <ApiKeysTab adminToken={adminToken} />}
        {activeTab === 'models' && <ModelsTab />}
        {activeTab === 'stats' && <StatsTab adminToken={adminToken} />}
        {activeTab === 'cache' && <CacheDashboardTab adminToken={adminToken} />}
        {activeTab === 'upstream' && <UpstreamTab adminToken={adminToken} />}
        {activeTab === 'password' && <ChangePassTab adminToken={adminToken} sha256={sha256} onLogout={onLogout} />}
      </div>
    </div>
  );
}