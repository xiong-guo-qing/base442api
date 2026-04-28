import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Globe, Sparkles, Zap } from "lucide-react";

const MODEL_GROUPS = [
  {
    provider: 'OpenAI',
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    models: [
      { id: 'gpt-5.5', desc: '最强 GPT 模型' },
      { id: 'gpt-5.4', desc: '高性能 GPT' },
      { id: 'gpt-5-mini', desc: '快速经济型' },
    ],
    aliases: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-5', 'o3', 'o3-mini'],
  },
  {
    provider: 'Anthropic',
    color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    models: [
      { id: 'claude-sonnet-4.6', desc: '均衡版 Claude' },
      { id: 'claude-opus-4.6', desc: '高级 Claude' },
      { id: 'claude-opus-4.7', desc: '最强 Claude' },
    ],
    aliases: ['claude-3.5-sonnet', 'claude-3-opus'],
  },
  {
    provider: 'Google',
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    models: [
      { id: 'gemini-3-flash', desc: '闪电快速, 支持联网' },
      { id: 'gemini-3.1-pro', desc: '专业版, 支持联网' },
    ],
    aliases: ['gemini-pro', 'gemini-flash'],
  },
  {
    provider: 'Base44',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    models: [
      { id: 'automatic', desc: '自动选择最佳模型' },
    ],
    aliases: [],
  },
];

export default function ModelsTab() {
  return (
    <div className="space-y-4">
      {MODEL_GROUPS.map(group => (
        <Card key={group.provider} className="border-border/50 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-inter flex items-center gap-2">
              <Badge className={group.color}>{group.provider}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.models.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                <code className="text-sm font-mono text-primary">{m.id}</code>
                <span className="text-xs text-muted-foreground">{m.desc}</span>
              </div>
            ))}
            {group.aliases.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">兼容别名:</span>
                {group.aliases.map(a => (
                  <Badge key={a} variant="outline" className="text-xs font-mono border-border/50">{a}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-inter flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            扩展能力
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/20">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold">深度思考</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">自动升级到更强模型进行推理</p>
            <pre className="text-xs font-mono bg-background/50 rounded-md p-3 overflow-x-auto text-muted-foreground">
{`extra_body={"reasoning_effort": "high"}
// 或
extra_body={"thinking": {"type": "enabled", "budget_tokens": 20000}}`}
            </pre>
          </div>

          <div className="p-4 rounded-lg bg-muted/30 border border-border/20">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">联网搜索</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">自动切换到 Gemini 并启用网络搜索</p>
            <pre className="text-xs font-mono bg-background/50 rounded-md p-3 overflow-x-auto text-muted-foreground">
{`extra_body={"web_search": True}
// 或模型名加 -search 后缀
model="gpt-4o-search"`}
            </pre>
          </div>

          <div className="p-4 rounded-lg bg-muted/30 border border-border/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">响应缓存</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">自动缓存相同请求,1小时 TTL</p>
            <pre className="text-xs font-mono bg-background/50 rounded-md p-3 overflow-x-auto text-muted-foreground">
{`// 跳过缓存
extra_body={"no_cache": True}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}