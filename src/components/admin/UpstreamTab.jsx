import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowUpRight, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function UpstreamTab({ adminToken }) {
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await base44.functions.invoke('admin', { action: 'getupstream', adminToken });
      const up = res.data.upstream;
      setEndpoint(up.endpoint || '');
      setApiKey(up.apiKey || '');
      setModel(up.model || '');
      setEnabled(up.enabled || false);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await base44.functions.invoke('admin', {
      action: 'setupstream', adminToken,
      endpoint, apiKey, model, enabled,
    });
    setSaving(false);
    toast.success('上游配置已保存');
  };

  if (loading) return <div className="text-center text-muted-foreground py-8">加载中...</div>;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-inter flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-primary" />
          上游 API 配置
        </CardTitle>
        <p className="text-xs text-muted-foreground">当 Base44 内置 LLM 失败时,自动回退到此上游</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <Label className="text-sm">{enabled ? '已启用' : '已禁用'}</Label>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Endpoint</Label>
          <Input
            placeholder="https://api.openai.com/v1"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="bg-muted border-border/50 font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">API Key</Label>
          <Input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="bg-muted border-border/50 font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">默认模型</Label>
          <Input
            placeholder="gpt-4o-mini"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-muted border-border/50 font-mono text-sm"
          />
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          <Save className="w-4 h-4 mr-1" />
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </CardContent>
    </Card>
  );
}