import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw, Database, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { toast } from "sonner";

export default function StatsTab({ adminToken }) {
  const [stats, setStats] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    const [statsRes, cacheRes] = await Promise.all([
      base44.functions.invoke('admin', { action: 'stats', adminToken }),
      base44.functions.invoke('admin', { action: 'cachestats', adminToken }),
    ]);
    setStats(statsRes.data.stats || []);
    setCacheStats(cacheRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const handleClearCache = async () => {
    await base44.functions.invoke('admin', { action: 'clearcache', adminToken });
    await fetchStats();
    toast.success('缓存已清空');
  };

  const totalTokens = stats.reduce((sum, s) => sum + (s.total_tokens || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50 bg-card/80">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">总请求</p>
            <p className="text-2xl font-bold font-inter">{stats.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">总 Token</p>
            <p className="text-2xl font-bold font-inter">{totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/80">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">缓存命中</p>
                <p className="text-2xl font-bold font-inter">{cacheStats?.totalHits || 0}</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleClearCache} className="border-border/50 text-xs">
                清空缓存
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {cacheStats?.count || 0} 条缓存 · 节省 ~{(cacheStats?.savedTokens || 0).toLocaleString()} token
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-inter flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            使用记录
          </CardTitle>
          <Button size="icon" variant="ghost" onClick={fetchStats} className="h-8 w-8">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-8">加载中...</div>
          ) : stats.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无使用记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">时间</th>
                    <th className="text-left py-2 px-2 font-medium">模型</th>
                    <th className="text-right py-2 px-2 font-medium">Prompt</th>
                    <th className="text-right py-2 px-2 font-medium">Completion</th>
                    <th className="text-right py-2 px-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {s.timestamp ? format(new Date(s.timestamp), 'MM/dd HH:mm') : '-'}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs font-mono border-border/50">{s.model}</Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs">{s.prompt_tokens}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs">{s.completion_tokens}</td>
                      <td className="py-2 px-2 text-right font-mono text-xs font-semibold">{s.total_tokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}