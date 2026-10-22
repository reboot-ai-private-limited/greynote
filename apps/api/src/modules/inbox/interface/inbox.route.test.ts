import type { AddressInfo } from 'node:net';
import express, { type NextFunction, type Request, type Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { publishUpload } from './inbox.route.js';

/** The multipart half of `POST /inbox/messages`: what reaches `validate` and the controller. */
describe('publishUpload', () => {
  let base = '';
  let close: () => void = () => undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.post('/messages', publishUpload, (req: Request, res: Response) => {
      const files = ((req.files as Array<{ originalname: string; size: number }> | undefined) ?? []).map((f) => ({ name: f.originalname, size: f.size }));
      res.json({ body: req.body as unknown, files });
    });
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(err instanceof AppError ? err.statusCode : 500).json({ message: err instanceof Error ? err.message : 'error' });
    });
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  const message = { title: 'Hello', body: 'Body', kind: 'ANNOUNCEMENT', audience: { everyone: true } };

  it('reads the message from `payload` and the files beside it', async () => {
    const form = new FormData();
    form.append('payload', JSON.stringify(message));
    form.append('files', new Blob(['%PDF-1.7']), 'Price list.pdf');
    form.append('files', new Blob(['%PDF-1.7 two']), 'Second.pdf');
    const res = await fetch(`${base}/messages`, { method: 'POST', body: form });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body: message, files: [{ name: 'Price list.pdf', size: 8 }, { name: 'Second.pdf', size: 12 }] });
  });

  it('leaves a JSON send as it is', async () => {
    const res = await fetch(`${base}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
    expect(await res.json()).toEqual({ body: message, files: [] });
  });

  it('refuses a missing or broken payload, and a sixth file', async () => {
    const noPayload = new FormData();
    noPayload.append('files', new Blob(['%PDF-1.7']), 'a.pdf');
    expect((await fetch(`${base}/messages`, { method: 'POST', body: noPayload })).status).toBe(400);

    const broken = new FormData();
    broken.append('payload', '{not json');
    expect((await fetch(`${base}/messages`, { method: 'POST', body: broken })).status).toBe(400);

    const six = new FormData();
    six.append('payload', JSON.stringify(message));
    for (let i = 0; i < 6; i += 1) six.append('files', new Blob(['%PDF-1.7']), `${i}.pdf`);
    const res = await fetch(`${base}/messages`, { method: 'POST', body: six });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/at most 5 files/);
  });

  it('takes a message body far over the old 2,000 characters', async () => {
    const form = new FormData();
    form.append('payload', JSON.stringify({ ...message, body: 'x'.repeat(500_000) }));
    const res = await fetch(`${base}/messages`, { method: 'POST', body: form });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { body: { body: string } }).body.body).toHaveLength(500_000);
  });
});
