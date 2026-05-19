import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipInput } from '@/components/chip-input';
import { useCreateWebhook, useWebhookEvents } from './api';

export function WebhookNewSheet() {
  const navigate = useNavigate();
  const close = () => navigate('/webhooks');

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const create = useCreateWebhook();
  const { data: eventsData } = useWebhookEvents();
  const knownEvents = eventsData?.events ?? [];

  const submit = async () => {
    try {
      await create.mutateAsync({
        name, url,
        secret: secret || undefined,
        events,
      });
      close();
    } catch { /* toast handled */ }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Webhook</SheetTitle>
          <SheetDescription>POSTs event JSON to a URL. Optionally sign with HMAC.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ops-slack-bot" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/path" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secret">Secret (optional, enables HMAC)</Label>
            <Input id="secret" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="random-string" type="password" />
          </div>
          <div className="space-y-1.5">
            <Label>Events (leave empty for all)</Label>
            <ChipInput value={events} onChange={setEvents} placeholder={knownEvents.join(', ')} ariaLabel="events" />
            <p className="text-xs text-muted-foreground">Common: {knownEvents.map((e) => <code key={e} className="mr-1 font-mono">{e}</code>)}</p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim() || !url.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
