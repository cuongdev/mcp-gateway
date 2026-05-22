import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RulesTab } from './rules-tab';
import { FindingsTab } from './findings-tab';
import { PlaygroundTab } from './playground-tab';

export function RedactionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Redaction</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PII &amp; secret scrubbing across MCP request arguments and response content.
        </p>
      </div>
      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="playground">Test playground</TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="findings"><FindingsTab /></TabsContent>
        <TabsContent value="playground"><PlaygroundTab /></TabsContent>
      </Tabs>
    </div>
  );
}
