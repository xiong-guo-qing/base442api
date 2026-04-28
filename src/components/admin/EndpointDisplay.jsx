import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Globe } from "lucide-react";
import { toast } from "sonner";

function CopyRow({ label, value }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border/30">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-mono text-foreground truncate">{value}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-primary"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export default function EndpointDisplay() {
  const base = `${window.location.origin}/functions/v1`;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-xl mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-inter flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          API 端点
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <CopyRow label="OpenAI Base URL" value={base} />
        <CopyRow label="Models" value={`${base}/models`} />
        <CopyRow label="Chat Completions" value={`${base}/chat/completions`} />
        <CopyRow label="Images Generations" value={`${base}/images/generations`} />
      </CardContent>
    </Card>
  );
}