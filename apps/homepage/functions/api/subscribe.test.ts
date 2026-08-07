import { describe, expect, it, vi } from 'vitest';
import { onRequestPost } from './subscribe';

function jsonRequest(body: unknown): Request {
	return new Request('https://sero.ai/api/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

function formRequest(email: string): Request {
	const form = new FormData();
	form.set('email', email);
	return new Request('https://sero.ai/api/subscribe', { method: 'POST', body: form });
}

function kv() {
	return { put: vi.fn<(key: string, value: string) => Promise<void>>(async () => undefined) };
}

describe('POST /api/subscribe', () => {
	it('rejects an address that is not an email', async () => {
		const store = kv();
		const response = await onRequestPost({
			request: jsonRequest({ email: 'not-an-email' }),
			env: { BETA_SUBSCRIBERS: store },
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_email' });
		expect(store.put).not.toHaveBeenCalled();
	});

	it('rejects a missing address', async () => {
		const response = await onRequestPost({
			request: jsonRequest({}),
			env: { BETA_SUBSCRIBERS: kv() },
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ ok: false, error: 'invalid_email' });
	});

	it('reports not_configured when no KV namespace is bound', async () => {
		const response = await onRequestPost({
			request: jsonRequest({ email: 'builder@example.com' }),
			env: {},
		});

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_configured' });
	});

	it('stores a valid address under a lower-cased key', async () => {
		const store = kv();
		const response = await onRequestPost({
			request: jsonRequest({ email: '  Builder@Example.com  ' }),
			env: { BETA_SUBSCRIBERS: store },
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(store.put).toHaveBeenCalledTimes(1);
		const [key, value] = store.put.mock.calls[0]!;
		expect(key).toBe('email:builder@example.com');
		const stored = JSON.parse(value) as { email: string; subscribedAt: string };
		expect(stored.email).toBe('Builder@Example.com');
		expect(Number.isNaN(Date.parse(stored.subscribedAt))).toBe(false);
	});

	it('accepts a form post as well as JSON', async () => {
		const store = kv();
		const response = await onRequestPost({
			request: formRequest('builder@example.com'),
			env: { BETA_SUBSCRIBERS: store },
		});

		expect(response.status).toBe(200);
		expect(store.put).toHaveBeenCalledTimes(1);
	});
});
