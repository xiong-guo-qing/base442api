import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ChangePasswordTab({ adminToken, onPasswordChanged }) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) {
      toast.error('新密码至少 6 位');
      return;
    }
    if (newPass !== confirmPass) {
      toast.error('两次输入不一致');
      return;
    }

    setSaving(true);
    const oldPassHash = await sha256(oldPass);
    const newPassHash = await sha256(newPass);

    const res = await base44.functions.invoke('admin', {
      action: 'changepass', adminToken,
      oldPassHash, newPassHash,
    });

    if (res.data.error) {
      toast.error(res.data.error.message || '修改失败');
    } else {
      toast.success('密码已修改,请重新登录');
      localStorage.setItem('admin_token', newPassHash);
      onPasswordChanged(newPassHash);
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
    }
    setSaving(false);
  };

  return (
    <Card className="border-border/50 bg-card/80 max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-inter flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          修改管理密码
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">旧密码</Label>
            <div className="relative">
              <Input
                type={showOld ? 'text' : 'password'}
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                className="bg-muted border-border/50 pr-10"
              />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">新密码 (≥6 位)</Label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="bg-muted border-border/50 pr-10"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">确认新密码</Label>
            <Input
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              className="bg-muted border-border/50"
            />
          </div>
          <Button
            type="submit"
            disabled={saving || !oldPass || !newPass || !confirmPass}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white"
          >
            {saving ? '修改中...' : '修改密码'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}