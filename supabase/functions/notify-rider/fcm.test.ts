import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { FcmSender, type PushMessage, readFcmCredentials } from "./fcm.ts";

const message: PushMessage = {
  order_id: "pilot-order",
  leg: "pickup",
  kind: "reminder",
  token: "test-device-token",
  expires_at: new Date(Date.now() + 600_000).toISOString(),
};

Deno.test("signs a Firebase OAuth assertion and reuses the access token", async () => {
  const key = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const keyData = new Uint8Array(await crypto.subtle.exportKey("pkcs8", key.privateKey));
  const credentials = readFcmCredentials(JSON.stringify({
    client_email: "fcm@echo.invalid",
    project_id: "echo-test",
    private_key: `-----BEGIN PRIVATE KEY-----\n${
      btoa(String.fromCharCode(...keyData))
    }\n-----END PRIVATE KEY-----`,
  }));
  const original = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = (input, options) => {
      requests++;
      assert.equal(input, "https://oauth2.googleapis.com/token");
      assert.ok(options?.body instanceof URLSearchParams);
      const [, payload, signature] = options.body.get("assertion")!.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
      assert.equal(claims.iss, credentials.client_email);
      assert.equal(claims.scope, "https://www.googleapis.com/auth/firebase.messaging");
      assert.ok(signature);
      return Promise.resolve(Response.json({ access_token: "test-access-token", expires_in: 3600 }));
    };
    const sender = new FcmSender(credentials);
    assert.equal(await sender.authorize(), "test-access-token");
    assert.equal(await sender.authorize(), "test-access-token");
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("sends a non-sensitive reminder and handles retry and device invalidation", async () => {
  const sender = new FcmSender({ client_email: "", private_key: "", project_id: "echo-test" });
  const original = globalThis.fetch;
  let response = Response.json({ name: "demo-message" });
  try {
    globalThis.fetch = (input, options) => {
      assert.equal(input, "https://fcm.googleapis.com/v1/projects/echo-test/messages:send");
      const { message: sent } = JSON.parse(options?.body as string);
      assert.equal(sent.token, message.token);
      assert.deepEqual(sent.data, { order_id: "pilot-order", type: "reminder_pickup" });
      assert.equal(sent.android.notification.channel_id, "order_updates");
      assert.equal(sent.apns.headers["apns-collapse-id"], "test-delivery");
      assert.equal(sent.notification.title, "Promemoria ritiro");
      return Promise.resolve(response);
    };
    assert.deepEqual(await sender.send("access-token", "test-delivery", message), { status: "sent" });

    response = new Response(null, { status: 429, headers: { "Retry-After": "90" } });
    assert.deepEqual(await sender.send("access-token", "test-delivery", message), {
      status: "retry",
      code: "HTTP_429",
      retryAfter: 90,
    });
    response = Response.json({
      error: {
        details: [{
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode: "UNREGISTERED",
        }],
      },
    }, { status: 404 });
    assert.deepEqual(await sender.send("access-token", "test-delivery", message), {
      status: "unregistered",
      code: "UNREGISTERED",
    });
  } finally {
    globalThis.fetch = original;
  }
});
