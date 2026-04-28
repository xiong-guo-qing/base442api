import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Key, Plus, Copy, Trash2, RefreshCw, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function generateKey() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `sk-${hex}`;
}

export default function ApiKeysTab({ adminToken }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const fetchKeys = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('admin', { action: 'list', adminToken });
    setKeys(res.data.keys || []);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async () => {
    if (!newKey) return;
    setCreating(true);
    await base44.functions.invoke('admin', { action: 'create', adminToken, key: newKey, name: newName });
    setNewKey('');
    setNewName('');
    await fetchKeys();
    setCreating(false);
    toast.success('API Key 已创建');
  };

  const handleDelete = async (id) => {
    await base44.functions.invoke('admin', { action: 'delete', adminToken, keyId: id });
    await fetchKeys();
    toast.success('已删除');
  };

  const handleToggle = async (id, enabled) => {
    await base44.functions.invoke('admin', { action: 'toggle', adminToken, keyId: id, enabled });
    await fetchKeys();
  };

  const handleCopy = (key, id) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    toast.success('已复制');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-inter">创建新 Key</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="名称 (可选)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-muted border-border/50 sm:w-40"
            />
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="API Key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="bg-muted border-border/50 font-mono text-sm flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => setNewKey(generateKey())}
                className="shrink-0 border-border/50"
                title="生成随机 Key"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !newKey}
              className="bg-primary hover:bg-primary/90 shrink-0"
            >
              <Plus className="w-4 h-4 mr-1" /> 创建
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-inter flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            Key 列表
            <Badge variant="secondary" className="ml-auto">{keys.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">加载中...</div>
          ) : keys.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无 API Key</div>
          ) : (
            <div className="space-y-2">
              {keys.map(k => (
                <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/20 hover:border-border/40 transition-colors">
                  <Switch
                    checked={k.enabled}
                    onCheckedChange={(v) => handleToggle(k.id, v)}
                  />
                  <div className="min-w-0 flex-1">
                    {k.name && <p className="text-xs text-muted-foreground">{k.name}</p>}
                    <p className="text-sm font-mono truncate">{k.key}</p>
                  </div>
                  <Badge variant={k.enabled ? 'default' : 'secondary'} className={k.enabled ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}>
                    {k.enabled ? '启用' : '禁用'}
                  </Badge>
                  <Button size="icon" variant="ghost" onClick={() => handleCopy(k.key, k.id)} className="h-8 w-8">
                    {copiedId === k.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(k.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}