type Credentials = { client_email: string; private_key: string; project_id: string };

export type PushMessage = {
  order_id: string;
  leg: "delivery" | "pickup";
  kind: "assignment" | "reminder";
  token: string;
  expires_at: string;
};

export type DeliveryResult = {
  status: "sent" | "skipped" | "failed" | "retry" | "unregistered";
  code?: string;
  retryAfter?: number;
};

const oauthUrl = "https://oauth2.googleapis.com/token";
const encoder = new TextEncoder();
const requestTimeoutMs = 10_000;

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return base64url(encoder.encode(JSON.stringify(value)));
}

export function readFcmCredentials(value: string | undefined): Credentials {
  const credentials = JSON.parse(value ?? "null") as Partial<Credentials> | null;
  if (
    !credentials ||
    typeof credentials.client_email !== "string" || !credentials.client_email.includes("@") ||
    typeof credentials.private_key !== "string" ||
    !credentials.private_key.startsWith("-----BEGIN PRIVATE KEY-----") ||
    typeof credentials.project_id !== "string" || !/^[a-z0-9-]+$/.test(credentials.project_id)
  ) {
    throw new Error("invalid_fcm_credentials");
  }
  return credentials as Credentials;
}

export class FcmSender {
  private token: { value: string; expiresAt: number } | undefined;

  constructor(private readonly credentials: Credentials) {}

  async authorize(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      encodeJwtPart({ alg: "RS256", typ: "JWT" }),
      encodeJwtPart({
        iss: this.credentials.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: oauthUrl,
        iat: now,
        exp: now + 3600,
      }),
    ].join(".");
    const pem = this.credentials.private_key.replace(
      /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
      "",
    );
    const key = await crypto.subtle.importKey(
      "pkcs8",
      Uint8Array.from(atob(pem), (byte) => byte.charCodeAt(0)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
    const response = await fetch(oauthUrl, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) throw new Error("fcm_oauth_failed");
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token || !Number.isFinite(body.expires_in)) {
      throw new Error("invalid_fcm_oauth_response");
    }
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in! * 1000 };
    return this.token.value;
  }

  async send(accessToken: string, deliveryId: string, payload: PushMessage): Promise<DeliveryResult> {
    const expiration = Math.floor(Date.parse(payload.expires_at) / 1000);
    const ttl = expiration - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return { status: "skipped", code: "expired" };

    const delivery = payload.leg === "delivery";
    const reminder = payload.kind === "reminder";
    const notification = reminder
      ? {
        title: delivery ? "Promemoria consegna" : "Promemoria ritiro",
        body: "Hai un’attività in programma a breve.",
      }
      : {
        title: delivery ? "Nuova consegna" : "Nuovo ritiro",
        body: "Hai una nuova attività assegnata.",
      };

    let response: Response;
    try {
      response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.credentials.project_id}/messages:send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: payload.token,
              notification,
              data: { order_id: payload.order_id, type: `${payload.kind}_${payload.leg}` },
              android: {
                priority: "high",
                ttl: `${ttl}s`,
                notification: { channel_id: "order_updates", sound: "default", tag: deliveryId },
              },
              apns: {
                headers: { "apns-collapse-id": deliveryId, "apns-expiration": String(expiration) },
                payload: { aps: { sound: "default", badge: 1 } },
              },
            },
          }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );
    } catch {
      return { status: "retry", code: "network_error" };
    }

    if (response.ok) {
      await response.body?.cancel();
      return { status: "sent" };
    }

    const body = await response.json().catch(() => null) as {
      error?: { details?: { "@type"?: string; errorCode?: string }[] };
    } | null;
    const error = body?.error?.details?.find((detail) =>
      detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError"
    )?.errorCode;
    if (error === "UNREGISTERED") return { status: "unregistered", code: error };
    if (response.status === 401) this.token = undefined;
    const retry = response.status === 401 || response.status === 429 || response.status >= 500 ||
      error === "THIRD_PARTY_AUTH_ERROR";
    const retryHeader = response.headers.get("Retry-After");
    const retryAfter = retryHeader == null
      ? undefined
      : /^\d+$/.test(retryHeader)
      ? Number(retryHeader)
      : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000);
    return {
      status: retry ? "retry" : "failed",
      code: error ?? `HTTP_${response.status}`,
      retryAfter: retryAfter != null && Number.isSafeInteger(retryAfter)
        ? Math.max(60, Math.min(retryAfter, 3600))
        : undefined,
    };
  }
}
