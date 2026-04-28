import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function LoginCard({ onLogin, loading }) {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-xl">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-inter font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            AI API 代理管理
          </CardTitle>
          <p className="text-sm text-muted-foreground">输入管理员密码以访问控制台</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                placeholder="管理员密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10 bg-muted border-border/50 h-12 font-inter"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button
              type="submit"
              disabled={loading || !password}
              className="w-full h-12 bg-gradient-to-r from-primary to-accent hover:opacity-90 font-semibold text-white"
            >
              {loading ? '验证中...' : '登录'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              默认密码: admin2024
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}