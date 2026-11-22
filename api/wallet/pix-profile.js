import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getDb, HttpError, requireUser, sendJson } from "../_lib.js";

const PROFILE_COLLECTION = "walletPayoutProfiles";
const KEY_TYPES = new Set(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]);

function encryptionKey() {
  const key = Buffer.from(process.env.PIX_PROFILE_ENCRYPTION_KEY || "", "base64url");
  if (key.length !== 32) throw new HttpError(503, "No está disponible el almacenamiento seguro de los datos Pix.");
  return key;
}

function encryptProfile(uid, profile) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${PROFILE_COLLECTION}:${uid}`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(profile), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    updatedAt: new Date(),
  };
}

function decryptProfile(uid, record) {
  if (record.version !== 1) throw new Error("Unsupported Pix profile version");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(record.iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`${PROFILE_COLLECTION}:${uid}`));
  decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const profile = JSON.parse(plaintext);
  if (
    typeof profile.legalName !== "string" ||
    !KEY_TYPES.has(profile.pixKeyType) ||
    typeof profile.pixKey !== "string"
  ) throw new Error("Invalid Pix profile");
  return profile;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  if (!["GET", "PUT"].includes(req.method)) {
    res.setHeader("Allow", "GET, PUT");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  try {
    const user = await requireUser(req);
    const profileRef = getDb().collection(PROFILE_COLLECTION).doc(user.uid);

    if (req.method === "GET") {
      const snapshot = await profileRef.get();
      if (!snapshot.exists) return sendJson(res, 200, { profile: null });
      return sendJson(res, 200, { profile: decryptProfile(user.uid, snapshot.data()) });
    }

    const legalName = String(req.body?.legalName || "").trim().replace(/\s+/g, " ");
    const pixKey = String(req.body?.pixKey || "").trim();
    const pixKeyType = String(req.body?.pixKeyType || "").toUpperCase();
    if (legalName.length < 5 || legalName.length > 120 || !/\S+\s+\S+/.test(legalName)) {
      throw new HttpError(400, "Escribe tu nombre legal completo.");
    }
    if (!KEY_TYPES.has(pixKeyType)) throw new HttpError(400, "Selecciona el tipo de llave Pix.");
    if (pixKey.length < 3 || pixKey.length > 120 || /[\r\n]/.test(pixKey)) {
      throw new HttpError(400, "La llave Pix debe tener entre 3 y 120 caracteres.");
    }
    const profile = { legalName, pixKeyType, pixKey };
    await profileRef.set(encryptProfile(user.uid, profile));
    return sendJson(res, 200, { saved: true, profile });
  } catch (error) {
    if (error instanceof HttpError) return sendJson(res, error.status, { error: error.message });
    return sendJson(res, 500, { error: "No se pudieron guardar los datos Pix de forma segura." });
  }
}
