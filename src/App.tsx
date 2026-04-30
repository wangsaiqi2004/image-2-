import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Square,
  CheckSquare,
  Trash2,
  UploadCloud,
  WandSparkles,
  Wifi,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ImageProtocol =
  | "custom-openai"
  | "openai-images"
  | "openai-responses"
  | "gemini-native"
  | "gemini-openai"
  | "google-imagen"
  | "stability-core";

type ApiConfig = {
  protocol: ImageProtocol;
  baseUrl: string;
  apiKey: string;
  rememberKey: boolean;
};

type ImageParams = {
  aspectRatio: string;
  size: string;
  quality: string;
  outputFormat: "png" | "jpeg" | "webp";
  batchCount: number;
  concurrency: number;
  seed: string;
  negativePrompt: string;
};

type ReferenceStatus = "ready" | "warning" | "error";

type UploadedReference = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  width?: number;
  height?: number;
  status?: ReferenceStatus;
  message?: string;
};

type JobStatus = "queued" | "running" | "success" | "error";

type ErrorDetail = unknown;

type Job = {
  id: string;
  batchId: string;
  index: number;
  total: number;
  protocol: ImageProtocol;
  prompt: string;
  model: string;
  params: ImageParams;
  referenceImages: UploadedReference[];
  status: JobStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  imageBlob?: Blob;
  imageUrl?: string;
  width?: number;
  height?: number;
  revisedPrompt?: string;
  errorDetail?: ErrorDetail;
};

type StoredHistoryRecord = {
  id: string;
  batchId?: string;
  index?: number;
  total?: number;
  protocol?: ImageProtocol;
  prompt: string;
  model: string;
  params: ImageParams;
  referenceImages: UploadedReference[];
  status: "success" | "error";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  imageBlob?: Blob;
  width?: number;
  height?: number;
  revisedPrompt?: string;
  errorDetail?: ErrorDetail;
};

type HistoryRecord = StoredHistoryRecord & {
  objectUrl?: string;
};

type ModelLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
};

type GenerateProxyResponse = {
  ok: boolean;
  status?: number;
  images?: Array<{ dataUrl: string; revisedPrompt?: string }>;
  detail?: unknown;
  raw?: unknown;
};

type PreviewItem = {
  id: string;
  url: string;
  protocol?: ImageProtocol;
  prompt: string;
  model: string;
  status: "success" | "error";
  params: ImageParams;
  width?: number;
  height?: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  errorDetail?: ErrorDetail;
};

const DB_NAME = "codex-image-batch-studio";
const STORE_NAME = "history";
const HISTORY_PAGE_SIZE = 20;
const REFERENCE_LIMIT = 6;
const MAX_REFERENCE_SIZE = 10 * 1024 * 1024;
const MIN_REFERENCE_EDGE = 128;
const LARGE_REFERENCE_EDGE = 4096;
const PROMPT_TEXTAREA_MAX_HEIGHT = 220;
const DEFAULT_API_URL = "http://64.83.46.3:8317";
const DEFAULT_PROTOCOL: ImageProtocol = "custom-openai";
const SUPPORTED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 方图", hint: "头像、商品主图、社媒配图" },
  { value: "4:5", label: "4:5 竖版社媒", hint: "小红书、信息流、电商卡片" },
  { value: "5:4", label: "5:4 横版产品", hint: "商品展示、横版构图" },
  { value: "3:4", label: "3:4 竖版照片", hint: "人像、封面、海报草图" },
  { value: "4:3", label: "4:3 经典横图", hint: "摄影、PPT、内容插图" },
  { value: "2:3", label: "2:3 竖版海报", hint: "海报、人物全身、印刷" },
  { value: "3:2", label: "3:2 相机横图", hint: "风景、产品场景、摄影" },
  { value: "9:16", label: "9:16 手机竖屏", hint: "短视频封面、Story、壁纸" },
  { value: "16:9", label: "16:9 宽屏", hint: "视频封面、网页头图、桌面壁纸" },
  { value: "21:9", label: "21:9 超宽屏", hint: "横幅、电影感场景" },
  { value: "9:21", label: "9:21 长竖屏", hint: "长屏海报、移动端素材" },
  { value: "4:1", label: "4:1 横幅", hint: "Banner、页面横幅" },
  { value: "1:4", label: "1:4 长图", hint: "竖向长图、信息流素材" },
  { value: "8:1", label: "8:1 超横幅", hint: "超宽展示屏、高级模式" },
  { value: "1:8", label: "1:8 超长图", hint: "特殊竖向长图、高级模式" },
] as const;

const ALL_ASPECT_RATIOS = ASPECT_RATIOS.map((ratio) => ratio.value);

const IMAGEN_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];
const STABILITY_ASPECT_RATIOS = ["16:9", "1:1", "21:9", "2:3", "3:2", "4:5", "5:4", "9:16", "9:21"];
const OPENAI_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "21:9", "9:21"];

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
  "4:1": "2048x512",
  "1:4": "512x2048",
  "8:1": "2048x256",
  "1:8": "256x2048",
};

const PROTOCOLS: Array<{
  value: ImageProtocol;
  label: string;
  shortLabel: string;
  description: string;
  defaultBaseUrl: string;
  defaultModels: string[];
  supportedAspectRatios: string[];
  supportsReferenceImages: boolean;
  supportsNegativePrompt: boolean;
  supportsQuality: boolean;
  supportsOutputFormat: boolean;
}> = [
  {
    value: "custom-openai",
    label: "OpenAI 兼容",
    shortLabel: "兼容协议",
    description: "适合第三方中转或自建 OpenAI 风格图片接口",
    defaultBaseUrl: DEFAULT_API_URL,
    defaultModels: ["gpt-image-1", "gpt-image-2"],
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    supportsReferenceImages: true,
    supportsNegativePrompt: true,
    supportsQuality: true,
    supportsOutputFormat: true,
  },
  {
    value: "openai-images",
    label: "OpenAI Images",
    shortLabel: "OpenAI",
    description: "官方 Images API，宽高比会转换为 size 参数",
    defaultBaseUrl: "https://api.openai.com",
    defaultModels: ["gpt-image-1"],
    supportedAspectRatios: OPENAI_ASPECT_RATIOS,
    supportsReferenceImages: false,
    supportsNegativePrompt: true,
    supportsQuality: true,
    supportsOutputFormat: true,
  },
  {
    value: "openai-responses",
    label: "OpenAI Responses",
    shortLabel: "Responses",
    description: "适合对话式生成和后续多轮改图",
    defaultBaseUrl: "https://api.openai.com",
    defaultModels: ["gpt-4.1", "gpt-4.1-mini"],
    supportedAspectRatios: OPENAI_ASPECT_RATIOS,
    supportsReferenceImages: false,
    supportsNegativePrompt: true,
    supportsQuality: true,
    supportsOutputFormat: true,
  },
  {
    value: "gemini-native",
    label: "Gemini Native",
    shortLabel: "Gemini",
    description: "Google Gemini 原生 generateContent 生图/改图",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModels: ["gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"],
    supportedAspectRatios: ALL_ASPECT_RATIOS,
    supportsReferenceImages: true,
    supportsNegativePrompt: true,
    supportsQuality: false,
    supportsOutputFormat: true,
  },
  {
    value: "gemini-openai",
    label: "Gemini OpenAI 兼容",
    shortLabel: "Gemini 兼容",
    description: "Gemini 的 OpenAI 兼容接口，适合快速迁移",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModels: ["gemini-2.5-flash-image"],
    supportedAspectRatios: OPENAI_ASPECT_RATIOS,
    supportsReferenceImages: false,
    supportsNegativePrompt: true,
    supportsQuality: false,
    supportsOutputFormat: true,
  },
  {
    value: "google-imagen",
    label: "Google Imagen",
    shortLabel: "Imagen",
    description: "Imagen 系列文生图，比例范围较明确",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModels: ["imagen-4.0-generate-001", "imagen-4.0-ultra-generate-001", "imagen-3.0-generate-002"],
    supportedAspectRatios: IMAGEN_ASPECT_RATIOS,
    supportsReferenceImages: false,
    supportsNegativePrompt: true,
    supportsQuality: false,
    supportsOutputFormat: true,
  },
  {
    value: "stability-core",
    label: "Stability Core",
    shortLabel: "Stability",
    description: "Stability AI Stable Image Core/Ultra 风格接口",
    defaultBaseUrl: "https://api.stability.ai",
    defaultModels: ["stable-image-core"],
    supportedAspectRatios: STABILITY_ASPECT_RATIOS,
    supportsReferenceImages: false,
    supportsNegativePrompt: true,
    supportsQuality: false,
    supportsOutputFormat: true,
  },
];

const PROMPT_STARTERS = [
  {
    label: "场景图",
    prompt: "雨后的城市街角，玻璃橱窗反射霓虹与车灯，电影感自然光，真实摄影，细节丰富",
  },
  {
    label: "产品图",
    prompt: "一款极简黑色智能音箱放在浅灰色桌面上，柔和棚拍光，高级商业摄影，干净背景",
  },
  {
    label: "海报",
    prompt: "未来科技发布会主视觉，发光的数字地球悬浮在深色舞台中央，强烈空间层次，高清海报",
  },
  {
    label: "室内",
    prompt: "清晨阳光洒进现代客厅，亚麻沙发、木质地板、绿植，温暖安静的生活方式摄影",
  },
  {
    label: "人物",
    prompt: "半身肖像摄影，柔和侧光，自然表情，浅景深背景，真实皮肤质感，专业杂志风格",
  },
];

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const fullDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function uid() {
  return crypto.randomUUID();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value?: number) {
  if (!value) return "-";
  return dateTimeFormatter.format(new Date(value));
}

function formatFullDate(value?: number) {
  if (!value) return "-";
  return fullDateTimeFormatter.format(new Date(value));
}

function formatFileDate(value = Date.now()) {
  const date = new Date(value);
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeImageType(file: File) {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (type) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function formatReferenceType(type: string) {
  if (type === "image/jpeg") return "JPEG";
  if (type === "image/png") return "PNG";
  if (type === "image/webp") return "WebP";
  return type.replace(/^image\//, "").toUpperCase() || "文件";
}

function referenceDimensionLabel(image: UploadedReference) {
  return image.width && image.height ? `${image.width} x ${image.height}` : "尺寸未知";
}

function isReferenceUsable(image: UploadedReference) {
  return Boolean(image.dataUrl) && image.status !== "error";
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "image";
}

function recordFilename(record: Job) {
  const size = record.width && record.height ? `${record.width}x${record.height}` : record.params.size || "image";
  return `${formatFileDate(record.createdAt)}-${String(record.index).padStart(2, "0")}-${sanitizeFilename(record.model)}-${size}.${record.params.outputFormat}`;
}

function getProtocolDefinition(protocol: ImageProtocol) {
  return PROTOCOLS.find((item) => item.value === protocol) || PROTOCOLS[0];
}

function isImageProtocol(value: string | null): value is ImageProtocol {
  return PROTOCOLS.some((protocol) => protocol.value === value);
}

function getAspectDefinition(value: string) {
  return ASPECT_RATIOS.find((ratio) => ratio.value === value) || ASPECT_RATIOS[0];
}

function getSupportedAspectRatios(protocol: ImageProtocol) {
  return getProtocolDefinition(protocol).supportedAspectRatios;
}

function isAspectRatioSupported(protocol: ImageProtocol, aspectRatio: string) {
  return getSupportedAspectRatios(protocol).includes(aspectRatio);
}

function resolveSize(aspectRatio: string) {
  return SIZE_BY_RATIO[aspectRatio] || SIZE_BY_RATIO["1:1"];
}

function aspectRatioNumber(aspectRatio?: string) {
  if (!aspectRatio) return 1;
  const [width, height] = aspectRatio.split(":").map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return width / height;
}

function aspectRatioCss(width?: number, height?: number, fallbackAspectRatio = "1:1") {
  if (width && height && width > 0 && height > 0) return `${width} / ${height}`;
  const [fallbackWidth = 1, fallbackHeight = 1] = fallbackAspectRatio.split(":").map(Number);
  if (!Number.isFinite(fallbackWidth) || !Number.isFinite(fallbackHeight) || fallbackWidth <= 0 || fallbackHeight <= 0) {
    return "1 / 1";
  }
  return `${fallbackWidth} / ${fallbackHeight}`;
}

function aspectClass(width?: number, height?: number, fallbackAspectRatio = "1:1") {
  const ratio = width && height && width > 0 && height > 0
    ? width / height
    : aspectRatioNumber(fallbackAspectRatio);
  if (ratio >= 4) return "is-extreme-wide";
  if (ratio >= 2.1) return "is-wide";
  if (ratio <= 0.25) return "is-extreme-tall";
  if (ratio <= 0.55) return "is-tall";
  if (ratio > 1.15) return "is-landscape";
  if (ratio < 0.87) return "is-portrait";
  return "is-square";
}

function previewStyle(width?: number, height?: number, fallbackAspectRatio = "1:1"): CSSProperties {
  return {
    aspectRatio: aspectRatioCss(width, height, fallbackAspectRatio),
  };
}

function formatProtocolCapability(protocol: ImageProtocol) {
  const definition = getProtocolDefinition(protocol);
  const capabilities = [
    definition.supportsReferenceImages ? "支持参考图" : "不支持参考图",
    definition.supportsQuality ? "支持质量" : "不支持质量",
    definition.supportsOutputFormat ? "支持格式" : "不支持格式",
  ];
  return capabilities.join(" · ");
}

function formatError(detail: ErrorDetail) {
  if (!detail) return "未知错误";
  if (typeof detail === "string") return detail;
  if (detail instanceof Error) return detail.message;
  if (typeof detail !== "object") return String(detail);

  const record = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.status === "number") parts.push(`HTTP ${record.status}`);

  const error = record.error;
  if (typeof error === "string") {
    parts.push(error);
  } else if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === "string") parts.push(errorRecord.message);
    if (typeof errorRecord.type === "string") parts.push(errorRecord.type);
    if (typeof errorRecord.code === "string") parts.push(errorRecord.code);
  }

  if (parts.length > 0) return parts.join(" · ");
  try {
    return JSON.stringify(detail, null, 2).slice(0, 1200);
  } catch {
    return String(detail);
  }
}

type HistoryPage = {
  records: HistoryRecord[];
  nextCursor?: number;
  hasMore: boolean;
};

type PendingQueueItem = {
  job: Job;
  config: ApiConfig;
};

function historyRecordToJob(record: HistoryRecord): Job {
  return {
    id: record.id,
    batchId: record.batchId || record.id,
    index: record.index || 1,
    total: record.total || 1,
    protocol: record.protocol || DEFAULT_PROTOCOL,
    prompt: record.prompt,
    model: record.model,
    params: record.params,
    referenceImages: record.referenceImages,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
    imageBlob: record.imageBlob,
    imageUrl: record.objectUrl,
    width: record.width,
    height: record.height,
    revisedPrompt: record.revisedPrompt,
    errorDetail: record.errorDetail,
  };
}

function sortGenerationRecords(records: Job[]) {
  return [...records].sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    if (a.index !== b.index) return a.index - b.index;
    return b.id.localeCompare(a.id);
  });
}

function sortHistoryRecords(records: HistoryRecord[]) {
  return [...records].sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return b.id.localeCompare(a.id);
  });
}

function mergeHistoryRecords(current: HistoryRecord[], incoming: HistoryRecord[]) {
  const seen = new Set(current.map((record) => record.id));
  const next = [...current];
  incoming.forEach((record) => {
    if (seen.has(record.id)) {
      const existing = current.find((item) => item.id === record.id);
      if (record.objectUrl && record.objectUrl !== existing?.objectUrl) URL.revokeObjectURL(record.objectUrl);
      return;
    }
    seen.add(record.id);
    next.push(record);
  });
  return sortHistoryRecords(next);
}

function mergeHistoricalJobs(current: Job[], incoming: Job[]) {
  const seen = new Set(current.map((record) => record.id));
  const next = [...current];
  incoming.forEach((record) => {
    if (seen.has(record.id)) {
      const existing = current.find((item) => item.id === record.id);
      if (record.imageUrl && record.imageUrl !== existing?.imageUrl) URL.revokeObjectURL(record.imageUrl);
      return;
    }
    seen.add(record.id);
    next.push(record);
  });
  return sortGenerationRecords(next);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getHistoryRecordsPage({
  limit = HISTORY_PAGE_SIZE,
  beforeCreatedAt,
}: {
  limit?: number;
  beforeCreatedAt?: number;
} = {}): Promise<HistoryPage> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const toHistoryRecord = (record: StoredHistoryRecord): HistoryRecord => ({
      ...record,
      objectUrl: record.imageBlob ? URL.createObjectURL(record.imageBlob) : undefined,
    });
    const finish = (records: StoredHistoryRecord[]) => {
      const page = records.slice(0, limit).map(toHistoryRecord);
      resolve({
        records: page,
        nextCursor: page.at(-1)?.createdAt,
        hasMore: records.length > limit,
      });
    };

    if (!store.indexNames.contains("createdAt")) {
      const request = store.getAll();
      request.onsuccess = () => {
        const records = (request.result as StoredHistoryRecord[])
          .filter((record) => beforeCreatedAt === undefined || record.createdAt < beforeCreatedAt)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit + 1);
        finish(records);
      };
      request.onerror = () => reject(request.error);
      return;
    }

    const range = beforeCreatedAt === undefined ? null : IDBKeyRange.upperBound(beforeCreatedAt, true);
    const request = store.index("createdAt").openCursor(range, "prev");
    const records: StoredHistoryRecord[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit + 1) {
        finish(records);
        return;
      }
      records.push(cursor.value as StoredHistoryRecord);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveHistoryRecord(record: StoredHistoryRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteHistoryRecord(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearHistoryRecords() {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToReference(file: File): Promise<UploadedReference> {
  const type = normalizeImageType(file);
  const baseReference = {
    id: uid(),
    name: file.name,
    type,
    size: file.size,
  };

  if (!type.startsWith("image/")) {
    return {
      ...baseReference,
      dataUrl: "",
      status: "error",
      message: "不是图片文件",
    };
  }

  let dataUrl = "";
  try {
    dataUrl = await readFileAsDataUrl(file);
  } catch {
    return {
      ...baseReference,
      dataUrl: "",
      status: "error",
      message: "读取失败",
    };
  }

  let dimensions: { width?: number; height?: number } = {};
  try {
    dimensions = await getImageSize(dataUrl);
  } catch {
    dimensions = {};
  }

  if (!SUPPORTED_REFERENCE_TYPES.has(type)) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      status: "error",
      message: `暂不支持 ${formatReferenceType(type)}`,
    };
  }

  if (file.size > MAX_REFERENCE_SIZE) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      status: "error",
      message: `超过 ${formatBytes(MAX_REFERENCE_SIZE)}`,
    };
  }

  if (!dimensions.width || !dimensions.height) {
    return {
      ...baseReference,
      dataUrl,
      status: "error",
      message: "无法读取尺寸",
    };
  }

  const shortestEdge = Math.min(dimensions.width, dimensions.height);
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  if (shortestEdge < MIN_REFERENCE_EDGE) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      status: "error",
      message: `短边小于 ${MIN_REFERENCE_EDGE}px`,
    };
  }

  if (longestEdge > LARGE_REFERENCE_EDGE) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      status: "warning",
      message: "尺寸较大",
    };
  }

  return {
    ...baseReference,
    ...dimensions,
    dataUrl,
    status: "ready",
    message: "可用",
  };
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function getImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片尺寸"));
    image.src = url;
  });
}

function downloadUrl(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

const zipTextEncoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(value = Date.now()) {
  const date = new Date(value);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = Math.max(1, date.getDate());
  const month = date.getMonth() + 1;
  const year = Math.max(1980, date.getFullYear()) - 1980;
  return { date: (year << 9) | (month << 5) | day, time };
}

async function createZipBlob(files: Array<{ name: string; blob: Blob; date?: number }>) {
  const fileParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let centralSize = 0;
  let offset = 0;

  for (const file of files) {
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = zipTextEncoder.encode(file.name);
    const checksum = crc32(bytes);
    const { date, time } = dosDateTime(file.date);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    const byteCopy = new Uint8Array(bytes.byteLength);
    byteCopy.set(bytes);
    fileParts.push(localHeader.buffer, byteCopy.buffer);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader.buffer);
    centralSize += centralHeader.byteLength;

    offset += localHeader.length + bytes.length;
  }

  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...fileParts, ...centralParts, endHeader.buffer], { type: "application/zip" });
}

function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const drag = useRef({
    active: false,
    startX: 0,
    scrollLeft: 0,
  });

  const onPointerDown = (event: ReactPointerEvent<T>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, summary")) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const stop = (event: ReactPointerEvent<T>) => {
    drag.current.active = false;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<T>) => {
    if (!drag.current.active) return;
    const delta = event.clientX - drag.current.startX;
    event.currentTarget.scrollLeft = drag.current.scrollLeft - delta;
  };

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  };
}

function serializeError(detail: ErrorDetail) {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function loadBooleanSetting(key: string, fallback: boolean) {
  const raw = localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function loadInitialApiConfig(): ApiConfig {
  const rememberKey = localStorage.getItem("imageStudioRememberKey") === "true";
  const storedProtocol = localStorage.getItem("imageStudioProtocol");
  const protocol = isImageProtocol(storedProtocol) ? storedProtocol : DEFAULT_PROTOCOL;
  const definition = getProtocolDefinition(protocol);
  return {
    protocol,
    baseUrl: localStorage.getItem("imageStudioBaseUrl") || definition.defaultBaseUrl,
    apiKey: rememberKey
      ? localStorage.getItem("imageStudioApiKey") || ""
      : sessionStorage.getItem("imageStudioApiKey") || "",
    rememberKey,
  };
}

function loadInitialParams(): ImageParams {
  const raw = localStorage.getItem("imageStudioParams");
  if (!raw) {
    return {
      aspectRatio: "1:1",
      size: "1024x1024",
      quality: "auto",
      outputFormat: "png",
      batchCount: 4,
      concurrency: 2,
      seed: "",
      negativePrompt: "",
    };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ImageParams>;
    const aspectRatio = parsed.aspectRatio || "1:1";
    return {
      aspectRatio,
      size: parsed.size || resolveSize(aspectRatio),
      quality: parsed.quality || "auto",
      outputFormat: parsed.outputFormat || "png",
      batchCount: clampNumber(Number(parsed.batchCount || 4), 1, 20),
      concurrency: clampNumber(Number(parsed.concurrency || 2), 1, 6),
      seed: parsed.seed || "",
      negativePrompt: parsed.negativePrompt || "",
    };
  } catch {
    return {
      aspectRatio: "1:1",
      size: "1024x1024",
      quality: "auto",
      outputFormat: "png",
      batchCount: 4,
      concurrency: 2,
      seed: "",
      negativePrompt: "",
    };
  }
}

function preferModel(models: string[], current: string) {
  if (current && models.includes(current)) return current;
  return (
    models.find((model) => model.toLowerCase().includes("gpt-image")) ||
    models.find((model) => model.toLowerCase().includes("image")) ||
    models[0] ||
    ""
  );
}

function createJob(
  index: number,
  total: number,
  batchId: string,
  protocol: ImageProtocol,
  prompt: string,
  model: string,
  params: ImageParams,
  referenceImages: UploadedReference[],
  createdAt = Date.now(),
): Job {
  return {
    id: uid(),
    batchId,
    index,
    total,
    protocol,
    prompt,
    model,
    params: { ...params },
    referenceImages: [...referenceImages],
    status: "queued",
    createdAt,
  };
}

export default function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadInitialApiConfig);
  const [params, setParams] = useState<ImageParams>(loadInitialParams);
  const [prompt, setPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<UploadedReference[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem("imageStudioSelectedModel") || "");
  const [modelFilter, setModelFilter] = useState("");
  const [modelState, setModelState] = useState<ModelLoadState>({
    status: "idle",
    message: "未读取",
  });
  const [visibleRecords, setVisibleRecords] = useState<Job[]>([]);
  const [sidebarRecords, setSidebarRecords] = useState<HistoryRecord[]>([]);
  const [highlightedRecordId, setHighlightedRecordId] = useState<string>("");
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);
  const [isLoadingMainRecords, setIsLoadingMainRecords] = useState(false);
  const [isLoadingSidebarRecords, setIsLoadingSidebarRecords] = useState(false);
  const [hasMoreMainRecords, setHasMoreMainRecords] = useState(true);
  const [hasMoreSidebarRecords, setHasMoreSidebarRecords] = useState(true);
  const [queueStats, setQueueStats] = useState({ running: 0, queued: 0 });
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() =>
    loadBooleanSetting("imageStudioLeftSidebarOpen", window.innerWidth > 780),
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(() =>
    loadBooleanSetting("imageStudioSettingsOpen", window.innerWidth > 1180),
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [isSendLaunching, setIsSendLaunching] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const sidebarListRef = useRef<HTMLDivElement | null>(null);
  const mainLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const sidebarLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const mainCursorRef = useRef<number | undefined>(undefined);
  const sidebarCursorRef = useRef<number | undefined>(undefined);
  const hasMoreMainRef = useRef(true);
  const hasMoreSidebarRef = useRef(true);
  const isLoadingMainRef = useRef(false);
  const isLoadingSidebarRef = useRef(false);
  const pendingQueueRef = useRef<PendingQueueItem[]>([]);
  const runningCountRef = useRef(0);
  const paramsRef = useRef(params);
  const recordElementRefs = useRef(new Map<string, HTMLElement>());
  const startIntentRef = useRef(0);
  const sendLaunchFrameRef = useRef<number | undefined>(undefined);
  const sendLaunchTimerRef = useRef<number | undefined>(undefined);
  const starterDrag = useDragScroll<HTMLDivElement>();
  const protocolDefinition = getProtocolDefinition(apiConfig.protocol);
  const selectedAspectRatio = getAspectDefinition(params.aspectRatio);
  const resolvedRequestSize = resolveSize(params.aspectRatio);
  const aspectRatioSupported = isAspectRatioSupported(apiConfig.protocol, params.aspectRatio);

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    return models.filter((model) => model.toLowerCase().includes(query)).slice(0, 80);
  }, [modelFilter, models]);

  const visibleStats = useMemo(() => {
    return visibleRecords.reduce(
      (stats, record) => {
        stats[record.status] += 1;
        return stats;
      },
      { queued: 0, running: 0, success: 0, error: 0 } as Record<JobStatus, number>,
    );
  }, [visibleRecords]);
  const successfulVisibleRecords = visibleRecords.filter((record) => record.status === "success" && record.imageUrl);
  const selectableVisibleRecords = visibleRecords.filter((record) => record.status !== "running");
  const selectedRecords = useMemo(
    () => visibleRecords.filter((record) => selectedRecordIds.has(record.id)),
    [selectedRecordIds, visibleRecords],
  );
  const downloadableSelectedRecords = selectedRecords.filter((record) => record.status === "success" && record.imageBlob);
  const pendingDeleteRecords = useMemo(
    () => visibleRecords.filter((record) => pendingDeleteIds?.includes(record.id)),
    [pendingDeleteIds, visibleRecords],
  );
  const usableReferenceImages = useMemo(
    () => referenceImages.filter(isReferenceUsable),
    [referenceImages],
  );
  const referenceIssueCount = referenceImages.filter((image) => image.status === "error").length;
  const referenceWarningCount = referenceImages.filter((image) => image.status === "warning").length;
  const canGenerate =
    prompt.trim().length > 0 &&
    selectedModel.length > 0 &&
    models.includes(selectedModel) &&
    modelState.status === "ready" &&
    aspectRatioSupported;

  useEffect(() => {
    void loadMainRecordsPage();
    void loadSidebarRecordsPage();
  }, []);

  useEffect(() => {
    paramsRef.current = params;
    pumpQueue();
  }, [params]);

  useEffect(() => {
    localStorage.setItem("imageStudioProtocol", apiConfig.protocol);
    localStorage.setItem("imageStudioBaseUrl", apiConfig.baseUrl);
    localStorage.setItem("imageStudioRememberKey", String(apiConfig.rememberKey));
    sessionStorage.setItem("imageStudioApiKey", apiConfig.apiKey);
    if (apiConfig.rememberKey) {
      localStorage.setItem("imageStudioApiKey", apiConfig.apiKey);
    } else {
      localStorage.removeItem("imageStudioApiKey");
    }
  }, [apiConfig]);

  useEffect(() => {
    localStorage.setItem("imageStudioParams", JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem("imageStudioSelectedModel", selectedModel);
  }, [selectedModel]);

  useLayoutEffect(() => {
    resizePromptTextarea();
  }, [prompt]);

  useEffect(() => {
    localStorage.setItem("imageStudioLeftSidebarOpen", String(isLeftSidebarOpen));
  }, [isLeftSidebarOpen]);

  useEffect(() => {
    localStorage.setItem("imageStudioSettingsOpen", String(isSettingsOpen));
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isAspectRatioSupported(apiConfig.protocol, params.aspectRatio)) return;
    const fallbackRatio = getSupportedAspectRatios(apiConfig.protocol)[0] || "1:1";
    updateParams({ aspectRatio: fallbackRatio, size: resolveSize(fallbackRatio) });
  }, [apiConfig.protocol, params.aspectRatio]);

  useEffect(() => {
    if (!visibleRecords.some((record) => record.status === "running")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [visibleRecords]);

  useEffect(() => {
    return () => {
      if (sendLaunchFrameRef.current) {
        window.cancelAnimationFrame(sendLaunchFrameRef.current);
      }
      if (sendLaunchTimerRef.current) {
        window.clearTimeout(sendLaunchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const marker = mainLoadMoreRef.current;
    const root = canvasRef.current;
    if (!marker || !root || !hasMoreMainRecords) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMainRecordsPage();
      },
      { root, rootMargin: "320px 0px", threshold: 0 },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [visibleRecords.length, hasMoreMainRecords]);

  useEffect(() => {
    const marker = sidebarLoadMoreRef.current;
    const root = sidebarListRef.current;
    if (!marker || !root || !hasMoreSidebarRecords) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadSidebarRecordsPage();
      },
      { root, rootMargin: "220px 0px", threshold: 0 },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [sidebarRecords.length, hasMoreSidebarRecords]);

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1180px)");
    const mobile = window.matchMedia("(max-width: 780px)");
    const syncPanels = () => {
      if (compact.matches) setIsSettingsOpen(false);
      if (mobile.matches) setIsLeftSidebarOpen(false);
    };
    syncPanels();
    compact.addEventListener("change", syncPanels);
    mobile.addEventListener("change", syncPanels);
    return () => {
      compact.removeEventListener("change", syncPanels);
      mobile.removeEventListener("change", syncPanels);
    };
  }, []);

  useEffect(() => {
    if (!previewItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewItem]);

  function resizePromptTextarea() {
    const element = promptTextareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, PROMPT_TEXTAREA_MAX_HEIGHT);
    element.style.height = `${Math.max(46, nextHeight)}px`;
    element.style.overflowY = element.scrollHeight > PROMPT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }

  function syncQueueStats() {
    setQueueStats({
      running: runningCountRef.current,
      queued: pendingQueueRef.current.length,
    });
  }

  async function loadMainRecordsPage() {
    if (isLoadingMainRef.current || !hasMoreMainRef.current) return;
    isLoadingMainRef.current = true;
    setIsLoadingMainRecords(true);
    try {
      const page = await getHistoryRecordsPage({
        limit: HISTORY_PAGE_SIZE,
        beforeCreatedAt: mainCursorRef.current,
      });
      const historicalJobs = page.records.map(historyRecordToJob);
      setVisibleRecords((current) => mergeHistoricalJobs(current, historicalJobs));
      mainCursorRef.current = page.nextCursor;
      hasMoreMainRef.current = page.hasMore;
      setHasMoreMainRecords(page.hasMore);
    } catch (error) {
      setModelState({
        status: "error",
        message: `历史库读取失败：${formatError(error)}`,
      });
    } finally {
      isLoadingMainRef.current = false;
      setIsLoadingMainRecords(false);
    }
  }

  async function loadSidebarRecordsPage() {
    if (isLoadingSidebarRef.current || !hasMoreSidebarRef.current) return;
    isLoadingSidebarRef.current = true;
    setIsLoadingSidebarRecords(true);
    try {
      const page = await getHistoryRecordsPage({
        limit: HISTORY_PAGE_SIZE,
        beforeCreatedAt: sidebarCursorRef.current,
      });
      setSidebarRecords((current) => mergeHistoryRecords(current, page.records));
      sidebarCursorRef.current = page.nextCursor;
      hasMoreSidebarRef.current = page.hasMore;
      setHasMoreSidebarRecords(page.hasMore);
    } catch (error) {
      setModelState({
        status: "error",
        message: `历史库读取失败：${formatError(error)}`,
      });
    } finally {
      isLoadingSidebarRef.current = false;
      setIsLoadingSidebarRecords(false);
    }
  }

  function patchVisibleRecord(id: string, patch: Partial<Job>) {
    setVisibleRecords((current) =>
      sortGenerationRecords(current.map((record) => (record.id === id ? { ...record, ...patch } : record))),
    );
  }

  function enqueueJobs(records: Job[], config: ApiConfig) {
    pendingQueueRef.current.push(...records.map((job) => ({ job, config })));
    syncQueueStats();
    pumpQueue();
  }

  function pumpQueue() {
    const maxConcurrency = clampNumber(Number(paramsRef.current.concurrency), 1, 6);
    while (runningCountRef.current < maxConcurrency && pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!;
      runningCountRef.current += 1;
      syncQueueStats();
      void generateSingle(next.job, next.config).finally(() => {
        runningCountRef.current = Math.max(0, runningCountRef.current - 1);
        syncQueueStats();
        pumpQueue();
      });
    }
  }

  function registerRecordElement(id: string, element: HTMLElement | null) {
    if (element) {
      recordElementRefs.current.set(id, element);
    } else {
      recordElementRefs.current.delete(id);
    }
  }

  function focusSidebarRecord(record: HistoryRecord) {
    setHighlightedRecordId(record.id);
    const element = recordElementRefs.current.get(record.id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (record.objectUrl) {
      previewCurrent(record);
    }
    window.setTimeout(() => {
      setHighlightedRecordId((current) => (current === record.id ? "" : current));
    }, 1800);
  }

  function toggleSelectionMode() {
    setIsSelectionMode((value) => {
      if (value) setSelectedRecordIds(new Set());
      return !value;
    });
  }

  function toggleRecordSelection(record: Job) {
    if (record.status === "running") return;
    setIsSelectionMode(true);
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (next.has(record.id)) {
        next.delete(record.id);
      } else {
        next.add(record.id);
      }
      return next;
    });
  }

  function selectAllVisibleRecords() {
    setIsSelectionMode(true);
    setSelectedRecordIds(new Set(selectableVisibleRecords.map((record) => record.id)));
  }

  function invertVisibleSelection() {
    setIsSelectionMode(true);
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      selectableVisibleRecords.forEach((record) => {
        if (next.has(record.id)) {
          next.delete(record.id);
        } else {
          next.add(record.id);
        }
      });
      return next;
    });
  }

  function cancelSelection() {
    setIsSelectionMode(false);
    setSelectedRecordIds(new Set());
  }

  async function downloadSelectedRecords() {
    if (downloadableSelectedRecords.length === 0 || isBulkDownloading) return;
    setIsBulkDownloading(true);
    try {
      const zipBlob = await createZipBlob(
        downloadableSelectedRecords.map((record) => ({
          name: recordFilename(record),
          blob: record.imageBlob!,
          date: record.finishedAt || record.createdAt,
        })),
      );
      const url = URL.createObjectURL(zipBlob);
      downloadUrl(url, `image-studio-selected-${formatFileDate()}.zip`);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setIsBulkDownloading(false);
    }
  }

  function requestBulkDelete() {
    const ids = selectedRecords.filter((record) => record.status !== "running").map((record) => record.id);
    if (ids.length === 0) return;
    setPendingDeleteIds(ids);
  }

  async function confirmBulkDelete() {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
    const deleteIdSet = new Set(pendingDeleteIds);
    const recordsToDelete = visibleRecords.filter((record) => deleteIdSet.has(record.id));
    const storedIds = recordsToDelete
      .filter((record) => record.status === "success" || record.status === "error")
      .map((record) => record.id);

    pendingQueueRef.current = pendingQueueRef.current.filter((item) => !deleteIdSet.has(item.job.id));
    syncQueueStats();
    await Promise.all(storedIds.map((id) => deleteHistoryRecord(id)));

    setSidebarRecords((current) => {
      current.forEach((record) => {
        if (deleteIdSet.has(record.id) && record.objectUrl) URL.revokeObjectURL(record.objectUrl);
      });
      return current.filter((record) => !deleteIdSet.has(record.id));
    });
    setVisibleRecords((current) => {
      current.forEach((record) => {
        if (deleteIdSet.has(record.id) && record.imageUrl) URL.revokeObjectURL(record.imageUrl);
      });
      return current.filter((record) => !deleteIdSet.has(record.id));
    });
    setSelectedRecordIds(new Set());
    setIsSelectionMode(false);
    setPendingDeleteIds(null);
    setHighlightedRecordId((current) => (deleteIdSet.has(current) ? "" : current));
  }

  async function handleFiles(files: FileList | File[]) {
    const incomingFiles = Array.from(files);
    if (incomingFiles.length === 0) return;
    const nextImages = await Promise.all(incomingFiles.slice(0, REFERENCE_LIMIT).map(fileToReference));
    setReferenceImages((current) => [...current, ...nextImages].slice(0, REFERENCE_LIMIT));
  }

  function onReferenceInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void handleFiles(event.target.files);
    event.target.value = "";
  }

  function onComposerDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  async function loadModels() {
    setModelState({ status: "loading", message: "读取中" });
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: apiConfig.protocol,
          baseUrl: apiConfig.baseUrl,
          apiKey: apiConfig.apiKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw payload.detail || payload;
      }
      const nextModels = Array.isArray(payload.models) ? payload.models : [];
      if (nextModels.length === 0) {
        throw new Error("接口返回了空模型列表");
      }
      setModels(nextModels);
      setSelectedModel((current) => preferModel(nextModels, current));
      setModelState({ status: "ready", message: `${nextModels.length} 个模型` });
    } catch (error) {
      setModels([]);
      setSelectedModel("");
      setModelState({ status: "error", message: formatError(error) });
    }
  }

  async function generateSingle(job: Job, config: ApiConfig) {
    const startedAt = Date.now();
    patchVisibleRecord(job.id, { status: "running", startedAt, durationMs: 0 });

    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          request: {
            protocol: job.protocol,
            model: job.model,
            prompt: job.prompt,
            aspectRatio: job.params.aspectRatio,
            size: job.params.size || resolveSize(job.params.aspectRatio),
            quality: job.params.quality,
            outputFormat: job.params.outputFormat,
            seed: job.params.seed,
            negativePrompt: job.params.negativePrompt,
            referenceImages: job.referenceImages,
          },
        }),
      });
      const payload = (await response.json()) as GenerateProxyResponse;
      if (!response.ok || !payload.ok || !payload.images?.[0]?.dataUrl) {
        throw payload.detail || payload;
      }

      const dataUrl = payload.images[0].dataUrl;
      const blob = await dataUrlToBlob(dataUrl);
      const objectUrl = URL.createObjectURL(blob);
      const { width, height } = await getImageSize(objectUrl);
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const revisedPrompt = payload.images[0].revisedPrompt || "";

      patchVisibleRecord(job.id, {
        status: "success",
        imageBlob: blob,
        imageUrl: objectUrl,
        width,
        height,
        revisedPrompt,
        startedAt,
        finishedAt,
        durationMs,
      });

      const historyRecord: StoredHistoryRecord = {
        id: job.id,
        batchId: job.batchId,
        index: job.index,
        total: job.total,
        protocol: job.protocol,
        prompt: job.prompt,
        model: job.model,
        params: job.params,
        referenceImages: job.referenceImages,
        status: "success",
        createdAt: job.createdAt,
        startedAt,
        finishedAt,
        durationMs,
        imageBlob: blob,
        width,
        height,
        revisedPrompt,
      };
      await saveHistoryRecord(historyRecord);
      setSidebarRecords((current) => mergeHistoryRecords(current, [{ ...historyRecord, objectUrl }]));
    } catch (error) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const errorDetail = error instanceof Error ? { error: error.message } : error;
      patchVisibleRecord(job.id, { status: "error", errorDetail, startedAt, finishedAt, durationMs });
      const historyRecord: StoredHistoryRecord = {
        id: job.id,
        batchId: job.batchId,
        index: job.index,
        total: job.total,
        protocol: job.protocol,
        prompt: job.prompt,
        model: job.model,
        params: job.params,
        referenceImages: job.referenceImages,
        status: "error",
        createdAt: job.createdAt,
        startedAt,
        finishedAt,
        durationMs,
        errorDetail,
      };
      await saveHistoryRecord(historyRecord);
      setSidebarRecords((current) => mergeHistoryRecords(current, [{ ...historyRecord }]));
    }
  }

  async function startBatch(event?: FormEvent) {
    event?.preventDefault();
    if (!canGenerate) return;
    const total = clampNumber(Number(params.batchCount), 1, 20);
    const concurrency = clampNumber(Number(params.concurrency), 1, 6);
    const batchId = uid();
    const batchCreatedAt = Date.now();
    const snapshotConfig = { ...apiConfig };
    const snapshotParams = {
      ...params,
      batchCount: total,
      concurrency,
      size: resolvedRequestSize,
    };
    const snapshotReferenceImages = getProtocolDefinition(apiConfig.protocol).supportsReferenceImages
      ? usableReferenceImages
      : [];
    const nextJobs = Array.from({ length: total }, (_, index) =>
      createJob(
        index + 1,
        total,
        batchId,
        apiConfig.protocol,
        prompt.trim(),
        selectedModel,
        snapshotParams,
        snapshotReferenceImages,
        batchCreatedAt - index / 1000,
      ),
    );
    setHighlightedRecordId("");
    setVisibleRecords((current) => sortGenerationRecords([...nextJobs, ...current]));
    enqueueJobs(nextJobs, snapshotConfig);
  }

  function requestStartBatch() {
    if (!canGenerate) return;
    const nextStart = performance.now();
    if (nextStart - startIntentRef.current < 400) return;
    startIntentRef.current = nextStart;
    if (sendLaunchFrameRef.current) {
      window.cancelAnimationFrame(sendLaunchFrameRef.current);
    }
    if (sendLaunchTimerRef.current) {
      window.clearTimeout(sendLaunchTimerRef.current);
    }
    setIsSendLaunching(false);
    sendLaunchFrameRef.current = window.requestAnimationFrame(() => {
      setIsSendLaunching(true);
      sendLaunchTimerRef.current = window.setTimeout(() => setIsSendLaunching(false), 760);
    });
    void startBatch();
  }

  async function retryJob(job: Job) {
    const retry = createJob(
      job.index,
      job.total,
      uid(),
      job.protocol,
      job.prompt,
      job.model,
      job.params,
      job.referenceImages,
    );
    setHighlightedRecordId("");
    setVisibleRecords((current) => sortGenerationRecords([retry, ...current]));
    enqueueJobs([retry], { ...apiConfig });
  }

  async function deleteHistory(id: string) {
    await deleteHistoryRecord(id);
    setSidebarRecords((current) => {
      current.forEach((record) => {
        if (record.id === id && record.objectUrl) URL.revokeObjectURL(record.objectUrl);
      });
      return current.filter((record) => record.id !== id);
    });
    setVisibleRecords((current) => {
      current.forEach((record) => {
        if (record.id === id && record.imageUrl) URL.revokeObjectURL(record.imageUrl);
      });
      return current.filter((record) => record.id !== id);
    });
    setHighlightedRecordId((current) => (current === id ? "" : current));
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function clearHistory() {
    await clearHistoryRecords();
    sidebarRecords.forEach((record) => {
      if (record.objectUrl) URL.revokeObjectURL(record.objectUrl);
    });
    setSidebarRecords([]);
    setVisibleRecords((current) => {
      current.forEach((record) => {
        if ((record.status === "success" || record.status === "error") && record.imageUrl) {
          URL.revokeObjectURL(record.imageUrl);
        }
      });
      return current.filter((record) => record.status === "queued" || record.status === "running");
    });
    mainCursorRef.current = undefined;
    sidebarCursorRef.current = undefined;
    hasMoreMainRef.current = false;
    hasMoreSidebarRef.current = false;
    setHasMoreMainRecords(false);
    setHasMoreSidebarRecords(false);
    setHighlightedRecordId("");
    setSelectedRecordIds(new Set());
    setIsSelectionMode(false);
  }

  function updateParams(patch: Partial<ImageParams>) {
    setParams((current) => ({
      ...current,
      ...patch,
      aspectRatio: patch.aspectRatio || current.aspectRatio,
      size: patch.aspectRatio ? resolveSize(patch.aspectRatio) : patch.size || current.size,
      batchCount: patch.batchCount !== undefined
        ? clampNumber(Number(patch.batchCount), 1, 20)
        : current.batchCount,
      concurrency: patch.concurrency !== undefined
        ? clampNumber(Number(patch.concurrency), 1, 6)
        : current.concurrency,
    }));
  }

  function changeProtocol(protocol: ImageProtocol) {
    const nextDefinition = getProtocolDefinition(protocol);
    setApiConfig((current) => {
      const currentDefinition = getProtocolDefinition(current.protocol);
      const knownDefaultUrl = PROTOCOLS.some((item) => item.defaultBaseUrl === current.baseUrl);
      return {
        ...current,
        protocol,
        baseUrl: !current.baseUrl || current.baseUrl === currentDefinition.defaultBaseUrl || knownDefaultUrl
          ? nextDefinition.defaultBaseUrl
          : current.baseUrl,
      };
    });
    setModels(nextDefinition.defaultModels);
    setSelectedModel((current) => preferModel(nextDefinition.defaultModels, current));
    setModelFilter("");
    setModelState({ status: "ready", message: `${nextDefinition.defaultModels.length} 个预设模型` });
  }

  function downloadCurrent(job: Job | HistoryRecord) {
    const url = (job as Job).imageUrl || (job as HistoryRecord).objectUrl;
    if (!url) return;
    const size = job.width && job.height ? `${job.width}x${job.height}` : job.params.size || "image";
    const filename = `${formatFileDate(job.createdAt)}-${sanitizeFilename(job.model)}-${size}-${job.id}.${job.params.outputFormat}`;
    downloadUrl(url, filename);
  }

  function downloadCurrentBatch() {
    successfulVisibleRecords.forEach((job) => downloadCurrent(job));
  }

  function copyPrompt(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function removeReference(id: string) {
    setReferenceImages((current) => current.filter((image) => image.id !== id));
  }

  function applyPromptStarter(nextPrompt: string) {
    setPrompt((current) => (current.trim() ? `${current.trim()}\n${nextPrompt}` : nextPrompt));
  }

  function previewCurrent(item: Job | HistoryRecord) {
    const url = (item as Job).imageUrl || (item as HistoryRecord).objectUrl;
    if (!url) return;
    setPreviewItem({
      id: item.id,
      url,
      protocol: (item as Job).protocol || (item as HistoryRecord).protocol,
      prompt: item.prompt,
      model: item.model,
      status: item.status === "success" ? "success" : "error",
      params: item.params,
      width: item.width,
      height: item.height,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
      durationMs: item.durationMs,
      errorDetail: item.errorDetail,
    });
  }

  return (
    <div className={`app-shell ${isLeftSidebarOpen ? "left-open" : "left-closed"} ${isSettingsOpen ? "settings-open" : "settings-closed"}`}>
      <button
        className="drawer-backdrop"
        type="button"
        aria-label="关闭侧边栏"
        onClick={() => {
          setIsLeftSidebarOpen(false);
          setIsSettingsOpen(false);
        }}
      />
      <aside className={`sidebar ${isLeftSidebarOpen ? "open" : "closed"}`}>
        <div className="brand">
          <div className="brand-main">
            <div className="brand-mark">
              <WandSparkles size={21} />
            </div>
            <div>
              <strong>Image Studio</strong>
              <span>本地批量生图</span>
            </div>
          </div>
          <button
            className="icon-button sidebar-close-button"
            type="button"
            title="收起最近记录"
            onClick={() => setIsLeftSidebarOpen(false)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        <button
          className="new-task"
          type="button"
          onClick={() => {
            setPrompt("");
            setReferenceImages([]);
            setHighlightedRecordId("");
            canvasRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <ImagePlus size={17} />
          新任务
        </button>

        <div className="history-title">
          <span>最近记录</span>
          <button type="button" className="icon-button" title="清空历史" onClick={() => void clearHistory()}>
            <Trash2 size={16} />
          </button>
        </div>

        <div className="history-list" ref={sidebarListRef}>
          {sidebarRecords.length === 0 && !isLoadingSidebarRecords ? (
            <div className="muted-box">暂无记录</div>
          ) : (
            sidebarRecords.map((record) => (
              <button
                key={record.id}
                type="button"
                className={`history-item ${highlightedRecordId === record.id ? "active" : ""}`}
                onClick={() => focusSidebarRecord(record)}
              >
                <div className={`history-thumb ${record.status}`}>
                  {record.objectUrl ? (
                    <img src={record.objectUrl} alt="" />
                  ) : (
                    <AlertCircle size={18} />
                  )}
                </div>
                <div className="history-copy">
                  <strong>{record.status === "success" ? record.prompt : "生成失败"}</strong>
                  <span>
                    {record.model} · {formatDate(record.finishedAt || record.createdAt)}
                  </span>
                </div>
              </button>
            ))
          )}
          {isLoadingSidebarRecords && <div className="load-more-state">读取记录中...</div>}
          {hasMoreSidebarRecords && <div ref={sidebarLoadMoreRef} className="load-more-sentinel" />}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-cluster">
            <SidebarToggleButton
              side="left"
              open={isLeftSidebarOpen}
              title={isLeftSidebarOpen ? "收起最近记录" : "打开最近记录"}
              onClick={() => setIsLeftSidebarOpen((value) => !value)}
            />
            <div className={`status-pill ${modelState.status}`}>
              {modelState.status === "ready" ? <Wifi size={16} /> : <Settings2 size={16} />}
              <span>{modelState.status === "ready" ? "已连接" : modelState.message}</span>
            </div>
          </div>
          <div className="current-model">
            <span>{protocolDefinition.shortLabel}</span>
            <strong>{selectedModel || "未选择"}</strong>
          </div>
          <div className="topbar-cluster right">
            <SidebarToggleButton
              side="right"
              open={isSettingsOpen}
              title={isSettingsOpen ? "收起配置" : "打开配置"}
              onClick={() => setIsSettingsOpen((value) => !value)}
            />
          </div>
        </header>

        <section className="canvas" ref={canvasRef}>
          {visibleRecords.length === 0 && !isLoadingMainRecords ? (
            <div className="empty-state">
              <div className="empty-mark">
                <ImagePlus size={26} />
              </div>
              <div>
                <strong>准备生成</strong>
                <span>读取模型后输入提示词</span>
              </div>
            </div>
          ) : (
            <div className="gallery-stack">
              <div className="batch-toolbar">
                <div className="record-summary">
                  <span>全部生成记录 · 已显示 {visibleRecords.length} 条</span>
                  <small>运行中 {queueStats.running} / 排队 {queueStats.queued} / 成功 {visibleStats.success} / 失败 {visibleStats.error}</small>
                </div>
                <div className="toolbar-actions">
                  {isSelectionMode ? (
                    <BulkActionBar
                      selectedCount={selectedRecords.length}
                      downloadableCount={downloadableSelectedRecords.length}
                      selectableCount={selectableVisibleRecords.length}
                      isDownloading={isBulkDownloading}
                      onSelectAll={selectAllVisibleRecords}
                      onInvert={invertVisibleSelection}
                      onDownload={() => void downloadSelectedRecords()}
                      onDelete={requestBulkDelete}
                      onCancel={cancelSelection}
                    />
                  ) : (
                    <>
                      <button type="button" className="subtle-button" onClick={toggleSelectionMode}>
                        <CheckSquare size={16} />
                        选择
                      </button>
                      {successfulVisibleRecords.length > 0 && (
                        <button type="button" className="subtle-button" onClick={downloadCurrentBatch}>
                          <Download size={16} />
                          下载已显示成功图片
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="gallery-scroll">
                <div className="gallery-grid">
                  {visibleRecords.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      now={now}
                      highlighted={highlightedRecordId === job.id}
                      recordRef={(element) => registerRecordElement(job.id, element)}
                      selected={selectedRecordIds.has(job.id)}
                      selectionMode={isSelectionMode}
                      selectable={job.status !== "running"}
                      onToggleSelect={() => toggleRecordSelection(job)}
                      onRetry={() => void retryJob(job)}
                      onPreview={() => previewCurrent(job)}
                      onDownload={() => downloadCurrent(job)}
                      onCopyPrompt={() => copyPrompt(job.prompt)}
                    />
                  ))}
                </div>
                {isLoadingMainRecords && <div className="load-more-state">读取更多记录中...</div>}
                {hasMoreMainRecords && <div ref={mainLoadMoreRef} className="load-more-sentinel" />}
              </div>
            </div>
          )}
        </section>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            requestStartBatch();
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onComposerDrop}
        >
          <div className="starter-rail" {...starterDrag}>
            {PROMPT_STARTERS.map((starter) => (
              <button type="button" key={starter.label} onClick={() => applyPromptStarter(starter.prompt)}>
                <strong>{starter.label}</strong>
                <span>{starter.prompt}</span>
              </button>
            ))}
          </div>
          {referenceImages.length > 0 && (
            <div className="reference-strip">
              {!protocolDefinition.supportsReferenceImages && (
                <div className="reference-warning">当前协议暂不发送参考图，切回兼容协议或 Gemini Native 后生效</div>
              )}
              {referenceImages.map((image) => (
                <div className={`reference-chip ${image.status || "ready"}`} key={image.id}>
                  {image.dataUrl ? (
                    <img src={image.dataUrl} alt="" />
                  ) : (
                    <div className="reference-thumb-fallback">
                      <AlertCircle size={16} />
                    </div>
                  )}
                  <div className="reference-chip-copy">
                    <span title={image.name}>{image.name}</span>
                    <small title={image.message || ""}>
                      {referenceDimensionLabel(image)} · {formatReferenceType(image.type)} · {formatBytes(image.size)}
                    </small>
                  </div>
                  <div className="reference-status" title={image.message || "可用"}>
                    {image.status === "error" ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                  </div>
                  <button type="button" title="移除参考图" onClick={() => removeReference(image.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-main">
            <button
              type="button"
              className="icon-button upload-button"
              title="上传参考图"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud size={19} />
            </button>
            <textarea
              ref={promptTextareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onInput={resizePromptTextarea}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  requestStartBatch();
                }
              }}
              placeholder="描述你想生成的图片..."
              aria-label="提示词"
              rows={1}
            />
            <button
              type="button"
              className={`send-button${isSendLaunching ? " is-launching" : ""}`}
              title="生成"
              aria-label="生成图片"
              disabled={!canGenerate}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                requestStartBatch();
              }}
              onClick={() => requestStartBatch()}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                requestStartBatch();
              }}
            >
              <span className="send-button__trail" aria-hidden="true" />
              <span className="send-button__plane" aria-hidden="true">
                <Send size={18} />
              </span>
            </button>
          </div>
          <div className="composer-meta">
            <span className={referenceIssueCount > 0 ? "has-error" : referenceWarningCount > 0 ? "has-warning" : ""}>
              {referenceImages.length > 0
                ? `参考图 ${usableReferenceImages.length}/${referenceImages.length} 可用`
                : `${protocolDefinition.shortLabel} · ${resolvedRequestSize}`}
            </span>
            <span>{prompt.trim().length} 字</span>
          </div>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept="image/*"
            multiple
            onChange={onReferenceInput}
          />
        </form>
      </main>

      <aside className={`settings-panel ${isSettingsOpen ? "open" : "closed"}`}>
        <div className="panel-header">
          <div>
            <strong>配置</strong>
            <span>API 与生成参数</span>
          </div>
          <button className="icon-button" type="button" onClick={() => setIsSettingsOpen(false)}>
            <PanelRightClose size={16} />
          </button>
        </div>

        <section className="settings-section">
          <label>
            <span>生图协议</span>
            <select
              value={apiConfig.protocol}
              onChange={(event) => changeProtocol(event.target.value as ImageProtocol)}
            >
              {PROTOCOLS.map((protocol) => (
                <option key={protocol.value} value={protocol.value}>
                  {protocol.label}
                </option>
              ))}
            </select>
          </label>
          <div className="protocol-note">
            <strong>{protocolDefinition.shortLabel}</strong>
            <span>{protocolDefinition.description}</span>
            <small>{formatProtocolCapability(apiConfig.protocol)}</small>
          </div>
          <label>
            <span>API URL</span>
            <input
              value={apiConfig.baseUrl}
              onChange={(event) => setApiConfig((current) => ({ ...current, baseUrl: event.target.value }))}
              spellCheck={false}
            />
          </label>
          <label>
            <span>API Key</span>
            <input
              value={apiConfig.apiKey}
              type="password"
              onChange={(event) => setApiConfig((current) => ({ ...current, apiKey: event.target.value }))}
              spellCheck={false}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={apiConfig.rememberKey}
              onChange={(event) => setApiConfig((current) => ({ ...current, rememberKey: event.target.checked }))}
            />
            <span>记住 API Key</span>
          </label>
          <button className="primary-action" type="button" onClick={() => void loadModels()} disabled={modelState.status === "loading"}>
            {modelState.status === "loading" ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}
            读取模型列表
          </button>
          <div className={`status-line ${modelState.status}`}>
            {modelState.status === "ready" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{modelState.message}</span>
          </div>
          <div className="local-save-note">
            <Database size={15} />
            <span>生成图片和历史仅保存到当前浏览器本地，服务端只做无状态协议转发。</span>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-label">模型</div>
          <div className="search-input">
            <Search size={16} />
            <input
              value={modelFilter}
              placeholder="筛选模型"
              onChange={(event) => setModelFilter(event.target.value)}
            />
          </div>
          <div className="model-list">
            {filteredModels.length === 0 ? (
              <div className="muted-box">无模型</div>
            ) : (
              filteredModels.map((model) => (
                <button
                  type="button"
                  key={model}
                  className={selectedModel === model ? "selected" : ""}
                  onClick={() => setSelectedModel(model)}
                >
                  {model}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="settings-section compact-grid">
          <label>
            <span>宽高比</span>
            <select
              value={params.aspectRatio}
              onChange={(event) => updateParams({ aspectRatio: event.target.value })}
            >
              {ASPECT_RATIOS.map((ratio) => (
                <option
                  key={ratio.value}
                  value={ratio.value}
                  disabled={!isAspectRatioSupported(apiConfig.protocol, ratio.value)}
                >
                  {ratio.label}
                </option>
              ))}
            </select>
          </label>
          <div className={`ratio-preview ${aspectRatioSupported ? "" : "unsupported"}`}>
            <strong>{selectedAspectRatio.value}</strong>
            <span>{selectedAspectRatio.hint}</span>
            <small>{aspectRatioSupported ? `请求尺寸 ${resolvedRequestSize}` : "当前协议不支持此比例"}</small>
          </div>
          <label>
            <span>质量</span>
            <select
              value={params.quality}
              disabled={!protocolDefinition.supportsQuality}
              onChange={(event) => updateParams({ quality: event.target.value })}
            >
              <option value="auto">auto</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            <span>格式</span>
            <select
              value={params.outputFormat}
              disabled={!protocolDefinition.supportsOutputFormat}
              onChange={(event) => updateParams({ outputFormat: event.target.value as ImageParams["outputFormat"] })}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <label>
            <span>张数</span>
            <input
              type="number"
              min={1}
              max={20}
              value={params.batchCount}
              onChange={(event) => updateParams({ batchCount: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>并发</span>
            <input
              type="number"
              min={1}
              max={6}
              value={params.concurrency}
              onChange={(event) => updateParams({ concurrency: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Seed</span>
            <input value={params.seed} onChange={(event) => updateParams({ seed: event.target.value })} />
          </label>
        </section>

        <section className="settings-section">
          <label>
            <span>负面提示词</span>
            <textarea
              value={params.negativePrompt}
              rows={3}
              onChange={(event) => updateParams({ negativePrompt: event.target.value })}
              placeholder="不想出现的内容"
            />
          </label>
        </section>
      </aside>

      {previewItem && (
        <ImagePreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDownload={() => downloadUrl(
            previewItem.url,
            `${previewItem.model}-${previewItem.width || "image"}x${previewItem.height || "image"}-${previewItem.id}.${previewItem.params.outputFormat}`,
          )}
          onCopyPrompt={() => copyPrompt(previewItem.prompt)}
        />
      )}
      {pendingDeleteIds && (
        <ConfirmDialog
          title="删除本地记录"
          body={`将从当前浏览器本地删除 ${pendingDeleteRecords.length} 条记录，此操作不可撤销。运行中的任务不会被删除。`}
          confirmLabel="删除"
          onCancel={() => setPendingDeleteIds(null)}
          onConfirm={() => void confirmBulkDelete()}
        />
      )}
    </div>
  );
}

function JobCard({
  job,
  now,
  highlighted,
  recordRef,
  selected,
  selectionMode,
  selectable,
  onToggleSelect,
  onRetry,
  onPreview,
  onDownload,
  onCopyPrompt,
}: {
  job: Job;
  now: number;
  highlighted: boolean;
  recordRef: (element: HTMLElement | null) => void;
  selected: boolean;
  selectionMode: boolean;
  selectable: boolean;
  onToggleSelect: () => void;
  onRetry: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onCopyPrompt: () => void;
}) {
  const elapsed = job.status === "running" && job.startedAt ? now - job.startedAt : job.durationMs || 0;
  const previewClass = aspectClass(job.width, job.height, job.params.aspectRatio);
  const previewAspect = previewStyle(job.width, job.height, job.params.aspectRatio);
  const sizeLabel = job.width && job.height ? `${job.width} x ${job.height}` : job.params.size;
  const durationLabel = job.status === "queued" ? "等待" : elapsed > 0 ? formatDuration(elapsed) : "-";
  return (
    <article
      ref={recordRef}
      className={`job-card ${job.status} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""} ${selectionMode ? "selection-mode" : ""}`}
    >
      <div className={`tile-preview ${previewClass}`} style={previewAspect}>
        {(selectionMode || selectable) && (
          <button
            type="button"
            className={`selection-toggle ${selected ? "selected" : ""}`}
            title={selectable ? "选择图片" : "运行中不可选择"}
            aria-pressed={selected}
            disabled={!selectable}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect();
            }}
          >
            {selected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        )}
        {job.status === "success" && job.imageUrl && (
          <button type="button" className="preview-button" onClick={onPreview} title="预览图片">
            <img src={job.imageUrl} alt="" />
            <span>
              <Maximize2 size={16} />
            </span>
          </button>
        )}
        {job.status === "running" && (
          <div className="tile-state running">
            <Loader2 className="spin" size={24} />
            <strong>{formatDuration(elapsed)}</strong>
          </div>
        )}
        {job.status === "queued" && (
          <div className="tile-state queued">
            <Clock3 size={22} />
            <strong>排队中</strong>
          </div>
        )}
        {job.status === "error" && (
          <div className="tile-state error">
            <AlertCircle size={22} />
            <strong>生成失败</strong>
          </div>
        )}
        <div className="tile-index">#{job.index}</div>
      </div>

      <div className="tile-body">
        <div className="tile-summary-line">
          <StatusBadge status={job.status} elapsed={elapsed} />
          <strong className="tile-model" title={job.model}>{job.model}</strong>
          <div className="tile-meta-compact">
            <span>{job.params.aspectRatio}</span>
            <span title={sizeLabel}>{sizeLabel}</span>
            <span>{durationLabel}</span>
          </div>
        </div>

        {job.status === "error" && (
          <div className="tile-error-line" title={serializeError(job.errorDetail)}>
            {formatError(job.errorDetail)}
          </div>
        )}

        <div className="tile-bottom-line">
          <div className="tile-prompt" title={job.prompt}>{job.prompt}</div>
          <div className="job-actions">
            <button type="button" className="icon-button" title="复制提示词" onClick={onCopyPrompt}>
              <Copy size={16} />
            </button>
            {job.status === "success" && (
              <button type="button" className="icon-button" title="预览图片" onClick={onPreview}>
                <Maximize2 size={16} />
              </button>
            )}
            {job.status === "success" && (
              <button type="button" className="icon-button" title="下载图片" onClick={onDownload}>
                <Download size={16} />
              </button>
            )}
            {job.status === "error" && (
              <button type="button" className="icon-button" title="重试" onClick={onRetry}>
                <RefreshCw size={16} />
              </button>
            )}
            {job.status === "queued" && (
              <button type="button" className="icon-button" title="排队中" disabled>
                <Clock3 size={16} />
              </button>
            )}
            {job.status === "running" && (
              <button type="button" className="icon-button" title="生成中" disabled>
                <Loader2 size={16} className="spin" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function SidebarToggleButton({
  side,
  open,
  title,
  onClick,
}: {
  side: "left" | "right";
  open: boolean;
  title: string;
  onClick: () => void;
}) {
  const Icon = side === "left"
    ? open ? PanelLeftClose : PanelLeftOpen
    : open ? PanelRightClose : PanelRightOpen;
  return (
    <button type="button" className="topbar-toggle" title={title} onClick={onClick} aria-pressed={open}>
      <Icon size={18} />
    </button>
  );
}

function BulkActionBar({
  selectedCount,
  downloadableCount,
  selectableCount,
  isDownloading,
  onSelectAll,
  onInvert,
  onDownload,
  onDelete,
  onCancel,
}: {
  selectedCount: number;
  downloadableCount: number;
  selectableCount: number;
  isDownloading: boolean;
  onSelectAll: () => void;
  onInvert: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <strong>已选 {selectedCount} / 可选 {selectableCount}</strong>
      <button type="button" className="subtle-button" onClick={onSelectAll} disabled={selectableCount === 0}>
        全选已显示
      </button>
      <button type="button" className="subtle-button" onClick={onInvert} disabled={selectableCount === 0}>
        反选
      </button>
      <button type="button" className="subtle-button" onClick={onDownload} disabled={downloadableCount === 0 || isDownloading}>
        {isDownloading ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
        下载 {downloadableCount || ""}
      </button>
      <button type="button" className="subtle-button danger" onClick={onDelete} disabled={selectedCount === 0}>
        <Trash2 size={16} />
        删除
      </button>
      <button type="button" className="subtle-button" onClick={onCancel}>
        <X size={16} />
        取消选择
      </button>
    </>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="confirm-backdrop" type="button" aria-label="取消" onClick={onCancel} />
      <div className="confirm-card">
        <div>
          <strong>{title}</strong>
          <p>{body}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="subtle-button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="subtle-button danger solid" onClick={onConfirm}>
            <Trash2 size={16} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, elapsed }: { status: JobStatus; elapsed: number }) {
  const map = {
    queued: { label: "排队", icon: <Clock3 size={15} /> },
    running: { label: formatDuration(elapsed), icon: <Loader2 size={15} className="spin" /> },
    success: { label: formatDuration(elapsed), icon: <CheckCircle2 size={15} /> },
    error: { label: formatDuration(elapsed), icon: <AlertCircle size={15} /> },
  };
  return (
    <div className={`status-badge ${status}`}>
      {map[status].icon}
      <span>{map[status].label}</span>
    </div>
  );
}

function ImageInfo({ job }: { job: Job | HistoryRecord | PreviewItem }) {
  const params = job.params;
  return (
    <dl className="image-info">
      <div>
        <dt>协议</dt>
        <dd>{job.protocol ? getProtocolDefinition(job.protocol).label : "-"}</dd>
      </div>
      <div>
        <dt>宽高比</dt>
        <dd>{params.aspectRatio || "-"}</dd>
      </div>
      <div>
        <dt>实际尺寸</dt>
        <dd>{job.width && job.height ? `${job.width} x ${job.height}` : "-"}</dd>
      </div>
      <div>
        <dt>请求尺寸</dt>
        <dd>{params.size}</dd>
      </div>
      <div>
        <dt>质量</dt>
        <dd>{params.quality}</dd>
      </div>
      <div>
        <dt>格式</dt>
        <dd>{params.outputFormat.toUpperCase()}</dd>
      </div>
      <div>
        <dt>开始</dt>
        <dd>{formatFullDate(job.startedAt)}</dd>
      </div>
      <div>
        <dt>完成</dt>
        <dd>{formatFullDate(job.finishedAt)}</dd>
      </div>
      <div>
        <dt>耗时</dt>
        <dd>{formatDuration(job.durationMs)}</dd>
      </div>
    </dl>
  );
}

function HistoryDetail({
  record,
  onPreview,
  onDownload,
  onCopyPrompt,
  onDelete,
}: {
  record: HistoryRecord;
  onPreview: () => void;
  onDownload: () => void;
  onCopyPrompt: () => void;
  onDelete: () => void;
}) {
  const previewClass = aspectClass(record.width, record.height, record.params.aspectRatio);
  const previewAspect = previewStyle(record.width, record.height, record.params.aspectRatio);
  return (
    <article className={`history-detail ${record.status}`}>
      <div className="job-meta">
        <div>
          <span className="eyebrow">历史记录</span>
          <strong>{record.model}</strong>
        </div>
        <StatusBadge status={record.status === "success" ? "success" : "error"} elapsed={record.durationMs || 0} />
      </div>

      {record.objectUrl ? (
        <div className="result-layout large">
          <button
            type="button"
            className={`result-preview-button ${previewClass}`}
            style={previewAspect}
            onClick={onPreview}
          >
            <img className="result-image" src={record.objectUrl} alt="" />
            <span>
              <Maximize2 size={17} />
              预览
            </span>
          </button>
          <ImageInfo job={record} />
        </div>
      ) : (
        <div className="error-box">
          <div>
            <AlertCircle size={18} />
            <strong>{formatError(record.errorDetail)}</strong>
          </div>
          <details open>
            <summary>错误详情</summary>
            <pre>{serializeError(record.errorDetail)}</pre>
          </details>
        </div>
      )}

      <div className="prompt-block">{record.prompt}</div>

      {record.referenceImages.length > 0 && (
        <div className="reference-readonly">
          {record.referenceImages.map((image) => (
            <div key={image.id}>
              <img src={image.dataUrl} alt="" />
              <span>{image.name}</span>
              <small>{referenceDimensionLabel(image)} · {formatBytes(image.size)}</small>
            </div>
          ))}
        </div>
      )}

      <div className="job-actions">
        {record.objectUrl && (
          <button type="button" className="subtle-button" onClick={onPreview}>
            <Maximize2 size={16} />
            预览
          </button>
        )}
        <button type="button" className="subtle-button" onClick={onCopyPrompt}>
          <Copy size={16} />
          复制提示词
        </button>
        {record.objectUrl && (
          <button type="button" className="subtle-button" onClick={onDownload}>
            <Download size={16} />
            下载
          </button>
        )}
        <button type="button" className="subtle-button danger" onClick={onDelete}>
          <Trash2 size={16} />
          删除
        </button>
      </div>
    </article>
  );
}

function ImagePreviewModal({
  item,
  onClose,
  onDownload,
  onCopyPrompt,
}: {
  item: PreviewItem;
  onClose: () => void;
  onDownload: () => void;
  onCopyPrompt: () => void;
}) {
  const previewClass = aspectClass(item.width, item.height, item.params.aspectRatio);
  return (
    <div className="preview-modal" role="dialog" aria-modal="true" aria-label="图片预览">
      <button className="preview-backdrop" type="button" aria-label="关闭预览" onClick={onClose} />
      <div className="preview-shell">
        <div className={`preview-stage ${previewClass}`}>
          <div className="preview-image-frame">
            <img src={item.url} alt="" />
          </div>
        </div>
        <aside className="preview-side">
          <div className="preview-head">
            <div>
              <span className="eyebrow">预览</span>
              <strong>{item.model}</strong>
            </div>
            <button className="icon-button" type="button" onClick={onClose} title="关闭">
              <X size={17} />
            </button>
          </div>
          <ImageInfo job={item} />
          <div className="preview-prompt">{item.prompt}</div>
          <div className="job-actions">
            <button type="button" className="subtle-button" onClick={onCopyPrompt}>
              <Copy size={16} />
              复制提示词
            </button>
            <button type="button" className="subtle-button" onClick={onDownload}>
              <Download size={16} />
              下载
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
