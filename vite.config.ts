import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { defineConfig, type PluginOption, type PreviewServer, type ViteDevServer } from "vite";

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
  field: "image";
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
type RequestLogType = "image_generation" | "prompt_analysis" | "agent_analysis";

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

type SquareFeedTab = "latest" | "hot" | "top_day" | "top_week" | "top_month";
type SquareActionResult = "added" | "replaced" | "rejected" | "liked" | "unliked" | "noop";

type SquareItem = {
  id: string;
  imageId: string;
  requestId?: string;
  thumbnailDataUrl: string;
  imageHash: string;
  prompt: string;
  caption: string;
  model: string;
  params: Record<string, unknown>;
  width?: number;
  height?: number;
  aspectRatio?: string;
  sourceType: string;
  reasonPlan?: unknown;
  recommenderHash: string;
  recommenderLabel: string;
  pageLabel?: string;
  active: boolean;
  featured?: boolean;
  likeCount: number;
  qualityScore: number;
  trustScore: number;
  createdAt: number;
  updatedAt: number;
  replacedById?: string;
};

type SquareRecommendLog = {
  id: string;
  requestId: string;
  apiKeyHash: string;
  imageId?: string;
  itemId?: string;
  action: SquareActionResult;
  result: "success" | "rejected" | "error";
  reasonCode: string;
  replacedItemId?: string;
  remainingDailyQuota: number;
  remainingShelfSlots: number;
  ipHash: string;
  uaHash: string;
  promptHash?: string;
  imageHash?: string;
  sourceType?: string;
  timestamp: number;
};

type SquareLikeLog = {
  id: string;
  requestId: string;
  apiKeyHash: string;
  itemId: string;
  action: "like" | "unlike";
  result: "success" | "rejected" | "noop" | "error";
  reasonCode: string;
  likeCount: number;
  remainingLikeQuota: number;
  ipHash: string;
  uaHash: string;
  timestamp: number;
};

type SquareLikeState = {
  apiKeyHash: string;
  itemId: string;
  liked: boolean;
  createdAt: number;
  updatedAt: number;
};

type SquareQuotaDaily = {
  apiKeyHash: string;
  dateKey: string;
  dailyRecommendUsed: number;
  dailyLikeUsed: number;
  firstSeenAt: number;
  updatedAt: number;
};

type SquareModerationAudit = {
  id: string;
  requestId: string;
  apiKeyHash: string;
  itemId?: string;
  imageId?: string;
  event: string;
  reasonCode: string;
  severity: "low" | "medium" | "high";
  ipHash: string;
  uaHash: string;
  timestamp: number;
  detail?: unknown;
};

type SquareStore = {
  items: SquareItem[];
  recommendLogs: SquareRecommendLog[];
  likeLogs: SquareLikeLog[];
  likes: SquareLikeState[];
  quotas: SquareQuotaDaily[];
  moderationAudits: SquareModerationAudit[];
};

const API_TIMEOUT_MS = 300_000;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
const DEFAULT_PROTOCOL: ImageProtocol = "custom-openai";
const GPT_IMAGE_2_MODEL = "gpt-image-2";
const GPT_IMAGE_2_FAMILY_MODEL = "gpt-5.4-image-2";
const GEMINI_3_PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";
const GEMINI_NATIVE_API_PREFIX = "/v1beta";
const DEFAULT_API_BASE_URL = "https://api.clawopen.top/";
const SESSION_COOKIE = "image_studio_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DATA_DIR = join(process.cwd(), ".data");
const ADMIN_STORE_PATH = join(DATA_DIR, "admin-store.json");
const SQUARE_STORE_PATH = join(DATA_DIR, "square-store.json");
const REFERENCE_TEMP_TTL_MS = 1000 * 60 * 10;
const PUBLIC_REFERENCE_BASE_URL = "";
const SQUARE_TIME_ZONE = "Asia/Shanghai";
const SQUARE_SHELF_LIMIT = 4;
const SQUARE_DAILY_RECOMMEND_LIMIT = 10;
const SQUARE_DAILY_LIKE_LIMIT = 10;
const SQUARE_MAX_FEED_LIMIT = 20;
const SQUARE_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const temporaryReferences = new Map<string, {
  bytes: Buffer;
  mime: string;
  name: string;
  expiresAt: number;
}>();

const FRONTEND_BUILD_TIME_ZONE = "Asia/Shanghai";
const FRONTEND_BUILD_DATE = new Date();

function frontendDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: FRONTEND_BUILD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

function formatFrontendVersion(date: Date) {
  const parts = frontendDateParts(date);
  const pad = (item: number, length = 2) => String(item).padStart(length, "0");
  return [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    pad(date.getMilliseconds(), 3),
  ].join("");
}

function formatFrontendBuiltAtLocal(date: Date) {
  const parts = frontendDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}.${String(date.getMilliseconds()).padStart(3, "0")} ${FRONTEND_BUILD_TIME_ZONE}`;
}

function createFrontendBuildVersion() {
  const explicitVersion = process.env.FRONTEND_BUILD_VERSION?.trim();
  if (explicitVersion) return explicitVersion.replace(/[^a-zA-Z0-9._-]/g, "");
  return formatFrontendVersion(FRONTEND_BUILD_DATE);
}

const FRONTEND_BUILD_VERSION = createFrontendBuildVersion();
const FRONTEND_BUILD_INFO = {
  version: FRONTEND_BUILD_VERSION,
  builtAt: FRONTEND_BUILD_DATE.toISOString(),
  builtAtLocal: formatFrontendBuiltAtLocal(FRONTEND_BUILD_DATE),
  timeZone: FRONTEND_BUILD_TIME_ZONE,
};

const adminSessions = new Map<string, { username: string; expiresAt: number }>();

const DEFAULT_MODELS: Record<ImageProtocol, string[]> = {
  "custom-openai": [GPT_IMAGE_2_MODEL, GPT_IMAGE_2_FAMILY_MODEL],
  "openai-images": [GPT_IMAGE_2_MODEL, GPT_IMAGE_2_FAMILY_MODEL],
  "openai-responses": ["gpt-4.1", "gpt-4.1-mini"],
  "gemini-native": [GEMINI_3_PRO_IMAGE_MODEL, "gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"],
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

function emptySquareStore(): SquareStore {
  return {
    items: [],
    recommendLogs: [],
    likeLogs: [],
    likes: [],
    quotas: [],
    moderationAudits: [],
  };
}

function ensureSquareStore() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(SQUARE_STORE_PATH)) {
    writeFileSync(SQUARE_STORE_PATH, JSON.stringify(emptySquareStore(), null, 2));
  }
}

function readSquareStore(): SquareStore {
  ensureSquareStore();
  try {
    const parsed = JSON.parse(readFileSync(SQUARE_STORE_PATH, "utf8"));
    return {
      ...emptySquareStore(),
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      recommendLogs: Array.isArray(parsed.recommendLogs) ? parsed.recommendLogs : [],
      likeLogs: Array.isArray(parsed.likeLogs) ? parsed.likeLogs : [],
      likes: Array.isArray(parsed.likes) ? parsed.likes : [],
      quotas: Array.isArray(parsed.quotas) ? parsed.quotas : [],
      moderationAudits: Array.isArray(parsed.moderationAudits) ? parsed.moderationAudits : [],
    };
  } catch {
    return emptySquareStore();
  }
}

function writeSquareStore(store: SquareStore) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  store.items = store.items.slice(0, 2500);
  store.recommendLogs = store.recommendLogs.slice(0, 5000);
  store.likeLogs = store.likeLogs.slice(0, 8000);
  store.likes = store.likes.slice(0, 12000);
  store.quotas = store.quotas.slice(0, 5000);
  store.moderationAudits = store.moderationAudits.slice(0, 5000);
  writeFileSync(SQUARE_STORE_PATH, JSON.stringify(store, null, 2));
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

function hashText(value: unknown, length = 32) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, length);
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey.trim()).digest("hex");
}

function squareDayKey(value = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SQUARE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

function getSquareQuota(store: SquareStore, apiKeyHash: string, dateKey = squareDayKey()) {
  let quota = store.quotas.find((item) => item.apiKeyHash === apiKeyHash && item.dateKey === dateKey);
  if (!quota) {
    const now = Date.now();
    quota = {
      apiKeyHash,
      dateKey,
      dailyRecommendUsed: 0,
      dailyLikeUsed: 0,
      firstSeenAt: now,
      updatedAt: now,
    };
    store.quotas.unshift(quota);
  }
  return quota;
}

function squareRemainingRecommendQuota(quota: SquareQuotaDaily) {
  return Math.max(0, SQUARE_DAILY_RECOMMEND_LIMIT - quota.dailyRecommendUsed);
}

function squareRemainingLikeQuota(quota: SquareQuotaDaily) {
  return Math.max(0, SQUARE_DAILY_LIKE_LIMIT - quota.dailyLikeUsed);
}

function squareClientMeta(req: IncomingMessage) {
  return {
    ipHash: hashClientIp(req),
    uaHash: hashText(req.headers["user-agent"] || "", 16),
  };
}

function getSquareAdminAuth(req: IncomingMessage): { ok: true; user: AdminUser } | { ok: false; status: number; error: string; mustChangePassword?: boolean } {
  const session = getAdminSession(req);
  const adminStore = readAdminStore();
  const user = session ? adminStore.admins.find((admin) => admin.username === session.username) : undefined;
  if (!session || !user) {
    return { ok: false, status: 401, error: "未登录" };
  }
  if (user.mustChangePassword) {
    return { ok: false, status: 403, error: "首次登录必须修改密码", mustChangePassword: true };
  }
  return { ok: true, user };
}

function squareItemForExport(item: SquareItem) {
  const { thumbnailDataUrl, ...safeItem } = item;
  return safeItem;
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

function normalizeApiBaseUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("API URL 不能为空");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("API URL 格式不正确");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API URL 仅支持 HTTP/HTTPS");
  }
  url.hash = "";
  url.search = "";
  return `${url.toString().replace(/\/+$/, "")}/`;
}

function isApiBaseUrlError(error: unknown) {
  return error instanceof Error
    && (error.message === "API URL 不能为空"
      || error.message === "API URL 格式不正确"
      || error.message === "API URL 仅支持 HTTP/HTTPS");
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
  if (protocol === "gemini-native") return `${GEMINI_NATIVE_API_PREFIX}/models/${modelName(model)}:generateContent`;
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

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getNestedString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNestedNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function imageBytesFromDataUrl(dataUrl: string) {
  const base64 = dataUrl.match(/^data:[^;]+;base64,(.*)$/)?.[1] || dataUrl;
  return Math.round((base64.replace(/\s+/g, "").length * 3) / 4);
}

function hashImageDataUrl(dataUrl: string) {
  const base64 = dataUrl.match(/^data:[^;]+;base64,(.*)$/)?.[1] || dataUrl;
  return createHash("sha256").update(base64.replace(/\s+/g, "")).digest("hex");
}

function normalizeSquareFeedTab(value: string | null): SquareFeedTab {
  if (value === "hot" || value === "top_day" || value === "top_week" || value === "top_month") return value;
  return "latest";
}

function squareCursorOffset(value: string | null) {
  if (!value) return 0;
  const parsedDirect = Number(value);
  if (Number.isFinite(parsedDirect) && parsedDirect >= 0) return Math.floor(parsedDirect);
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const offset = typeof decoded.offset === "number" ? decoded.offset : 0;
    return Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
  } catch {
    return 0;
  }
}

function squareNextCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function squareActiveItems(store: SquareStore) {
  return store.items.filter((item) => item.active !== false);
}

function squareShelfCount(store: SquareStore, apiKeyHash: string) {
  return squareActiveItems(store).filter((item) => item.recommenderHash === apiKeyHash).length;
}

function squareQualityScore(width?: number, height?: number, prompt = "") {
  const longest = Math.max(width || 0, height || 0);
  const dimensionScore = longest >= 1024 ? 86 : longest >= 768 ? 74 : 62;
  const promptScore = prompt.trim().length >= 20 ? 82 : 68;
  return Math.round(dimensionScore * 0.72 + promptScore * 0.28);
}

function squareRankScore(item: SquareItem, tab: SquareFeedTab, now = Date.now()) {
  const periodMs = tab === "top_day"
    ? 24 * 60 * 60 * 1000
    : tab === "top_week"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  const hotPeriodMs = tab === "hot" ? 3 * 24 * 60 * 60 * 1000 : periodMs;
  const ageMs = Math.max(0, now - item.createdAt);
  const recencyScore = Math.max(0, Math.round(100 * Math.exp(-ageMs / hotPeriodMs)));
  const likeScore = Math.min(100, Math.round(Math.log1p(item.likeCount || 0) * 32));
  const qualityScore = Math.max(0, Math.min(100, item.qualityScore || 70));
  const trustScore = Math.max(0, Math.min(100, item.trustScore || 70));
  const manualBoost = item.featured ? 8 : 0;
  return Math.round((recencyScore * 0.45 + likeScore * 0.35 + qualityScore * 0.15 + trustScore * 0.05 + manualBoost) * 100) / 100;
}

let squareRankScoreCache = new WeakMap<SquareItem, number>();

function sortSquareItems(items: SquareItem[], tab: SquareFeedTab) {
  const now = Date.now();
  squareRankScoreCache = new WeakMap();
  if (tab === "latest") {
    for (const item of items) squareRankScoreCache.set(item, squareRankScore(item, tab, now));
    return [...items].sort((a, b) => b.createdAt - a.createdAt);
  }
  const periodMs = tab === "top_day"
    ? 24 * 60 * 60 * 1000
    : tab === "top_week"
      ? 7 * 24 * 60 * 60 * 1000
      : tab === "top_month"
        ? 30 * 24 * 60 * 60 * 1000
        : 0;
  const scoped = periodMs > 0
    ? items.filter((item) => item.createdAt >= now - periodMs)
    : items;
  for (const item of scoped) squareRankScoreCache.set(item, squareRankScore(item, tab, now));
  return [...scoped].sort((a, b) => {
    const scoreDiff = (squareRankScoreCache.get(b) ?? 0) - (squareRankScoreCache.get(a) ?? 0);
    return scoreDiff || b.createdAt - a.createdAt;
  });
}

function isLikedBy(store: SquareStore, apiKeyHash: string, itemId: string) {
  return Boolean(store.likes.find((like) => like.apiKeyHash === apiKeyHash && like.itemId === itemId && like.liked));
}

function squareFeedItem(item: SquareItem, store: SquareStore, tab: SquareFeedTab, viewerApiKeyHash = "", cachedRankScore?: number) {
  return {
    id: item.id,
    imageId: item.imageId,
    requestId: item.requestId,
    thumbnailUrl: `/api/square/image/${item.id}`,
    prompt: item.prompt,
    caption: item.caption,
    model: item.model,
    params: item.params,
    width: item.width,
    height: item.height,
    aspectRatio: item.aspectRatio,
    sourceType: item.sourceType,
    reasonPlan: item.reasonPlan,
    recommenderLabel: item.recommenderLabel,
    pageLabel: item.pageLabel,
    likeCount: item.likeCount || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    rankScore: cachedRankScore ?? squareRankScore(item, tab),
    likedByRequester: viewerApiKeyHash ? isLikedBy(store, viewerApiKeyHash, item.id) : false,
  };
}

function appendSquareRecommendLog(store: SquareStore, log: Omit<SquareRecommendLog, "id" | "timestamp">) {
  store.recommendLogs.unshift({
    id: randomUUID(),
    timestamp: Date.now(),
    ...log,
  });
}

function appendSquareLikeLog(store: SquareStore, log: Omit<SquareLikeLog, "id" | "timestamp">) {
  store.likeLogs.unshift({
    id: randomUUID(),
    timestamp: Date.now(),
    ...log,
  });
}

function appendSquareModerationAudit(store: SquareStore, audit: Omit<SquareModerationAudit, "id" | "timestamp">) {
  store.moderationAudits.unshift({
    id: randomUUID(),
    timestamp: Date.now(),
    ...audit,
  });
}

function moderationReasonForSquareText(prompt: string, caption = "") {
  const text = `${prompt}\n${caption}`.toLowerCase();
  if (/(nsfw|nude|porn|sex|色情|裸露|裸体|成人内容)/i.test(text)) return "blocked_sensitive_content";
  if (prompt.length > 8000 || caption.length > 1000) return "abnormal_text_length";
  return "";
}

function recentSquareRecommendCount(store: SquareStore, apiKeyHash: string, withinMs: number) {
  const threshold = Date.now() - withinMs;
  return store.recommendLogs.filter((log) => log.apiKeyHash === apiKeyHash && log.timestamp >= threshold).length;
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

function publicBaseUrlFromRequest(req: IncomingMessage) {
  const configured = process.env.SUM_IMAGE_PUBLIC_BASE_URL?.trim() || PUBLIC_REFERENCE_BASE_URL;
  if (isPublicReferenceBaseUrl(configured)) {
    return configured.replace(/\/+$/, "");
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0]?.trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  const protocol = forwardedProto || "http";
  const inferred = host ? `${protocol}://${host}` : "";
  return isPublicReferenceBaseUrl(inferred) ? inferred.replace(/\/+$/, "") : "";
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

  // 上游协议：POST /v1/images/generations + JSON body + image: array<string>
  // 实测两种字符串都被识别：
  //   1. data URI —— 客户端已压到 ≤ 512KB，base64 后 ~700KB，JSON 直接装得下
  //   2. 公网 URL —— 上游回 fetch 我们的临时存储；只在 publicBaseUrl 真的公网可达时尝试
  // 顺序：data URI 优先。本地 dev 时 publicBaseUrl 写死指向生产域名，
  // 临时 URL 通道在本地内存里根本不存在，先发 data URI 能省掉一次必败的尝试。
  // 历史上的 image_urls / reference_image_urls 字段名经实测**不被上游读取**，已删除。
  const dataUriUrls = references.map(dataUrlToReferenceImageUrl);
  const payloads: ReferenceUrlPayload[] = [];

  payloads.push({
    field: "image",
    urls: dataUriUrls,
    mode: "image:data_uri",
  });

  if (isPublicReferenceBaseUrl(publicBaseUrl)) {
    const temp = createTemporaryReferenceUrls(references, publicBaseUrl);
    payloads.push({
      field: "image",
      urls: temp.urls,
      mode: "image:temporary_url",
      cleanup: temp.cleanup,
    });
  }

  return payloads;
}

function shouldTryNextReferencePayload(result: ImageResult) {
  if (result.ok) return false;
  const status = result.status || 0;
  if ([400, 401, 403, 404, 405, 413, 415, 422, 429, 500, 502, 503].includes(status)) return true;
  const detailText = JSON.stringify(result.detail || {}).toLowerCase();
  // 历史 image_urls / reference_image_urls 字段 2026-05-04 已删，正则不再匹配它们
  return /reference|image|url|data uri|base64|payload|too large|unsupported|unknown|invalid/.test(detailText);
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
  "3:4": "1152x1536",
  "4:3": "1536x1152",
  "2:3": "1024x1536",
  "3:2": "1536x1024",
  "9:16": "1024x1792",
  "16:9": "1792x1024",
  "21:9": "2016x864",
  "9:21": "864x2016",
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
  if (isGptImage2Model(request.model) && request.aspectRatio) {
    return SIZE_BY_RATIO[request.aspectRatio] || SIZE_BY_RATIO["1:1"];
  }
  return request.aspectRatio
    ? scaleSize(SIZE_BY_RATIO[request.aspectRatio] || SIZE_BY_RATIO["1:1"], request.resolution)
    : request.size || "auto";
}

function isGptImage2Model(model = "") {
  const normalized = model.toLowerCase();
  return normalized === GPT_IMAGE_2_MODEL || normalized === GPT_IMAGE_2_FAMILY_MODEL || normalized.includes("image-2");
}

function isGemini3ProImageModel(model = "") {
  return modelName(model).toLowerCase() === GEMINI_3_PRO_IMAGE_MODEL;
}

function imageGenerationSize(request: GenerateRequest) {
  if (isGptImage2Model(request.model) && request.aspectRatio) {
    return SIZE_BY_RATIO[request.aspectRatio] || SIZE_BY_RATIO["1:1"];
  }
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

type AgentModeIntentType = "single_image" | "multi_image_batch" | "brochure_project" | "page_refine" | "unknown";
type AgentModeCostLevel = "low" | "medium" | "high";
type AgentModeJobSpec = {
  id: string;
  title: string;
  prompt: string;
  objective?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  size?: string;
  resolution?: "1K" | "2K" | "4K";
  quality?: string;
  count?: number;
};
type AgentModeBrochurePage = {
  pageNo: number;
  role: string;
  title: string;
  objective: string;
};
type AgentModeBrochureProject = {
  title: string;
  companyName?: string;
  industry?: string;
  purpose?: string;
  pageCount: number;
  summary: string;
  outline: AgentModeBrochurePage[];
  styleDirections: string[];
  requestPrompt?: string;
};
type AgentModeAnalysisResult = {
  intentType: AgentModeIntentType;
  confidence: number;
  reasoningSummary: string;
  estimatedCostLevel: AgentModeCostLevel;
  requiresConfirmation: boolean;
  autoExecute: boolean;
  jobs: AgentModeJobSpec[];
  brochureProject?: AgentModeBrochureProject;
  analysisModel?: string;
  source?: "ai" | "local";
};

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function clampCount(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseNaturalCountToken(value = "") {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const arabic = normalized.match(/\d+/)?.[0];
  if (arabic) return Number(arabic);
  if (normalized === "十") return 10;
  if (normalized.includes("十")) {
    const [left, right] = normalized.split("十");
    const leftValue = left ? (CHINESE_DIGITS[left] ?? 1) : 1;
    const rightValue = right ? (CHINESE_DIGITS[right] ?? 0) : 0;
    return leftValue * 10 + rightValue;
  }
  return CHINESE_DIGITS[normalized];
}

function normalizeAgentModeIntentType(value: unknown, fallback: AgentModeIntentType = "unknown"): AgentModeIntentType {
  return value === "single_image"
    || value === "multi_image_batch"
    || value === "brochure_project"
    || value === "page_refine"
    || value === "unknown"
    ? value
    : fallback;
}

function normalizeAgentModeCostLevel(value: unknown, fallback: AgentModeCostLevel = "low"): AgentModeCostLevel {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function normalizeAgentModeJobSpec(
  value: unknown,
  fallback?: Partial<AgentModeJobSpec>,
): AgentModeJobSpec {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const prompt = typeof record.prompt === "string" && record.prompt.trim()
    ? record.prompt.trim()
    : fallback?.prompt || "";
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : fallback?.id || `job_${randomUUID().slice(0, 8)}`;
  const count = typeof record.count === "number" && Number.isFinite(record.count)
    ? clampCount(Math.round(record.count), 1, 8)
    : clampCount(Math.round(fallback?.count || 1), 1, 8);
  const resolution = record.resolution === "1K" || record.resolution === "2K" || record.resolution === "4K"
    ? record.resolution
    : fallback?.resolution;
  return {
    id,
    title: typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : fallback?.title || "图片任务",
    prompt,
    objective: typeof record.objective === "string" && record.objective.trim()
      ? record.objective.trim()
      : fallback?.objective,
    negativePrompt: typeof record.negativePrompt === "string" && record.negativePrompt.trim()
      ? record.negativePrompt.trim()
      : fallback?.negativePrompt,
    aspectRatio: typeof record.aspectRatio === "string" && record.aspectRatio.trim()
      ? record.aspectRatio.trim()
      : fallback?.aspectRatio,
    size: typeof record.size === "string" && record.size.trim()
      ? record.size.trim()
      : fallback?.size,
    resolution,
    quality: typeof record.quality === "string" && record.quality.trim()
      ? record.quality.trim()
      : fallback?.quality,
    count,
  };
}

function normalizeAgentModeBrochurePage(
  value: unknown,
  index: number,
): AgentModeBrochurePage {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const parsedPageNo = typeof record.pageNo === "number" && Number.isFinite(record.pageNo)
    ? Math.max(1, Math.round(record.pageNo))
    : index + 1;
  return {
    pageNo: parsedPageNo,
    role: typeof record.role === "string" && record.role.trim() ? record.role.trim() : `page_${parsedPageNo}`,
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : `第 ${parsedPageNo} 页`,
    objective: typeof record.objective === "string" && record.objective.trim()
      ? record.objective.trim()
      : "延续整本风格，完成本页的关键信息表达。",
  };
}

function normalizeAgentModeBrochureProject(
  value: unknown,
  fallback?: Partial<AgentModeBrochureProject>,
): AgentModeBrochureProject {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fallbackOutline = Array.isArray(fallback?.outline) ? fallback.outline : [];
  const outline = Array.isArray(record.outline)
    ? record.outline
      .map((item, index) => normalizeAgentModeBrochurePage(item, index))
      .filter((item) => item.title)
    : fallbackOutline;
  const styleDirections = Array.isArray(record.styleDirections)
    ? record.styleDirections
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6)
    : (fallback?.styleDirections || []);
  const pageCount = typeof record.pageCount === "number" && Number.isFinite(record.pageCount)
    ? clampCount(Math.round(record.pageCount), 2, 20)
    : clampCount(Math.round(fallback?.pageCount || outline.length || 8), 2, 20);
  return {
    title: typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : fallback?.title || "宣传画册方案",
    companyName: typeof record.companyName === "string" && record.companyName.trim()
      ? record.companyName.trim()
      : fallback?.companyName,
    industry: typeof record.industry === "string" && record.industry.trim()
      ? record.industry.trim()
      : fallback?.industry,
    purpose: typeof record.purpose === "string" && record.purpose.trim()
      ? record.purpose.trim()
      : fallback?.purpose,
    pageCount,
    summary: typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : fallback?.summary || `共 ${pageCount} 页的宣传画册规划。`,
    outline: outline.length > 0 ? outline : fallbackOutline,
    styleDirections: styleDirections.length > 0 ? styleDirections : (fallback?.styleDirections || []),
    requestPrompt: typeof record.requestPrompt === "string" && record.requestPrompt.trim()
      ? record.requestPrompt.trim()
      : fallback?.requestPrompt,
  };
}

function normalizeAgentModeAnalysisPayload(
  value: unknown,
  fallback: AgentModeAnalysisResult,
  analysisModel: string,
): AgentModeAnalysisResult {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const intentType = normalizeAgentModeIntentType(record.intentType, fallback.intentType);
  const jobs = Array.isArray(record.jobs)
    ? record.jobs
      .map((item, index) => normalizeAgentModeJobSpec(item, fallback.jobs[index] || fallback.jobs[0]))
      .filter((job) => Boolean(job.prompt))
    : fallback.jobs;
  const brochureProjectSource = record.brochureProject ?? record.project;
  const brochureProject = brochureProjectSource
    ? normalizeAgentModeBrochureProject(brochureProjectSource, fallback.brochureProject)
    : fallback.brochureProject;
  return {
    intentType,
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : fallback.confidence,
    reasoningSummary: typeof record.reasoningSummary === "string" && record.reasoningSummary.trim()
      ? record.reasoningSummary.trim()
      : fallback.reasoningSummary,
    estimatedCostLevel: normalizeAgentModeCostLevel(record.estimatedCostLevel, fallback.estimatedCostLevel),
    requiresConfirmation: typeof record.requiresConfirmation === "boolean"
      ? record.requiresConfirmation
      : fallback.requiresConfirmation,
    autoExecute: typeof record.autoExecute === "boolean" ? record.autoExecute : fallback.autoExecute,
    jobs: jobs.length > 0 ? jobs : fallback.jobs,
    brochureProject: intentType === "brochure_project" || brochureProject ? brochureProject : undefined,
    analysisModel,
    source: "ai",
  };
}

function countAgentModeImages(jobs: AgentModeJobSpec[]) {
  return jobs.reduce((sum, job) => sum + Math.max(1, Math.round(job.count || 1)), 0);
}

function recommendedAgentAspectRatio(prompt: string, fallback = "1:1") {
  if (/(封面|海报|竖版|人物全身|彩页封面)/.test(prompt)) return "3:4";
  if (/(画册|宣传册|内页|横版|跨页|目录|手册)/.test(prompt)) return "4:3";
  if (/(横幅|banner|页眉|头图|展板|宽屏)/i.test(prompt)) return "16:9";
  if (/(logo|图标|头像|方图|方形)/i.test(prompt)) return "1:1";
  return fallback;
}

function recommendedAgentResolution(prompt: string) {
  if (/(宣传册|画册|海报|展板|印刷|高清|高分辨率|封面)/.test(prompt)) return "2K" as const;
  return "1K" as const;
}

function detectRequestedImageCount(prompt: string, fallback = 1) {
  const patterns = [
    /(?:做|生成|出|要|需要|想要|帮我做)\s*([0-9一二三四五六七八九十两]+)\s*张/,
    /([0-9一二三四五六七八九十两]+)\s*张(?:图|图片|海报|方案|视觉|kv)?/,
    /一共\s*([0-9一二三四五六七八九十两]+)\s*张/,
  ];
  for (const pattern of patterns) {
    const matched = prompt.match(pattern)?.[1];
    const count = parseNaturalCountToken(matched || "");
    if (count && count > 0) return clampCount(count, 1, 8);
  }
  return fallback;
}

function detectRequestedPageCount(prompt: string, fallback = 8) {
  const patterns = [
    /([0-9一二三四五六七八九十两]+)\s*页/,
    /共\s*([0-9一二三四五六七八九十两]+)\s*页/,
    /包含\s*([0-9一二三四五六七八九十两]+)\s*页/,
  ];
  for (const pattern of patterns) {
    const matched = prompt.match(pattern)?.[1];
    const count = parseNaturalCountToken(matched || "");
    if (count && count > 0) return clampCount(count, 2, 20);
  }
  return fallback;
}

function extractCompanyName(prompt: string) {
  const patterns = [
    /(?:为|给|帮|替)\s*[「“"]?([^，。,.；;\s]{2,24}?公司)[」”"]?/,
    /([A-Za-z0-9\u4e00-\u9fa5]{2,24}?公司)/,
  ];
  for (const pattern of patterns) {
    const matched = prompt.match(pattern)?.[1]?.trim();
    if (!matched) continue;
    if (/^(我|你|他|她|它|帮我|给我|做一个|做个|一个|一家|某家|某个|这个|那个)/.test(matched)) continue;
    if (/^(制造业公司|科技公司|公司|企业公司)$/.test(matched)) continue;
    if (/(一个|一家|某家|某个).{0,8}公司$/.test(matched)) continue;
    return matched;
  }
  return "";
}

function detectIndustry(prompt: string) {
  const keywordMap: Array<{ pattern: RegExp; value: string }> = [
    { pattern: /(科技|SaaS|软件|AI|人工智能|云服务|数据)/i, value: "科技" },
    { pattern: /(制造|工业|工厂|设备|机械|供应链)/, value: "制造" },
    { pattern: /(医疗|医药|生物|健康|医院)/, value: "医疗" },
    { pattern: /(教育|培训|学校|课程)/, value: "教育" },
    { pattern: /(地产|建筑|空间|园区|楼盘)/, value: "地产" },
    { pattern: /(金融|银行|证券|投资|保险)/, value: "金融" },
    { pattern: /(美妆|护肤|时尚|服饰|珠宝)/, value: "消费品牌" },
    { pattern: /(餐饮|食品|饮品|咖啡|酒水)/, value: "餐饮消费" },
  ];
  return keywordMap.find((item) => item.pattern.test(prompt))?.value || "企业品牌";
}

function detectBrochurePurpose(prompt: string) {
  if (/(宣传画册|宣传册|公司介绍|企业介绍|企业宣传|品牌手册)/.test(prompt)) return "公司宣传";
  if (/(招商|加盟|投资人)/.test(prompt)) return "招商宣传";
  if (/(产品|目录|样本|产品册)/.test(prompt)) return "产品目录";
  if (/(品牌|企业形象)/.test(prompt)) return "品牌介绍";
  if (/(年度|年报|总结)/.test(prompt)) return "年度介绍";
  return "公司宣传";
}

function brochureStyleDirectionsFor(industry: string, prompt: string) {
  if (industry === "科技") {
    return ["科技蓝信息栅格", "极简白底产品提案感", "深色发布会视觉", "未来感数据界面风"];
  }
  if (industry === "制造") {
    return ["工业蓝目录感", "黑银设备质感", "白底参数样本册", "展会招商海报感"];
  }
  if (industry === "医疗") {
    return ["洁净白蓝专业感", "高可信研究型版式", "温和品牌手册感", "器械产品目录感"];
  }
  if (/(高端|奢华|精品|时尚)/.test(prompt)) {
    return ["高端杂志感", "黑金品牌提案感", "留白大片感", "Editorial 视觉陈列风"];
  }
  return ["科技蓝信息栅格", "高端杂志感", "制造业目录感", "招商海报感"];
}

function splitPromptIntoSegments(prompt: string) {
  const prepared = prompt
    .replace(/\r/g, "")
    .replace(/(?=第\s*[0-9一二三四五六七八九十两]+\s*(?:张|幅|图|页))/g, "\n")
    .replace(/(?=\d+\s*[\.、\)]\s*)/g, "\n");
  return prepared
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripSegmentMarker(value: string) {
  return value
    .replace(/^\s*(?:[-*•]\s*)/, "")
    .replace(/^\s*\d+\s*[\.、\)]\s*/, "")
    .replace(/^\s*第\s*[0-9一二三四五六七八九十两]+\s*(?:张|幅|图|页)\s*[:：]?\s*/, "")
    .trim();
}

function extractBrochureTopics(prompt: string) {
  const candidates: Array<{ pattern: RegExp; role: string; title: string; objective: string }> = [
    { pattern: /(品牌导语|品牌介绍|前言|导语)/, role: "intro", title: "品牌导语", objective: "概括品牌定位与主张，建立阅读预期。" },
    { pattern: /(公司介绍|企业简介|企业介绍|公司简介)/, role: "profile", title: "企业简介", objective: "说明公司背景、规模、发展历程与核心业务。" },
    { pattern: /(核心优势|优势介绍|竞争优势)/, role: "advantages", title: "核心优势", objective: "突出技术、团队、供应链或服务的差异化优势。" },
    { pattern: /(产品展示|产品介绍|产品矩阵|服务矩阵|服务介绍)/, role: "products", title: "产品/服务矩阵", objective: "梳理主要产品线、解决方案或服务模块。" },
    { pattern: /(应用场景|解决方案|场景展示)/, role: "scenarios", title: "应用场景", objective: "展示产品或服务在真实业务场景中的价值。" },
    { pattern: /(案例|客户案例|项目案例|成功案例)/, role: "cases", title: "案例展示", objective: "通过项目案例强化可信度与落地能力。" },
    { pattern: /(团队|资质|荣誉|认证)/, role: "team", title: "团队与资质", objective: "呈现团队实力、认证资质、荣誉和合作资源。" },
    { pattern: /(合作方式|联系我们|联系方式|合作流程)/, role: "cta", title: "合作方式", objective: "明确合作流程、联系入口与行动指引。" },
  ];
  return candidates
    .map((item) => ({ ...item, index: prompt.search(item.pattern) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(({ role, title, objective }) => ({ role, title, objective }));
}

function buildLocalBrochureProject(prompt: string): AgentModeBrochureProject {
  const pageCount = detectRequestedPageCount(prompt, 8);
  const companyName = extractCompanyName(prompt);
  const industry = detectIndustry(prompt);
  const purpose = detectBrochurePurpose(prompt);
  const middleTemplates: Array<{ role: string; title: string; objective: string }> = [
    { role: "intro", title: "品牌导语", objective: "概括品牌定位与主张，建立阅读预期。" },
    { role: "profile", title: "企业简介", objective: "说明公司背景、规模、发展历程与核心业务。" },
    { role: "advantages", title: "核心优势", objective: "突出技术、团队、供应链或服务的差异化优势。" },
    { role: "products", title: "产品/服务矩阵", objective: "梳理主要产品线、解决方案或服务模块。" },
    { role: "scenarios", title: "应用场景", objective: "展示产品或服务在真实业务场景中的价值。" },
    { role: "cases", title: "案例展示", objective: "通过项目案例强化可信度与落地能力。" },
    { role: "team", title: "团队与资质", objective: "呈现团队实力、认证资质、荣誉和合作资源。" },
    { role: "cta", title: "合作方式", objective: "明确合作流程、联系入口与行动指引。" },
  ];
  const detectedTopics = extractBrochureTopics(prompt);
  const mergedTemplates = [
    ...detectedTopics,
    ...middleTemplates.filter((template) => !detectedTopics.some((item) => item.role === template.role)),
  ];
  const outline: AgentModeBrochurePage[] = [{
    pageNo: 1,
    role: "cover",
    title: "封面",
    objective: "建立品牌第一印象，突出公司名、主视觉与宣传主题。",
  }];
  const middleCount = Math.max(0, pageCount - 2);
  for (let index = 0; index < middleCount; index += 1) {
    const template = mergedTemplates[index % mergedTemplates.length];
    outline.push({
      pageNo: index + 2,
      role: template.role,
      title: template.title,
      objective: template.objective,
    });
  }
  if (pageCount > 1) {
    outline.push({
      pageNo: pageCount,
      role: "back_cover",
      title: "封底",
      objective: "收束品牌形象，保留联系方式或行动号召。",
    });
  }
  const titleBase = companyName || `${industry}企业`;
  const title = `${titleBase}${purpose === "产品目录" ? "产品画册" : "宣传画册"}`;
  return {
    title,
    companyName: companyName || undefined,
    industry,
    purpose,
    pageCount,
    summary: `识别为 ${pageCount} 页的${purpose}画册需求，建议先生成整本模板板，再逐页细化。`,
    outline,
    styleDirections: brochureStyleDirectionsFor(industry, prompt),
    requestPrompt: prompt,
  };
}

function buildLocalAgentModeAnalysis(body: ProxyBody): AgentModeAnalysisResult {
  const prompt = getString(body, "prompt");
  const aspectRatio = getString(body, "aspectRatio") || "1:1";
  const size = getString(body, "size") || undefined;
  const quality = getString(body, "quality") || "auto";
  const negativePrompt = getString(body, "negativePrompt") || undefined;
  const pageRefineMatch = prompt.match(/第\s*([0-9一二三四五六七八九十两]+)\s*页.*(?:修改|改成|重做|调整|优化|替换|单独再改)/);
  const brochureKeywordScore = [
    /(画册|宣传册|宣传画册|彩页|brochure)/i.test(prompt),
    /(封底|内页|页结构|页数|整本|版式模板)/.test(prompt),
    /第\s*[0-9一二三四五六七八九十两]+\s*页/.test(prompt),
  ].filter(Boolean).length;
  if (pageRefineMatch && brochureKeywordScore > 0) {
    const pageNo = parseNaturalCountToken(pageRefineMatch[1]) || 1;
    return {
      intentType: "page_refine",
      confidence: 0.86,
      reasoningSummary: `识别为宣传画册的单页调整需求，将按第 ${pageNo} 页单独重做。`,
      estimatedCostLevel: "low",
      requiresConfirmation: false,
      autoExecute: true,
      jobs: [{
        id: `page-refine-${pageNo}`,
        title: `第 ${pageNo} 页精修`,
        prompt: `为宣传画册单独重做第 ${pageNo} 页，保持整本视觉体系统一。用户要求：${prompt}`,
        objective: `优化第 ${pageNo} 页的版式、主视觉和信息层级。`,
        aspectRatio: "4:3",
        size,
        resolution: "2K",
        quality,
        negativePrompt,
        count: 1,
      }],
      analysisModel: "local-agent-heuristic",
      source: "local",
    };
  }
  if (brochureKeywordScore >= 2) {
    return {
      intentType: "brochure_project",
      confidence: 0.94,
      reasoningSummary: "识别为公司宣传画册任务，建议先生成整本模板板，再进入逐页细化。",
      estimatedCostLevel: "medium",
      requiresConfirmation: true,
      autoExecute: false,
      jobs: [],
      brochureProject: buildLocalBrochureProject(prompt),
      analysisModel: "local-agent-heuristic",
      source: "local",
    };
  }

  const segments = splitPromptIntoSegments(prompt);
  const explicitImageSegments = segments
    .filter((segment) => /^([-*•]|\d+\s*[\.、\)]|第\s*[0-9一二三四五六七八九十两]+\s*(?:张|幅|图))/.test(segment))
    .map(stripSegmentMarker)
    .filter(Boolean);
  if (explicitImageSegments.length >= 2) {
    const jobs = explicitImageSegments.map((segment, index) => ({
      id: `multi-${index + 1}`,
      title: `第 ${index + 1} 张`,
      prompt: segment,
      objective: "生成一张与其他任务明显区分的独立图片。",
      aspectRatio: recommendedAgentAspectRatio(segment, aspectRatio),
      size,
      resolution: recommendedAgentResolution(segment),
      quality,
      negativePrompt,
      count: 1,
    }));
    return {
      intentType: "multi_image_batch",
      confidence: 0.92,
      reasoningSummary: `识别到 ${jobs.length} 条独立图片需求，已按每张图分别拆解。`,
      estimatedCostLevel: countAgentModeImages(jobs) >= 5 ? "high" : "medium",
      requiresConfirmation: true,
      autoExecute: false,
      jobs,
      analysisModel: "local-agent-heuristic",
      source: "local",
    };
  }

  const requestedCount = detectRequestedImageCount(prompt, 1);
  if (requestedCount > 1) {
    const jobs: AgentModeJobSpec[] = [{
      id: "multi-count-1",
      title: requestedCount > 1 ? `同主题多图 · ${requestedCount} 张` : "图片任务",
      prompt,
      objective: "按同一主题生成多张候选图，可后续继续细分每张图的差异要求。",
      aspectRatio: recommendedAgentAspectRatio(prompt, aspectRatio),
      size,
      resolution: recommendedAgentResolution(prompt),
      quality,
      negativePrompt,
      count: requestedCount,
    }];
    return {
      intentType: "multi_image_batch",
      confidence: 0.8,
      reasoningSummary: `识别到需要 ${requestedCount} 张图片，但未拆出逐张描述，先按同主题多图方案处理。`,
      estimatedCostLevel: requestedCount >= 5 ? "high" : "medium",
      requiresConfirmation: true,
      autoExecute: false,
      jobs,
      analysisModel: "local-agent-heuristic",
      source: "local",
    };
  }

  return {
    intentType: "single_image",
    confidence: 0.96,
    reasoningSummary: "识别为单张图片需求，已准备直接进入生成。",
    estimatedCostLevel: "low",
    requiresConfirmation: false,
    autoExecute: true,
    jobs: [{
      id: "single-1",
      title: "主图生成",
      prompt,
      objective: "根据提示词直接生成单张主图。",
      aspectRatio: recommendedAgentAspectRatio(prompt, aspectRatio),
      size,
      resolution: recommendedAgentResolution(prompt),
      quality,
      negativePrompt,
      count: 1,
    }],
    analysisModel: "local-agent-heuristic",
    source: "local",
  };
}

async function analyzeAgentModeWithGpt(
  baseUrl: string,
  apiKey: string,
  body: ProxyBody,
  requestId?: string,
  callbacks: AnalyzeStreamCallbacks = {},
) {
  const analysisModel = getString(body, "analysisModel");
  const prompt = getString(body, "prompt");
  if (!analysisModel) throw new Error("分析模型不能为空");
  if (!prompt) throw new Error("提示词不能为空");
  if (!apiKey) throw new Error("API Key 不能为空");

  const localFallback = buildLocalAgentModeAnalysis(body);
  const context = {
    prompt,
    protocol: getString(body, "protocol"),
    imageModel: getString(body, "imageModel"),
    aspectRatio: getString(body, "aspectRatio"),
    size: getString(body, "size"),
    resolution: getString(body, "resolution"),
    quality: getString(body, "quality"),
    outputFormat: getString(body, "outputFormat"),
    count: getNumber(body.count),
    referenceCount: getNumber(body.referenceCount) || 0,
  };
  const systemPrompt = [
    "你是一个图片生成 Agent 的任务拆解器。",
    "你要识别用户当前输入属于 single_image、multi_image_batch、brochure_project 或 page_refine 哪一种。",
    "如果是多图任务，要尽量拆成逐张独立 job；如果只是说明总张数但没有逐张差异，也可以返回 1 个 job 并把 count 设为总数。",
    "如果是宣传画册任务，不要直接输出 jobs，而是返回 brochureProject，包含 title, companyName, industry, purpose, pageCount, summary, outline, styleDirections, requestPrompt。",
    "outline 每项包含 pageNo, role, title, objective。styleDirections 返回 3 到 6 个方向。",
    "如果是 page_refine，需要输出 1 个 job，说明是某一页单独重做。",
    "只返回 JSON，不要使用 Markdown。",
    "JSON 顶层字段必须包含 intentType, confidence, reasoningSummary, estimatedCostLevel, requiresConfirmation, autoExecute, jobs, brochureProject。",
    "estimatedCostLevel 只能是 low、medium、high。confidence 范围 0 到 1。",
    "每个 job 可包含 id, title, prompt, objective, negativePrompt, aspectRatio, size, resolution, quality, count。",
  ].join("\n");

  const upstreamPayload = {
    model: analysisModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(context, null, 2) },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
    stream: true,
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
      Accept: "text/event-stream",
    },
    body: JSON.stringify(upstreamPayload),
  }, 60_000);
  callbacks.onUpstreamConnected?.(response.status);
  if (!response.ok) {
    const bodyText = await response.text();
    const detail = detailFromUpstream(response.status, bodyText);
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({
          ok: false,
          status: response.status,
          detail,
          rawContent: truncateText(bodyText, 4000),
        }),
      });
    }
    throw detail;
  }
  if (!response.body) {
    throw new Error("上游返回空响应体");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let firstByteReported = false;
  let finishReason: string | undefined;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!firstByteReported) {
        callbacks.onFirstByte?.();
        firstByteReported = true;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") continue;
        let chunk: unknown;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          continue;
        }
        const choice = chunk && typeof chunk === "object"
          ? ((chunk as { choices?: unknown }).choices as Array<Record<string, unknown>> | undefined)?.[0]
          : undefined;
        const delta = choice && typeof choice === "object" ? (choice.delta as Record<string, unknown> | undefined) : undefined;
        const deltaContent = delta && typeof delta.content === "string" ? delta.content : "";
        if (deltaContent) {
          accumulated += deltaContent;
          callbacks.onChunk?.(deltaContent, accumulated);
        }
        if (typeof choice?.finish_reason === "string") {
          finishReason = choice.finish_reason as string;
        }
      }
    }
    if (buffer.startsWith("data:")) {
      const tail = buffer.slice(5).trim();
      if (tail && tail !== "[DONE]") {
        try {
          const chunk = JSON.parse(tail);
          const deltaContent = (chunk?.choices?.[0]?.delta?.content as string) || "";
          if (deltaContent) {
            accumulated += deltaContent;
            callbacks.onChunk?.(deltaContent, accumulated);
          }
        } catch {
          // ignore trailing partial
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  if (!accumulated.trim()) {
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({ ok: false, status: response.status, error: "Agent 分析 stream 没有返回任何内容", finishReason }),
      });
    }
    throw new Error("分析模型返回空内容");
  }

  const analysis = parseMaybeJson(extractJsonObject(accumulated));
  if (!analysis || typeof analysis !== "object") {
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({
          ok: false,
          status: response.status,
          error: "Agent 分析模型没有返回可解析的 JSON",
          finishReason,
          rawContent: truncateText(accumulated, 4000),
        }),
      });
    }
    throw new Error("Agent 分析结果不是有效 JSON");
  }
  const normalized = normalizeAgentModeAnalysisPayload(analysis, localFallback, analysisModel);
  if (requestId) {
    updateRequestLog(requestId, {
      responseBody: sanitizeForLog({
        ok: true,
        status: response.status,
        finishReason,
        rawContent: truncateText(accumulated, 4000),
        analysis: normalized,
      }),
    });
  }
  return normalized;
}

type AnalyzeStreamCallbacks = {
  onUpstreamConnected?: (status: number) => void;
  onFirstByte?: () => void;
  onChunk?: (delta: string, accumulated: string) => void;
};

async function analyzePromptWithGpt(
  baseUrl: string,
  apiKey: string,
  body: ProxyBody,
  requestId?: string,
  callbacks: AnalyzeStreamCallbacks = {},
) {
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
    stream: true,
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
      Accept: "text/event-stream",
    },
    body: JSON.stringify(upstreamPayload),
  }, 60_000);
  callbacks.onUpstreamConnected?.(response.status);
  if (!response.ok) {
    const errorText = await response.text();
    const detail = detailFromUpstream(response.status, errorText);
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({ ok: false, status: response.status, detail, errorRaw: truncateText(errorText, 2500) }),
      });
    }
    throw detail;
  }
  if (!response.body) {
    throw new Error("上游返回空响应体");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let firstByteReported = false;
  let finishReason: string | undefined;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!firstByteReported) {
        callbacks.onFirstByte?.();
        firstByteReported = true;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === "[DONE]") continue;
        let chunk: unknown;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          continue;
        }
        const choice = chunk && typeof chunk === "object"
          ? ((chunk as { choices?: unknown }).choices as Array<Record<string, unknown>> | undefined)?.[0]
          : undefined;
        const delta = choice && typeof choice === "object" ? (choice.delta as Record<string, unknown> | undefined) : undefined;
        const deltaContent = delta && typeof delta.content === "string" ? delta.content : "";
        if (deltaContent) {
          accumulated += deltaContent;
          callbacks.onChunk?.(deltaContent, accumulated);
        }
        if (typeof choice?.finish_reason === "string") {
          finishReason = choice.finish_reason as string;
        }
      }
    }
    if (buffer.startsWith("data:")) {
      const tail = buffer.slice(5).trim();
      if (tail && tail !== "[DONE]") {
        try {
          const chunk = JSON.parse(tail);
          const deltaContent = (chunk?.choices?.[0]?.delta?.content as string) || "";
          if (deltaContent) {
            accumulated += deltaContent;
            callbacks.onChunk?.(deltaContent, accumulated);
          }
        } catch {
          // ignore trailing partial
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  if (!accumulated.trim()) {
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({ ok: false, status: response.status, error: "上游 stream 没有返回任何内容", finishReason }),
      });
    }
    throw new Error("分析模型返回空内容");
  }

  const analysis = parseMaybeJson(extractJsonObject(accumulated));
  if (!analysis || typeof analysis !== "object") {
    if (requestId) {
      updateRequestLog(requestId, {
        responseBody: sanitizeForLog({
          ok: false,
          status: response.status,
          error: "分析模型没有返回可解析的 JSON",
          finishReason,
          rawContent: truncateText(accumulated, 4000),
          accumulatedBytes: Buffer.byteLength(accumulated, "utf8"),
        }),
      });
    }
    throw new Error("分析模型没有返回可解析的 JSON");
  }
  const normalizedAnalysis = normalizeAnalysisPayload(analysis, analysisModel);
  if (requestId) {
    updateRequestLog(requestId, {
      responseBody: sanitizeForLog({
        ok: true,
        status: response.status,
        finishReason,
        accumulatedBytes: Buffer.byteLength(accumulated, "utf8"),
        rawContent: truncateText(accumulated, 4000),
        analysis: normalizedAnalysis,
      }),
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
  if (request.aspectRatio && protocol === "custom-openai" && !isGptImage2Model(request.model)) payload.aspect_ratio = request.aspectRatio;
  if (protocol === "custom-openai" && !isGptImage2Model(request.model) && request.resolution && request.resolution !== "1K") {
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
  const imageConfig: Record<string, unknown> = {
    aspectRatio: request.aspectRatio || "1:1",
  };
  if (isGemini3ProImageModel(request.model)) {
    imageConfig.imageSize = normalizeResolution(request.resolution);
  }
  const upstreamPayload = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig,
    },
  };
  if (requestId) {
    updateRequestLog(requestId, {
      endpoint: `${GEMINI_NATIVE_API_PREFIX}/models/${modelName(request.model)}:generateContent`,
      upstreamPayloadKeys: Object.keys(upstreamPayload),
      upstreamReferenceCount: references.length,
      upstreamReferenceMode: references.length ? "gemini:parts:inline_data" : "none",
      upstreamSize: typeof imageConfig.imageSize === "string" ? imageConfig.imageSize : undefined,
      upstreamRequest: sanitizeForLog(upstreamPayload),
    });
  }
  const response = await fetchWithTimeout(endpoint(baseUrl, `${GEMINI_NATIVE_API_PREFIX}/models/${modelName(request.model)}:generateContent`), {
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
    const path = protocol === "gemini-native" ? `${GEMINI_NATIVE_API_PREFIX}/models` : "/models";
    const response = await fetchWithTimeout(endpoint(baseUrl, path), {
      headers: { "x-goog-api-key": apiKey },
    });
    const text = await response.text();
    if (!response.ok) throw detailFromUpstream(response.status, text);
    const payload = parseMaybeJson(text);
    let models = extractModelIds(payload, "models");
    if (protocol === "google-imagen") {
      models = models.filter((model) => model.toLowerCase().includes("imagen"));
    }
    return { models: [...new Set([...DEFAULT_MODELS[protocol], ...models])], raw: payload };
  }

  const path = protocol === "gemini-openai" ? "/models" : "/v1/models";
  const response = await fetchWithTimeout(endpoint(baseUrl, path), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  if (!response.ok) throw detailFromUpstream(response.status, text);
  const payload = parseMaybeJson(text);
  const models = extractModelIds(payload, "data");
  return { models: [...new Set([...DEFAULT_MODELS[protocol], ...models])], raw: payload };
}

async function handleSquareFeed(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const tab = normalizeSquareFeedTab(url.searchParams.get("tab"));
  const limit = Math.max(1, Math.min(SQUARE_MAX_FEED_LIMIT, Number(url.searchParams.get("limit")) || SQUARE_MAX_FEED_LIMIT));
  const offset = squareCursorOffset(url.searchParams.get("cursor"));
  const apiKey = String(req.headers["x-sumapi-api-key"] || "").trim();
  const viewerHash = apiKey ? hashApiKey(apiKey) : "";
  const store = readSquareStore();
  const sorted = sortSquareItems(squareActiveItems(store), tab);
  const items = sorted.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  sendJson(res, 200, {
    ok: true,
    tab,
    items: items.map((item) => squareFeedItem(item, store, tab, viewerHash, squareRankScoreCache.get(item))),
    nextCursor: nextOffset < sorted.length ? squareNextCursor(nextOffset) : "",
    hasMore: nextOffset < sorted.length,
  });
}

async function handleSquareQuota(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const apiKey = String(req.headers["x-sumapi-api-key"] || "").trim();
  if (!apiKey) {
    sendJson(res, 401, { ok: false, error: "推荐和点赞需要先配置 API Key" });
    return;
  }
  const apiKeyHash = hashApiKey(apiKey);
  const store = readSquareStore();
  const quota = getSquareQuota(store, apiKeyHash);
  writeSquareStore(store);
  sendJson(res, 200, {
    ok: true,
    dailyRecommendUsed: quota.dailyRecommendUsed,
    dailyRecommendLeft: squareRemainingRecommendQuota(quota),
    dailyLikeUsed: quota.dailyLikeUsed,
    dailyLikeLeft: squareRemainingLikeQuota(quota),
    shelfCount: squareShelfCount(store, apiKeyHash),
    shelfLimit: SQUARE_SHELF_LIMIT,
    dayKey: quota.dateKey,
  });
}

async function handleSquareRecommend(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const requestId = randomUUID();
  const clientMeta = squareClientMeta(req);
  try {
    const body = await readJsonBody(req);
    const apiKey = getString(body, "apiKey");
    if (!apiKey) {
      sendJson(res, 401, { ok: false, status: "rejected", action: "rejected", error: "推荐到广场需要先配置 API Key" });
      return;
    }
    const apiKeyHash = hashApiKey(apiKey);
    const store = readSquareStore();
    const quota = getSquareQuota(store, apiKeyHash);
    const reject = (status: number, reasonCode: string, error: string, extra: Partial<SquareRecommendLog> = {}) => {
      appendSquareRecommendLog(store, {
        requestId,
        apiKeyHash,
        action: "rejected",
        result: "rejected",
        reasonCode,
        remainingDailyQuota: squareRemainingRecommendQuota(quota),
        remainingShelfSlots: Math.max(0, SQUARE_SHELF_LIMIT - squareShelfCount(store, apiKeyHash)),
        ...clientMeta,
        ...extra,
      });
      writeSquareStore(store);
      sendJson(res, status, {
        ok: false,
        status: "rejected",
        action: "rejected",
        reasonCode,
        error,
        remainingDailyQuota: squareRemainingRecommendQuota(quota),
        remainingShelfSlots: Math.max(0, SQUARE_SHELF_LIMIT - squareShelfCount(store, apiKeyHash)),
      });
    };

    if (quota.dailyRecommendUsed >= SQUARE_DAILY_RECOMMEND_LIMIT) {
      reject(429, "daily_recommend_quota_exceeded", "今日推荐额度已满");
      return;
    }
    quota.dailyRecommendUsed += 1;
    quota.updatedAt = Date.now();

    const sourceImageMeta = getRecord(body.sourceImageMeta);
    const params = getRecord(body.params);
    const thumbnailDataUrl = getString(body, "thumbnailDataUrl")
      || getNestedString(sourceImageMeta, "thumbnailDataUrl")
      || getNestedString(sourceImageMeta, "imageDataUrl");
    const imageId = getString(body, "imageId") || getNestedString(sourceImageMeta, "imageId") || randomUUID();
    const prompt = getString(body, "prompt");
    const caption = getString(body, "caption") || truncateText(prompt.replace(/\s+/g, " "), 140);
    const sourceType = getString(body, "sourceType") || "local_history";
    const model = getString(body, "model") || getNestedString(sourceImageMeta, "model") || "unknown";
    const width = getNumber(body.width) || getNestedNumber(sourceImageMeta, "width");
    const height = getNumber(body.height) || getNestedNumber(sourceImageMeta, "height");
    const reasonPlan = body.reasonPlan;
    const promptHash = prompt ? hashText(prompt, 32) : undefined;

    if (!thumbnailDataUrl) {
      reject(400, "missing_square_thumbnail", "缺少广场展示图", { imageId, promptHash, sourceType });
      return;
    }
    if (!/^data:image\/[a-zA-Z+.-]+;base64,/.test(thumbnailDataUrl)) {
      reject(400, "invalid_square_thumbnail", "广场展示图格式无效", { imageId, promptHash, sourceType });
      return;
    }
    const thumbnailBytes = imageBytesFromDataUrl(thumbnailDataUrl);
    if (thumbnailBytes <= 0 || thumbnailBytes > SQUARE_MAX_IMAGE_BYTES) {
      reject(413, "square_thumbnail_too_large", "广场展示图过大，请压缩后再推荐", { imageId, promptHash, sourceType });
      return;
    }
    if (!prompt) {
      reject(400, "missing_prompt", "推荐到广场需要保留提示词", { imageId, sourceType });
      return;
    }
    const moderationReason = moderationReasonForSquareText(prompt, caption);
    if (moderationReason) {
      appendSquareModerationAudit(store, {
        requestId,
        apiKeyHash,
        imageId,
        event: "recommend_rejected",
        reasonCode: moderationReason,
        severity: "high",
        ...clientMeta,
        detail: sanitizeForLog({ prompt, caption }),
      });
      reject(422, moderationReason, "内容需要人工复核，暂不进入广场", { imageId, promptHash, sourceType });
      return;
    }
    if (recentSquareRecommendCount(store, apiKeyHash, 60_000) >= 8) {
      appendSquareModerationAudit(store, {
        requestId,
        apiKeyHash,
        imageId,
        event: "recommend_backoff",
        reasonCode: "rapid_submit_backoff",
        severity: "medium",
        ...clientMeta,
      });
      reject(429, "rapid_submit_backoff", "提交过于频繁，请稍后再试", { imageId, promptHash, sourceType });
      return;
    }

    const imageHash = hashImageDataUrl(thumbnailDataUrl);
    const duplicatedBySelf = squareActiveItems(store).find((item) => item.recommenderHash === apiKeyHash && item.imageHash === imageHash);
    if (duplicatedBySelf) {
      appendSquareModerationAudit(store, {
        requestId,
        apiKeyHash,
        itemId: duplicatedBySelf.id,
        imageId,
        event: "duplicate_content",
        reasonCode: "duplicate_active_item",
        severity: "low",
        ...clientMeta,
      });
      reject(409, "duplicate_active_item", "这张图已经在你的广场展示位中", { imageId, itemId: duplicatedBySelf.id, imageHash, promptHash, sourceType });
      return;
    }

    const now = Date.now();
    const activeByKey = squareActiveItems(store)
      .filter((item) => item.recommenderHash === apiKeyHash)
      .sort((a, b) => a.createdAt - b.createdAt);
    const action: "added" | "replaced" = activeByKey.length >= SQUARE_SHELF_LIMIT ? "replaced" : "added";
    const replaced = action === "replaced" ? activeByKey[0] : undefined;
    const itemId = randomUUID();
    if (replaced) {
      replaced.active = false;
      replaced.replacedById = itemId;
      replaced.updatedAt = now;
    }

    const item: SquareItem = {
      id: itemId,
      imageId,
      requestId: getNestedString(sourceImageMeta, "requestId") || undefined,
      thumbnailDataUrl,
      imageHash,
      prompt: truncateText(prompt, 4000),
      caption: truncateText(caption || prompt, 240),
      model: truncateText(model, 240),
      params: sanitizeForLog(params) as Record<string, unknown>,
      width,
      height,
      aspectRatio: getNestedString(sourceImageMeta, "aspectRatio") || (typeof params.aspectRatio === "string" ? params.aspectRatio : undefined),
      sourceType,
      reasonPlan: sanitizeForLog(reasonPlan),
      recommenderHash: apiKeyHash,
      recommenderLabel: `创作者 ${apiKeyHash.slice(0, 6)}`,
      pageLabel: getNestedString(sourceImageMeta, "pageLabel") || undefined,
      active: true,
      featured: Boolean(body.featured),
      likeCount: 0,
      qualityScore: squareQualityScore(width, height, prompt),
      trustScore: 72,
      createdAt: now,
      updatedAt: now,
    };
    store.items.unshift(item);

    const sameImageFromOthers = squareActiveItems(store).find((candidate) => candidate.id !== item.id && candidate.imageHash === imageHash);
    if (sameImageFromOthers) {
      appendSquareModerationAudit(store, {
        requestId,
        apiKeyHash,
        itemId,
        imageId,
        event: "duplicate_content_warning",
        reasonCode: "same_image_hash_seen",
        severity: "low",
        ...clientMeta,
      });
    }

    appendSquareRecommendLog(store, {
      requestId,
      apiKeyHash,
      imageId,
      itemId,
      action,
      result: "success",
      reasonCode: action === "replaced" ? "shelf_limit_replaced_oldest" : "added_to_square",
      replacedItemId: replaced?.id,
      remainingDailyQuota: squareRemainingRecommendQuota(quota),
      remainingShelfSlots: Math.max(0, SQUARE_SHELF_LIMIT - squareShelfCount(store, apiKeyHash)),
      ...clientMeta,
      promptHash,
      imageHash,
      sourceType,
    });
    writeSquareStore(store);
    sendJson(res, 200, {
      ok: true,
      status: "accepted",
      action,
      item: squareFeedItem(item, store, "latest", apiKeyHash),
      remainingDailyQuota: squareRemainingRecommendQuota(quota),
      remainingShelfSlots: Math.max(0, SQUARE_SHELF_LIMIT - squareShelfCount(store, apiKeyHash)),
      replacedItemId: replaced?.id,
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, requestId, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleSquareLike(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const requestId = randomUUID();
  const clientMeta = squareClientMeta(req);
  try {
    const body = await readJsonBody(req);
    const apiKey = getString(body, "apiKey");
    const itemId = getString(body, "itemId");
    const action = getString(body, "action") === "unlike" ? "unlike" : "like";
    if (!apiKey) {
      sendJson(res, 401, { ok: false, status: "rejected", error: "点赞需要先配置 API Key" });
      return;
    }
    const apiKeyHash = hashApiKey(apiKey);
    const store = readSquareStore();
    const quota = getSquareQuota(store, apiKeyHash);
    const item = store.items.find((candidate) => candidate.id === itemId && candidate.active !== false);
    if (!item) {
      sendJson(res, 404, { ok: false, status: "rejected", error: "广场作品不存在或已被替换" });
      return;
    }
    const existing = store.likes.find((like) => like.apiKeyHash === apiKeyHash && like.itemId === itemId);
    const log = (result: SquareLikeLog["result"], reasonCode: string) => {
      appendSquareLikeLog(store, {
        requestId,
        apiKeyHash,
        itemId,
        action,
        result,
        reasonCode,
        likeCount: item.likeCount || 0,
        remainingLikeQuota: squareRemainingLikeQuota(quota),
        ...clientMeta,
      });
    };

    if (action === "like") {
      if (existing?.liked) {
        log("noop", "already_liked");
        writeSquareStore(store);
        sendJson(res, 200, {
          ok: true,
          status: "liked",
          action: "noop",
          likeCount: item.likeCount || 0,
          remainingLikeQuota: squareRemainingLikeQuota(quota),
        });
        return;
      }
      if (quota.dailyLikeUsed >= SQUARE_DAILY_LIKE_LIMIT) {
        log("rejected", "daily_like_quota_exceeded");
        writeSquareStore(store);
        sendJson(res, 429, {
          ok: false,
          status: "rejected",
          action: "rejected",
          reasonCode: "daily_like_quota_exceeded",
          error: "今日点赞额度已满",
          likeCount: item.likeCount || 0,
          remainingLikeQuota: 0,
        });
        return;
      }
      quota.dailyLikeUsed += 1;
      quota.updatedAt = Date.now();
      if (existing) {
        existing.liked = true;
        existing.updatedAt = Date.now();
      } else {
        store.likes.unshift({
          apiKeyHash,
          itemId,
          liked: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      item.likeCount = Math.max(0, (item.likeCount || 0) + 1);
      item.updatedAt = Date.now();
      log("success", "liked");
      writeSquareStore(store);
      sendJson(res, 200, {
        ok: true,
        status: "liked",
        action: "liked",
        likeCount: item.likeCount,
        remainingLikeQuota: squareRemainingLikeQuota(quota),
      });
      return;
    }

    let didUnlike = false;
    if (existing?.liked) {
      existing.liked = false;
      existing.updatedAt = Date.now();
      item.likeCount = Math.max(0, (item.likeCount || 0) - 1);
      item.updatedAt = Date.now();
      log("success", "unliked");
      didUnlike = true;
    } else {
      if (!existing) {
        store.likes.unshift({
          apiKeyHash,
          itemId,
          liked: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      log("noop", "already_unliked");
    }
    writeSquareStore(store);
    sendJson(res, 200, {
      ok: true,
      status: "unliked",
      action: didUnlike ? "unliked" : "noop",
      likeCount: item.likeCount || 0,
      remainingLikeQuota: squareRemainingLikeQuota(quota),
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, requestId, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleSquareAdminOverview(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const auth = getSquareAdminAuth(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, mustChangePassword: auth.mustChangePassword });
    return;
  }
  const store = readSquareStore();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const trend = Array.from({ length: 14 }, (_, index) => {
    const dateKey = squareDayKey(now - (13 - index) * oneDay);
    const recommendLogs = store.recommendLogs.filter((log) => squareDayKey(log.timestamp) === dateKey);
    const likeLogs = store.likeLogs.filter((log) => squareDayKey(log.timestamp) === dateKey);
    return {
      dateKey,
      recommendAttempts: recommendLogs.length,
      added: recommendLogs.filter((log) => log.action === "added").length,
      replaced: recommendLogs.filter((log) => log.action === "replaced").length,
      rejected: recommendLogs.filter((log) => log.result === "rejected").length,
      likes: likeLogs.filter((log) => log.result === "success" && log.action === "like").length,
      unlikes: likeLogs.filter((log) => log.result === "success" && log.action === "unlike").length,
    };
  });
  const rejectedReasons = store.recommendLogs
    .filter((log) => log.result === "rejected")
    .reduce<Record<string, number>>((acc, log) => {
      acc[log.reasonCode || "unknown"] = (acc[log.reasonCode || "unknown"] || 0) + 1;
      return acc;
    }, {});
  const activeItems = squareActiveItems(store);
  const totalPublished = store.recommendLogs.filter((log) => log.action === "added" || log.action === "replaced").length;
  const totalReplaced = store.recommendLogs.filter((log) => log.action === "replaced").length;
  sendJson(res, 200, {
    ok: true,
    overview: {
      activeItems: activeItems.length,
      totalItems: store.items.length,
      totalRecommendAttempts: store.recommendLogs.length,
      totalLikes: store.likeLogs.filter((log) => log.result === "success" && log.action === "like").length,
      replacementRate: totalPublished ? Math.round((totalReplaced / totalPublished) * 1000) / 10 : 0,
      likeRate: activeItems.length ? Math.round((activeItems.reduce((sum, item) => sum + (item.likeCount || 0), 0) / activeItems.length) * 10) / 10 : 0,
      trend,
      rejectedReasonTop: Object.entries(rejectedReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reasonCode, count]) => ({ reasonCode, count })),
      riskEvents: store.moderationAudits.slice(0, 80),
    },
  });
}

async function handleSquareAdminExport(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  const auth = getSquareAdminAuth(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, mustChangePassword: auth.mustChangePassword });
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  const format = url.searchParams.get("format") || "json";
  const dateKey = url.searchParams.get("dateKey") || squareDayKey();
  const store = readSquareStore();
  const exportedAt = new Date().toISOString();
  const recommendLogs = store.recommendLogs.filter((log) => squareDayKey(log.timestamp) === dateKey);
  const likeLogs = store.likeLogs.filter((log) => squareDayKey(log.timestamp) === dateKey);
  const moderationAudits = store.moderationAudits.filter((audit) => squareDayKey(audit.timestamp) === dateKey);
  const relatedItemIds = new Set<string>();
  recommendLogs.forEach((log) => {
    if (log.itemId) relatedItemIds.add(log.itemId);
    if (log.replacedItemId) relatedItemIds.add(log.replacedItemId);
  });
  likeLogs.forEach((log) => relatedItemIds.add(log.itemId));
  moderationAudits.forEach((audit) => {
    if (audit.itemId) relatedItemIds.add(audit.itemId);
  });
  const items = store.items.filter((item) => squareDayKey(item.createdAt) === dateKey || relatedItemIds.has(item.id));
  if (format === "csv") {
    const rows = [
      ["type", "timestamp", "requestId", "apiKeyHash", "itemId", "imageId", "action", "result", "reasonCode", "replacedItemId", "remainingDailyQuota", "remainingShelfSlots", "likeCount", "remainingLikeQuota", "ipHash", "uaHash"],
      ...recommendLogs.map((log) => [
        "recommend",
        new Date(log.timestamp).toISOString(),
        log.requestId,
        log.apiKeyHash,
        log.itemId || "",
        log.imageId || "",
        log.action,
        log.result,
        log.reasonCode,
        log.replacedItemId || "",
        String(log.remainingDailyQuota),
        String(log.remainingShelfSlots),
        "",
        "",
        log.ipHash,
        log.uaHash,
      ]),
      ...likeLogs.map((log) => [
        "like",
        new Date(log.timestamp).toISOString(),
        log.requestId,
        log.apiKeyHash,
        log.itemId,
        "",
        log.action,
        log.result,
        log.reasonCode,
        "",
        "",
        "",
        String(log.likeCount),
        String(log.remainingLikeQuota),
        log.ipHash,
        log.uaHash,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="sumapi-square-audit-${dateKey}-${exportedAt.replace(/[:.]/g, "-")}.csv"`);
    res.end(csv);
    appendAuditLog(auth.user.username, "admin_export_square_logs", `dateKey=${dateKey} format=csv count=${recommendLogs.length + likeLogs.length}`);
    return;
  }
  const payload = {
    exportedAt,
    exportedBy: auth.user.username,
    schemaVersion: 1,
    dateKey,
    items: items.map(squareItemForExport),
    recommendLogs,
    likeLogs,
    quotas: store.quotas.filter((quota) => quota.dateKey === dateKey),
    moderationAudits,
    counts: {
      items: items.length,
      activeItems: items.filter((item) => item.active !== false).length,
      recommendLogs: recommendLogs.length,
      likeLogs: likeLogs.length,
      quotas: store.quotas.filter((quota) => quota.dateKey === dateKey).length,
      moderationAudits: moderationAudits.length,
    },
  };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", `attachment; filename="sumapi-square-audit-${dateKey}-${exportedAt.replace(/[:.]/g, "-")}.json"`);
  res.end(JSON.stringify(payload, null, 2));
  appendAuditLog(auth.user.username, "admin_export_square_logs", `dateKey=${dateKey} format=json count=${recommendLogs.length + likeLogs.length}`);
}

function registerImageProxyMiddlewares(server: ViteDevServer | PreviewServer) {
      ensureAdminStore();
      ensureSquareStore();
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

      server.middlewares.use("/api/square/image/", (req, res) => {
        const itemId = decodeURIComponent((req.url || "/").split("?")[0]?.replace(/^\/+/, "") || "");
        if (!itemId) { sendJson(res, 400, { ok: false, error: "missing item id" }); return; }
        const store = readSquareStore();
        const item = store.items.find((candidate) => candidate.id === itemId);
        if (!item || !item.thumbnailDataUrl) { sendJson(res, 404, { ok: false, error: "not found" }); return; }
        const match = item.thumbnailDataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.*)$/);
        if (!match) { sendJson(res, 500, { ok: false, error: "invalid data" }); return; }
        const bytes = Buffer.from(match[2], "base64");
        res.statusCode = 200;
        res.setHeader("Content-Type", match[1]);
        res.setHeader("Content-Length", String(bytes.length));
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        if (req.method === "HEAD") { res.end(); return; }
        res.end(bytes);
      });

      server.middlewares.use("/api/square/feed", (req, res) => {
        void handleSquareFeed(req, res);
      });

      server.middlewares.use("/api/square/quota", (req, res) => {
        void handleSquareQuota(req, res);
      });

      server.middlewares.use("/api/square/recommend", (req, res) => {
        void handleSquareRecommend(req, res);
      });

      server.middlewares.use("/api/square/like", (req, res) => {
        void handleSquareLike(req, res);
      });

      server.middlewares.use("/api/square/admin/overview", (req, res) => {
        void handleSquareAdminOverview(req, res);
      });

      server.middlewares.use("/api/square/admin/export", (req, res) => {
        void handleSquareAdminExport(req, res);
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
            const filename = `sumapi-logs-${exportedAt.replace(/[:.]/g, "-")}.json`;
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
          const baseUrl = normalizeApiBaseUrl(getString(body, "baseUrl"));
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
          const status = isApiBaseUrlError(error) ? 400 : upstreamStatus || 500;
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

        // SSE 框架。一旦第一行写出去 res.statusCode 就锁死了，所以异常路径
        // 在 send/end 都用 SSE 帧（status: 200，错误塞 event: error）。
        let sseStarted = false;
        let chunkCount = 0;
        let lastChunkAt = 0;
        const sse = (event: string, data: unknown) => {
          if (!sseStarted) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            res.flushHeaders?.();
            sseStarted = true;
          }
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
          const body = await readJsonBody(req);
          const baseUrl = normalizeApiBaseUrl(getString(body, "baseUrl"));
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

          sse("started", { requestId, model: analysisModel, startedAt });

          const analysis = await analyzePromptWithGpt(baseUrl, apiKey, body, requestId, {
            onUpstreamConnected: (status) => {
              sse("upstream_connected", { status, elapsedMs: Date.now() - startedAt });
            },
            onFirstByte: () => {
              sse("receiving", { elapsedMs: Date.now() - startedAt });
              if (logCreated) {
                updateRequestLog(requestId, {
                  upstreamRequest: undefined as never,  // 留空，避免覆盖之前 sanitizeForLog 写入的内容
                });
              }
            },
            onChunk: (delta, accumulated) => {
              chunkCount += 1;
              lastChunkAt = Date.now();
              sse("chunk", {
                delta,
                totalLength: accumulated.length,
                preview: truncateText(accumulated, 420),
              });
            },
          });

          const finishedAt = Date.now();
          updateRequestLog(requestId, {
            status: "success",
            httpStatus: 200,
            finishedAt,
            durationMs: finishedAt - startedAt,
          });
          sse("done", { requestId, analysis, durationMs: finishedAt - startedAt, chunkCount });
          res.end();
        } catch (error) {
          const detail = error && typeof error === "object" && "error" in error
            ? error
            : { error: error instanceof Error ? error.message : String(error) };
          const status = isApiBaseUrlError(error) ? 400 : httpStatusFromDetail(detail) || httpStatusFromDetail(error) || 500;
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
              responseBody: sanitizeForLog({
                ok: false,
                status,
                detail,
                chunkCount,
                lastChunkAt: lastChunkAt ? lastChunkAt - startedAt : null,
              }),
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
          }
          if (sseStarted) {
            sse("error", { requestId, status, detail, chunkCount });
            res.end();
          } else {
            sendJson(res, status, { ok: false, requestId, detail });
          }
        }
      });

      server.middlewares.use("/api/agent/analyze", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        const requestId = randomUUID();
        const startedAt = Date.now();
        let logCreated = false;
        let sseStarted = false;
        let chunkCount = 0;
        let lastChunkAt = 0;
        const sse = (event: string, data: unknown) => {
          if (!sseStarted) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("Connection", "keep-alive");
            res.setHeader("X-Accel-Buffering", "no");
            res.flushHeaders?.();
            sseStarted = true;
          }
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
          const body = await readJsonBody(req);
          const baseUrl = normalizeApiBaseUrl(getString(body, "baseUrl") || DEFAULT_API_BASE_URL);
          const apiKey = getString(body, "apiKey");
          const protocol = getProtocol(body.protocol);
          const clientId = getString(body, "clientId") || "anonymous";
          const analysisModel = getString(body, "analysisModel");
          const prompt = getString(body, "prompt");

          if (!prompt) {
            sendJson(res, 400, {
              ok: false,
              requestId,
              detail: { status: 400, error: "提示词不能为空" },
            });
            return;
          }

          createRequestLog({
            requestId,
            requestType: "agent_analysis",
            clientId: truncateText(clientId, 120),
            clientUserAgent: truncateText(req.headers["user-agent"] || "", 500),
            clientIpHash: hashClientIp(req),
            protocol,
            apiBaseUrl: baseUrl.replace(/\/+$/, ""),
            ...apiKeyLogMeta(apiKey),
            endpoint: "/api/agent/analyze",
            model: truncateText(analysisModel || "local-agent-heuristic", 240),
            prompt: truncateText(prompt, 4000),
            negativePrompt: getString(body, "negativePrompt") ? truncateText(getString(body, "negativePrompt"), 2400) : undefined,
            aspectRatio: getString(body, "aspectRatio") || undefined,
            size: getString(body, "size") || undefined,
            resolution: getString(body, "resolution") || undefined,
            quality: getString(body, "quality") || undefined,
            outputFormat: getString(body, "outputFormat") || undefined,
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

          sse("started", { requestId, model: analysisModel || "local-agent-heuristic", startedAt });

          const localAnalysis = buildLocalAgentModeAnalysis(body);
          let analysis = localAnalysis;
          let fallbackReason = "";

          if (analysisModel && apiKey) {
            try {
              analysis = await analyzeAgentModeWithGpt(baseUrl, apiKey, body, requestId, {
                onUpstreamConnected: (status) => {
                  sse("upstream_connected", { status, elapsedMs: Date.now() - startedAt });
                },
                onFirstByte: () => {
                  sse("receiving", { elapsedMs: Date.now() - startedAt });
                },
                onChunk: (_delta, accumulated) => {
                  chunkCount += 1;
                  lastChunkAt = Date.now();
                  sse("chunk", {
                    totalLength: accumulated.length,
                    preview: truncateText(accumulated, 420),
                  });
                },
              });
            } catch (error) {
              fallbackReason = truncateText(
                error instanceof Error ? error.message : JSON.stringify(sanitizeForLog(error)),
                1000,
              );
              analysis = {
                ...localAnalysis,
                reasoningSummary: `${localAnalysis.reasoningSummary} AI 分析暂不可用，已回退到本地规则拆解。`,
              };
            }
          }

          const finishedAt = Date.now();
          if (logCreated) {
            updateRequestLog(requestId, {
              status: "success",
              httpStatus: 200,
              finishedAt,
              durationMs: finishedAt - startedAt,
              responseBody: sanitizeForLog({
                ok: true,
                requestId,
                usedModel: analysisModel || "local-agent-heuristic",
                fallbackReason: fallbackReason || undefined,
                analysis,
                chunkCount,
              }),
            });
          }

          sse("done", {
            requestId,
            analysis,
            durationMs: finishedAt - startedAt,
            chunkCount,
            fallbackReason: fallbackReason || undefined,
          });
          res.end();
        } catch (error) {
          const status = isApiBaseUrlError(error) ? 400 : httpStatusFromDetail(error) || 500;
          if (logCreated) {
            const summary = safeErrorSummary(error);
            const finishedAt = Date.now();
            updateRequestLog(requestId, {
              status: "error",
              httpStatus: status,
              errorMessage: summary.message,
              errorType: summary.type || "agent_analysis_error",
              errorCode: summary.code,
              errorRaw: summary.raw,
              responseBody: sanitizeForLog({
                ok: false,
                requestId,
                status,
                detail: error,
                chunkCount,
                lastChunkAt: lastChunkAt ? lastChunkAt - startedAt : null,
              }),
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
          }
          const detail = error && typeof error === "object" && "error" in (error as Record<string, unknown>)
            ? error
            : { status, error: error instanceof Error ? error.message : String(error) };
          if (sseStarted) {
            sse("error", { requestId, status, detail, chunkCount });
            res.end();
          } else {
            sendJson(res, status, { ok: false, requestId, detail });
          }
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
          const baseUrl = normalizeApiBaseUrl(getString(body, "baseUrl"));
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
          sendJson(res, isApiBaseUrlError(error) ? 400 : 500, { ok: false, requestId, detail: { error: message } });
        }
      });
}

function imageProxyPlugin(): PluginOption {
  return {
    name: "image-api-proxy",
    configureServer(server: ViteDevServer) {
      registerImageProxyMiddlewares(server);
    },
    configurePreviewServer(server: PreviewServer) {
      registerImageProxyMiddlewares(server);
    },
  };
}

function frontendVersionPlugin(): PluginOption {
  const registerBuildVersion = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use("/build-version.json", (_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
      res.end(JSON.stringify(FRONTEND_BUILD_INFO));
    });
  };

  return {
    name: "frontend-build-version",
    configureServer(server: ViteDevServer) {
      registerBuildVersion(server);
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
