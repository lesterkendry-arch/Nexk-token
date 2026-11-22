import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID = "nexk-131a4";
const ASAAS_API = "https://api.asaas.com/v3";
const firebaseJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export function requiredEnvironment() {
  return [
    "ASAAS_API_KEY",
    "ASAAS_WEBHOOK_TOKEN",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "PIX_PROFILE_ENCRYPTION_KEY",
  ].filter((name) => !process.env[name]);
}

export function requirePixEnabled() {
  if (process.env.PIX_ENABLED !== "true") {
    throw new HttpError(503, "Pix aún no está habilitado: falta verificar la protección del registro de saldos.");
  }
}

function firebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new HttpError(503, "Wallet service is not configured.");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new HttpError(503, "Wallet service is not configured.");
  }
  if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) {
    throw new HttpError(503, "Wallet service is not configured.");
  }
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID,
    });
  return { db: getFirestore(app) };
}

export async function requireUser(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Inicia sesión para continuar.");
  try {
    const { payload } = await jwtVerify(match[1], firebaseJwks, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
    });
    if (!payload.sub || payload.sub.length > 128 || !payload.auth_time || payload.auth_time > Date.now() / 1000) {
      throw new Error("Invalid Firebase identity");
    }
    return { ...payload, uid: payload.sub };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "La sesión venció. Vuelve a iniciar sesión.");
  }
}

export function getDb() {
  return firebase().db;
}

export async function assertWebhookReady(db) {
  requirePixEnabled();
  const config = await db.collection("walletSettings").doc("asaasWebhook").get();
  if (!config.exists || config.data().status !== "active" || config.data().keyFingerprint !== asaasKeyFingerprint()) {
    throw new HttpError(503, "La confirmación segura de Asaas aún no está disponible.");
  }
}

export function asaasKeyFingerprint() {
  return createHash("sha256").update(process.env.ASAAS_API_KEY || "").digest("hex");
}

export function makeIdempotencyKey(value) {
  const supplied = String(value || "");
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(supplied)) {
    throw new HttpError(400, "Falta una referencia segura de la operación.");
  }
  return supplied;
}

export function parseMoneyCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new HttpError(400, "El monto no es válido.");
  }
  const cents = Math.round(amount * 100);
  if (cents <= 0 || Math.abs(amount * 100 - cents) > 0.00001) {
    throw new HttpError(400, "El monto debe tener como máximo dos decimales.");
  }
  return cents;
}

export function centsToReais(cents) {
  return Number((cents / 100).toFixed(2));
}

export async function asaas(path, { method = "GET", body, idempotencyKey } = {}) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new HttpError(503, "Pix está temporalmente indisponible.");
  const response = await fetch(`${ASAAS_API}${path}`, {
    signal: AbortSignal.timeout(15000),
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "NEX-Token-Wallet/1.0",
      access_token: apiKey,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const codes = Array.isArray(payload.errors)
      ? payload.errors.map((item) => item?.code).filter((code) => typeof code === "string")
      : [];
    let issue = "request_rejected";
    if (codes.includes("invalid_environment")) issue = "wrong_environment";
    else if (codes.includes("invalid_access_token_format")) issue = "key_format";
    else if (response.status === 401 || codes.includes("invalid_access_token") || codes.includes("access_token_not_found")) issue = "invalid_key";
    else if (response.status === 403) issue = "permission_denied";
    else if (response.status >= 500 || response.status === 429) issue = "unavailable";
    const safeMessages = {
      wrong_environment: "La clave de Asaas no corresponde a producción. Revisa ASAAS_API_KEY en Vercel; no cambies la clave de Firebase.",
      key_format: "El formato de ASAAS_API_KEY no es válido. Comprueba que se guardó completa, sin comillas ni espacios adicionales, en Vercel.",
      invalid_key: "Asaas rechazó la clave de acceso. Revisa la clave de producción ASAAS_API_KEY en Vercel; puede ser incorrecta, estar vencida o revocada.",
      permission_denied: "Asaas no permite esta solicitud. Revisa los permisos y las restricciones de IP de la clave de producción.",
      unavailable: "Asaas no está disponible temporalmente. Consulta el historial antes de repetir una operación.",
      request_rejected: "Asaas rechazó los datos de la solicitud. No se confirmó la operación.",
    };
    const error = new HttpError(
      response.status >= 500 ? 502 : 400,
      safeMessages[issue],
    );
    error.providerIssue = issue;
    error.providerHttpStatus = response.status;
    error.definitiveProviderRejection = [400, 401, 403, 404, 422].includes(response.status);
    throw error;
  }
  return payload;
}

let asaasHealthCache = null;
export async function getAsaasHealth() {
  if (!process.env.ASAAS_API_KEY) return { ready: false, issue: "missing_key" };
  const fingerprint = asaasKeyFingerprint();
  const now = Date.now();
  if (!asaasHealthCache || asaasHealthCache.fingerprint !== fingerprint || asaasHealthCache.expiresAt <= now) {
    // Cache successes and failures and share concurrent probes. Never retain
    // provider response data, credentials, account details or webhook URLs.
    asaasHealthCache = {
      fingerprint,
      expiresAt: now + 60000,
      promise: (async () => {
        try {
          await asaas("/webhooks?limit=1");
          return { ready: true, issue: null };
        } catch (error) {
          return { ready: false, issue: error.providerIssue || "unavailable" };
        }
      })(),
    };
  }
  return asaasHealthCache.promise;
}

export async function verifyAsaasWebhook(req) {
  const supplied = String(req.headers["asaas-access-token"] || "");
  const expected = String(process.env.ASAAS_WEBHOOK_TOKEN || "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newOperationId() {
  return randomUUID();
}

export function dateInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
