import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Resend } from "resend";

// POST /api/subscribe
// Body: { email: string; firstName?: string }
// Adds the contact to the Resend audience list and returns { ok: true } or { ok: false, message }

const subscribeHandler = createServerFn({ method: "POST" })
	.inputValidator((body: unknown) => {
		if (typeof body !== "object" || body === null || !("email" in body)) {
			throw new Error("email is required");
		}
		const { email, firstName } = body as Record<string, string>;
		if (typeof email !== "string" || !email.includes("@")) {
			throw new Error("invalid email");
		}
		return { email: email.trim().toLowerCase(), firstName: firstName?.trim() ?? "" };
	})
	.handler(async ({ data }) => {
		const apiKey = process.env.RESEND_API_KEY;
		const audienceId = process.env.RESEND_AUDIENCE_ID;

		if (!apiKey || !audienceId) {
			throw new Error("RESEND_API_KEY and RESEND_AUDIENCE_ID must be set");
		}

		const resend = new Resend(apiKey);

		const result = await resend.contacts.create({
			audienceId,
			email: data.email,
			firstName: data.firstName || undefined,
			unsubscribed: false,
		});

		if (result.error) {
			// Resend returns a specific error code when the contact already exists
			if (result.error.name === "validation_error" && result.error.message?.toLowerCase().includes("already exists")) {
				// Treat as success — they're already subscribed
				return { ok: true, alreadySubscribed: true };
			}
			throw new Error(result.error.message ?? "Resend error");
		}

		return { ok: true, alreadySubscribed: false };
	});

export const Route = createFileRoute("/api/subscribe")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json() as unknown;
					const result = await subscribeHandler({ data: body });
					return Response.json(result, { status: 200 });
				} catch (err) {
					const message = err instanceof Error ? err.message : "Subscription failed";
					return Response.json({ ok: false, message }, { status: 400 });
				}
			},
		},
	},
});
