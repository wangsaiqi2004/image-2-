import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
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

const API_TIMEOUT_MS = 300_000;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
const DEFAULT_PROTOCOL: ImageProtocol = "custom-openai";

const DEFAULT_MODELS: Record<ImageProtocol, string[]> = {
  "custom-openai": ["gpt-image-1", "gpt-image-2"],
  "openai-images": ["gpt-image-1"],
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

      server.middlewares.use("/api/images/generate", async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        try {
          const body = await readJsonBody(req);
          const baseUrl = getString(body, "baseUrl");
          const apiKey = getString(body, "apiKey");
          const request = (body.request && typeof body.request === "object" ? body.request : {}) as GenerateRequest;
          const protocol = getProtocol(request.protocol);
          request.protocol = protocol;

          if (!request.model || !request.prompt) {
            sendJson(res, 400, { ok: false, detail: { error: "模型和提示词不能为空" } });
            return;
          }

          if (!apiKey) {
            sendJson(res, 400, { ok: false, detail: { error: "API Key 不能为空" } });
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

          sendJson(res, result.ok ? 200 : result.status || 500, result);
        } catch (error) {
          sendJson(res, 500, { ok: false, detail: { error: error instanceof Error ? error.message : String(error) } });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
});
