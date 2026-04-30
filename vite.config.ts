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

type GenerateRequest = {
  protocol?: ImageProtocol;
  model?: string;
  prompt?: string;
  size?: string;
  aspectRatio?: string;
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

type AdminUser = {
  username: string;
  passwordHash: string;
  salt: string;
  mustChangePassword: boolean;
  createdAt: number;
  updatedAt: number;
};

type RequestLogStatus = "running" | "success" | "error";

type RequestLog = {
  requestId: string;
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  clientId: string;
  clientUserAgent: string;
  clientIpHash: string;
  protocol: ImageProtocol;
  apiBaseUrl: string;
  endpoint: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  seed?: string;
  referenceCount: number;
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
const SESSION_COOKIE = "image_studio_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DATA_DIR = join(process.cwd(), ".data");
const ADMIN_STORE_PATH = join(DATA_DIR, "admin-store.json");

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
    raw: truncateText(detail, 2500)
      .replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, "[image-data-redacted]")
      .replace(/"b64_json"\s*:\s*"[^"]+"/g, "\"b64_json\":\"[image-data-redacted]\"")
      .replace(/"data"\s*:\s*"[A-Za-z0-9+/=]{180,}"/g, "\"data\":\"[large-data-redacted]\""),
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

function generationEndpointLabel(protocol: ImageProtocol, model = "") {
  if (protocol === "openai-responses") return "/v1/responses";
  if (protocol === "gemini-native") return `/models/${modelName(model)}:generateContent`;
  if (protocol === "google-imagen") return `/models/${modelName(model)}:predict`;
  if (protocol === "stability-core") {
    return String(model).includes("ultra")
      ? "/v2beta/stable-image/generate/ultra"
      : "/v2beta/stable-image/generate/core";
  }
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

function dataUrlToReferencePayload(image: ReferenceImage) {
  const [meta, b64 = ""] = image.dataUrl.split(",");
  const mime = image.type || meta.match(/^data:(.*?);base64$/)?.[1] || "image/png";
  return {
    name: image.name,
    mime_type: mime,
    b64_json: b64,
  };
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

async function analyzePromptWithGpt(baseUrl: string, apiKey: string, body: ProxyBody) {
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
    "suggestedParams 可包含 aspectRatio, size, count, quality, styleStrength, referenceWeight。",
    "risks 每项包含 level, title, description, fix。styleEnhancements 每项包含 name, description, promptFragment。",
    "优化提示词时要保留用户原意，不要替换主体，不要加入未授权的具体人物身份。",
  ].join("\n");

  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: analysisModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(context, null, 2) },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  }, 90_000);
  const text = await response.text();
  if (!response.ok) throw detailFromUpstream(response.status, text);
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
  return normalizeAnalysisPayload(analysis, analysisModel);
}

async function readOpenAiImageResponse(response: Response, outputFormat: string) {
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

  return {
    ok: true,
    status: response.status,
    images: images.filter(Boolean),
    raw: json,
  };
}

async function readGenericJsonImageResponse(response: Response, outputFormat: string) {
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

async function generateOpenAiCompatible(baseUrl: string, apiKey: string, request: GenerateRequest) {
  const protocol = request.protocol || DEFAULT_PROTOCOL;
  const references = Array.isArray(request.referenceImages) ? request.referenceImages : [];
  const outputFormat = request.outputFormat || "png";
  const payload: Record<string, unknown> = {
    model: request.model,
    prompt: fullPrompt(request),
    n: 1,
    response_format: "b64_json",
  };
  if (request.size && request.size !== "auto") payload.size = request.size;
  if (request.quality && request.quality !== "auto") payload.quality = request.quality;
  if (outputFormat && outputFormat !== "png") payload.output_format = outputFormat;
  if (request.aspectRatio && protocol === "custom-openai") payload.aspect_ratio = request.aspectRatio;
  if (request.seed) payload.seed = Number.isFinite(Number(request.seed)) ? Number(request.seed) : request.seed;
  if (references.length > 0 && protocol === "custom-openai") {
    payload.reference_images = references.map(dataUrlToReferencePayload);
  }

  const path = protocol === "gemini-openai" ? "/images/generations" : "/v1/images/generations";
  const response = await fetchWithTimeout(endpoint(baseUrl, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readOpenAiImageResponse(response, outputFormat);
}

async function generateOpenAiResponses(baseUrl: string, apiKey: string, request: GenerateRequest) {
  const outputFormat = request.outputFormat || "png";
  const imageTool: Record<string, unknown> = {
    type: "image_generation",
  };
  if (request.size && request.size !== "auto") imageTool.size = request.size;
  if (request.quality && request.quality !== "auto") imageTool.quality = request.quality;
  if (outputFormat) imageTool.output_format = outputFormat;

  const response = await fetchWithTimeout(endpoint(baseUrl, "/v1/responses"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      input: fullPrompt(request),
      tools: [imageTool],
    }),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateGeminiNative(baseUrl: string, apiKey: string, request: GenerateRequest) {
  const references = Array.isArray(request.referenceImages) ? request.referenceImages : [];
  const outputFormat = request.outputFormat || "png";
  const parts = [
    { text: fullPrompt(request) },
    ...references.map(dataUrlToGeminiPart),
  ];
  const response = await fetchWithTimeout(endpoint(baseUrl, `/models/${modelName(request.model)}:generateContent`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: request.aspectRatio || "1:1",
        },
      },
    }),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateImagen(baseUrl: string, apiKey: string, request: GenerateRequest) {
  const outputFormat = request.outputFormat || "png";
  const parameters: Record<string, unknown> = {
    sampleCount: 1,
    aspectRatio: request.aspectRatio || "1:1",
    outputMimeType: outputMime(outputFormat),
  };
  if (request.negativePrompt) parameters.negativePrompt = request.negativePrompt;
  if (request.seed) parameters.seed = Number.isFinite(Number(request.seed)) ? Number(request.seed) : request.seed;

  const response = await fetchWithTimeout(endpoint(baseUrl, `/models/${modelName(request.model)}:predict`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt: request.prompt }],
      parameters,
    }),
  });
  return readGenericJsonImageResponse(response, outputFormat);
}

async function generateStability(baseUrl: string, apiKey: string, request: GenerateRequest) {
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
              .filter((log) => !query || `${log.requestId} ${log.clientId} ${log.prompt} ${log.model} ${log.errorMessage || ""}`.toLowerCase().includes(query))
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
          const baseUrl = getString(body, "baseUrl");
          const apiKey = getString(body, "apiKey");
          const { models, raw } = await loadUpstreamModels(protocol, baseUrl, apiKey);
          sendJson(res, 200, { ok: true, models: [...new Set(models)].sort(), raw });
        } catch (error) {
          sendJson(res, 500, { ok: false, detail: { error: error instanceof Error ? error.message : String(error) } });
        }
      });

      server.middlewares.use("/api/prompt/analyze", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const baseUrl = getString(body, "baseUrl");
          const apiKey = getString(body, "apiKey");
          const analysis = await analyzePromptWithGpt(baseUrl, apiKey, body);
          sendJson(res, 200, { ok: true, analysis });
        } catch (error) {
          sendJson(res, 500, {
            ok: false,
            detail: error && typeof error === "object" && "error" in error
              ? error
              : { error: error instanceof Error ? error.message : String(error) },
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
          const baseUrl = getString(body, "baseUrl");
          const apiKey = getString(body, "apiKey");
          const request = (body.request && typeof body.request === "object" ? body.request : {}) as GenerateRequest;
          const protocol = getProtocol(request.protocol);
          request.protocol = protocol;
          const requestMeta = body.request && typeof body.request === "object"
            ? body.request as Record<string, unknown>
            : {};
          const clientId = getString(body, "clientId") || "anonymous";

          createRequestLog({
            requestId,
            batchId: typeof requestMeta.batchId === "string" ? requestMeta.batchId : undefined,
            batchIndex: getNumber(requestMeta.index),
            batchTotal: getNumber(requestMeta.total),
            clientId: truncateText(clientId, 120),
            clientUserAgent: truncateText(req.headers["user-agent"] || "", 500),
            clientIpHash: hashClientIp(req),
            protocol,
            apiBaseUrl: baseUrl.replace(/\/+$/, ""),
            endpoint: generationEndpointLabel(protocol, request.model),
            model: truncateText(request.model || "", 240),
            prompt: truncateText(request.prompt || "", 4000),
            negativePrompt: request.negativePrompt ? truncateText(request.negativePrompt, 2400) : undefined,
            aspectRatio: request.aspectRatio,
            size: request.size,
            quality: request.quality,
            outputFormat: request.outputFormat,
            seed: request.seed,
            referenceCount: Array.isArray(request.referenceImages) ? request.referenceImages.length : 0,
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
            ? await generateOpenAiResponses(baseUrl, apiKey, request)
            : protocol === "gemini-native"
              ? await generateGeminiNative(baseUrl, apiKey, request)
              : protocol === "google-imagen"
                ? await generateImagen(baseUrl, apiKey, request)
                : protocol === "stability-core"
                  ? await generateStability(baseUrl, apiKey, request)
                  : await generateOpenAiCompatible(baseUrl, apiKey, request);

          const finishedAt = Date.now();
          const durationMs = finishedAt - startedAt;
          if (result.ok) {
            updateRequestLog(requestId, {
              status: "success",
              httpStatus: result.status || 200,
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
              errorRaw: truncateText(message, 2500),
              finishedAt,
              durationMs: finishedAt - startedAt,
            });
          }
          sendJson(res, 500, { ok: false, requestId, detail: { error: message } });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
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
