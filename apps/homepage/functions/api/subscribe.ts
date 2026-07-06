// Cloudflare Pages Function: POST /api/subscribe — "Get beta updates" sign-up.
//
// STUB: no storage backend is bound yet, so this returns 503 not_configured
// and the form shows a friendly "not live yet" message. To go live with the
// zero-dependency option, create a KV namespace and bind it in wrangler.jsonc:
//
//   "kv_namespaces": [{ "binding": "BETA_SUBSCRIBERS", "id": "<namespace-id>" }]
//
// Alternative backends (Buttondown, Formspree) are documented in
// docs/marketing/drafts/homepage-notes.md — backend choice is Dan's call.

interface KVNamespaceLike {
	put(key: string, value: string): Promise<void>;
}

interface Env {
	BETA_SUBSCRIBERS?: KVNamespaceLike;
}

interface PagesContext {
	request: Request;
	env: Env;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
	const contentType = request.headers.get("content-type") ?? "";
	let email = "";
	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => ({}))) as { email?: string };
		email = (body.email ?? "").trim();
	} else {
		const form = await request.formData().catch(() => null);
		email = String(form?.get("email") ?? "").trim();
	}

	if (!EMAIL_RE.test(email)) return json({ ok: false, error: "invalid_email" }, 400);
	if (!env.BETA_SUBSCRIBERS) return json({ ok: false, error: "not_configured" }, 503);

	await env.BETA_SUBSCRIBERS.put(
		`email:${email.toLowerCase()}`,
		JSON.stringify({ email, subscribedAt: new Date().toISOString() }),
	);
	return json({ ok: true }, 200);
}
