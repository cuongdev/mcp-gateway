import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Package } from 'lucide-react';
import type { ConnectorTemplate, ConnectorCategory } from './types';

/** Brand logo from the connector's iconSlug (Simple Icons CDN), with a graceful
 *  fallback to a generic package glyph when the slug is missing or offline. */
function BrandIcon({ slug }: { slug?: string }) {
  const [failed, setFailed] = useState(false);
  if (!slug || failed) return <Package className="h-5 w-5 flex-shrink-0 text-muted-foreground" />;
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      className="h-5 w-5 flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

const CATEGORY_LABEL: Record<ConnectorCategory, string> = {
  'developer-tools': 'Developer',
  databases: 'Database',
  productivity: 'Productivity',
  cloud: 'Cloud',
  'ai-ml': 'AI / ML',
  communications: 'Comms',
  local: 'Local',
};

export function ConnectorCard({ template, installed, onInstall }: {
  template: ConnectorTemplate;
  installed: boolean;
  onInstall: () => void;
}) {
  const supports = Object.entries(template.supports)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BrandIcon slug={template.iconSlug} />
            <span className="truncate">{template.displayName}</span>
          </CardTitle>
          <a href={template.docsUrl} target="_blank" rel="noreferrer"
             className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="text-xs text-muted-foreground">{CATEGORY_LABEL[template.category]}</div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex flex-wrap gap-1 mb-3">
          {supports.map((s) => (
            <Badge key={s} variant="outline" className="text-xs px-1.5 py-0">{s}</Badge>
          ))}
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          v{template.templateVersion} · {template.requiredEnv.length} secret{template.requiredEnv.length === 1 ? '' : 's'}
        </div>
        <div className="mt-auto">
          {installed ? (
            <Button variant="outline" size="sm" disabled className="w-full">Installed</Button>
          ) : (
            <Button size="sm" className="w-full" onClick={onInstall}>Install</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
