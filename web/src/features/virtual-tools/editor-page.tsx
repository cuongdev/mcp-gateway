import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, FlaskConical, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useVirtualTool, useCreateVirtualTool, useUpdateVirtualTool, useValidatePlan, useTestVirtualTool } from './api';
import type { VirtualToolPlan } from './types';

const SAMPLE_PLAN: VirtualToolPlan = {
  name: 'example__hello',
  description: 'Example virtual tool — replace with your own',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  steps: [
    {
      id: 'greet',
      tool: 'echo__say',
      args: { message: '{{input.name}}' },
    },
  ],
  output: { format: 'select', shape: '{{steps.greet}}' },
  errorPolicy: 'fail_fast',
};

export function VirtualToolEditorPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const isNew = !name || name === 'new';
  const { data: existing } = useVirtualTool(isNew ? undefined : name);
  const create = useCreateVirtualTool();
  const update = useUpdateVirtualTool();
  const validate = useValidatePlan();
  const test = useTestVirtualTool(isNew ? undefined : name);

  const [planText, setPlanText] = useState(JSON.stringify(SAMPLE_PLAN, null, 2));
  const [testArgs, setTestArgs] = useState('{}');

  useEffect(() => {
    if (existing?.tool?.plan) setPlanText(JSON.stringify(existing.tool.plan, null, 2));
  }, [existing]);

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(planText);
      validate.mutate(parsed);
    } catch (e) {
      validate.reset();
      // eslint-disable-next-line no-console
      console.error(e);
    }
  };

  const handleSave = () => {
    let parsed: VirtualToolPlan;
    try { parsed = JSON.parse(planText) as VirtualToolPlan; } catch { return; }
    if (isNew) {
      create.mutate(parsed, { onSuccess: () => navigate('/virtual-tools') });
    } else {
      update.mutate({ name: name!, plan: parsed });
    }
  };

  const handleTest = () => {
    let args: unknown;
    try { args = JSON.parse(testArgs); } catch { return; }
    test.mutate(args);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/virtual-tools')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <h1 className="text-xl font-bold">{isNew ? 'New virtual tool' : (name ?? 'Editor')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Plan (JSON)</CardTitle>
            <div className="flex items-center gap-2">
              {validate.data?.ok === true && <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />valid</Badge>}
              {validate.data?.ok === false && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />invalid</Badge>}
              <Button size="sm" variant="outline" onClick={handleValidate}>Validate</Button>
              <Button size="sm" onClick={handleSave} disabled={create.isPending || update.isPending}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[420px] rounded-md border bg-background p-3 font-mono text-xs"
              value={planText}
              onChange={(e) => setPlanText(e.target.value)}
              spellCheck={false}
            />
            {validate.data?.errors && validate.data.errors.length > 0 && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <div className="font-semibold mb-1">Validation errors:</div>
                <ul className="space-y-0.5">
                  {validate.data.errors.map((e, i) => <li key={i}>· {e}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {!isNew && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> Test (dry-run)
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={test.isPending}>
                Run
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Input args (JSON)</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border bg-background p-2 font-mono text-xs"
                  value={testArgs}
                  onChange={(e) => setTestArgs(e.target.value)}
                />
              </div>
              {test.data && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Steps</Label>
                    <pre className="mt-1 rounded-md border bg-muted/30 p-2 font-mono text-xs max-h-60 overflow-auto">
                      {JSON.stringify(test.data.steps, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <Label className="text-xs">Output</Label>
                    <pre className="mt-1 rounded-md border bg-muted/30 p-2 font-mono text-xs max-h-60 overflow-auto">
                      {JSON.stringify(test.data.output, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
