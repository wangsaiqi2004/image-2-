import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { defineConfig, type PluginOption, type ViteDevServer } from "vite";

type ImageProtocol =
  | "custom-openai"
  | "openai-images"
  | "openai-responses"
  | "gemini-native"
  | "gemini-openai"
  | "google-imagen"
  | "stability-core";

type ProxyBody = Record<string, unknown>;

type ReferenceImage = {
  dataUrl: string;
  name: string;
  type: string;
};

type ReferenceUrlPayload = {
  field: "image_urls" | "reference_image_urls";
  urls: string[];
  mode: string;
  cleanup?: () => void;
};

type GenerateRequest = {
  protocol?: ImageProtocol;
  model?: string;
  prompt?: string;
  size?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  outputFormat?: string;
  seed?: string;
  negativePrompt?: string;
  referenceImages?: ReferenceImage[];
};

type GenerateBody = {
  baseUrl?: string;
  apiKey?: string;
  clientId?: string;
  request?: GenerateRequest & {
    batchId?: string;
    index?: number;
    total?: number;
  };
};

type ImageResult = {
  ok: true;
  status?: number;
  images: Array<{ dataUrl: string; revisedPrompt?: string }>;
  raw?: unknown;
} | {
  ok: false;
  status?: number;
  detail?: unknown;
};

type AdminUser = {
  username: string;
  passwordHash: string;
  salt: string;
  mustChangePassword: boolean;
  createdAt: number;
  updatedAt: number;
};

type RequestLogStatus = "running" | "success" | "error";
type RequestLogType = "image_generation" | "prompt_analysis";

type RequestLog = {
  requestId: string;
  requestType: RequestLogType;
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  clientId: string;
  clientUserAgent: string;
  clientIpHash: string;
  protocol: ImageProtocol;
  apiBaseUrl: string;
  apiKeyPresent?: boolean;
  apiKeyLength?: number;
  apiKeyPrefix?: string;
  apiKeySuffix?: string;
  endpoint: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  size?: string;
  resolution?: string;
  quality?: string;
  outputFormat?: string;
  seed?: string;
  agentId?: string;
  agentName?: string;
  agentScenario?: string;
  promptVariant?: string;
  referenceCount: number;
  referenceTotalBytes?: number;
  referenceUploadStatus?: "none" | "received" | "forwarded" | "succeeded" | "failed";
  upstreamPayloadKeys?: string[];
  upstreamReferenceCount?: number;
  upstreamReferenceMode?: string;
  upstreamSize?: string;
  requestParams?: unknown;
  upstreamRequest?: unknown;
  responseBody?: unknown;
  status: RequestLogStatus;
  httpStatus?: number;
  errorMessage?: string;
  errorType?: string;
  errorCode?: string;
  errorRaw?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  imageSaved: false;
};

type AdminAuditLog = {
  id: string;
  action: string;
  username: string;
  createdAt: number;
  detail?: string;
};

type AdminStore = {
  admins: AdminUser[];
  requestLogs: RequestLog[];
  auditLogs: AdminAuditLog[];
};

const API_TIMEOUT_MS = 300_000;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
const DEFAULT_PROTOCOL: ImageProtocol = "custom-openai";
const ALLOWED_API_BASE_URLS = ["https://www.taijiai.online/", "https://bobdong.cn/"];
const SESSION_COOKIE = "image_studio_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DATA_DIR = join(process.cwd(), ".data");
const ADMIN_STORE_PATH = join(DATA_DIR, "admin-store.json");
const FRONTEND_VERSION_PATHS = ["src", "index.html", "package.json", "vite.config.ts"];
const REFERENCE_TEMP_TTL_MS = 1000 * 60 * 10;
const PUBLIC_REFERENCE_BASE_URL = "https://imagehub.taijiai.online";

const temporaryReferences = new Map<string, {
  bytes: Buffer;
  mime: string;
  name: string;
  expiresAt: number;
}>();

function formatFrontendVersion(value: number) {
  const date = new Date(value);
  const pad = (item: number, length = 2) => String(item).padStart(length, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join("");
}

function latestModifiedAt(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path)
    .filter((item) => !item.startsWith("."))
    .reduce((latest, item) => Math.max(latest, latestModifiedAt(join(path, item))), stat.mtimeMs);
}

function createFrontendBuildVersion() {
  if (process.env.FRONTEND_BUILD_VERSION) return process.env.FRONTEND_BUILD_VERSION;
  const latest = FRONTEND_VERSION_PATHS.reduce(
    (maxTime, path) => Math.max(maxTime, latestModifiedAt(join(process.cwd(), path))),
    0,
  );
  return formatFrontendVersion(latest || Date.now());
}

const FRONTEND_BUILD_VERSION = createFrontendBuildVersion();
const FRONTEND_BUILD_INFO = {
  version: FRONTEND_BUILD_VERSION,
  builtAt: new Date().toISOString(),
};

const adminSessions = new Map<string, { username: string; expiresAt: number }>();

const DEFAULT_MODELS: Record<ImageProtocol, string[]> = {
  "custom-openai": ["gpt-image-2", "gpt-5.4-image-2"],
  "openai-images": ["gpt-image-2", "gpt-5.4-image-2"],
  "openai-responses": ["gpt-4.1", "gpt-4.1-mini"],
  "gemini-native": ["gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"],
  "gemini-openai": ["gemini-2.5-flash-image"],
  "google-imagen": ["imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "imagen-3.0-generate-002"],
  "stability-core": ["stable-image-core", "stable-image-ultra"],
};

const PROTOCOLS = Object.keys(DEFAULT_MODELS) as ImageProtocol[];

function readJsonBody(req: IncomingMessage): Promise<ProxyBody> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_REQUEST_BYTES) {
        reject(new Error("请求体过大，请减少参考图数量或压缩图片"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash: derived };
}

function verifyPassword(password: string, user: AdminUser) {
  const derived = scryptSync(password, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === derived.length && timingSafeEqual(stored, derived);
}

function emptyStore(): AdminStore {
  return {
    admins: [],
    requestLogs: [],
    auditLogs: [],
  };
}

function ensureAdminStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(ADMIN_STORE_PATH)) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || "admin123456";
    const { salt, passwordHash } = hashPassword(initialPassword);
    const now = Date.now();
    const store: AdminStore = {
      admins: [{
        username,
        salt,
        passwordHash,
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      }],
      requestLogs: [],
      auditLogs: [{
        id: randomUUID(),
        action: "admin_initialized",
        username,
        createdAt: now,
        detail: "Default administrator created. Password reset required on first login.",
      }],
    };
    writeFileSync(ADMIN_STORE_PATH, JSON.stringify(store, null, 2));
  }
}

function readAdminStore(): AdminStore {
  ensureAdminStore();
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(ADMIN_STORE_PATH, "utf8")) };
  } catch {
    return emptyStore();
  }
}

function writeAdminStore(store: AdminStore) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ADMIN_STORE_PATH, JSON.stringify(store, null, 2));
}

function appendAuditLog(username: string, action: string, detail?: string) {
  const store = readAdminStore();
  store.auditLogs.unshift({
    id: randomUUID(),
    username,
    action,
    detail,
    createdAt: Date.now(),
  });
  store.auditLogs = store.auditLogs.slice(0, 500);
  writeAdminStore(store);
}

function createSession(username: string) {
  const token = randomBytes(32).toString("hex");
  adminSessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function cookieValue(req: IncomingMessage, name: string) {
  const cookies = req.headers.cookie || "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function getAdminSession(req: IncomingMessage) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, ...session };
}

function setSessionCookie(res: ServerResponse, token: string) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.round(SESSION_TTL_MS / 1000)}`);
}

function clearSessionCookie(res: ServerResponse) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function hashClientIp(req: IncomingMessage) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "");
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function truncateText(value: unknown, max = 2000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.slice(0, max);
}

function apiKeyLogMeta(apiKey: string) {
  const trimmed = apiKey.trim();
  return {
    apiKeyPresent: trimmed.length > 0,
    apiKeyLength: trimmed.length,
    apiKeyPrefix: trimmed ? trimmed.slice(0, 6) : undefined,
    apiKeySuffix: trimmed.length > 4 ? trimmed.slice(-4) : undefined,
  };
}

function redactImageText(value: string, max = 4000) {
  return truncateText(value, max)
    .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, "[image-data-redacted]")
    .replace(/"b64_json"\s*:\s*"[^"]+"/g, "\"b64_json\":\"[image-data-redacted]\"")
    .replace(/"dataUrl"\s*:\s*"[^"]+"/g, "\"dataUrl\":\"[image-data-redacted]\"")
    .replace(/"thumbnailDataUrl"\s*:\s*"[^"]+"/g, "\"thumbnailDataUrl\":\"[image-data-redacted]\"")
    .replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{180,}"/g, "\"data\":\"[large-data-redacted]\"");
}

function looksLikeLargeBase64(value: string) {
  return value.length > 180 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function imageOmittedPlaceholder(value: string, fallbackMime?: string) {
  const match = value.match(/^data:([^;]+);base64,(.*)$/);
  const mime = match?.[1] || fallbackMime || "application/octet-stream";
  const base64Body = match?.[2] ?? value;
  const cleaned = base64Body.replace(/\s+/g, "");
  const bytes = Math.round((cleaned.length * 3) / 4);
  let sha256 = "";
  try {
    sha256 = createHash("sha256").update(cleaned).digest("hex").slice(0, 8);
  } catch {
    sha256 = "";
  }
  return {
    __omitted: "image" as const,
    mime,
    bytes,
    sha256,
  };
}

function referenceImagesForLog(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    const image = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const dataUrl = typeof image.dataUrl === "string" ? image.dataUrl : "";
    return {
      index,
      name: typeof image.name === "string" ? truncateText(image.name, 240) : undefined,
      type: typeof image.type === "string" ? image.type : undefined,
      hasImageContent: Boolean(dataUrl),
      imageContentBytes: dataUrl.length,
      dataUrl: dataUrl ? imageOmittedPlaceholder(dataUrl, typeof image.type === "string" ? image.type : undefined) : undefined,
    };
  });
}

function sanitizeForLog(value: unknown, key = "", depth = 0): unknown {
  const lowerKey = key.toLowerCase();
  if (depth > 8) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (lowerKey === "apikey" || lowerKey === "api_key" || lowerKey === "authorization" || lowerKey === "password" || lowerKey === "token") {
    return "[redacted]";
  }
  if (lowerKey === "referenceimages") {
    return referenceImagesForLog(value);
  }
  if (typeof value === "string") {
    if (
      value.startsWith("data:image/")
      || lowerKey === "dataurl"
      || lowerKey === "thumbnaildataurl"
      || lowerKey === "b64_json"
      || (lowerKey === "data" && looksLikeLargeBase64(value))
    ) {
      return imageOmittedPlaceholder(value);
    }
    return redactImageText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeForLog(item, key, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeForLog(entryValue, entryKey, depth + 1),
      ]),
    );
  }
  return String(value);
}

function normalizeAllowedApiBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  const match = ALLOWED_API_BASE_URLS.find((allowed) => allowed.replace(/\/+$/, "") === normalized);
  if (!match) {
    throw new Error("API URL 不在允许列表中");
  }
  return match;
}

function isAllowedApiBaseUrlError(error: unknown) {
  return error instanceof Error && error.message === "API URL 不在允许列表中";
}

function httpStatusFromDetail(detail: unknown) {
  if (!detail || typeof detail !== "object") return undefined;
  const record = detail as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  const error = record.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).status === "number") {
    return (error as Record<string, unknown>).status as number;
  }
  return undefined;
}

function safeErrorSummary(detail: unknown) {
  const record = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
  return {
    message: truncateText(
      typeof record.error === "string"
        ? record.error
        : typeof error.message === "string"
          ? error.message
          : typeof detail === "string"
            ? detail
            : "请求失败",
      800,
    ),
    type: typeof error.type === "string" ? error.type : undefined,
    code: typeof error.code === "string" ? error.code : undefined,
    raw: redactImageText(typeof detail === "string" ? detail : JSON.stringify(sanitizeForLog(detail)), 2500),
  };
}

function createRequestLog(log: RequestLog) {
  const store = readAdminStore();
  store.requestLogs.unshift(log);
  store.requestLogs = store.requestLogs.slice(0, 5000);
  writeAdminStore(store);
}

function updateRequestLog(requestId: string, patch: Partial<RequestLog>) {
  const store = readAdminStore();
  store.requestLogs = store.requestLogs.map((record) =>
    record.requestId === requestId ? { ...record, ...patch } : record,
  );
  writeAdminStore(store);
}

function generationEndpointLabel(protocol: ImageProtocol, model = "", referenceCount = 0) {
  if (protocol === "openai-responses") return "/v1/responses";
  if (protocol === "gemini-native") return `/models/${modelName(model)}:generateContent`;
  if (protocol === "google-imagen") return `/models/${modelName(model)}:predict`;
  if (protocol === "stability-core") {
    return String(model).includes("ultra")
      ? "/v2beta/stable-image/generate/ultra"
      : "/v2beta/stable-image/generate/core";
  }
  if (protocol === "openai-images" && referenceCount > 0) return "/v1/images/edits → /v1/images/generations";
  if (protocol === "custom-openai" && referenceCount > 0) return "/v1/images/generations";
  return protocol === "gemini-openai" ? "/images/generations" : "/v1/images/generations";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求超过 ${Math.round(timeoutMs / 1000)} 秒，已自动超时`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getString(body: ProxyBody, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function getProtocol(value: unknown): ImageProtocol {
  return typeof value === "string" && PROTOCOLS.includes(value as ImageProtocol)
    ? (value as ImageProtocol)
    : DEFAULT_PROTOCOL;
}

function endpoint(baseUrl: string, path: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  if (!cleanBase) {
    throw new Error("API URL 不能为空");
  }
  const cleanPath = cleanBase.endsWith("/v1") && path.startsWith("/v1/")
    ? path.slice(3)
    : path;
  return `${cleanBase}${cleanPath}`;
}

function publicBaseUrlFromRequest(_req: IncomingMessage) {
  return PUBLIC_REFERENCE_BASE_URL;
}

function isPublicReferenceBaseUrl(value = "") {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return Boolean(url.protocol.startsWith("http"))
      && host !== "localhost"
      && host !== "127.0.0.1"
      && host !== "::1"
      && !host.endsWith(".local");
  } catch {
    return false;
  }
}

function modelName(value = "") {
  return value.replace(/^models\//, "");
}

function parseMaybeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detailFromUpstream(status: number, bodyText: string) {
  const parsed = parseMaybeJson(bodyText);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const error = (parsed as { error?: unknown }).error;
    return { status, error, raw: parsed };
  }
  return { status, error: parsed || `HTTP ${status}`, raw: parsed };
}

function outputMime(outputFormat = "png") {
  const mimeByFormat: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    webp: "image/webp",
  };
  return mimeByFormat[outputFormat] || "image/png";
}

function fullPrompt(request: GenerateRequest) {
  return request.negativePrompt
    ? `${request.prompt}\n\nNegative prompt: ${request.negativePrompt}`
    : request.prompt || "";
}

function dataUrlToReferenceImageUrl(image: ReferenceImage) {
  if (image.dataUrl.startsWith("data:")) return image.dataUrl;
  const mime = image.type || "image/png";
  return `data:${mime};base64,${image.dataUrl}`;
}

function referenceImageToBuffer(image: ReferenceImage) {
  const dataUrl = dataUrlToReferenceImageUrl(image);
  const [, mime = image.type || "image/png", data = image.dataUrl] =
    dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
  return {
    mime,
    data: Buffer.from(data, "base64"),
  };
}

function uploadedReferenceUrlFrom(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.startsWith("http") ? value : "";
  if (Array.isArray(value)) {
    return value.map(uploadedReferenceUrlFrom).find(Boolean) || "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const directKeys = ["url", "imageUrl", "image_url", "fileUrl", "file_url", "downloadUrl", "download_url"];
  for (const key of directKeys) {
    const url = uploadedReferenceUrlFrom(record[key]);
    if (url) return url;
  }
  return uploadedReferenceUrlFrom(record.data)
    || uploadedReferenceUrlFrom(record.result)
    || uploadedReferenceUrlFrom(record.file)
    || uploadedReferenceUrlFrom(record.files)
    || uploadedReferenceUrlFrom(record.images);
}

async function uploadCompatibleReferenceImage(baseUrl: string, apiKey: string, image: ReferenceImage, index: number) {
  const { mime, data } = referenceImageToBuffer(image);
  const fileName = image.name || `reference-${index + 1}.${mime.split("/")[1] || "png"}`;
  const form = new FormData();
  form.append("file", new Blob([data], { type: mime }), fileName);

  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/uploads/images"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  }, 60_000);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`参考图上传失败：HTTP ${response.status}`);
  }

  const url = uploadedReferenceUrlFrom(parseMaybeJson(bodyText));
  if (!url) {
    throw new Error("参考图上传成功，但响应中没有可用 URL");
  }
  return url;
}

function cleanupExpiredTemporaryReferences() {
  const now = Date.now();
  for (const [id, record] of temporaryReferences.entries()) {
    if (record.expiresAt <= now) temporaryReferences.delete(id);
  }
}

function scheduleTemporaryReferenceCleanup(id: string) {
  const timer = setTimeout(() => temporaryReferences.delete(id), REFERENCE_TEMP_TTL_MS + 1000);
  const maybeTimer = timer as unknown as { unref?: () => void };
  if (typeof maybeTimer.unref === "function") maybeTimer.unref();
}

function createTemporaryReferenceUrls(references: ReferenceImage[], publicBaseUrl: string) {
  cleanupExpiredTemporaryReferences();
  const ids: string[] = [];
  const urls = references.map((image, index) => {
    const { mime, data } = referenceImageToBuffer(image);
    const id = randomUUID();
    ids.push(id);
    temporaryReferences.set(id, {
      bytes: data,
      mime,
      name: image.name || `reference-${index + 1}.${mime.split("/")[1] || "png"}`,
      expiresAt: Date.now() + REFERENCE_TEMP_TTL_MS,
    });
    scheduleTemporaryReferenceCleanup(id);
    return `${publicBaseUrl}/api/reference-images/${encodeURIComponent(id)}`;
  });
  return {
    urls,
    cleanup: () => ids.forEach((id) => temporaryReferences.delete(id)),
  };
}

function compatibleReferenceImagePayloads(references: ReferenceImage[], publicBaseUrl = ""): ReferenceUrlPayload[] {
  if (references.length === 0) return [];

  const dataUriUrls = references.map(dataUrlToReferenceImageUrl);
  const payloads: ReferenceUrlPayload[] = [];

  if (isPublicReferenceBaseUrl(publicBaseUrl)) {
    const temp = createTemporaryReferenceUrls(references, publicBaseUrl);
    payloads.push({
      field: "image_urls",
      urls: temp.urls,
      mode: "image_urls:temporary_url",
      cleanup: temp.cleanup,
    });
  }

  payloads.push({
    field: "image_urls",
    urls: dataUriUrls,
    mode: "image_urls:data_uri",
  });

  if (isPublicReferenceBaseUrl(publicBaseUrl)) {
    const temp = createTemporaryReferenceUrls(references, publicBaseUrl);
    payloads.push({
      field: "reference_image_urls",
      urls: temp.urls,
      mode: "reference_image_urls:temporary_url",
      cleanup: temp.cleanup,
    });
  }

  payloads.push({
    field: "reference_image_urls",
    urls: dataUriUrls,
    mode: "reference_image_urls:data_uri",
  });

  return payloads;
}

function shouldTryNextReferencePayload(result: ImageResult) {
  if (result.ok) return false;
  const status = result.status || 0;
  if ([400, 401, 403, 404, 405, 413, 415, 422, 429, 500, 502, 503].includes(status)) return true;
  const detailText = JSON.stringify(result.detail || {}).toLowerCase();
  return /image_urls|reference_image_urls|reference|image|url|data uri|base64|payload|too large|unsupported|unknown|invalid/.test(detailText);
}

function shouldFallbackToGeneration(result: ImageResult) {
  if (result.ok) return false;
  const status = result.status || 0;
  if (![400, 404, 405, 415, 422, 501].includes(status)) return false;
  const detailText = JSON.stringify(result.detail || {}).toLowerCase();
  return /invalid url|not found|method not allowed|unsupported|unknown endpoint|no route|content-type/.test(detailText);
}

function shouldFallbackReferenceEditToGeneration(result: ImageResult) {
  if (result.ok) return false;
  const status = result.status || 0;
  if (status === 401 || status === 403) return true;
  return shouldFallbackToGeneration(result);
}

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "5:4": "1280x1024",
  "3:4": "1024x1365",
  "4:3": "1365x1024",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
  "9:16": "1024x1792",
  "16:9": "1792x1024",
  "21:9": "1792x768",
  "9:21": "768x1792",
};

const RESOLUTION_MULTIPLIER: Record<string, number> = {
  "1K": 1,
  "2K": 2,
  "4K": 4,
};

function normalizeResolution(value?: string) {
  return value === "2K" || value === "4K" ? value : "1K";
}

function scaleSize(size: string, resolution = "1K") {
  const multiplier = RESOLUTION_MULTIPLIER[normalizeResolution(resolution)] || 1;
  if (multiplier === 1) return size;
  const [width, height] = size.split("x").map((item) => Number(item));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return size;
  return `${Math.round(width * multiplier)}x${Math.round(height * multiplier)}`;
}

function imageSizeForProtocol(request: GenerateRequest, protocol: ImageProtocol) {
  if (protocol === "custom-openai" && isImage2Model(request.model) && request.aspectRatio) return request.aspectRatio;
  return request.aspectRatio
    ? scaleSize(SIZE_BY_RATIO[request.aspectRatio] || SIZE_BY_RATIO["1:1"], request.resolution)
    : request.size || "auto";
}

function isImage2Model(model = "") {
  const normalized = model.toLowerCase();
  return normalized === "gpt-image-2" || normalized === "gpt-5.4-image-2" || normalized.includes("image-2");
}

function imageGenerationSize(request: GenerateRequest) {
  if (isImage2Model(request.model) && request.aspectRatio) return request.aspectRatio;
  return request.size || request.aspectRatio || "auto";
}

function dataUrlToGeminiPart(image: ReferenceImage) {
  const [meta, data = ""] = image.dataUrl.split(",");
  const mimeType = image.type || meta.match(/^data:(.*?);base64$/)?.[1] || "image/png";
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

function dataUrlFromBase64(base64: string, mime: string) {
  if (base64.startsWith("data:")) return base64;
  return `data:${mime};base64,${base64}`;
}

async function urlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`读取图片 URL 失败：HTTP ${response.status} ${text.slice(0, 400)}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
  return `data:${contentType};base64,${bytes}`;
}

function extractModelIds(payload: unknown, key: "data" | "models" = "data") {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { id?: string; name?: string; displayName?: string };
      return modelName(record.id || record.name || record.displayName || "");
    })
    .filter(Boolean);
}

function collectImageData(node: unknown, found: string[] = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    node.forEach((item) => collectImageData(item, found));
    return found;
  }

  const record = node as Record<string, unknown>;
  const keys = ["b64_json", "result", "bytesBase64Encoded", "data"];
  keys.forEach((key) => {
    const value = record[key];
    if (typeof value === "string" && value.length > 100) {
      found.push(value);
    }
  });

  const inlineData = record.inlineData || record.inline_data;
  if (inlineData && typeof inlineData === "object") {
    const data = (inlineData as Record<string, unknown>).data;
    if (typeof data === "string") found.push(data);
  }

  Object.values(record).forEach((value) => collectImageData(value, found));
  return found;
}

function collectText(node: unknown, found: string[] = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    node.forEach((item) => collectText(item, found));
    return found;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.text === "string") found.push(record.text);
  Object.values(record).forEach((value) => collectText(value, found));
  return found;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced?.startsWith("{")) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function normalizeRiskLevel(value: unknown) {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeAnalysisPayload(value: unknown, analysisModel: string) {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const risks = Array.isArray(record.risks)
    ? record.risks
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((risk) => ({
        level: normalizeRiskLevel(risk.level),
        title: typeof risk.title === "string" ? risk.title : "生成风险",
        description: typeof risk.description === "string" ? risk.description : "",
        fix: typeof risk.fix === "string" ? risk.fix : undefined,
      }))
    : [];
  const riskLevel = normalizeRiskLevel(record.riskLevel || (risks.some((risk) => risk.level === "high") ? "high" : risks.some((risk) => risk.level === "medium") ? "medium" : "low"));
  const suggestedParams = record.suggestedParams && typeof record.suggestedParams === "object"
    ? record.suggestedParams as Record<string, unknown>
    : {};
  const styleStrength = suggestedParams.styleStrength;
  const referenceWeight = suggestedParams.referenceWeight;
  const styleEnhancements = Array.isArray(record.styleEnhancements)
    ? record.styleEnhancements
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        name: typeof item.name === "string" ? item.name : "",
        description: typeof item.description === "string" ? item.description : "",
        promptFragment: typeof item.promptFragment === "string" ? item.promptFragment : "",
      }))
      .filter((item) => item.name && item.promptFragment)
    : [];
  return {
    safe: typeof record.safe === "boolean" ? record.safe : riskLevel !== "high",
    score: typeof record.score === "number" ? Math.max(0, Math.min(100, record.score)) : riskLevel === "low" ? 92 : riskLevel === "medium" ? 74 : 48,
    riskLevel,
    summary: typeof record.summary === "string" ? record.summary : "已完成发送前分析。",
    optimizedPrompt: typeof record.optimizedPrompt === "string" ? record.optimizedPrompt : "",
    suggestedNegativePrompt: typeof record.suggestedNegativePrompt === "string" ? record.suggestedNegativePrompt : "",
    suggestedParams: {
      aspectRatio: typeof suggestedParams.aspectRatio === "string" ? suggestedParams.aspectRatio : undefined,
      size: typeof suggestedParams.size === "string" ? suggestedParams.size : undefined,
      resolution: typeof suggestedParams.resolution === "string" ? suggestedParams.resolution : undefined,
      count: typeof suggestedParams.count === "number" ? suggestedParams.count : undefined,
      quality: typeof suggestedParams.quality === "string" ? suggestedParams.quality : undefined,
      styleStrength: styleStrength === "low" || styleStrength === "medium" || styleStrength === "high"
        ? styleStrength
        : undefined,
      referenceWeight: referenceWeight === "low" || referenceWeight === "medium" || referenceWeight === "high"
        ? referenceWeight
        : undefined,
    },
    risks,
    styleEnhancements,
    analysisModel,
    source: "ai",
  };
}

async function analyzePromptWithGpt(baseUrl: string, apiKey: string, body: ProxyBody, requestId?: string) {
  const analysisModel = getString(body, "analysisModel");
  const prompt = getString(body, "prompt");
  if (!analysisModel) throw new Error("分析模型不能为空");
  if (!prompt) throw new Error("提示词不能为空");
  if (!apiKey) throw new Error("API Key 不能为空");

  const context = {
    prompt,
    negativePrompt: getString(body, "negativePrompt"),
    protocol: getString(body, "protocol"),
    imageModel: getString(body, "imageModel"),
    aspectRatio: getString(body, "aspectRatio"),
    size: getString(body, "size"),
    resolution: getString(body, "resolution"),
    quality: getString(body, "quality"),
    outputFormat: getString(body, "outputFormat"),
    count: getNumber(body.count),
    concurrency: getNumber(body.concurrency),
    referenceCount: getNumber(body.referenceCount) || 0,
    referenceIssues: Array.isArray(body.referenceIssues) ? body.referenceIssues : [],
    mode: getString(body, "mode") || "send",
  };
  const systemPrompt = [
    "你是一个专业的 GPT 生图发送前分析器。",
    "你的任务是判断提示词是否适合进入生图流程，并给出提示词优化、参数推荐、失败预判和风格增强。",
    "只返回 JSON，不要使用 Markdown。",
    "JSON 字段必须包含 safe, score, riskLevel, summary, optimizedPrompt, suggestedNegativePrompt, suggestedParams, risks, styleEnhancements。",
    "riskLevel 只能是 low、medium、high。safe=false 仅用于高风险或大概率失败场景。",
    "suggestedParams 可包含 aspectRatio, size, resolution, count, quality, styleStrength, referenceWeight。",
    "risks 每项包含 level, title, description, fix。styleEnhancements 每项包含 name, description, promptFragment。",
    "优化提示词时要保留用户原意，不要替换主体，不要加入未授权的具体人物身份。",
  ].join("\n");

  const upstreamPayload = {
    model: analysisModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(context, null, 2) },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  if (requestId) {
    updateRequestLog(requestId, {
      upstreamPayloadKeys: Object.keys(upstreamPayload),
      upstreamRequest: sanitizeForLog(upstreamPayload),
    });
  }

  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(upstreamPayload),
  }, 20_000);
  const text = await response.text();
  if (!response.ok) {
    const detail = detailFromUpstream(response.status, text);
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({ ok: false, status: response.status, detail }),
      });
    }
    throw detail;
  }
  const payload = parseMaybeJson(text);
  const choices = payload && typeof payload === "object" && Array.isArray((payload as { choices?: unknown }).choices)
    ? (payload as { choices: Array<Record<string, unknown>> }).choices
    : [];
  const message = choices[0]?.message;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : "";
  const rawContent = typeof content === "string" ? content : JSON.stringify(content || {});
  const analysis = parseMaybeJson(extractJsonObject(rawContent));
  if (!analysis || typeof analysis !== "object") {
    throw new Error("分析模型没有返回可解析的 JSON");
  }
  const normalizedAnalysis = normalizeAnalysisPayload(analysis, analysisModel);
  if (requestId) {
    updateRequestLog(requestId, {
      responseBody: sanitizeForLog({ ok: true, status: response.status, raw: payload, analysis: normalizedAnalysis }),
    });
  }
  return normalizedAnalysis;
}

async function readOpenAiImageResponse(response: Response, outputFormat: string): Promise<ImageResult> {
  const bodyText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: detailFromUpstream(response.status, bodyText),
    };
  }

  const json = parseMaybeJson(bodyText);
  if (!json || typeof json !== "object" || !("data" in json)) {
    return {
      ok: false,
      status: response.status,
      detail: { status: response.status, error: "接口返回格式不是 images API 格式", raw: json },
    };
  }

  const mime = outputMime(outputFormat);
  const items = Array.isArray((json as { data?: unknown }).data)
    ? ((json as { data: unknown[] }).data)
    : [];

  const images = await Promise.all(
    items.map(async (item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as { b64_json?: string; url?: string; revised_prompt?: string };
      if (record.b64_json) {
        return {
          dataUrl: dataUrlFromBase64(record.b64_json, mime),
          revisedPrompt: record.revised_prompt || "",
        };
      }
      if (record.url) {
        return {
          dataUrl: await urlToDataUrl(record.url),
          revisedPrompt: record.revised_prompt || "",
        };
      }
      return null;
    }),
  );

  const usableImages = images.filter(Boolean) as Array<{ dataUrl: string; revisedPrompt?: string }>;
  if (usableImages.length === 0) {
    return {
      ok: false,
      status: response.status,
      detail: { status: response.status, error: "接口没有返回可识别的图片数据", raw: json },
    };
  }

  return {
    ok: true,
    status: response.status,
    images: usableImages,
    raw: json,
  };
}

async function readGenericJsonImageResponse(response: Response, outputFormat: string): Promise<ImageResult> {
  const bodyText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: detailFromUpstream(response.status, bodyText),
    };
  }
  const json = parseMaybeJson(bodyText);
  const imageData = collectImageData(json);
  const textParts = collectText(json);
  if (imageData.length === 0) {
    return {
      ok: false,
      status: response.status,
      detail: { status: response.status, error: "接口没有返回可识别的图片数据", raw: json },
    };
  }
  return {
    ok: true,
    status: response.status,
    images: imageData.map((data) => ({
      dataUrl: dataUrlFromBase64(data, outputMime(outputFormat)),
      revisedPrompt: textParts.join("\n").trim(),
    })),
    raw: json,
  };
}

async function generateOpenAiImageEdit(baseUrl: string, apiKey: string, request: GenerateRequest, references: ReferenceImage[], requestId?: string) {
  const outputFormat = request.outputFormat || "png";
  const requestSize = imageSizeForProtocol(request, "openai-images");
  const form = new FormData();
  form.append("model", request.model || "gpt-image-2");
  form.append("prompt", fullPrompt(request));
  form.append("n", "1");
  form.append("response_format", "b64_json");
  if (requestSize && requestSize !== "auto") form.append("size", requestSize);
  if (request.quality && request.quality !== "auto") form.append("quality", request.quality);
  if (outputFormat && outputFormat !== "png") form.append("output_format", outputFormat);
  references.forEach((image, index) => {
    const { mime, data } = referenceImageToBuffer(image);
    const fileName = image.name || `reference-${index + 1}.${mime.split("/")[1] || "png"}`;
    form.append("image[]", new Blob([data], { type: mime }), fileName);
  });

  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: "/v1/images/edits",
      upstreamPayloadKeys: [
        "model",
        "prompt",
        "n",
        "response_format",
        ...(requestSize && requestSize !== "auto" ? ["size"] : []),
        ...(request.quality && request.quality !== "auto" ? ["quality"] : []),
        ...(outputFormat && outputFormat !== "png" ? ["output_format"] : []),
        "image[]",
      ],
      upstreamReferenceCount: references.length,
      upstreamReferenceMode: "multipart:image[]",
      upstreamSize: requestSize && requestSize !== "auto" ? requestSize : undefined,
      upstreamRequest: sanitizeForLog({
        model: request.model || "gpt-image-2",
        prompt: fullPrompt(request),
        n: 1,
        response_format: "b64_json",
        size: requestSize && requestSize !== "auto" ? requestSize : undefined,
        quality: request.quality && request.quality !== "auto" ? request.quality : undefined,
        output_format: outputFormat && outputFormat !== "png" ? outputFormat : undefined,
        referenceImages: references,
      }),
    });
  }

  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/images/edits"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  return readOpenAiImageResponse(response, outputFormat);
}

async function generateOpenAiCompatible(baseUrl: string, apiKey: string, request: GenerateRequest, requestId?: string, publicBaseUrl = "") {
  const protocol = request.protocol || DEFAULT_PROTOCOL;
  const references = Array.isArray(request.referenceImages) ? request.referenceImages : [];
  const outputFormat = request.outputFormat || "png";
  let editFallback: Record<string, unknown> | undefined;
  if (protocol === "openai-images" && references.length > 0) {
    const editResult = await generateOpenAiImageEdit(baseUrl, apiKey, request, references, requestId);
    if (editResult.ok || !shouldFallbackReferenceEditToGeneration(editResult)) {
      return editResult;
    }
    const summary = safeErrorSummary(editResult.detail);
    editFallback = {
      from: "/v1/images/edits",
      status: editResult.status,
      reason: summary.message,
      type: summary.type,
      code: summary.code,
    };
  }
  const requestSize = imageSizeForProtocol(request, protocol);
  const payload: Record<string, unknown> = {
    model: request.model,
    prompt: fullPrompt(request),
    n: 1,
    response_format: "b64_json",
  };
  if (requestSize && requestSize !== "auto") payload.size = requestSize;
  if (request.quality && request.quality !== "auto") payload.quality = request.quality;
  if (outputFormat && outputFormat !== "png") payload.output_format = outputFormat;
  if (request.aspectRatio && protocol === "custom-openai") payload.aspect_ratio = request.aspectRatio;
  if (protocol === "custom-openai" && isImage2Model(request.model) && request.resolution && request.resolution !== "1K") {
    payload.resolution = request.resolution;
  }
  if (request.seed) payload.seed = Number.isFinite(Number(request.seed)) ? Number(request.seed) : request.seed;

  const path = protocol === "gemini-openai" ? "/images/generations" : "/v1/images/generations";
  const referencePayloads = references.length > 0 && (protocol === "custom-openai" || protocol === "openai-images")
    ? compatibleReferenceImagePayloads(references, publicBaseUrl)
    : [];
  const attempts = referencePayloads.length > 0 ? referencePayloads : [undefined];
  const referenceAttemptErrors: Array<Record<string, unknown>> = [];
  let lastResult: ImageResult | undefined;

  try {
    for (const [attemptIndex, referencePayload] of attempts.entries()) {
      const attemptPayload = { ...payload };
      let referenceMode = "none";
      let referenceCount = 0;
      if (referencePayload && referencePayload.urls.length > 0) {
        attemptPayload[referencePayload.field] = referencePayload.urls;
        referenceMode = editFallback
          ? `${referencePayload.mode}:fallback_from_edits_${editFallback.status || "error"}`
          : referencePayload.mode;
        referenceCount = referencePayload.urls.length;
      }

      if (requestId) {
        updateRequestLog(requestId, {
          endpoint: path,
          upstreamPayloadKeys: Object.keys(attemptPayload),
          upstreamReferenceCount: referenceCount,
          upstreamReferenceMode: referenceMode,
          upstreamSize: typeof attemptPayload.size === "string" ? attemptPayload.size : undefined,
          referenceUploadStatus: referenceCount > 0 ? "forwarded" : undefined,
          upstreamRequest: sanitizeForLog({
            ...attemptPayload,
            ...(editFallback ? { _proxyFallback: editFallback } : {}),
            _proxyReferenceAttempt: attemptIndex + 1,
            _proxyReferenceAttemptErrors: referenceAttemptErrors,
          }),
        });
      }

      try {
        const response = await fetchWithTimeout(endpoint(baseUrl, path), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(attemptPayload),
        });
        const result = await readOpenAiImageResponse(response, outputFormat);
        if (result.ok) return result;
        lastResult = result;
        const summary = safeErrorSummary(result.detail);
        referenceAttemptErrors.push({
          attempt: attemptIndex + 1,
          field: referencePayload?.field || "none",
          mode: referenceMode,
          status: result.status,
          message: summary.message,
          type: summary.type,
          code: summary.code,
        });
        if (!referencePayload || attemptIndex >= attempts.length - 1 || !shouldTryNextReferencePayload(result)) {
          return result;
        }
      } finally {
        referencePayload?.cleanup?.();
      }
    }
  } finally {
    referencePayloads.forEach((item) => item.cleanup?.());
  }

  return lastResult || {
    ok: false,
    status: 500,
    detail: { error: "参考图请求没有得到有效响应" },
  };
}

async function generateOpenAiResponses(baseUrl: string, apiKey: string, request: GenerateRequest, requestId?: string) {
  const outputFormat = request.outputFormat || "png";
  const imageTool: Record<string, unknown> = {
    type: "image_generation",
  };
  if (request.size && request.size !== "auto") imageTool.size = request.size;
  if (request.quality && request.quality !== "auto") imageTool.quality = request.quality;
  if (outputFormat) imageTool.output_format = outputFormat;

  const upstreamPayload = {
    model: request.model,
    input: fullPrompt(request),
    tools: [imageTool],
  };
  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: "/v1/responses",
      upstreamPayloadKeys: Object.keys(upstreamPayload),
      upstreamRequest: sanitizeForLog(upstreamPayload),
      upstreamSize: typeof imageTool.size === "string" ? imageTool.size : undefined,
    });
  }
  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(upstreamPayload),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateGeminiNative(baseUrl: string, apiKey: string, request: GenerateRequest, requestId?: string) {
  const references = Array.isArray(request.referenceImages) ? request.referenceImages : [];
  const outputFormat = request.outputFormat || "png";
  const parts = [
    { text: fullPrompt(request) },
    ...references.map(dataUrlToGeminiPart),
  ];
  const upstreamPayload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: request.aspectRatio || "1:1",
      },
    },
  };
  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: `/models/${modelName(request.model)}:generateContent`,
      upstreamPayloadKeys: Object.keys(upstreamPayload),
      upstreamReferenceCount: references.length,
      upstreamReferenceMode: references.length ? "gemini:parts:inline_data" : "none",
      upstreamRequest: sanitizeForLog(upstreamPayload),
    });
  }
  const response = await fetchWithTimeout(endpoint(baseUrl, `/models/${modelName(request.model)}:generateContent`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(upstreamPayload),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateImagen(baseUrl: string, apiKey: string, request: GenerateRequest, requestId?: string) {
  const outputFormat = request.outputFormat || "png";
  const parameters: Record<string, unknown> = {
    sampleCount: 1,
    aspectRatio: request.aspectRatio || "1:1",
    outputMimeType: outputMime(outputFormat),
  };
  if (request.negativePrompt) parameters.negativePrompt = request.negativePrompt;
  if (request.seed) parameters.seed = Number.isFinite(Number(request.seed)) ? Number(request.seed) : request.seed;

  const upstreamPayload = {
    instances: [{ prompt: request.prompt }],
    parameters,
  };
  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: `/models/${modelName(request.model)}:predict`,
      upstreamPayloadKeys: Object.keys(upstreamPayload),
      upstreamRequest: sanitizeForLog(upstreamPayload),
    });
  }
  const response = await fetchWithTimeout(endpoint(baseUrl, `/models/${modelName(request.model)}:predict`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(upstreamPayload),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateStability(baseUrl: string, apiKey: string, request: GenerateRequest, requestId?: string) {
  const outputFormat = request.outputFormat === "jpeg" ? "jpeg" : request.outputFormat || "png";
  const form = new FormData();
  form.append("prompt", request.prompt || "");
  form.append("output_format", outputFormat);
  if (request.aspectRatio) form.append("aspect_ratio", request.aspectRatio);
  if (request.negativePrompt) form.append("negative_prompt", request.negativePrompt);
  if (request.seed) form.append("seed", String(Number.isFinite(Number(request.seed)) ? Number(request.seed) : request.seed));

  const path = String(request.model || "").includes("ultra")
    ? "/v2beta/stable-image/generate/ultra"
    : "/v2beta/stable-image/generate/core";
  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: path,
      upstreamPayloadKeys: ["prompt", "output_format", ...(request.aspectRatio ? ["aspect_ratio"] : []), ...(request.negativePrompt ? ["negative_prompt"] : []), ...(request.seed ? ["seed"] : [])],
      upstreamRequest: sanitizeForLog({
        prompt: request.prompt || "",
        output_format: outputFormat,
        aspect_ratio: request.aspectRatio,
        negative_prompt: request.negativePrompt,
        seed: request.seed,
      }),
    });
  }
  const response = await fetchWithTimeout(endpoint(baseUrl, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "image/*",
    },
    body: form,
  });

  const contentType = response.headers.get("content-type") || outputMime(outputFormat);
  if (!response.ok) {
    const text = await response.text();
    return {
      ok: false,
      status: response.status,
      detail: detailFromUpstream(response.status, text),
    };
  }

  if (contentType.includes("application/json")) {
    return readGenericJsonImageResponse(response, outputFormat);
  }

  const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
  return {
    ok: true,
    status: response.status,
    images: [{
      dataUrl: dataUrlFromBase64(bytes, contentType),
      revisedPrompt: "",
    }],
    raw: { contentType },
  };
}

async function loadUpstreamModels(protocol: ImageProtocol, baseUrl: string, apiKey: string) {
  if (!apiKey || protocol === "stability-core") {
    return { models: DEFAULT_MODELS[protocol], raw: { source: "preset" } };
  }

  if (protocol === "gemini-native" || protocol === "google-imagen") {
    const response = await fetchWithTimeout(endpoint(baseUrl, "/models"), {
      headers: { "x-goog-api-key": apiKey },
    });
    const text = await response.text();
    if (!response.ok) throw detailFromUpstream(response.status, text);
    const payload = parseMaybeJson(text);
    let models = extractModelIds(payload, "models");
    if (protocol === "google-imagen") {
      models = models.filter((model) => model.toLowerCase().includes("imagen"));
    }
    return { models: models.length > 0 ? models : DEFAULT_MODELS[protocol], raw: payload };
  }

  const path = protocol === "gemini-openai" ? "/models" : "/v1/models";
  const response = await fetchWithTimeout(endpoint(baseUrl, path), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) throw detailFromUpstream(response.status, text);
  const payload = parseMaybeJson(text);
  const models = extractModelIds(payload, "data");
  return { models: models.length > 0 ? models : DEFAULT_MODELS[protocol], raw: payload };
}

function imageProxyPlugin(): PluginOption {
  return {
    name: "image-api-proxy",
    configureServer(server: ViteDevServer) {
      ensureAdminStore();
      server.middlewares.use("/api/reference-images", (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        cleanupExpiredTemporaryReferences();
        const id = decodeURIComponent((req.url || "/").split("?")[0]?.replace(/^\/+/, "") || "");
        const record = id ? temporaryReferences.get(id) : undefined;
        if (!record || record.expiresAt <= Date.now()) {
          sendJson(res, 404, { ok: false, error: "参考图已过期或不存在" });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", record.mime);
        res.setHeader("Content-Length", String(record.bytes.length));
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.name)}"`);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(record.bytes);
      });

      server.middlewares.use("/api/admin", async (req, res) => {
        const path = (req.url || "/").split("?")[0] || "/";
        const session = getAdminSession(req);
        const store = readAdminStore();

        try {
          if (path === "/login" && req.method === "POST") {
            const body = await readJsonBody(req);
            const username = getString(body, "username");
            const password = getString(body, "password");
            const user = store.admins.find((admin) => admin.username === username);
            if (!user || !verifyPassword(password, user)) {
              sendJson(res, 401, { ok: false, error: "账号或密码错误" });
              return;
            }
            const token = createSession(user.username);
            setSessionCookie(res, token);
            appendAuditLog(user.username, "admin_login");
            sendJson(res, 200, {
              ok: true,
              user: {
                username: user.username,
                mustChangePassword: user.mustChangePassword,
              },
            });
            return;
          }

          if (path === "/logout" && req.method === "POST") {
            if (session) adminSessions.delete(session.token);
            clearSessionCookie(res);
            sendJson(res, 200, { ok: true });
            return;
          }

          if (!session) {
            sendJson(res, 401, { ok: false, error: "未登录" });
            return;
          }

          const user = store.admins.find((admin) => admin.username === session.username);
          if (!user) {
            sendJson(res, 401, { ok: false, error: "管理员不存在" });
            return;
          }

          if (path === "/me" && req.method === "GET") {
            sendJson(res, 200, {
              ok: true,
              user: {
                username: user.username,
                mustChangePassword: user.mustChangePassword,
              },
            });
            return;
          }

          if (path === "/change-password" && req.method === "POST") {
            const body = await readJsonBody(req);
            const oldPassword = getString(body, "oldPassword");
            const newPassword = getString(body, "newPassword");
            if (!verifyPassword(oldPassword, user)) {
              sendJson(res, 400, { ok: false, error: "旧密码不正确" });
              return;
            }
            if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
              sendJson(res, 400, { ok: false, error: "新密码至少 8 位，并包含字母和数字" });
              return;
            }
            const { salt, passwordHash } = hashPassword(newPassword);
            const nextStore = readAdminStore();
            nextStore.admins = nextStore.admins.map((admin) =>
              admin.username === user.username
                ? { ...admin, salt, passwordHash, mustChangePassword: false, updatedAt: Date.now() }
                : admin,
            );
            writeAdminStore(nextStore);
            appendAuditLog(user.username, "admin_password_changed");
            sendJson(res, 200, { ok: true });
            return;
          }

          if (user.mustChangePassword) {
            sendJson(res, 403, { ok: false, error: "首次登录必须修改密码", mustChangePassword: true });
            return;
          }

          if (path === "/stats" && req.method === "GET") {
            const logs = store.requestLogs;
            const success = logs.filter((log) => log.status === "success").length;
            const error = logs.filter((log) => log.status === "error").length;
            const durations = logs.filter((log) => typeof log.durationMs === "number").map((log) => log.durationMs || 0);
            const avgDurationMs = durations.length
              ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)
              : 0;
            const modelCounts = logs.reduce<Record<string, number>>((acc, log) => {
              acc[log.model] = (acc[log.model] || 0) + 1;
              return acc;
            }, {});
            const errorCounts = logs.filter((log) => log.status === "error").reduce<Record<string, number>>((acc, log) => {
              const key = log.errorCode || log.errorType || log.errorMessage || "未知错误";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});
            sendJson(res, 200, {
              ok: true,
              stats: {
                total: logs.length,
                success,
                error,
                running: logs.filter((log) => log.status === "running").length,
                successRate: logs.length ? Math.round((success / logs.length) * 1000) / 10 : 0,
                avgDurationMs,
                modelCounts,
                errorCounts,
              },
            });
            return;
          }

          if (path === "/requests" && req.method === "GET") {
            const url = new URL(req.url || "/", "http://localhost");
            const query = (url.searchParams.get("q") || "").toLowerCase();
            const status = url.searchParams.get("status") || "";
            const model = url.searchParams.get("model") || "";
            const logs = store.requestLogs
              .filter((log) => !status || log.status === status)
              .filter((log) => !model || log.model === model)
              .filter((log) => !query || `${log.requestId} ${log.clientId} ${log.prompt} ${log.model} ${log.resolution || ""} ${log.agentName || ""} ${log.agentScenario || ""} ${log.errorMessage || ""}`.toLowerCase().includes(query))
              .slice(0, 300);
            sendJson(res, 200, { ok: true, logs });
            return;
          }

          if (path.startsWith("/requests/") && req.method === "GET") {
            const requestId = decodeURIComponent(path.replace("/requests/", ""));
            const log = store.requestLogs.find((record) => record.requestId === requestId);
            if (!log) {
              sendJson(res, 404, { ok: false, error: "日志不存在" });
              return;
            }
            sendJson(res, 200, { ok: true, log });
            return;
          }

          if (path === "/logs/export" && req.method === "GET") {
            const exportedAt = new Date().toISOString();
            const filename = `image-studio-logs-${exportedAt.replace(/[:.]/g, "-")}.json`;
            const payload = {
              exportedAt,
              exportedBy: user.username,
              schemaVersion: 1,
              admins: store.admins.map((admin) => ({
                username: admin.username,
                createdAt: admin.createdAt,
                updatedAt: admin.updatedAt,
                mustChangePassword: admin.mustChangePassword,
              })),
              auditLogs: store.auditLogs,
              requestLogs: store.requestLogs,
              counts: {
                requestLogs: store.requestLogs.length,
                auditLogs: store.auditLogs.length,
                admins: store.admins.length,
              },
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.end(JSON.stringify(payload, null, 2));
            appendAuditLog(user.username, "admin_export_logs", `count=${store.requestLogs.length}`);
            return;
          }

          sendJson(res, 404, { ok: false, error: "Not found" });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.middlewares.use("/api/models", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const protocol = getProtocol(body.protocol);
          const baseUrl = normalizeAllowedApiBaseUrl(getString(body, "baseUrl"));
          const apiKey = getString(body, "apiKey");
          if (!apiKey) {
            sendJson(res, 400, { ok: false, detail: { status: 400, error: "API Key 不能为空" } });
            return;
          }
          const { models, raw } = await loadUpstreamModels(protocol, baseUrl, apiKey);
          sendJson(res, 200, { ok: true, models: [...new Set(models)].sort(), raw });
        } catch (error) {
          const upstreamStatus = httpStatusFromDetail(error);
          const summary = safeErrorSummary(error);
          const status = isAllowedApiBaseUrlError(error) ? 400 : upstreamStatus || 500;
          const isAuthError = status === 401 || status === 403;
          sendJson(res, status, {
            ok: false,
            detail: {
              status,
              error: isAuthError ? "API Key 错误或无权限，请检查后重试" : summary.message,
              type: summary.type,
              code: summary.code,
              raw: summary.raw,
            },
          });
        }
      });

      server.middlewares.use("/api/prompt/analyze", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const requestId = randomUUID();
        const startedAt = Date.now();
        let logCreated = false;
        try {
          const body = await readJsonBody(req);
          const baseUrl = normalizeAllowedApiBaseUrl(getString(body, "baseUrl"));
          const apiKey = getString(body, "apiKey");
          const protocol = getProtocol(body.protocol);
          const clientId = getString(body, "clientId") || "anonymous";
          const analysisModel = getString(body, "analysisModel");
          const prompt = getString(body, "prompt");

          createRequestLog({
            requestId,
            requestType: "prompt_analysis",
            clientId: truncateText(clientId, 120),
            clientUserAgent: truncateText(req.headers["user-agent"] || "", 500),
            clientIpHash: hashClientIp(req),
            protocol,
            apiBaseUrl: baseUrl.replace(/\/+$/, ""),
            ...apiKeyLogMeta(apiKey),
            endpoint: "/v1/chat/completions",
            model: truncateText(analysisModel || "", 240),
            prompt: truncateText(prompt || "", 4000),
            negativePrompt: getString(body, "negativePrompt") ? truncateText(getString(body, "negativePrompt"), 2400) : undefined,
            aspectRatio: getString(body, "aspectRatio") || undefined,
            size: getString(body, "size") || undefined,
            resolution: getString(body, "resolution") || undefined,
            quality: getString(body, "quality") || undefined,
            outputFormat: getString(body, "outputFormat") || undefined,
            agentId: getString(body, "agentId") || undefined,
            agentName: getString(body, "agentName") ? truncateText(getString(body, "agentName"), 120) : undefined,
            agentScenario: getString(body, "agentScenario") ? truncateText(getString(body, "agentScenario"), 240) : undefined,
            promptVariant: getString(body, "promptVariant") || undefined,
            referenceCount: getNumber(body.referenceCount) || 0,
            requestParams: sanitizeForLog({
              ...body,
              baseUrl,
              apiKey: undefined,
              credential: apiKeyLogMeta(apiKey),
            }),
            status: "running",
            createdAt: startedAt,
            startedAt,
            imageSaved: false,
          });
          logCreated = true;

          const analysis = await analyzePromptWithGpt(baseUrl, apiKey, body, requestId);
          const finishedAt = Date.now();
          updateRequestLog(requestId, {
            status: "success",
            httpStatus: 200,
            finishedAt,
            durationMs: finishedAt - startedAt,
          });
          sendJson(res, 200, { ok: true, requestId, analysis });
        } catch (error) {
          const detail = error && typeof error === "object" && "error" in error
            ? error
            : { error: error instanceof Error ? error.message : String(error) };
          const status = isAllowedApiBaseUrlError(error) ? 400 : httpStatusFromDetail(detail) || httpStatusFromDetail(error) || 500;
          if (logCreated) {
            const summary = safeErrorSummary(detail);
            const finishedAt = Date.now();
            updateRequestLog(requestId, {
              status: "error",
              httpStatus: status,
              errorMessage: summary.message,
              errorType: summary.type || "prompt_analysis_error",
              errorCode: summary.code,
              errorRaw: summary.raw,
              responseBody: sanitizeForLog({ ok: false, status, detail }),
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
          }
          sendJson(res, status, {
            ok: false,
            requestId,
            detail,
          });
        }
      });

      server.middlewares.use("/api/images/generate", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const requestId = randomUUID();
        const startedAt = Date.now();
        let logCreated = false;
        try {
          const body = await readJsonBody(req);
          const baseUrl = normalizeAllowedApiBaseUrl(getString(body, "baseUrl"));
          const apiKey = getString(body, "apiKey");
          const publicBaseUrl = publicBaseUrlFromRequest(req);
          const request = (body.request && typeof body.request === "object" ? body.request : {}) as GenerateRequest;
          const protocol = getProtocol(request.protocol);
          request.protocol = protocol;
          const requestMeta = body.request && typeof body.request === "object"
            ? body.request as Record<string, unknown>
            : {};
          const clientId = getString(body, "clientId") || "anonymous";

          const incomingRefs = Array.isArray(request.referenceImages) ? request.referenceImages : [];
          const referenceTotalBytes = incomingRefs.reduce((sum, image) => {
            if (!image || typeof image !== "object") return sum;
            const dataUrl = (image as { dataUrl?: unknown }).dataUrl;
            if (typeof dataUrl !== "string") return sum;
            const match = dataUrl.match(/^data:[^;]+;base64,(.*)$/);
            const base64 = (match?.[1] ?? dataUrl).replace(/\s+/g, "");
            return sum + Math.round((base64.length * 3) / 4);
          }, 0);
          const initialUploadStatus: NonNullable<RequestLog["referenceUploadStatus"]> =
            incomingRefs.length === 0 ? "none" : "received";

          createRequestLog({
            requestId,
            requestType: "image_generation",
            batchId: typeof requestMeta.batchId === "string" ? requestMeta.batchId : undefined,
            batchIndex: getNumber(requestMeta.index),
            batchTotal: getNumber(requestMeta.total),
            clientId: truncateText(clientId, 120),
            clientUserAgent: truncateText(req.headers["user-agent"] || "", 500),
            clientIpHash: hashClientIp(req),
            protocol,
            apiBaseUrl: baseUrl.replace(/\/+$/, ""),
            ...apiKeyLogMeta(apiKey),
            endpoint: generationEndpointLabel(
              protocol,
              request.model,
              incomingRefs.length,
            ),
            model: truncateText(request.model || "", 240),
            prompt: truncateText(request.prompt || "", 4000),
            negativePrompt: request.negativePrompt ? truncateText(request.negativePrompt, 2400) : undefined,
            aspectRatio: request.aspectRatio,
            size: request.size,
            resolution: request.resolution,
            quality: request.quality,
            outputFormat: request.outputFormat,
            seed: request.seed,
            agentId: typeof requestMeta.agentId === "string" ? requestMeta.agentId : undefined,
            agentName: typeof requestMeta.agentName === "string" ? truncateText(requestMeta.agentName, 120) : undefined,
            agentScenario: typeof requestMeta.agentScenario === "string" ? truncateText(requestMeta.agentScenario, 240) : undefined,
            promptVariant: typeof requestMeta.promptVariant === "string" ? requestMeta.promptVariant : undefined,
            referenceCount: incomingRefs.length,
            referenceTotalBytes,
            referenceUploadStatus: initialUploadStatus,
            requestParams: sanitizeForLog({
              ...body,
              baseUrl,
              apiKey: undefined,
              credential: apiKeyLogMeta(apiKey),
            }),
            status: "running",
            createdAt: startedAt,
            startedAt,
            imageSaved: false,
          });
          logCreated = true;

          const failFast = (status: number, message: string) => {
            const finishedAt = Date.now();
            updateRequestLog(requestId, {
              status: "error",
              httpStatus: status,
              errorMessage: message,
              errorType: "validation_error",
              responseBody: sanitizeForLog({ ok: false, requestId, detail: { error: message } }),
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
            sendJson(res, status, { ok: false, requestId, detail: { error: message } });
          };

          if (!request.model || !request.prompt) {
            failFast(400, "模型和提示词不能为空");
            return;
          }

          if (!apiKey) {
            failFast(400, "API Key 不能为空");
            return;
          }

          const result = protocol === "openai-responses"
            ? await generateOpenAiResponses(baseUrl, apiKey, request, requestId)
            : protocol === "gemini-native"
              ? await generateGeminiNative(baseUrl, apiKey, request, requestId)
              : protocol === "google-imagen"
                ? await generateImagen(baseUrl, apiKey, request, requestId)
                : protocol === "stability-core"
                  ? await generateStability(baseUrl, apiKey, request, requestId)
                  : await generateOpenAiCompatible(baseUrl, apiKey, request, requestId, publicBaseUrl);

          const finishedAt = Date.now();
          const durationMs = finishedAt - startedAt;
          if (result.ok) {
            updateRequestLog(requestId, {
              status: "success",
              httpStatus: result.status || 200,
              responseBody: sanitizeForLog(result),
              referenceUploadStatus: incomingRefs.length === 0 ? "none" : "succeeded",
              finishedAt,
              durationMs,
            });
          } else {
            const summary = safeErrorSummary(result.detail);
            updateRequestLog(requestId, {
              status: "error",
              httpStatus: result.status || 500,
              errorMessage: summary.message,
              errorType: summary.type,
              errorCode: summary.code,
              errorRaw: summary.raw,
              responseBody: sanitizeForLog(result),
              referenceUploadStatus: incomingRefs.length === 0 ? "none" : "failed",
              finishedAt,
              durationMs,
            });
          }

          sendJson(res, result.ok ? 200 : result.status || 500, { ...result, requestId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (logCreated) {
            const finishedAt = Date.now();
            updateRequestLog(requestId, {
              status: "error",
              httpStatus: 500,
              errorMessage: truncateText(message, 800),
              errorType: "proxy_error",
              errorRaw: redactImageText(message, 2500),
              responseBody: sanitizeForLog({ ok: false, detail: { error: message } }),
              referenceUploadStatus: "failed",
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
          }
          sendJson(res, isAllowedApiBaseUrlError(error) ? 400 : 500, { ok: false, requestId, detail: { error: message } });
        }
      });
    },
  };
}

function frontendVersionPlugin(): PluginOption {
  return {
    name: "frontend-build-version",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/build-version.json", (_req, res) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
        res.end(JSON.stringify(FRONTEND_BUILD_INFO));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-version.json",
        source: JSON.stringify(FRONTEND_BUILD_INFO, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin(), frontendVersionPlugin()],
  define: {
    __FRONTEND_BUILD_VERSION__: JSON.stringify(FRONTEND_BUILD_VERSION),
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/v${FRONTEND_BUILD_VERSION}-[name]-[hash].js`,
        chunkFileNames: `assets/v${FRONTEND_BUILD_VERSION}-[name]-[hash].js`,
        assetFileNames: `assets/v${FRONTEND_BUILD_VERSION}-[name]-[hash][extname]`,
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8877,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8877,
    strictPort: true,
  },
});
