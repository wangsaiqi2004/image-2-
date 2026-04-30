import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  Download,
  ImagePlus,
  Loader2,
  LogOut,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import homeHeroImage from "./assets/home-hero.png";

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
  requestId?: string;
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
  requestId?: string;
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
  requestId?: string;
  status?: number;
  images?: Array<{ dataUrl: string; revisedPrompt?: string }>;
  detail?: unknown;
  raw?: unknown;
};

type AnalysisMode = "send" | "optimize" | "params" | "risk" | "style";
type RiskLevel = "low" | "medium" | "high";

type SuggestedParams = {
  aspectRatio?: string;
  size?: string;
  count?: number;
  quality?: string;
  styleStrength?: "low" | "medium" | "high";
  referenceWeight?: "low" | "medium" | "high";
};

type PromptRisk = {
  level: RiskLevel;
  title: string;
  description: string;
  fix?: string;
};

type StyleEnhancement = {
  name: string;
  description: string;
  promptFragment: string;
};

type PromptAnalysisResult = {
  safe: boolean;
  score: number;
  riskLevel: RiskLevel;
  summary: string;
  optimizedPrompt: string;
  suggestedNegativePrompt?: string;
  suggestedParams: SuggestedParams;
  risks: PromptRisk[];
  styleEnhancements: StyleEnhancement[];
  analysisModel?: string;
  source?: "ai" | "local";
};

type PromptAnalysisState = {
  status: "idle" | "analyzing" | "ready" | "error";
  mode: AnalysisMode;
  message: string;
  result?: PromptAnalysisResult;
  error?: string;
};

type PreviewItem = {
  id: string;
  requestId?: string;
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

type AppPage = "home" | "studio" | "admin";

type AdminUserView = {
  username: string;
  mustChangePassword: boolean;
};

type AdminRequestLog = {
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
  status: "running" | "success" | "error";
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

type AdminStats = {
  total: number;
  success: number;
  error: number;
  running: number;
  successRate: number;
  avgDurationMs: number;
  modelCounts: Record<string, number>;
  errorCounts: Record<string, number>;
};

const DB_NAME = "codex-image-batch-studio";
const STORE_NAME = "history";
const HISTORY_PAGE_SIZE = 20;
const REFERENCE_LIMIT = 6;
const MAX_REFERENCE_SIZE = 10 * 1024 * 1024;
const MIN_REFERENCE_EDGE = 128;
const LARGE_REFERENCE_EDGE = 4096;
const PROMPT_TEXTAREA_MAX_HEIGHT = 220;
const FRONTEND_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const CURRENT_FRONTEND_VERSION = typeof __FRONTEND_BUILD_VERSION__ === "string"
  ? __FRONTEND_BUILD_VERSION__
  : "dev";
const ALLOWED_API_ENDPOINTS = [
  {
    value: "https://www.taijiai.online/",
    label: "太极 AI",
    description: "主服务地址",
  },
  {
    value: "https://bobdong.cn/",
    label: "BobDong",
    description: "备用服务地址",
  },
] as const;
const DEFAULT_API_URL = ALLOWED_API_ENDPOINTS[0].value;
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    defaultBaseUrl: DEFAULT_API_URL,
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
    label: "超写实人像",
    tag: "头像写真",
    prompt: "8K 超写实近景人像肖像，女性，白皙皮肤，五官与参考照片 100% 一致，柔和侧逆光打在脸上，背景虚化，皮肤纹理与毛发细节清晰可见，电影级光影和肤色过渡，高质感摄影棚风格，4K 细节，适合头像与人像写真展示。",
  },
  {
    label: "水墨双龙",
    tag: "东方概念",
    prompt: "阴阳概念，两条中国龙龙对战，一条白龙一条黑龙，极简水墨画风格，黑色墨迹绘制在白色背景上，带有和纸纹理，大号红色印章签名，禅意风格，居中构图",
  },
  {
    label: "建筑文字剖面",
    tag: "信息图",
    prompt: "2x2 网格布局，每一格是一栋著名建筑的垂直剖面示意图，不画真实造型，而是用建筑结构与材料术语堆叠成楼层文字方块：地基、柱网、楼板、幕墙、机电系统等，从下到上依次排列。整体采用极简信息图风格，白底黑字，少量线条勾勒楼层分隔，排版干净、对比清晰，可读性强，适合作为建筑结构可视化概念插画。",
  },
  {
    label: "蓝图到现实",
    tag: "建筑渲染",
    prompt: "创建一张纵向分屏建筑可视化图，上半部分是深色主题的精细建筑平立面蓝图，包含清晰线稿、标注和结构细节，下半部分是与蓝图完全对应的写实现代住宅外观 3D 渲染，真实光影和材质，干净背景，整体呈现“蓝图到现实”的一体化对比效果。",
  },
  {
    label: "人物侧脸海报",
    tag: "IP 视觉",
    prompt: "核心结构：人物侧脸外轮廓 + 内部世界观填充，适合文学/IP/人物传记海报。\n风格方向：电影海报 + 东方现实主义，强调光影、空间纵深和宿命感。\n质感控制：侧逆光、体积光、轻雾、胶片颗粒，让画面更像正式视觉物料。\n可复用点：把主题换成任意小说、历史人物、城市故事或品牌叙事，都能做系列封面。",
  },
  {
    label: "历史学家玩具",
    tag: "3D 手办",
    prompt: "2×2 网格布局，每格展示一个基于“历史学家”职业的可爱玩具人物立牌。输入为一个著名历史学家，分析其典型特征并转化为 Q 版或 chibi 风格：大头小身、夸张表情和代表性服饰或道具（如书卷、古地图、羽毛笔）。整体为 3D 扭蛋场景风格，塑料质感的小公仔站在透明底座上，画面为分层拆解的 split-view，展示人物、底座和扭蛋背景机台，柔和打光，高细节，卡通但带一点收藏手办质感。",
  },
  {
    label: "文本封面主视觉",
    tag: "社媒封面",
    prompt: "核心任务：把一句话或大段文本转成“封面主视觉”，适合小红书、X、公众号、Telegram 封面。\n设计思路：苹果设计师思维 + 海报大师思维 + 高桥流，强调大字、留白、冲击力和信息压缩。\n关键能力：让模型“智能梳理文本”，避免把长文逐字堆到图里。\n可复用点：适合金句、信息差、课程标题、文章封面、播客标题、社群公告。",
  },
  {
    label: "社交媒体成瘾",
    tag: "社论漫画",
    prompt: "为「社交媒体上瘾」这个主题创作一幅正方形、单格的社论漫画。先推理出最有力、最讽刺的视觉隐喻（例如赌场、仓鼠轮、正在下沉的船、飙车赛道等），再据此构图。画面应一眼就能看出是在批判社交媒体成瘾：人物被界面和通知牵制，氛围略带黑色幽默，细节简洁但寓意清晰，适合社论版头图使用。",
  },
];

const ANALYSIS_STEPS = [
  "正在理解画面主体",
  "正在检查生图兼容性",
  "正在预判失败风险",
  "正在推荐比例与参数",
  "正在增强风格表达",
];

const STYLE_ENHANCEMENT_PRESETS: StyleEnhancement[] = [
  {
    name: "电影感",
    description: "更强的镜头、光影和空间纵深",
    promptFragment: "电影级构图，柔和侧逆光，体积光，浅景深，细腻胶片颗粒，画面具有空间纵深和叙事感。",
  },
  {
    name: "商业摄影",
    description: "适合产品、人像与高质感展示",
    promptFragment: "高质感商业摄影棚风格，干净背景，精准布光，真实材质，高细节，主体边缘清晰。",
  },
  {
    name: "社媒封面",
    description: "更适合小红书、公众号和信息流",
    promptFragment: "社交媒体封面主视觉，强标题感构图，留白明确，高对比，信息层级清晰，移动端可读性强。",
  },
  {
    name: "极简信息图",
    description: "适合结构解释、知识卡片与图解",
    promptFragment: "极简信息图风格，白底黑字，少量辅助线条，模块化排版，层级分明，可读性强。",
  },
  {
    name: "东方水墨",
    description: "更适合国风、禅意和概念插画",
    promptFragment: "东方水墨画风格，宣纸纹理，留白构图，墨色层次丰富，克制的红色印章点缀，禅意氛围。",
  },
  {
    name: "3D 手办",
    description: "适合玩具、公仔、IP 角色",
    promptFragment: "3D 收藏手办质感，Q 版比例，塑料材质，透明底座，柔和棚拍打光，高细节，干净背景。",
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

function getClientId() {
  const storageKey = "imageStudioClientId";
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const next = uid();
  localStorage.setItem(storageKey, next);
  return next;
}

function pageFromHash(): AppPage {
  if (window.location.hash === "#studio") return "studio";
  if (window.location.hash.startsWith("#admin")) return "admin";
  return "home";
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

function formatCompactDuration(ms = 0) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
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

function normalizeApiBaseUrl(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  const matched = ALLOWED_API_ENDPOINTS.find((endpoint) => endpoint.value.replace(/\/+$/, "") === normalized);
  return matched?.value || DEFAULT_API_URL;
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
    requestId: record.requestId,
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

function serializeError(detail: ErrorDetail) {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

async function fetchFrontendBuildVersion(signal?: AbortSignal) {
  const response = await fetch(`/build-version.json?t=${Date.now()}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`版本检查失败：HTTP ${response.status}`);
  const payload = await response.json() as { version?: unknown };
  return typeof payload.version === "string" ? payload.version : "";
}

function reloadWithFrontendVersion(version: string) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("app_v", version);
  window.location.assign(nextUrl.toString());
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
  return {
    protocol,
    baseUrl: normalizeApiBaseUrl(localStorage.getItem("imageStudioBaseUrl")),
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

function isAllowedImageModel(model: string) {
  const normalized = model.toLowerCase();
  return normalized === "gpt-image-2" || normalized === "gpt-5.4-image-2" || normalized.includes("image-2");
}

function imageModelPriority(model: string) {
  const normalized = model.toLowerCase();
  if (normalized === "gpt-image-2") return 0;
  if (normalized === "gpt-5.4-image-2") return 1;
  return 2;
}

function filterAllowedImageModels(models: string[]) {
  return [...new Set(models)]
    .filter(isAllowedImageModel)
    .sort((a, b) => {
      const priority = imageModelPriority(a) - imageModelPriority(b);
      return priority || a.localeCompare(b);
    });
}

function preferModel(models: string[], current: string) {
  const allowedModels = filterAllowedImageModels(models);
  if (current && allowedModels.includes(current) && isAllowedImageModel(current)) return current;
  return (
    allowedModels.find((model) => model.toLowerCase() === "gpt-image-2") ||
    allowedModels.find((model) => model.toLowerCase() === "gpt-5.4-image-2") ||
    allowedModels[0] ||
    ""
  );
}

function normalizedModelId(model: string) {
  return model.replace(/^models\//, "").trim().toLowerCase();
}

function isAnalysisModel(model: string) {
  const normalized = normalizedModelId(model);
  return normalized.includes("gpt") && !normalized.includes("image");
}

function analysisModelPriority(model: string) {
  const normalized = normalizedModelId(model);
  if (normalized === "gpt-5.4") return 0;
  if (normalized.includes("gpt-5.4")) return 1;
  if (normalized === "gpt-5.5") return 2;
  if (normalized.includes("gpt-5.5")) return 3;
  if (normalized === "gpt-5.2") return 4;
  if (normalized.includes("gpt-5.2")) return 5;
  if (normalized.includes("gpt-5")) return 6;
  if (normalized.includes("gpt-4.1")) return 7;
  if (normalized.includes("gpt-4")) return 8;
  return 20;
}

function filterAnalysisModels(models: string[]) {
  return [...new Set(models)]
    .filter(isAnalysisModel)
    .sort((a, b) => {
      const priority = analysisModelPriority(a) - analysisModelPriority(b);
      return priority || a.localeCompare(b);
    });
}

function preferAnalysisModel(models: string[], current: string) {
  if (current && models.includes(current)) return current;
  return models[0] || "";
}

function analysisModeLabel(mode: AnalysisMode) {
  if (mode === "optimize") return "提示词优化";
  if (mode === "params") return "参数推荐";
  if (mode === "risk") return "失败预判";
  if (mode === "style") return "风格增强";
  return "发送前检查";
}

function riskScore(level: RiskLevel) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

function getOverallRiskLevel(risks: PromptRisk[]): RiskLevel {
  if (risks.some((risk) => risk.level === "high")) return "high";
  if (risks.some((risk) => risk.level === "medium")) return "medium";
  return "low";
}

function recommendAspectRatioForPrompt(promptText: string, currentAspectRatio: string) {
  const text = promptText.toLowerCase();
  if (/头像|avatar|portrait|肖像|近景人像|商品主图/.test(text)) return "1:1";
  if (/小红书|封面|海报|竖版|手机|story|reels|tiktok|shorts/.test(text)) return "3:4";
  if (/壁纸|短视频|9:16|竖屏|全身/.test(text)) return "9:16";
  if (/banner|横幅|头图|网页|视频封面|宽屏|youtube|16:9/.test(text)) return "16:9";
  if (/建筑|蓝图|住宅|室内|空间|剖面/.test(text)) return "4:3";
  if (/信息图|知识卡片|公众号|长图|排版/.test(text)) return "4:5";
  return currentAspectRatio;
}

function pickStyleEnhancements(promptText: string, mode: AnalysisMode) {
  const text = promptText.toLowerCase();
  const matched = STYLE_ENHANCEMENT_PRESETS.filter((preset) => {
    if (/电影|海报|故事|场景|氛围/.test(text) && preset.name === "电影感") return true;
    if (/商品|产品|人像|写真|摄影|头像/.test(text) && preset.name === "商业摄影") return true;
    if (/小红书|封面|公众号|社媒|标题/.test(text) && preset.name === "社媒封面") return true;
    if (/信息图|结构|图解|文字|知识/.test(text) && preset.name === "极简信息图") return true;
    if (/水墨|国风|东方|禅|龙/.test(text) && preset.name === "东方水墨") return true;
    if (/手办|玩具|公仔|chibi|q版|3d/.test(text) && preset.name === "3D 手办") return true;
    return false;
  });
  const base = matched.length > 0 ? matched : STYLE_ENHANCEMENT_PRESETS.slice(0, mode === "style" ? 4 : 2);
  return base.slice(0, 4);
}

function createOptimizedPrompt(promptText: string, mode: AnalysisMode) {
  const trimmed = promptText.trim();
  if (!trimmed) return "";
  const styleFragments = pickStyleEnhancements(trimmed, mode).slice(0, mode === "style" ? 2 : 1).map((item) => item.promptFragment);
  const structure = [
    trimmed,
    "主体清晰，构图干净，画面重点明确。",
    "补充镜头语言、光影方向、材质细节、背景层次和最终用途。",
    ...styleFragments,
  ];
  return [...new Set(structure)].join("\n");
}

function buildLocalPromptAnalysis({
  promptText,
  params,
  protocol,
  selectedModel,
  referenceImages,
  usableReferenceImages,
  mode,
}: {
  promptText: string;
  params: ImageParams;
  protocol: ImageProtocol;
  selectedModel: string;
  referenceImages: UploadedReference[];
  usableReferenceImages: UploadedReference[];
  mode: AnalysisMode;
}): PromptAnalysisResult {
  const trimmed = promptText.trim();
  const risks: PromptRisk[] = [];
  const definition = getProtocolDefinition(protocol);

  if (trimmed.length < 10) {
    risks.push({
      level: "medium",
      title: "提示词偏短",
      description: "主体、场景、光影和用途不够明确，结果随机性会更高。",
      fix: "补充主体、环境、风格、镜头和用途。",
    });
  }
  if (trimmed.length > 2800) {
    risks.push({
      level: "medium",
      title: "提示词过长",
      description: "过长的提示词容易稀释重点，也可能触发接口长度限制。",
      fix: "压缩为主体、风格、构图、约束四段。",
    });
  }
  if (/100%|完全一致|一模一样|高度一致|same face|identical/i.test(trimmed) && usableReferenceImages.length === 0) {
    risks.push({
      level: "high",
      title: "缺少参考图",
      description: "提示词要求高度一致，但当前没有可用参考图，生成结果很难稳定符合。",
      fix: "上传清晰参考图，或降低“一致性”要求。",
    });
  }
  if (/文字|标题|排版|字体|logo|标语|slogan|海报/i.test(trimmed)) {
    risks.push({
      level: "low",
      title: "文字渲染存在不确定性",
      description: "图片模型对精准文字仍可能出错，建议减少文字数量并强调可读性。",
      fix: "把文字控制在 1-2 个短句，后期可用设计工具补字。",
    });
  }
  if (referenceImages.some((image) => image.status === "error")) {
    risks.push({
      level: "high",
      title: "参考图不可用",
      description: "存在格式、尺寸或读取失败的参考图，发送时会被过滤。",
      fix: "移除失败参考图，重新上传 PNG、JPEG 或 WebP。",
    });
  }
  if (referenceImages.some((image) => image.status === "warning")) {
    risks.push({
      level: "medium",
      title: "参考图尺寸较大",
      description: "大图可能增加请求体积和等待时间。",
      fix: "优先压缩到 4096px 以下再上传。",
    });
  }
  if (referenceImages.length > 0 && !definition.supportsReferenceImages) {
    risks.push({
      level: "medium",
      title: "当前协议不发送参考图",
      description: `${definition.shortLabel} 暂不支持参考图，本次生成会按纯文本执行。`,
      fix: "切换到兼容协议或 Gemini Native。",
    });
  }
  if (!isAspectRatioSupported(protocol, params.aspectRatio)) {
    risks.push({
      level: "high",
      title: "宽高比不兼容",
      description: "当前协议不支持所选宽高比，请换成协议支持的比例。",
      fix: "应用系统推荐比例。",
    });
  }
  if (params.batchCount > 8 && params.concurrency > 3) {
    risks.push({
      level: "low",
      title: "批量并发较高",
      description: "大批量高并发可能遇到限流，排队等待时间也会更长。",
      fix: "建议并发保持 2-3。",
    });
  }

  const suggestedAspectRatio = recommendAspectRatioForPrompt(trimmed, params.aspectRatio);
  const suggestedParams: SuggestedParams = {
    aspectRatio: isAspectRatioSupported(protocol, suggestedAspectRatio) ? suggestedAspectRatio : getSupportedAspectRatios(protocol)[0] || "1:1",
    size: resolveSize(isAspectRatioSupported(protocol, suggestedAspectRatio) ? suggestedAspectRatio : getSupportedAspectRatios(protocol)[0] || "1:1"),
    count: /海报|封面|logo|文字|信息图/.test(trimmed) ? 2 : Math.min(Math.max(params.batchCount, 2), 4),
    quality: selectedModel ? params.quality : "auto",
    styleStrength: mode === "style" ? "high" : "medium",
    referenceWeight: usableReferenceImages.length > 0 ? "medium" : "low",
  };
  const riskLevel = getOverallRiskLevel(risks);
  const score = clampNumber(94 - risks.reduce((sum, risk) => sum + riskScore(risk.level) * 10, 0), 35, 98);
  const styleEnhancements = pickStyleEnhancements(trimmed, mode);
  return {
    safe: riskLevel !== "high",
    score,
    riskLevel,
    summary: riskLevel === "low"
      ? "提示词可以直接生成，建议可作为增强参考。"
      : riskLevel === "medium"
        ? "可以生成，但有几处会影响稳定性和效果。"
        : "存在较高失败或偏离风险，建议先修复再生成。",
    optimizedPrompt: createOptimizedPrompt(trimmed, mode),
    suggestedNegativePrompt: params.negativePrompt || "低清晰度，畸形结构，错误文字，重复肢体，低质量，过度锐化",
    suggestedParams,
    risks,
    styleEnhancements,
    source: "local",
  };
}

function safeRiskLevel(value: unknown): RiskLevel {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizePromptRisk(value: unknown): PromptRisk | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const description = typeof record.description === "string" ? record.description : "";
  if (!title && !description) return null;
  return {
    level: safeRiskLevel(record.level),
    title: title || "生成风险",
    description: description || "需要进一步检查。",
    fix: typeof record.fix === "string" ? record.fix : undefined,
  };
}

function normalizeStyleEnhancement(value: unknown): StyleEnhancement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  const description = typeof record.description === "string" ? record.description : "";
  const promptFragment = typeof record.promptFragment === "string" ? record.promptFragment : "";
  if (!name || !promptFragment) return null;
  return { name, description, promptFragment };
}

function normalizeSuggestedParams(value: unknown, fallback: SuggestedParams): SuggestedParams {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    aspectRatio: typeof record.aspectRatio === "string" ? record.aspectRatio : fallback.aspectRatio,
    size: typeof record.size === "string" ? record.size : fallback.size,
    count: typeof record.count === "number" ? record.count : fallback.count,
    quality: typeof record.quality === "string" ? record.quality : fallback.quality,
    styleStrength: record.styleStrength === "low" || record.styleStrength === "medium" || record.styleStrength === "high"
      ? record.styleStrength
      : fallback.styleStrength,
    referenceWeight: record.referenceWeight === "low" || record.referenceWeight === "medium" || record.referenceWeight === "high"
      ? record.referenceWeight
      : fallback.referenceWeight,
  };
}

function normalizePromptAnalysisResult(value: unknown, fallback: PromptAnalysisResult): PromptAnalysisResult {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const risks = Array.isArray(record.risks)
    ? record.risks.map(normalizePromptRisk).filter((item): item is PromptRisk => Boolean(item))
    : fallback.risks;
  const styleEnhancements = Array.isArray(record.styleEnhancements)
    ? record.styleEnhancements.map(normalizeStyleEnhancement).filter((item): item is StyleEnhancement => Boolean(item))
    : fallback.styleEnhancements;
  const riskLevel = safeRiskLevel(record.riskLevel || getOverallRiskLevel(risks));
  return {
    safe: typeof record.safe === "boolean" ? record.safe : riskLevel !== "high",
    score: typeof record.score === "number" ? clampNumber(record.score, 0, 100) : fallback.score,
    riskLevel,
    summary: typeof record.summary === "string" && record.summary.trim() ? record.summary : fallback.summary,
    optimizedPrompt: typeof record.optimizedPrompt === "string" && record.optimizedPrompt.trim()
      ? record.optimizedPrompt
      : fallback.optimizedPrompt,
    suggestedNegativePrompt: typeof record.suggestedNegativePrompt === "string"
      ? record.suggestedNegativePrompt
      : fallback.suggestedNegativePrompt,
    suggestedParams: normalizeSuggestedParams(record.suggestedParams, fallback.suggestedParams),
    risks,
    styleEnhancements: styleEnhancements.length > 0 ? styleEnhancements : fallback.styleEnhancements,
    analysisModel: typeof record.analysisModel === "string" ? record.analysisModel : fallback.analysisModel,
    source: record.source === "ai" || record.source === "local" ? record.source : fallback.source,
  };
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
  const [activePage, setActivePage] = useState<AppPage>(pageFromHash);
  const [referenceImages, setReferenceImages] = useState<UploadedReference[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [analysisModels, setAnalysisModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    const storedModel = localStorage.getItem("imageStudioSelectedModel") || "";
    return isAllowedImageModel(storedModel) ? storedModel : "";
  });
  const [selectedAnalysisModel, setSelectedAnalysisModel] = useState(() =>
    localStorage.getItem("imageStudioSelectedAnalysisModel") || "",
  );
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
  const [showOnboarding, setShowOnboarding] = useState(() =>
    localStorage.getItem("imageStudioOnboardingComplete") !== "true",
  );
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isAutoLoadingModels, setIsAutoLoadingModels] = useState(false);
  const [showPromptPresets, setShowPromptPresets] = useState(false);
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [isSendLaunching, setIsSendLaunching] = useState(false);
  const [analysisState, setAnalysisState] = useState<PromptAnalysisState>({
    status: "idle",
    mode: "send",
    message: "",
  });
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [availableFrontendVersion, setAvailableFrontendVersion] = useState("");
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
  const modelLoadRequestRef = useRef(0);
  const lastAutoModelLoadKeyRef = useRef("");
  const protocolDefinition = getProtocolDefinition(apiConfig.protocol);
  const selectedAspectRatio = getAspectDefinition(params.aspectRatio);
  const resolvedRequestSize = resolveSize(params.aspectRatio);
  const aspectRatioSupported = isAspectRatioSupported(apiConfig.protocol, params.aspectRatio);

  const filteredModels = useMemo(() => {
    const query = modelFilter.trim().toLowerCase();
    return models
      .filter(isAllowedImageModel)
      .filter((model) => model.toLowerCase().includes(query))
      .slice(0, 80);
  }, [modelFilter, models]);
  const preferredAnalysisModel = useMemo(
    () => preferAnalysisModel(analysisModels, selectedAnalysisModel),
    [analysisModels, selectedAnalysisModel],
  );

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
  const showPromptGroupHint = isPromptFocused || prompt.trim().length > 0;
  const isPromptAnalyzing = analysisState.status === "analyzing";
  const currentAnalysisMessage = ANALYSIS_STEPS[analysisStepIndex % ANALYSIS_STEPS.length];
  const canGenerate =
    prompt.trim().length > 0 &&
    selectedModel.length > 0 &&
    isAllowedImageModel(selectedModel) &&
    models.includes(selectedModel) &&
    modelState.status === "ready" &&
    aspectRatioSupported;
  const canRequestGenerate = canGenerate && !isPromptAnalyzing;

  useEffect(() => {
    void loadMainRecordsPage();
    void loadSidebarRecordsPage();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(pageFromHash());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (activePage !== "studio" || !showOnboarding) return;
    setIsSettingsOpen(true);
    if (onboardingStep < 2) {
      setIsLeftSidebarOpen(false);
    }
  }, [activePage, showOnboarding, onboardingStep]);

  useEffect(() => {
    paramsRef.current = params;
    pumpQueue();
  }, [params]);

  useEffect(() => {
    localStorage.setItem("imageStudioProtocol", apiConfig.protocol);
    localStorage.setItem("imageStudioBaseUrl", normalizeApiBaseUrl(apiConfig.baseUrl));
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

  useEffect(() => {
    localStorage.setItem("imageStudioSelectedAnalysisModel", selectedAnalysisModel);
  }, [selectedAnalysisModel]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    const checkVersion = async () => {
      try {
        const latestVersion = await fetchFrontendBuildVersion(controller.signal);
        if (!stopped && latestVersion && latestVersion !== CURRENT_FRONTEND_VERSION) {
          setAvailableFrontendVersion(latestVersion);
        }
      } catch {
        // Version checks are best-effort and should never interrupt creation.
      }
    };
    void checkVersion();
    const interval = window.setInterval(() => void checkVersion(), FRONTEND_VERSION_CHECK_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    window.addEventListener("focus", checkVersion);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkVersion);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
    if (!isPromptAnalyzing) {
      setAnalysisStepIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setAnalysisStepIndex((current) => current + 1);
    }, 860);
    return () => window.clearInterval(timer);
  }, [isPromptAnalyzing]);

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
    if (activePage !== "studio") return;
    const apiKey = apiConfig.apiKey.trim();
    if (apiKey.length < 8) return;
    const normalizedBaseUrl = normalizeApiBaseUrl(apiConfig.baseUrl);
    const autoLoadKey = `${apiConfig.protocol}|${normalizedBaseUrl}|${apiKey}`;
    if (lastAutoModelLoadKeyRef.current === autoLoadKey) return;

    const timer = window.setTimeout(() => {
      if (lastAutoModelLoadKeyRef.current === autoLoadKey) return;
      lastAutoModelLoadKeyRef.current = autoLoadKey;
      void loadModels({
        silent: true,
        config: {
          ...apiConfig,
          baseUrl: normalizedBaseUrl,
          apiKey,
        },
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activePage, apiConfig.apiKey, apiConfig.baseUrl, apiConfig.protocol]);

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

  async function loadModels({
    silent = false,
    config = apiConfig,
  }: {
    silent?: boolean;
    config?: ApiConfig;
  } = {}) {
    const normalizedBaseUrl = normalizeApiBaseUrl(config.baseUrl);
    const modelLoadKey = `${config.protocol}|${normalizedBaseUrl}|${config.apiKey.trim()}`;
    const requestId = modelLoadRequestRef.current + 1;
    modelLoadRequestRef.current = requestId;
    if (silent) {
      setIsAutoLoadingModels(true);
    } else {
      lastAutoModelLoadKeyRef.current = modelLoadKey;
      setIsAutoLoadingModels(false);
      setModelState({ status: "loading", message: "读取中" });
    }
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: config.protocol,
          baseUrl: normalizedBaseUrl,
          apiKey: config.apiKey,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw payload.detail || payload;
      }
      if (requestId !== modelLoadRequestRef.current) return;
      const upstreamModels = Array.isArray(payload.models) ? payload.models : [];
      if (upstreamModels.length === 0) {
        throw new Error("接口返回了空模型列表");
      }
      const nextModels = filterAllowedImageModels(upstreamModels);
      const nextAnalysisModels = filterAnalysisModels(upstreamModels);
      if (nextModels.length === 0) {
        throw new Error("未找到可用的 image-2 模型");
      }
      const nextSelectedModel = preferModel(nextModels, selectedModel);
      const nextSelectedAnalysisModel = preferAnalysisModel(nextAnalysisModels, selectedAnalysisModel);
      lastAutoModelLoadKeyRef.current = modelLoadKey;
      setModels(nextModels);
      setSelectedModel(nextSelectedModel);
      setAnalysisModels(nextAnalysisModels);
      setSelectedAnalysisModel(nextSelectedAnalysisModel);
      setModelFilter("");
      setModelState({ status: "ready", message: `${nextModels.length} 个 image-2 模型` });
      if (silent && showOnboarding && onboardingStep < 2) {
        setOnboardingStep(2);
      }
    } catch (error) {
      if (requestId !== modelLoadRequestRef.current || silent) return;
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "error", message: formatError(error) });
    } finally {
      if (silent) {
        setIsAutoLoadingModels(false);
      }
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
          clientId: getClientId(),
          request: {
            batchId: job.batchId,
            index: job.index,
            total: job.total,
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
        throw payload.detail && typeof payload.detail === "object"
          ? { ...payload.detail as Record<string, unknown>, requestId: payload.requestId }
          : { error: payload.detail || payload, requestId: payload.requestId };
      }

      const dataUrl = payload.images[0].dataUrl;
      const blob = await dataUrlToBlob(dataUrl);
      const objectUrl = URL.createObjectURL(blob);
      const { width, height } = await getImageSize(objectUrl);
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const revisedPrompt = payload.images[0].revisedPrompt || "";

      patchVisibleRecord(job.id, {
        requestId: payload.requestId,
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
        requestId: payload.requestId,
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
      const requestId = errorDetail && typeof errorDetail === "object" && "requestId" in errorDetail
        ? String((errorDetail as { requestId?: unknown }).requestId || "")
        : undefined;
      patchVisibleRecord(job.id, { requestId, status: "error", errorDetail, startedAt, finishedAt, durationMs });
      const historyRecord: StoredHistoryRecord = {
        id: job.id,
        requestId,
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

  function analysisFallback(mode: AnalysisMode, promptText = prompt.trim()) {
    return buildLocalPromptAnalysis({
      promptText,
      params,
      protocol: apiConfig.protocol,
      selectedModel,
      referenceImages,
      usableReferenceImages,
      mode,
    });
  }

  async function runPromptAnalysis(mode: AnalysisMode, promptText = prompt.trim()) {
    const fallback = analysisFallback(mode, promptText);
    const analysisModel = preferAnalysisModel(analysisModels, selectedAnalysisModel);
    if (!analysisModel || !apiConfig.apiKey.trim()) {
      return {
        ...fallback,
        analysisModel: analysisModel || "本地预检",
        source: "local" as const,
        summary: analysisModel
          ? "未配置 API Key，已先用本地规则完成预检。"
          : "未检测到 GPT 分析模型，已先用本地规则完成预检。",
      };
    }

    const response = await fetch("/api/prompt/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: normalizeApiBaseUrl(apiConfig.baseUrl),
        apiKey: apiConfig.apiKey,
        analysisModel,
        prompt: promptText,
        negativePrompt: params.negativePrompt,
        aspectRatio: params.aspectRatio,
        size: resolvedRequestSize,
        quality: params.quality,
        outputFormat: params.outputFormat,
        count: params.batchCount,
        concurrency: params.concurrency,
        referenceCount: usableReferenceImages.length,
        referenceIssues: referenceImages
          .filter((image) => image.status && image.status !== "ready")
          .map((image) => ({ name: image.name, status: image.status, message: image.message })),
        protocol: apiConfig.protocol,
        imageModel: selectedModel,
        mode,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw payload.detail || payload;
    }
    return normalizePromptAnalysisResult(payload.analysis, {
      ...fallback,
      analysisModel,
      source: "ai",
    });
  }

  function triggerSendLaunchAnimation() {
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
  }

  function buildParamsFromAnalysis(result: PromptAnalysisResult, applyRecommendedParams = true) {
    const suggestedRatio = result.suggestedParams.aspectRatio || params.aspectRatio;
    const nextRatio = applyRecommendedParams && isAspectRatioSupported(apiConfig.protocol, suggestedRatio)
      ? suggestedRatio
      : params.aspectRatio;
    return {
      ...params,
      aspectRatio: nextRatio,
      size: resolveSize(nextRatio),
      quality: applyRecommendedParams && protocolDefinition.supportsQuality && result.suggestedParams.quality
        ? result.suggestedParams.quality
        : params.quality,
      batchCount: applyRecommendedParams && result.suggestedParams.count
        ? clampNumber(Number(result.suggestedParams.count), 1, 20)
        : params.batchCount,
      negativePrompt: applyRecommendedParams && result.suggestedNegativePrompt && !params.negativePrompt.trim()
        ? result.suggestedNegativePrompt
        : params.negativePrompt,
    };
  }

  function applySuggestedParams(result: PromptAnalysisResult) {
    updateParams(buildParamsFromAnalysis(result, true));
  }

  function applyOptimizedPrompt(result: PromptAnalysisResult) {
    setPrompt(result.optimizedPrompt);
    window.requestAnimationFrame(resizePromptTextarea);
  }

  function appendStyleEnhancement(enhancement: StyleEnhancement) {
    setPrompt((current) => `${current.trim()}\n${enhancement.promptFragment}`.trim());
    window.requestAnimationFrame(resizePromptTextarea);
  }

  async function requestPromptAssist(mode: AnalysisMode) {
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt || isPromptAnalyzing) return;
    setShowPromptPresets(false);
    setAnalysisState({
      status: "analyzing",
      mode,
      message: analysisModeLabel(mode),
    });
    try {
      const result = await runPromptAnalysis(mode, submittedPrompt);
      setAnalysisState({
        status: "ready",
        mode,
        message: `${analysisModeLabel(mode)}完成`,
        result,
      });
    } catch (error) {
      setAnalysisState({
        status: "error",
        mode,
        message: `${analysisModeLabel(mode)}失败`,
        error: formatError(error),
      });
    }
  }

  async function analyzeBeforeGenerate(submittedPrompt: string) {
    setShowPromptPresets(false);
    setAnalysisState({
      status: "analyzing",
      mode: "send",
      message: "发送前智能检查",
    });
    try {
      const result = await runPromptAnalysis("send", submittedPrompt);
      if (result.safe && result.riskLevel === "low") {
        setAnalysisState({
          status: "ready",
          mode: "send",
          message: "检查通过，已进入生成队列",
          result,
        });
        await startBatch(undefined, { promptOverride: submittedPrompt });
        window.setTimeout(() => {
          setAnalysisState((current) => current.result === result ? { status: "idle", mode: "send", message: "" } : current);
        }, 1400);
        return;
      }
      setAnalysisState({
        status: "ready",
        mode: "send",
        message: result.riskLevel === "high" ? "建议先修复后生成" : "发现可优化项",
        result,
      });
    } catch (error) {
      setAnalysisState({
        status: "error",
        mode: "send",
        message: "智能分析失败",
        error: formatError(error),
      });
    }
  }

  function continueFromAnalysis({
    useOptimizedPrompt = false,
    applyRecommendedParams = false,
  }: {
    useOptimizedPrompt?: boolean;
    applyRecommendedParams?: boolean;
  } = {}) {
    const result = analysisState.result;
    const submittedPrompt = useOptimizedPrompt && result?.optimizedPrompt ? result.optimizedPrompt : prompt.trim();
    if (!submittedPrompt || !canGenerate) return;
    const nextParams = result ? buildParamsFromAnalysis(result, applyRecommendedParams) : params;
    if (result && applyRecommendedParams) {
      setParams(nextParams);
    }
    triggerSendLaunchAnimation();
    setAnalysisState({ status: "idle", mode: "send", message: "" });
    void startBatch(undefined, { promptOverride: submittedPrompt, paramsOverride: nextParams });
  }

  async function startBatch(
    event?: FormEvent,
    options: { promptOverride?: string; paramsOverride?: ImageParams } = {},
  ) {
    event?.preventDefault();
    if (!canGenerate) return;
    const batchParams = options.paramsOverride || params;
    const total = clampNumber(Number(batchParams.batchCount), 1, 20);
    const concurrency = clampNumber(Number(batchParams.concurrency), 1, 6);
    const batchId = uid();
    const batchCreatedAt = Date.now();
    const submittedPrompt = (options.promptOverride || prompt).trim();
    if (!submittedPrompt) return;
    const snapshotConfig = { ...apiConfig };
    const snapshotParams = {
      ...batchParams,
      batchCount: total,
      concurrency,
      size: batchParams.size || resolveSize(batchParams.aspectRatio),
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
        submittedPrompt,
        selectedModel,
        snapshotParams,
        snapshotReferenceImages,
        batchCreatedAt - index / 1000,
      ),
    );
    setHighlightedRecordId("");
    setVisibleRecords((current) => sortGenerationRecords([...nextJobs, ...current]));
    enqueueJobs(nextJobs, snapshotConfig);
    window.setTimeout(() => {
      setPrompt((current) => (current.trim() === submittedPrompt ? "" : current));
    }, 760);
  }

  function requestStartBatch() {
    if (!canRequestGenerate) return;
    const nextStart = performance.now();
    if (nextStart - startIntentRef.current < 400) return;
    startIntentRef.current = nextStart;
    const submittedPrompt = prompt.trim();
    triggerSendLaunchAnimation();
    void analyzeBeforeGenerate(submittedPrompt);
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
    const nextModels = filterAllowedImageModels(nextDefinition.defaultModels);
    const nextAnalysisModels = filterAnalysisModels(nextDefinition.defaultModels);
    setApiConfig((current) => {
      return {
        ...current,
        protocol,
        baseUrl: normalizeApiBaseUrl(current.baseUrl),
      };
    });
    setModels(nextModels);
    setSelectedModel((current) => preferModel(nextModels, current));
    setAnalysisModels(nextAnalysisModels);
    setSelectedAnalysisModel((current) => preferAnalysisModel(nextAnalysisModels, current));
    setModelFilter("");
    setModelState(
      nextModels.length > 0
        ? { status: "ready", message: `${nextModels.length} 个预设 image-2 模型` }
        : { status: "idle", message: "等待读取 image-2 模型" },
    );
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
    setShowPromptPresets(false);
    window.requestAnimationFrame(resizePromptTextarea);
  }

  function previewCurrent(item: Job | HistoryRecord) {
    const url = (item as Job).imageUrl || (item as HistoryRecord).objectUrl;
    if (!url) return;
    setPreviewItem({
      id: item.id,
      requestId: item.requestId,
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

  function enterStudio() {
    setActivePage("studio");
    if (window.location.hash !== "#studio") {
      window.history.pushState(null, "", "#studio");
    }
    if (showOnboarding) {
      setOnboardingStep(0);
      setIsSettingsOpen(true);
    }
  }

  function enterAdmin() {
    setActivePage("admin");
    if (window.location.hash !== "#admin") {
      window.history.pushState(null, "", "#admin");
    }
  }

  function returnHome() {
    setActivePage("home");
    if (window.location.hash) {
      window.history.pushState(null, "", window.location.pathname);
    }
  }

  function completeOnboarding() {
    localStorage.setItem("imageStudioOnboardingComplete", "true");
    setShowOnboarding(false);
    setOnboardingStep(0);
  }

  const analysisResult = analysisState.result;
  const suggestedRatio = analysisResult?.suggestedParams.aspectRatio;
  const suggestedSize = analysisResult?.suggestedParams.size || (suggestedRatio ? resolveSize(suggestedRatio) : "");
  const suggestedCount = analysisResult?.suggestedParams.count;
  const analysisSourceLabel = analysisResult?.source === "ai"
    ? `AI · ${analysisResult.analysisModel || preferredAnalysisModel}`
    : analysisResult?.analysisModel || "本地预检";
  const frontendUpdateNotice = availableFrontendVersion ? (
    <FrontendUpdateNotice
      version={availableFrontendVersion}
      onRefresh={() => reloadWithFrontendVersion(availableFrontendVersion)}
      onDismiss={() => setAvailableFrontendVersion("")}
    />
  ) : null;

  if (activePage === "home") {
    return (
      <>
        {frontendUpdateNotice}
        <HomePage onEnter={enterStudio} onAdmin={enterAdmin} />
      </>
    );
  }

  if (activePage === "admin") {
    return (
      <>
        {frontendUpdateNotice}
        <AdminApp onBackHome={returnHome} onEnterStudio={enterStudio} />
      </>
    );
  }

  return (
    <>
    {frontendUpdateNotice}
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
            <button type="button" className="topbar-home-button" onClick={returnHome}>
              <WandSparkles size={15} />
              首页
            </button>
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
          className={`composer ${isPromptAnalyzing ? "is-analyzing" : ""}`}
          data-onboarding-target="composer"
          onSubmit={(event) => {
            event.preventDefault();
            requestStartBatch();
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onComposerDrop}
        >
          {showPromptPresets && (
            <div className="prompt-presets-panel">
              <div className="prompt-presets-head">
                <div>
                  <strong>预设提示词</strong>
                  <span>点击模板填入输入框，填入后仍可继续编辑。</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="收起预设提示词"
                  onClick={() => setShowPromptPresets(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="prompt-presets-grid">
                {PROMPT_STARTERS.map((starter) => (
                  <button
                    type="button"
                    className="prompt-preset-card"
                    key={starter.label}
                    onClick={() => applyPromptStarter(starter.prompt)}
                  >
                    <span>{starter.tag}</span>
                    <strong>{starter.label}</strong>
                    <small>{starter.prompt}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
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
          {analysisState.status !== "idle" && (
            <div className={`prompt-analysis-panel ${analysisState.status} risk-${analysisResult?.riskLevel || "low"}`}>
              <div className="analysis-panel-head">
                <div className="analysis-orb" aria-hidden="true">
                  {analysisState.status === "analyzing" ? <Loader2 size={16} className="spin" /> : <WandSparkles size={16} />}
                </div>
                <div>
                  <strong>{analysisState.message || analysisModeLabel(analysisState.mode)}</strong>
                  <span>
                    {analysisState.status === "analyzing"
                      ? currentAnalysisMessage
                      : analysisResult
                        ? `${analysisSourceLabel} · 评分 ${analysisResult.score}`
                        : analysisState.error || "可以稍后重试"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="关闭智能建议"
                  onClick={() => setAnalysisState({ status: "idle", mode: "send", message: "" })}
                >
                  <X size={16} />
                </button>
              </div>

              {analysisState.status === "analyzing" && (
                <div className="analysis-scan">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              {analysisState.status === "error" && (
                <div className="analysis-error">
                  <AlertCircle size={16} />
                  <span>{analysisState.error || "分析接口暂时不可用"}</span>
                  {analysisState.mode === "send" && (
                    <button type="button" className="subtle-button" onClick={() => continueFromAnalysis()}>
                      跳过分析继续生成
                    </button>
                  )}
                </div>
              )}

              {analysisResult && analysisState.status === "ready" && (
                <>
                  <div className="analysis-summary">
                    <div className={`risk-badge ${analysisResult.riskLevel}`}>
                      {analysisResult.riskLevel === "high" ? "高风险" : analysisResult.riskLevel === "medium" ? "建议优化" : "可直接生成"}
                    </div>
                    <p>{analysisResult.summary}</p>
                  </div>

                  {analysisResult.risks.length > 0 && (
                    <div className="analysis-section">
                      <strong>失败预判</strong>
                      <div className="analysis-risk-list">
                        {analysisResult.risks.slice(0, 4).map((risk) => (
                          <div className={`analysis-risk ${risk.level}`} key={`${risk.title}-${risk.level}`}>
                            <span>{risk.title}</span>
                            <small>{risk.description}{risk.fix ? ` · 建议：${risk.fix}` : ""}</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="analysis-section">
                    <strong>参数推荐</strong>
                    <div className="analysis-param-grid">
                      <span>比例 <b>{suggestedRatio || params.aspectRatio}</b></span>
                      <span>尺寸 <b>{suggestedSize || resolvedRequestSize}</b></span>
                      <span>张数 <b>{suggestedCount || params.batchCount}</b></span>
                      <span>风格 <b>{analysisResult.suggestedParams.styleStrength || "medium"}</b></span>
                    </div>
                  </div>

                  <div className="analysis-section">
                    <strong>提示词优化</strong>
                    <div className="optimized-prompt-preview">{analysisResult.optimizedPrompt}</div>
                  </div>

                  {analysisResult.styleEnhancements.length > 0 && (
                    <div className="analysis-section">
                      <strong>风格增强</strong>
                      <div className="style-enhancement-row">
                        {analysisResult.styleEnhancements.slice(0, 4).map((enhancement) => (
                          <button
                            type="button"
                            key={enhancement.name}
                            className="style-enhancement-chip"
                            title={enhancement.description}
                            onClick={() => appendStyleEnhancement(enhancement)}
                          >
                            {enhancement.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="analysis-actions">
                    {analysisState.mode === "send" ? (
                      <>
                        <button
                          type="button"
                          className="primary-action compact"
                          onClick={() => continueFromAnalysis({ useOptimizedPrompt: true, applyRecommendedParams: true })}
                        >
                          <WandSparkles size={15} />
                          使用优化版生成
                        </button>
                        <button type="button" className="subtle-button" onClick={() => continueFromAnalysis()}>
                          原样继续
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="primary-action compact" onClick={() => applyOptimizedPrompt(analysisResult)}>
                          <WandSparkles size={15} />
                          应用优化提示词
                        </button>
                        <button type="button" className="subtle-button" onClick={() => applySuggestedParams(analysisResult)}>
                          应用推荐参数
                        </button>
                      </>
                    )}
                    <button type="button" className="subtle-button" onClick={() => copyPrompt(analysisResult.optimizedPrompt)}>
                      <Copy size={15} />
                      复制优化版
                    </button>
                  </div>
                </>
              )}
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
            <button
              type="button"
              className={`icon-button preset-toggle-button ${!showPromptPresets && !prompt.trim() ? "is-guiding" : ""}`}
              title={showPromptPresets ? "收起预设提示词" : "查看预设提示词"}
              aria-expanded={showPromptPresets}
              onClick={() => setShowPromptPresets((value) => !value)}
            >
              <WandSparkles size={18} />
              <span>预设</span>
            </button>
            <textarea
              ref={promptTextareaRef}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onInput={resizePromptTextarea}
              onFocus={() => setIsPromptFocused(true)}
              onBlur={() => setIsPromptFocused(false)}
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
              title={isPromptAnalyzing ? "正在分析提示词" : "生成"}
              aria-label="生成图片"
              disabled={!canRequestGenerate}
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
          <div className="prompt-assist-bar" aria-label="智能创作工具">
            <button type="button" disabled={!prompt.trim() || isPromptAnalyzing} onClick={() => void requestPromptAssist("optimize")}>
              <WandSparkles size={14} />
              优化提示词
            </button>
            <button type="button" disabled={!prompt.trim() || isPromptAnalyzing} onClick={() => void requestPromptAssist("params")}>
              <Settings2 size={14} />
              参数推荐
            </button>
            <button type="button" disabled={!prompt.trim() || isPromptAnalyzing} onClick={() => void requestPromptAssist("risk")}>
              <ShieldCheck size={14} />
              失败预判
            </button>
            <button type="button" disabled={!prompt.trim() || isPromptAnalyzing} onClick={() => void requestPromptAssist("style")}>
              <WandSparkles size={14} />
              风格增强
            </button>
          </div>
          {showPromptGroupHint && (
            <div className="prompt-group-hint" role="note">
              <WandSparkles size={14} />
              <span>
                推荐使用 <strong>banana Pro 官转</strong> 或 <strong>OpenRouter</strong> 分组。
              </span>
            </div>
          )}
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

        <section className="settings-section" data-onboarding-target="api">
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
            <select
              value={apiConfig.baseUrl}
              onChange={(event) => setApiConfig((current) => ({ ...current, baseUrl: normalizeApiBaseUrl(event.target.value) }))}
            >
              {ALLOWED_API_ENDPOINTS.map((endpoint) => (
                <option key={endpoint.value} value={endpoint.value}>
                  {endpoint.label} · {endpoint.value}
                </option>
              ))}
            </select>
          </label>
          <div className="endpoint-note">
            {ALLOWED_API_ENDPOINTS.find((endpoint) => endpoint.value === apiConfig.baseUrl)?.description || "固定服务地址"}
          </div>
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
            读取/刷新模型
          </button>
          <div className={`status-line ${isAutoLoadingModels ? "loading" : modelState.status}`}>
            {isAutoLoadingModels ? (
              <Loader2 size={15} className="spin" />
            ) : modelState.status === "ready" ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            <span>{isAutoLoadingModels ? "正在自动读取 image-2 模型..." : modelState.message}</span>
          </div>
          <label>
            <span>智能分析 AI</span>
            <select
              value={preferredAnalysisModel}
              disabled={analysisModels.length === 0}
              onChange={(event) => setSelectedAnalysisModel(event.target.value)}
            >
              {analysisModels.length === 0 ? (
                <option value="">未检测到 GPT 分析模型</option>
              ) : (
                analysisModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className={`status-line ${analysisModels.length > 0 ? "ready" : "idle"}`}>
            {analysisModels.length > 0 ? <ShieldCheck size={15} /> : <AlertCircle size={15} />}
            <span>
              {analysisModels.length > 0
                ? `发送前使用 ${preferredAnalysisModel} 做提示词优化、参数推荐和失败预判`
                : "没有 GPT 文本模型时，会先使用本地规则预检"}
            </span>
          </div>
          <div className="local-save-note">
            <Database size={15} />
            <span>生成图片和历史仅保存到当前浏览器本地，服务端只做无状态协议转发。</span>
          </div>
        </section>

        <section className="settings-section" data-onboarding-target="model">
          <div className="section-label with-note">
            <span>可用生图模型</span>
            <small>仅显示 gpt-image-2、gpt-5.4-image-2 或包含 image-2 的模型</small>
          </div>
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
              <div className="muted-box">
                {models.length === 0 ? "暂无可用 image-2 模型" : "无匹配模型"}
              </div>
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
      {showOnboarding && (
        <OnboardingGuide
          step={onboardingStep}
          canGenerate={canGenerate}
          modelState={modelState}
          selectedModel={selectedModel}
          apiKeyReady={apiConfig.apiKey.trim().length > 0}
          onStepChange={setOnboardingStep}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onFinish={completeOnboarding}
        />
      )}
    </div>
    </>
  );
}

function AdminApp({
  onBackHome,
  onEnterStudio,
}: {
  onBackHome: () => void;
  onEnterStudio: () => void;
}) {
  const [user, setUser] = useState<AdminUserView | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "" });
  const [passwordForm, setPasswordForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [adminError, setAdminError] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [logs, setLogs] = useState<AdminRequestLog[]>([]);
  const [logStatus, setLogStatus] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    void refreshDashboard();
    const timer = window.setInterval(() => void refreshDashboard({ quiet: true }), 10_000);
    return () => window.clearInterval(timer);
  }, [user?.username, user?.mustChangePassword, logStatus, logQuery]);

  async function adminFetch<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`/api/admin${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw payload;
    }
    return payload as T;
  }

  async function refreshMe() {
    setIsChecking(true);
    try {
      const payload = await adminFetch<{ ok: true; user: AdminUserView }>("/me");
      setUser(payload.user);
    } catch {
      setUser(null);
    } finally {
      setIsChecking(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setAdminError("");
    setIsSubmitting(true);
    try {
      const payload = await adminFetch<{ ok: true; user: AdminUserView }>("/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      setUser(payload.user);
      setPasswordForm((current) => ({ ...current, oldPassword: loginForm.password }));
    } catch (error) {
      setAdminError(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault();
    setAdminError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setAdminError("两次输入的新密码不一致");
      return;
    }
    setIsSubmitting(true);
    try {
      await adminFetch<{ ok: true }>("/change-password", {
        method: "POST",
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setUser((current) => current ? { ...current, mustChangePassword: false } : current);
    } catch (error) {
      setAdminError(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshDashboard(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setIsLoadingLogs(true);
    try {
      const query = new URLSearchParams();
      if (logStatus) query.set("status", logStatus);
      if (logQuery.trim()) query.set("q", logQuery.trim());
      const [statsPayload, logsPayload] = await Promise.all([
        adminFetch<{ ok: true; stats: AdminStats }>("/stats"),
        adminFetch<{ ok: true; logs: AdminRequestLog[] }>(`/requests?${query.toString()}`),
      ]);
      setStats(statsPayload.stats);
      setLogs(logsPayload.logs);
    } catch (error) {
      setAdminError(formatError(error));
      if ((error as { mustChangePassword?: boolean })?.mustChangePassword) {
        setUser((current) => current ? { ...current, mustChangePassword: true } : current);
      }
    } finally {
      if (!options.quiet) setIsLoadingLogs(false);
    }
  }

  async function handleLogout() {
    try {
      await adminFetch<{ ok: true }>("/logout", { method: "POST", body: "{}" });
    } finally {
      setUser(null);
      setStats(null);
      setLogs([]);
      setAdminError("");
    }
  }

  const topModels = useMemo(
    () => Object.entries(stats?.modelCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5),
    [stats],
  );
  const topErrors = useMemo(
    () => Object.entries(stats?.errorCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 4),
    [stats],
  );

  if (isChecking) {
    return (
      <main className="admin-page">
        <div className="admin-checking">
          <Loader2 className="spin" size={22} />
          <span>正在检查管理员登录状态...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="admin-page">
        <section className="admin-auth-panel">
          <div className="admin-auth-hero">
            <span className="admin-badge"><ShieldCheck size={16} /> Admin Console</span>
            <h1>请求日志与服务健康后台</h1>
            <p>查看所有用户的生成请求、成功率、耗时和失败原因。后台不会记录 API Key，也不会保存生成图片。</p>
            <div className="admin-auth-actions">
              <button type="button" className="subtle-button" onClick={onBackHome}>返回首页</button>
              <button type="button" className="subtle-button" onClick={onEnterStudio}>打开工作台</button>
            </div>
          </div>
          <form className="admin-login-card" onSubmit={handleLogin}>
            <strong>管理员登录</strong>
            <span>首次登录默认账号需要立即重置密码</span>
            <label>
              <span>用户名</span>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                autoComplete="username"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
                placeholder="默认 admin123456"
              />
            </label>
            {adminError && <div className="admin-error">{adminError}</div>}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}
              登录
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="admin-page">
        <section className="admin-reset-panel">
          <div>
            <span className="admin-badge"><ShieldCheck size={16} /> First Login</span>
            <h1>首次登录需要重置管理员密码</h1>
            <p>新密码至少 8 位，并包含字母和数字。完成后会进入日志后台。</p>
          </div>
          <form className="admin-login-card" onSubmit={handlePasswordChange}>
            <strong>重置密码</strong>
            <label>
              <span>当前密码</span>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))}
                autoComplete="current-password"
              />
            </label>
            <label>
              <span>新密码</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>确认新密码</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                autoComplete="new-password"
              />
            </label>
            {adminError && <div className="admin-error">{adminError}</div>}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />}
              保存新密码
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <span className="admin-badge"><ShieldCheck size={16} /> Image Studio Admin</span>
          <h1>请求日志后台</h1>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="subtle-button" onClick={onEnterStudio}>工作台</button>
          <button type="button" className="subtle-button" onClick={() => void refreshDashboard()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button type="button" className="subtle-button" onClick={() => void handleLogout()}>
            <LogOut size={16} />
            退出
          </button>
        </div>
      </header>

      <section className="admin-stat-grid">
        <AdminStatCard label="总请求" value={stats?.total ?? 0} />
        <AdminStatCard label="成功率" value={`${stats?.successRate ?? 0}%`} tone="success" />
        <AdminStatCard label="失败" value={stats?.error ?? 0} tone="error" />
        <AdminStatCard label="平均耗时" value={formatCompactDuration(stats?.avgDurationMs ?? 0)} />
      </section>

      <section className="admin-insight-grid">
        <article className="admin-panel">
          <div className="admin-panel-title">
            <BarChart3 size={17} />
            <strong>模型分布</strong>
          </div>
          {topModels.length === 0 ? (
            <p className="admin-muted">暂无模型请求</p>
          ) : (
            topModels.map(([model, count]) => (
              <div className="admin-rank-row" key={model}>
                <span title={model}>{model}</span>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </article>
        <article className="admin-panel">
          <div className="admin-panel-title">
            <AlertCircle size={17} />
            <strong>常见失败</strong>
          </div>
          {topErrors.length === 0 ? (
            <p className="admin-muted">暂无失败记录</p>
          ) : (
            topErrors.map(([error, count]) => (
              <div className="admin-rank-row" key={error}>
                <span title={error}>{error}</span>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </article>
      </section>

      <section className="admin-panel admin-log-panel">
        <div className="admin-log-toolbar">
          <div>
            <strong>请求记录</strong>
            <span>只记录 requestID、提示词、模型、参数、状态与错误信息</span>
          </div>
          <div className="admin-filter-row">
            <select value={logStatus} onChange={(event) => setLogStatus(event.target.value)}>
              <option value="">全部状态</option>
              <option value="running">运行中</option>
              <option value="success">成功</option>
              <option value="error">失败</option>
            </select>
            <input
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="搜索 requestID / 提示词 / 模型"
            />
          </div>
        </div>
        {adminError && <div className="admin-error">{adminError}</div>}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>Request ID</th>
                <th>提示词</th>
                <th>模型</th>
                <th>参数</th>
                <th>耗时</th>
                <th>时间</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-empty-cell">
                    {isLoadingLogs ? "正在读取日志..." : "暂无请求记录"}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.requestId}>
                    <td><span className={`admin-status ${log.status}`}>{log.status}</span></td>
                    <td><code title={log.requestId}>{log.requestId.slice(0, 8)}</code></td>
                    <td className="admin-prompt-cell" title={log.prompt}>{log.prompt || "-"}</td>
                    <td className="admin-model-cell" title={log.model}>{log.model || "-"}</td>
                    <td>{[log.aspectRatio, log.size, log.outputFormat, log.referenceCount ? `${log.referenceCount} 图` : ""].filter(Boolean).join(" · ") || "-"}</td>
                    <td>{formatCompactDuration(log.durationMs || 0)}</td>
                    <td>{formatFullDate(log.createdAt)}</td>
                    <td className="admin-error-cell" title={log.errorRaw || log.errorMessage || ""}>{log.errorMessage || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function AdminStatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "error";
}) {
  return (
    <article className={`admin-stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HomePage({ onEnter, onAdmin }: { onEnter: () => void; onAdmin: () => void }) {
  const featureBands = [
    {
      title: "批量生成，不打断思路",
      body: "提示词提交后立即进入队列，成功、失败、耗时和尺寸会沉到本地记录里，适合连续探索一组视觉方向。",
    },
    {
      title: "只走指定服务地址",
      body: "前端只允许在太极 AI 与 BobDong 两个服务地址之间选择，避免临时填错请求入口。",
    },
    {
      title: "浏览器本地历史",
      body: "图片 Blob、提示词、模型、宽高比和错误详情写入 IndexedDB，服务器不保存生成结果。",
    },
  ];

  return (
    <main className="home-page">
      <section
        className="home-hero"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(247, 247, 245, 0.96) 0%, rgba(247, 247, 245, 0.84) 34%, rgba(247, 247, 245, 0.1) 72%), url(${homeHeroImage})`,
        }}
      >
        <nav className="home-nav">
          <div className="home-brand">
            <span>
              <WandSparkles size={19} />
            </span>
            <strong>Image Studio</strong>
          </div>
          <button type="button" className="home-nav-action" onClick={onEnter}>
            打开工作台
          </button>
          <button type="button" className="home-admin-link" onClick={onAdmin}>
            <ShieldCheck size={16} />
            管理后台
          </button>
        </nav>

        <div className="home-hero-copy">
          <span className="home-kicker">Local-first batch image generation</span>
          <h1>Image Studio</h1>
          <p>
            一个面向创作者的本地批量生图工作台，把模型选择、参考图、宽高比、并发队列和历史图片收进同一个安静而快速的界面。
          </p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary" onClick={onEnter}>
              开始生成
              <ArrowRight size={18} />
            </button>
            <a className="home-secondary" href="#home-flow">
              了解流程
            </a>
          </div>
        </div>
      </section>

      <section className="home-flow" id="home-flow">
        <div className="home-section-copy">
          <span className="home-kicker">How it works</span>
          <h2>从提示词到图库，保持一条清晰的线。</h2>
        </div>
        <div className="home-feature-grid">
          {featureBands.map((feature) => (
            <article className="home-feature" key={feature.title}>
              <strong>{feature.title}</strong>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-insight">
        <div>
          <span className="home-kicker">Designed for iteration</span>
          <h2>每一次提交都会成为可回看的素材资产。</h2>
        </div>
        <p>
          工作台默认展示所有本地生成记录，失败也会保留完整错误内容，方便你判断是提示词、模型、网络还是服务端响应出了问题。
        </p>
        <button type="button" className="home-primary dark" onClick={onEnter}>
          进入使用界面
          <ArrowRight size={18} />
        </button>
      </section>
    </main>
  );
}

function OnboardingGuide({
  step,
  canGenerate,
  modelState,
  selectedModel,
  apiKeyReady,
  onStepChange,
  onOpenSettings,
  onFinish,
}: {
  step: number;
  canGenerate: boolean;
  modelState: ModelLoadState;
  selectedModel: string;
  apiKeyReady: boolean;
  onStepChange: (step: number) => void;
  onOpenSettings: () => void;
  onFinish: () => void;
}) {
  const steps = [
    {
      target: "api",
      title: "连接你的生图服务",
      body: "先在右侧配置里选择服务地址并填入 API Key。地址已被限制为两个固定入口，避免请求落到未知服务。",
      status: apiKeyReady ? "API Key 已填写" : "等待填写 API Key",
    },
    {
      target: "model",
      title: "读取并选择模型",
      body: "点击读取模型列表，只能从接口返回的模型中选择。模型就绪后，顶部会显示已连接状态。",
      status: modelState.status === "ready" && selectedModel ? `已选择 ${selectedModel}` : modelState.message,
    },
    {
      target: "composer",
      title: "输入提示词并生成",
      body: "回到底部输入框描述画面，选择宽高比、张数和并发。提交后提示词会在发送动画完成后自动清空。",
      status: canGenerate ? "现在可以提交生成" : "等待提示词、模型和比例就绪",
    },
  ];
  const current = steps[step] || steps[0];
  const last = step >= steps.length - 1;
  const [spotlightStyle, setSpotlightStyle] = useState<CSSProperties>({});
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    let raf = 0;
    let scrollTimer = 0;
    const targetSelector = `[data-onboarding-target="${current.target}"]`;

    if (current.target !== "composer") {
      onOpenSettings();
    }

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const measure = () => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const padding = 10;
      const left = clamp(rect.left - padding, 10, window.innerWidth - 40);
      const top = clamp(rect.top - padding, 10, window.innerHeight - 40);
      const width = Math.max(44, Math.min(rect.width + padding * 2, window.innerWidth - left - 10));
      const height = Math.max(44, Math.min(rect.height + padding * 2, window.innerHeight - top - 10));
      const panelWidth = Math.min(420, window.innerWidth - 28);
      const panelHeightEstimate = 250;
      const gap = 18;
      let panelLeft = 14;
      let panelTop = 14;

      if (left > panelWidth + gap + 14) {
        panelLeft = left - panelWidth - gap;
        panelTop = clamp(top, 14, window.innerHeight - panelHeightEstimate - 14);
      } else if (left + width + panelWidth + gap < window.innerWidth - 14) {
        panelLeft = left + width + gap;
        panelTop = clamp(top, 14, window.innerHeight - panelHeightEstimate - 14);
      } else if (top > panelHeightEstimate + gap + 14) {
        panelLeft = clamp(left, 14, window.innerWidth - panelWidth - 14);
        panelTop = top - panelHeightEstimate - gap;
      } else {
        panelLeft = clamp(left, 14, window.innerWidth - panelWidth - 14);
        panelTop = clamp(top + height + gap, 14, window.innerHeight - panelHeightEstimate - 14);
      }

      setSpotlightStyle({
        left,
        top,
        width,
        height,
      });
      setPanelStyle({
        left: panelLeft,
        top: panelTop,
        right: "auto",
        bottom: "auto",
      });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    };

    const target = document.querySelector<HTMLElement>(targetSelector);
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    scheduleMeasure();
    scrollTimer = window.setTimeout(scheduleMeasure, 260);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [current.target]);

  return (
    <div className="onboarding-overlay" role="presentation">
      <div className="onboarding-click-catcher" aria-hidden="true" />
      <div className="onboarding-spotlight" aria-hidden="true" style={spotlightStyle} />
      <div className="onboarding-panel" role="dialog" aria-modal="true" aria-label="首次使用引导" style={panelStyle}>
        <div className="onboarding-progress">
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              className={index === step ? "active" : ""}
              aria-label={`第 ${index + 1} 步`}
              onClick={() => onStepChange(index)}
            />
          ))}
        </div>
        <div className="onboarding-copy">
          <span>首次使用 · 第 {step + 1} 步 / {steps.length}</span>
          <strong>{current.title}</strong>
          <p>{current.body}</p>
          <small>{current.status}</small>
        </div>
        <div className="onboarding-actions">
          <button type="button" className="subtle-button" onClick={onFinish}>
            跳过
          </button>
          {step === 0 && (
            <button type="button" className="subtle-button" onClick={onOpenSettings}>
              打开配置
            </button>
          )}
          <button
            type="button"
            className="primary-action"
            onClick={() => (last ? onFinish() : onStepChange(step + 1))}
          >
            {last ? "完成引导" : "下一步"}
            {!last && <ArrowRight size={16} />}
          </button>
        </div>
      </div>
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

function FrontendUpdateNotice({
  version,
  onRefresh,
  onDismiss,
}: {
  version: string;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="version-update-notice" role="status" aria-live="polite">
      <div>
        <strong>新版本可用</strong>
        <span>检测到前端版本 v{version}，刷新后会加载最新样式和脚本。</span>
      </div>
      <button type="button" className="primary-action compact" onClick={onRefresh}>
        <RefreshCw size={15} />
        刷新
      </button>
      <button type="button" className="icon-button" title="稍后提醒" onClick={onDismiss}>
        <X size={15} />
      </button>
    </div>
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
