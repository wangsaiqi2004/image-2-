import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Copy,
  Database,
  Download,
  DownloadCloud,
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
  Fragment,
  type FormEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import homeHeroImage from "./assets/home-hero.png";
import homePromptPreview from "./assets/home-prompt-preview.png";
import homeStudioPreview from "./assets/home-studio-preview.png";
import imageStudioLogo from "./assets/image-studio-logo.svg";

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

type ImageResolution = "1K" | "2K" | "4K";

type ImageParams = {
  aspectRatio: string;
  size: string;
  resolution: ImageResolution;
  quality: string;
  outputFormat: "png" | "jpeg" | "webp";
  batchCount: number;
  concurrency: number;
  retryLimit: number;
  seed: string;
  negativePrompt: string;
};

type SubmittedReference = {
  name: string;
  type: string;
  dataUrl: string;
  originalBytes: number;
  requestBytes: number;
  compressed: boolean;
};

type ReferenceStatus = "ready" | "warning" | "error";

type UploadedReference = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  thumbnailDataUrl?: string;
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
  agentId?: string;
  agentName?: string;
  agentScenario?: string;
  promptVariant?: PromptVariant;
  attempt?: number;
  maxAttempts?: number;
  submittedReferenceImages?: SubmittedReference[];
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
  referenceImages?: UploadedReference[];
  submittedReferenceImages?: SubmittedReference[];
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
  agentId?: string;
  agentName?: string;
  agentScenario?: string;
  promptVariant?: PromptVariant;
};

type HistoryRecord = Omit<StoredHistoryRecord, "referenceImages"> & {
  referenceImages: UploadedReference[];
  objectUrl?: string;
};

type ModelLoadState = {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
};

type LocalLogLevel = "info" | "success" | "warning" | "error";
type LocalLogType = "model_load" | "api_health" | "prompt_analysis" | "image_generation";

type ReferenceUploadStatus =
  | "none"
  | "prepared"
  | "sent_ok"
  | "sent_failed"
  | "skipped_unsupported";

type ReferenceSummary = {
  hasReferences: boolean;
  count: number;
  totalBytes: number;
  status: ReferenceUploadStatus;
  unsupportedReason?: string;
  items?: Array<{
    name: string;
    type: string;
    originalBytes: number;
    requestBytes: number;
    compressed: boolean;
  }>;
};

type LocalLogEntry = {
  id: string;
  createdAt: number;
  type: LocalLogType;
  level: LocalLogLevel;
  title: string;
  message: string;
  endpoint?: string;
  requestId?: string;
  durationMs?: number;
  referenceSummary?: ReferenceSummary;
  params?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: unknown;
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
  resolution?: ImageResolution;
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
  status: "idle" | "analyzing" | "receiving" | "ready" | "error";
  mode: AnalysisMode;
  message: string;
  result?: PromptAnalysisResult;
  error?: string;
};

type PromptVariant = "stable" | "creative" | "commercial";
type AgentRunPhase = "collecting" | "planning" | "prompting" | "prechecking" | "countdown" | "generating" | "reviewing" | "done";

type AgentField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  required?: boolean;
};

type IndustryAgent = {
  id: string;
  name: string;
  tag: string;
  icon: string;
  scenario: string;
  description: string;
  recommendedRatio: string;
  defaultCount: number;
  defaultQuality: string;
  defaultSubject: string;
  defaultGoal: string;
  defaultScene: string;
  defaultAudience: string;
  clickHint: string;
  emptyStateHint: string;
  defaultValues: Record<string, string>;
  promptBlueprint: string;
  negativePrompt: string;
  fields: AgentField[];
  supplements: string[];
  promptStructures: Record<PromptVariant, string>;
  qualityChecklist: string[];
};

type AgentPlan = {
  agentId: string;
  agentName: string;
  scenario: string;
  brief: string;
  promptVariants: Record<PromptVariant, string>;
  recommendedParams: Partial<ImageParams>;
  negativePrompt: string;
  risks: PromptRisk[];
  notes: string[];
};

type AgentContext = {
  plan: AgentPlan;
  variant: PromptVariant;
};

type AnalysisCountdown = {
  runId: string;
  secondsLeft: number;
  prompt: string;
  params: ImageParams;
  referenceImages: UploadedReference[];
  result?: PromptAnalysisResult;
  agentContext?: AgentContext;
  label: string;
};

type PreviewItem = {
  id: string;
  requestId?: string;
  url?: string;
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
  agentId?: string;
  agentName?: string;
  agentScenario?: string;
  promptVariant?: PromptVariant;
  submittedReferenceImages?: SubmittedReference[];
};

type AppPage = "home" | "studio" | "admin";

type AdminUserView = {
  username: string;
  mustChangePassword: boolean;
};

type AdminRequestLog = {
  requestId: string;
  requestType?: "image_generation" | "prompt_analysis";
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
  upstreamPayloadKeys?: string[];
  upstreamReferenceCount?: number;
  upstreamReferenceMode?: string;
  upstreamSize?: string;
  requestParams?: unknown;
  upstreamRequest?: unknown;
  responseBody?: unknown;
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
const MAX_REFERENCE_REQUEST_BYTES = 512 * 1024;
const REFERENCE_REQUEST_MAX_EDGE = 1536;
const MIN_REFERENCE_EDGE = 128;
const LARGE_REFERENCE_EDGE = 4096;
const PROMPT_TEXTAREA_MAX_HEIGHT = 220;
const FRONTEND_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const API_KEY_MIN_LENGTH = 8;
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
const DEFAULT_IMAGE_RESOLUTION: ImageResolution = "1K";
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

const IMAGE_RESOLUTIONS: Array<{ value: ImageResolution; label: string; hint: string; multiplier: number }> = [
  { value: "1K", label: "1K 标准", hint: "速度优先，适合批量预览", multiplier: 1 },
  { value: "2K", label: "2K 高清", hint: "更清晰，适合交付候选", multiplier: 2 },
  { value: "4K", label: "4K 超清", hint: "高成本，取决于模型支持", multiplier: 4 },
];

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
    description: "OpenAI 风格 Images API，宽高比会转换为 size 参数",
    defaultBaseUrl: DEFAULT_API_URL,
    defaultModels: ["gpt-image-1"],
    supportedAspectRatios: OPENAI_ASPECT_RATIOS,
    supportsReferenceImages: true,
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

const PROMPT_VARIANT_LABELS: Record<PromptVariant, string> = {
  stable: "稳定版",
  creative: "创意版",
  commercial: "商业版",
};

const COMMON_AGENT_NEGATIVE_PROMPT = "低清晰度，主体变形，错误文字，杂乱背景，比例失真，廉价模板感，过度锐化，AI伪影";

const INDUSTRY_AGENTS: IndustryAgent[] = [
  {
    id: "ecommerce-product",
    name: "电商商品图",
    tag: "商业高频",
    icon: "商",
    scenario: "商品主图 / 场景图 / 详情页配图",
    description: "把商品卖点、材质和平台构图转成商业摄影方案。",
    recommendedRatio: "1:1",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "现代消费电子产品",
    defaultGoal: "生成可直接用于商品主图、场景图和详情页首屏的高质感商业摄影图。",
    defaultScene: "纯净棚拍电商主图，干净浅灰背景，商品完整居中。",
    defaultAudience: "电商运营、品牌营销和正在浏览商品详情页的潜在买家。",
    clickHint: "打开电商商品图工作流",
    emptyStateHint: "不填写也会默认生成现代消费电子产品的电商主图方案。",
    defaultValues: {
      productName: "现代消费电子产品",
      material: "磨砂金属与细腻织物纹理",
      sellingPoint: "高质感、主体清晰、材质真实、平台可直接使用",
      scene: "纯净棚拍",
      platform: "电商主图",
      blank: "不需要",
    },
    promptBlueprint: "商品主体 + 材质细节 + 平台用途 + 商业棚拍布光 + 干净背景 + 商品占比 + 可交付电商视觉",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，商品变形，过度反光，低质感，道具喧宾夺主`,
    fields: [
      { id: "productName", label: "商品名称", type: "text", required: true, placeholder: "例如：黑色智能音箱" },
      { id: "material", label: "材质 / 颜色", type: "text", placeholder: "磨砂黑金属、织物网面" },
      { id: "sellingPoint", label: "核心卖点", type: "textarea", placeholder: "音质、质感、便携、礼品感等" },
      { id: "scene", label: "使用场景", type: "select", options: ["纯净棚拍", "居家桌面", "礼盒场景", "户外生活方式", "高级灰背景"], defaultValue: "纯净棚拍" },
      { id: "platform", label: "目标平台", type: "select", options: ["电商主图", "电商详情页", "品牌官网", "广告投放", "私域海报"], defaultValue: "电商主图" },
      { id: "blank", label: "留白位置", type: "select", options: ["不需要", "上方留白", "左侧留白", "右侧留白", "底部留白"], defaultValue: "不需要" },
    ],
    supplements: ["商业摄影布光", "商品占比明确", "材质细节清晰", "背景干净", "适合电商合规构图"],
    promptStructures: {
      stable: "主体为现代消费电子产品，产品完整清晰，占据画面中心，干净浅灰背景，柔和双侧棚拍布光，真实材质纹理，边缘清晰，轻微自然投影。",
      creative: "保持商品结构真实，加入高级生活方式陈列、氛围光和轻叙事背景，让商品更有记忆点但不喧宾夺主。",
      commercial: "强调广告可交付质感，卖点可视化，背景克制，构图适合电商主图、详情页首屏和品牌页面。",
    },
    qualityChecklist: ["商品完整清晰", "主体占比明确", "材质真实", "背景干净", "适合电商平台"],
  },
  {
    id: "xiaohongshu-cover",
    name: "小红书封面",
    tag: "社媒增长",
    icon: "封",
    scenario: "笔记封面 / 种草图 / 干货图",
    description: "自动补全移动端识别、标题留白和种草氛围。",
    recommendedRatio: "4:5",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "精致生活方式场景与种草产品",
    defaultGoal: "生成手机端高识别、可叠加标题的小红书封面。",
    defaultScene: "干净生活方式画面，主体居中，上方保留标题区域。",
    defaultAudience: "小红书内容创作者、品牌种草运营和移动端浏览用户。",
    clickHint: "打开小红书封面工作流",
    emptyStateHint: "不填写也会默认生成精致生活方式种草封面。",
    defaultValues: {
      topic: "春日通勤包里有什么",
      audience: "年轻职场女性",
      subject: "精致桌面、通勤包和生活方式产品",
      emotion: "精致种草",
      titleSpace: "上方留白",
      style: "生活方式摄影",
    },
    promptBlueprint: "内容主题 + 移动端强识别 + 视觉中心 + 标题留白 + 情绪关键词 + 种草氛围 + 干净层级",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，杂乱排版，畸形人物，过度磨皮，主体不清晰，标题区域拥挤`,
    fields: [
      { id: "topic", label: "笔记主题", type: "text", required: true, placeholder: "例如：早八通勤包里有什么" },
      { id: "audience", label: "目标人群", type: "text", placeholder: "大学生、职场新人、精致妈妈" },
      { id: "subject", label: "画面主体", type: "text", placeholder: "人物、产品、桌面、场景" },
      { id: "emotion", label: "情绪关键词", type: "select", options: ["高级松弛", "强烈反差", "治愈温暖", "干货清晰", "精致种草"], defaultValue: "精致种草" },
      { id: "titleSpace", label: "标题留白", type: "select", options: ["上方留白", "左上留白", "右上留白", "中间标题区", "不需要文字区"], defaultValue: "上方留白" },
      { id: "style", label: "风格方向", type: "select", options: ["生活方式摄影", "强标题封面", "产品种草", "极简干货", "胶片氛围"], defaultValue: "生活方式摄影" },
    ],
    supplements: ["手机屏幕强识别", "视觉中心明确", "标题留白", "高点击率构图", "信息层级清晰"],
    promptStructures: {
      stable: "主体明确居中，上方保留标题留白，柔和自然光，高级干净配色，画面有种草感和真实生活氛围，移动端一眼可读。",
      creative: "增强颜色反差、情绪表达和封面记忆点，保留标题安全区，适合探索高点击率封面方向。",
      commercial: "保持高级生活方式质感和品牌可信度，构图可叠加标题，色彩统一，适合品牌种草和内容投放。",
    },
    qualityChecklist: ["手机端可读", "视觉中心明确", "标题留白清楚", "种草感强", "背景不杂乱"],
  },
  {
    id: "short-video-cover",
    name: "短视频封面",
    tag: "高点击",
    icon: "视",
    scenario: "抖音 / TikTok / Reels / Shorts 封面",
    description: "把视频主题提炼成一秒能看懂的竖屏首帧。",
    recommendedRatio: "9:16",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "大主体人物或核心物品",
    defaultGoal: "生成 1 秒内可读的竖屏短视频首帧封面。",
    defaultScene: "强视觉中心、顶部标题区、竖屏安全构图。",
    defaultAudience: "抖音、TikTok、Reels、Shorts 的快速滑动用户。",
    clickHint: "打开短视频封面工作流",
    emptyStateHint: "不填写也会默认生成强对比竖屏短视频封面。",
    defaultValues: {
      videoTopic: "3 个让房间显贵的软装技巧",
      platform: "抖音",
      subject: "博主与室内空间对比",
      conflict: "普通房间到高级感空间的前后对比",
      titleArea: "上方标题区",
      emotion: "强冲击",
    },
    promptBlueprint: "视频主题 + 大主体 + 冲突点 + 强对比 + 字幕安全区 + 快速识别 + 竖屏构图",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，主体太小，低对比，背景干扰，表情僵硬，画面拖沓`,
    fields: [
      { id: "videoTopic", label: "视频主题", type: "text", required: true, placeholder: "例如：3 个让房间显贵的软装技巧" },
      { id: "platform", label: "平台", type: "select", options: ["抖音", "TikTok", "Reels", "Shorts", "视频号"], defaultValue: "抖音" },
      { id: "subject", label: "主体人物 / 产品", type: "text", placeholder: "博主、产品、场景或道具" },
      { id: "conflict", label: "冲突点", type: "textarea", placeholder: "前后对比、常见误区、意外结果" },
      { id: "titleArea", label: "字幕安全区", type: "select", options: ["上方标题区", "中间大标题", "下方字幕区", "左右留白"], defaultValue: "上方标题区" },
      { id: "emotion", label: "情绪强度", type: "select", options: ["强冲击", "惊讶表情", "专业可信", "轻松幽默", "克制高级"], defaultValue: "强冲击" },
    ],
    supplements: ["9:16 竖屏构图", "大主体", "强对比", "字幕安全区", "快速识别"],
    promptStructures: {
      stable: "9:16 竖屏首帧图，主体足够大，表情或核心物品醒目，强对比背景，顶部保留标题安全区，画面在 1 秒内能看懂主题。",
      creative: "加强冲突、表情张力和视觉对比，让封面更有停留感和点击欲望，同时保持字幕区域清晰。",
      commercial: "保持专业质感和品牌可信度，适合课程、知识、产品视频封面，画面醒目但不过度夸张。",
    },
    qualityChecklist: ["1 秒内看懂主题", "主体足够大", "标题安全区清楚", "情绪明确", "背景不干扰"],
  },
  {
    id: "brand-poster",
    name: "品牌海报",
    tag: "主视觉",
    icon: "品",
    scenario: "活动海报 / 发布会图 / 官网头图",
    description: "建立主视觉、调性、色彩秩序和文案区域。",
    recommendedRatio: "4:5",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "现代生活方式品牌主视觉",
    defaultGoal: "生成活动、发布会或官网可用的高级商业主视觉。",
    defaultScene: "品牌发布海报，主视觉居中，文案区域干净留白。",
    defaultAudience: "品牌市场团队、活动运营和官网访客。",
    clickHint: "打开品牌海报工作流",
    emptyStateHint: "不填写也会默认生成极简高级品牌发布主视觉。",
    defaultValues: {
      brand: "现代生活方式品牌",
      campaign: "新品发布主视觉",
      tone: "极简高级",
      visual: "产品与抽象光影装置",
      color: "黑白银与淡绿色点缀",
      copyArea: "上方留白",
    },
    promptBlueprint: "品牌调性 + 活动主题 + 主视觉元素 + 留白区域 + 色彩秩序 + 商业海报质感",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，廉价模板感，视觉中心混乱，色彩脏，过度装饰`,
    fields: [
      { id: "brand", label: "品牌名称", type: "text", placeholder: "可选，不需要生成文字时也可只填调性" },
      { id: "campaign", label: "活动主题", type: "text", required: true, placeholder: "新品发布、节日营销、品牌升级" },
      { id: "tone", label: "品牌调性", type: "select", options: ["极简高级", "科技未来", "年轻潮流", "温暖生活", "东方美学"], defaultValue: "极简高级" },
      { id: "visual", label: "主视觉元素", type: "text", placeholder: "产品、符号、装置、自然元素" },
      { id: "color", label: "色彩方向", type: "text", placeholder: "黑白银、薄荷绿、暖金色" },
      { id: "copyArea", label: "文案区域", type: "select", options: ["上方留白", "左侧留白", "右侧留白", "底部留白", "中心主标题"], defaultValue: "上方留白" },
    ],
    supplements: ["品牌调性统一", "主视觉中心", "留白区域", "商业海报质感", "色彩秩序"],
    promptStructures: {
      stable: "高级商业主视觉，画面有明确主视觉中心，统一色彩秩序，干净留白区域可放文案，适合活动页、发布会、官网头图。",
      creative: "加入更有记忆点的视觉隐喻、装置感和空间层次，形成可作为发布会主 KV 的强视觉。",
      commercial: "强调可交付商业海报，色彩统一，视觉秩序清楚，画面高级、克制、适合官网和广告投放。",
    },
    qualityChecklist: ["主视觉明确", "留白可放文案", "品牌调性统一", "色彩干净", "商业交付感强"],
  },
  {
    id: "interior-space",
    name: "室内空间",
    tag: "设计灵感",
    icon: "室",
    scenario: "室内效果图 / 软装方案 / 空间灵感",
    description: "补全空间层次、材质、镜头焦段和真实自然光。",
    recommendedRatio: "4:3",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "现代极简客厅空间",
    defaultGoal: "生成真实可信的室内设计参考图和软装方案图。",
    defaultScene: "80 平现代公寓客厅，清晨自然光，材质真实，空间层次清楚。",
    defaultAudience: "室内设计师、装修业主、家居品牌和方案汇报用户。",
    clickHint: "打开室内空间工作流",
    emptyStateHint: "不填写也会默认生成现代极简客厅设计参考图。",
    defaultValues: {
      spaceType: "客厅",
      scale: "80 平现代公寓",
      style: "现代极简",
      materials: "木饰面、亚麻、浅色石材",
      light: "清晨自然光",
      camera: "人眼平视",
    },
    promptBlueprint: "空间类型 + 面积尺度 + 设计风格 + 主材 + 自然光 + 镜头角度 + 合理透视 + 真实摄影感",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，空间透视错误，家具变形，材质虚假，过曝，布局杂乱`,
    fields: [
      { id: "spaceType", label: "空间类型", type: "select", options: ["客厅", "卧室", "餐厅", "书房", "办公室", "商业空间"], defaultValue: "客厅" },
      { id: "scale", label: "面积 / 尺度", type: "text", placeholder: "例如：80 平现代公寓" },
      { id: "style", label: "风格", type: "select", options: ["现代极简", "奶油风", "侘寂", "中古风", "自然原木", "科技办公"], defaultValue: "现代极简" },
      { id: "materials", label: "主材", type: "text", placeholder: "木饰面、微水泥、石材、亚麻" },
      { id: "light", label: "光线", type: "select", options: ["清晨自然光", "午后侧光", "柔和夜景灯光", "大面积落地窗", "商业摄影灯光"], defaultValue: "清晨自然光" },
      { id: "camera", label: "镜头角度", type: "select", options: ["广角空间", "人眼平视", "角落斜拍", "细节特写", "中景生活感"], defaultValue: "人眼平视" },
    ],
    supplements: ["空间层次", "真实材质", "自然光", "透视合理", "家具布局"],
    promptStructures: {
      stable: "现代客厅真实室内摄影，自然光进入空间，合理透视，家具布局舒适，木饰面、亚麻与浅色石材材质真实，空间层次清楚。",
      creative: "强化风格叙事、材质对比和生活痕迹，提供更有灵感感的空间方案。",
      commercial: "强调设计方案图可交付感，干净高级，适合提案、官网和案例展示。",
    },
    qualityChecklist: ["透视自然", "家具比例合理", "材质真实", "光线舒适", "空间有层次"],
  },
  {
    id: "portrait-photo",
    name: "人像写真",
    tag: "人物形象",
    icon: "人",
    scenario: "头像 / 半身写真 / 商务形象照",
    description: "自动补全妆造、姿态、光线、背景和镜头语言。",
    recommendedRatio: "3:4",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "自然半身人像",
    defaultGoal: "生成自然专业的人像写真、头像和商务形象候选图。",
    defaultScene: "窗边浅色室内，柔和侧逆光，背景干净，浅景深。",
    defaultAudience: "个人形象用户、品牌创始人、内容创作者和摄影工作室。",
    clickHint: "打开人像写真工作流",
    emptyStateHint: "不填写也会默认生成自然半身人像写真。",
    defaultValues: {
      portraitType: "自然写真",
      temperament: "年轻、温柔、专业、松弛",
      styling: "淡妆、白色针织衫、干净发型",
      scene: "窗边浅色室内",
      light: "柔和侧逆光",
      pose: "自然微笑，看向镜头，放松坐姿",
    },
    promptBlueprint: "人像类型 + 气质 + 妆造服装 + 场景 + 光线 + 表情姿态 + 镜头语言 + 真实肤色",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，畸形五官，畸形手部，过度磨皮，表情僵硬，背景杂乱`,
    fields: [
      { id: "portraitType", label: "人像类型", type: "select", options: ["自然写真", "商务形象", "头像", "杂志大片", "生活方式"], defaultValue: "自然写真" },
      { id: "temperament", label: "年龄气质", type: "text", placeholder: "年轻、成熟、温柔、专业、松弛" },
      { id: "styling", label: "妆造 / 服装", type: "textarea", placeholder: "淡妆、白衬衫、针织衫、干净发型" },
      { id: "scene", label: "场景", type: "text", placeholder: "窗边、街角、棚拍灰背景、咖啡馆" },
      { id: "light", label: "光线", type: "select", options: ["柔和侧逆光", "自然窗光", "棚拍柔光", "日落暖光", "电影感暗调"], defaultValue: "柔和侧逆光" },
      { id: "pose", label: "表情姿态", type: "text", placeholder: "自然微笑、看向镜头、侧脸、放松坐姿" },
    ],
    supplements: ["肤色真实", "柔和光线", "浅景深", "自然表情", "背景干净"],
    promptStructures: {
      stable: "自然半身人像写真，柔和侧逆光，真实肤色，浅景深，表情放松，背景干净，适合头像和写真交付。",
      creative: "加入更强杂志感镜头、胶片质感和叙事氛围，适合探索视觉风格。",
      commercial: "强调专业可信的形象照质感，光线高级，构图稳重，适合商务和品牌展示。",
    },
    qualityChecklist: ["五官自然", "肤色真实", "手部不异常", "表情放松", "光线高级"],
  },
  {
    id: "food-photo",
    name: "餐饮美食",
    tag: "菜单转化",
    icon: "食",
    scenario: "菜品图 / 外卖主图 / 餐厅宣传图",
    description: "补全食物质感、摆盘、蒸汽和商业美食摄影语言。",
    recommendedRatio: "1:1",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "番茄牛腩饭",
    defaultGoal: "生成菜单、外卖主图和餐厅宣传可用的商业美食图。",
    defaultScene: "干净浅色桌面，菜品清晰，热气蒸腾，食欲感强。",
    defaultAudience: "餐饮商家、外卖运营、菜单设计和餐厅推广用户。",
    clickHint: "打开餐饮美食工作流",
    emptyStateHint: "不填写也会默认生成番茄牛腩饭商业菜单图。",
    defaultValues: {
      dish: "番茄牛腩饭",
      cuisine: "中式轻食",
      ingredients: "牛肉块、番茄浓汁、新鲜香草",
      plating: "外卖主图",
      background: "干净浅色桌面",
      freshness: "热气蒸腾",
    },
    promptBlueprint: "菜品名称 + 菜系 + 食材亮点 + 摆盘 + 背景 + 新鲜感 + 商业美食摄影 + 食欲质感",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，食物不新鲜，颜色失真，油腻脏乱，餐具变形，塑料质感，过度假`,
    fields: [
      { id: "dish", label: "菜品名称", type: "text", required: true, placeholder: "例如：番茄牛腩饭" },
      { id: "cuisine", label: "菜系", type: "text", placeholder: "中式、日式、意式、轻食" },
      { id: "ingredients", label: "食材亮点", type: "textarea", placeholder: "牛肉块、番茄浓汁、新鲜香草" },
      { id: "plating", label: "摆盘风格", type: "select", options: ["外卖主图", "高级餐厅摆盘", "家庭餐桌", "微距特写", "节日套餐"], defaultValue: "外卖主图" },
      { id: "background", label: "背景", type: "select", options: ["干净浅色桌面", "木质餐桌", "深色高级背景", "厨房现场", "节日氛围"], defaultValue: "干净浅色桌面" },
      { id: "freshness", label: "新鲜感", type: "select", options: ["热气蒸腾", "清爽新鲜", "酱汁光泽", "酥脆质感", "克制自然"], defaultValue: "热气蒸腾" },
    ],
    supplements: ["食物质感", "微距细节", "新鲜色泽", "餐桌氛围", "商业美食摄影"],
    promptStructures: {
      stable: "商业菜单图，菜品清晰有食欲，色泽自然，柔和侧光，热气蒸腾，干净摆盘，适合菜单或外卖主图。",
      creative: "加入更强氛围光、蒸汽和食材特写，让画面更有香气和记忆点。",
      commercial: "强调餐饮品牌交付质感，摆盘高级，背景克制，适合广告和宣传图。",
    },
    qualityChecklist: ["食物有食欲", "色泽自然", "构图干净", "摆盘清楚", "适合菜单或外卖"],
  },
  {
    id: "saas-promo",
    name: "App / SaaS 宣传图",
    tag: "科技营销",
    icon: "软",
    scenario: "官网头图 / App 展示 / 功能介绍图",
    description: "把功能卖点变成设备 mockup、数据感和官网视觉。",
    recommendedRatio: "16:9",
    defaultCount: 4,
    defaultQuality: "high",
    defaultSubject: "AI 图像工作台产品展示",
    defaultGoal: "生成官网头图、产品展示图和功能介绍主视觉。",
    defaultScene: "桌面网页设备 mockup，干净白色背景，科技光影和产品界面层级。",
    defaultAudience: "SaaS 团队、设计团队、运营团队和企业采购用户。",
    clickHint: "打开 App / SaaS 宣传图工作流",
    emptyStateHint: "不填写也会默认生成 AI 图像工作台官网宣传图。",
    defaultValues: {
      productType: "AI 图像工作台",
      coreFeature: "批量生图、行业 Agent、提示词优化、本地图库",
      audience: "设计团队、运营与企业客户",
      device: "桌面网页",
      style: "Apple 官网感",
      background: "干净白色",
    },
    promptBlueprint: "产品类型 + 核心功能 + 目标用户 + 设备 mockup + UI 层级 + 科技光影 + 官网留白",
    negativePrompt: `${COMMON_AGENT_NEGATIVE_PROMPT}，伪界面混乱，文字错误，层级不清，廉价科技感，过度复杂`,
    fields: [
      { id: "productType", label: "产品类型", type: "text", required: true, placeholder: "AI 图库、CRM、数据看板、效率工具" },
      { id: "coreFeature", label: "核心功能", type: "textarea", placeholder: "批量生图、智能分析、团队管理、自动化报表" },
      { id: "audience", label: "目标用户", type: "text", placeholder: "设计团队、运营、企业客户、开发者" },
      { id: "device", label: "展示设备", type: "select", options: ["桌面网页", "手机 App", "平板设备", "多设备组合", "抽象界面层"], defaultValue: "桌面网页" },
      { id: "style", label: "UI 风格", type: "select", options: ["Apple 官网感", "ChatGPT 极简", "企业级 SaaS", "深色科技", "明亮数据感"], defaultValue: "Apple 官网感" },
      { id: "background", label: "背景风格", type: "select", options: ["干净白色", "柔和渐变光", "深色发布会", "真实办公场景", "抽象数据空间"], defaultValue: "干净白色" },
    ],
    supplements: ["产品界面展示", "设备 mockup", "清晰层级", "科技光影", "官网留白"],
    promptStructures: {
      stable: "官网头图风格，真实设备 mockup，产品界面层级清晰，数据感和科技光影适度，干净白色背景，留白充足。",
      creative: "加入抽象数据流、光影空间和发布会感，让科技产品更有视觉冲击。",
      commercial: "强调 B2B 可交付营销图，真实可信，留白充足，适合官网和销售资料。",
    },
    qualityChecklist: ["产品功能清晰", "设备 mockup 真实", "UI 层级明确", "留白充足", "适合官网营销"],
  },
];

function createAgentDefaults(agent: IndustryAgent) {
  return agent.fields.reduce<Record<string, string>>((values, field) => {
    values[field.id] = agent.defaultValues[field.id] || field.defaultValue || "";
    return values;
  }, {});
}

function compactAgentValues(agent: IndustryAgent, values: Record<string, string>) {
  return agent.fields
    .map((field) => {
      const value = (values[field.id] || agent.defaultValues[field.id] || field.defaultValue || "").trim();
      return value ? `${field.label}：${value}` : "";
    })
    .filter(Boolean);
}

function hasAgentUserOverrides(agent: IndustryAgent, values: Record<string, string>) {
  return agent.fields.some((field) => {
    const value = (values[field.id] || "").trim();
    const defaultValue = (agent.defaultValues[field.id] || field.defaultValue || "").trim();
    return value.length > 0 && value !== defaultValue;
  });
}

function buildAgentPrompt(agent: IndustryAgent, values: Record<string, string>, variant: PromptVariant) {
  const details = compactAgentValues(agent, values);
  return [
    `行业类型：${agent.name}，${agent.scenario}`,
    `业务目标：${agent.defaultGoal}`,
    `主体：${agent.defaultSubject}`,
    `使用场景：${agent.defaultScene}`,
    `目标受众：${agent.defaultAudience}`,
    `业务信息：${details.join("；")}。`,
    `平台/比例约束：${agent.recommendedRatio}，画面可直接用于${agent.scenario}。`,
    `构图：主体清晰，视觉中心明确，保留必要文案区或平台安全区。`,
    `光线：真实自然，符合${agent.name}的专业摄影语言。`,
    `背景：干净、有层次，不干扰主体。`,
    `镜头/材质/细节：${agent.supplements.join("，")}。`,
    `提示词蓝图：${agent.promptBlueprint}`,
    `版本策略：${agent.promptStructures[variant]}`,
    `负面控制：${agent.negativePrompt}`,
    `交付标准：${agent.qualityChecklist.join("；")}。高细节，真实光影，专业商业视觉，可交付成片。`,
  ].join("\n");
}

function buildAgentPlan(agent: IndustryAgent, values: Record<string, string>): AgentPlan {
  const filledValues = compactAgentValues(agent, values);
  const hasOverrides = hasAgentUserOverrides(agent, values);
  const brief = [
    `画面目标：${agent.defaultGoal}`,
    `默认主体：${agent.defaultSubject}。`,
    `默认场景：${agent.defaultScene}`,
    filledValues.length ? `业务信息：${filledValues.join("；")}。` : "业务信息：用户未填写，系统按行业默认值补全。",
    `构图方案：推荐 ${agent.recommendedRatio}，主体明确，保留必要文案或平台安全区。`,
    `风格关键词：${agent.supplements.join("，")}。`,
    `质量检查：${agent.qualityChecklist.join("；")}。`,
  ].join("\n");

  return {
    agentId: agent.id,
    agentName: agent.name,
    scenario: agent.scenario,
    brief,
    promptVariants: {
      stable: buildAgentPrompt(agent, values, "stable"),
      creative: buildAgentPrompt(agent, values, "creative"),
      commercial: buildAgentPrompt(agent, values, "commercial"),
    },
    recommendedParams: {
      aspectRatio: agent.recommendedRatio,
      size: resolveSize(agent.recommendedRatio),
      batchCount: agent.defaultCount,
      quality: agent.defaultQuality,
      negativePrompt: agent.negativePrompt,
    },
    negativePrompt: agent.negativePrompt,
    risks: [
      {
        level: "low",
        title: "文字渲染需后期确认",
        description: "如果画面中需要精确标题或品牌字样，建议生成后用设计工具补字。",
        fix: "把模型负责的内容聚焦到画面、留白和视觉层级。",
      },
    ],
    notes: [
      hasOverrides ? "已根据你的补充重新规划。" : agent.emptyStateHint,
      `已按「${agent.name}」补全行业摄影语言、比例、负面提示词和质量检查项。`,
      "选择 variant 后系统会把提示词填入输入框，你可以继续编辑再点生成。",
    ],
  };
}

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

const LOCAL_LOG_STORAGE_KEY = "imageStudioLocalRequestLogs";
const LOCAL_LOG_LIMIT = 200;
const LOG_TEXT_LIMIT = 800;

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

function normalizeStoredReferenceImages(value: unknown): UploadedReference[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<UploadedReference[]>((images, item, index) => {
    if (!item || typeof item !== "object") return images;
    const record = item as Partial<UploadedReference>;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
    if (!dataUrl) return images;
    const status = record.status === "error" || record.status === "warning" || record.status === "ready"
      ? record.status
      : "ready";
    images.push({
      id: typeof record.id === "string" ? record.id : `reference-${index + 1}`,
      name: typeof record.name === "string" && record.name ? record.name : `参考图 ${index + 1}`,
      type: typeof record.type === "string" && record.type ? record.type : "image/png",
      size: typeof record.size === "number" && Number.isFinite(record.size) ? record.size : 0,
      dataUrl,
      thumbnailDataUrl: typeof record.thumbnailDataUrl === "string" && record.thumbnailDataUrl
        ? record.thumbnailDataUrl
        : dataUrl,
      width: typeof record.width === "number" ? record.width : undefined,
      height: typeof record.height === "number" ? record.height : undefined,
      status,
      message: typeof record.message === "string" ? record.message : undefined,
    });
    return images;
  }, []);
}

function referenceImagesForHistory(images: UploadedReference[]) {
  return normalizeStoredReferenceImages(images).map((image) => ({ ...image }));
}

function dataUrlByteLength(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

function mimeFromDataUrl(dataUrl: string, fallback = "image/png") {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] || fallback;
}

function withImageExtension(name: string, mime: string) {
  const ext = mime === "image/jpeg" ? "jpg" : mime.replace(/^image\//, "") || "png";
  const base = name.replace(/\.(png|jpe?g|webp)$/i, "") || "reference";
  return `${base}.${ext}`;
}

function renderReferenceForRequest(imageDataUrl: string, maxEdge: number, mime: string, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longestEdge > 0 ? Math.min(1, maxEdge / longestEdge) : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        reject(new Error("无法压缩参考图"));
        return;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL(mime, quality));
    };
    image.onerror = () => reject(new Error("无法读取参考图"));
    image.src = imageDataUrl;
  });
}

async function prepareReferenceForRequest(image: UploadedReference) {
  const originalBytes = dataUrlByteLength(image.dataUrl);
  const longestEdge = Math.max(image.width || 0, image.height || 0);
  if (originalBytes <= MAX_REFERENCE_REQUEST_BYTES && longestEdge <= REFERENCE_REQUEST_MAX_EDGE) {
    return {
      name: image.name,
      type: image.type,
      dataUrl: image.dataUrl,
      originalBytes,
      requestBytes: originalBytes,
      compressed: false,
    };
  }

  let best = image.dataUrl;
  const edges = [REFERENCE_REQUEST_MAX_EDGE, 1280, 1024];
  const qualities = [0.82, 0.72, 0.62];
  for (const edge of edges) {
    for (const quality of qualities) {
      try {
        const next = await renderReferenceForRequest(image.dataUrl, edge, "image/webp", quality);
        if (dataUrlByteLength(next) < dataUrlByteLength(best)) best = next;
        if (dataUrlByteLength(next) <= MAX_REFERENCE_REQUEST_BYTES) {
          const type = mimeFromDataUrl(next, "image/webp");
          return {
            name: withImageExtension(image.name, type),
            type,
            dataUrl: next,
            originalBytes,
            requestBytes: dataUrlByteLength(next),
            compressed: true,
          };
        }
      } catch {
        // Try the next compression setting.
      }
    }
  }

  const type = mimeFromDataUrl(best, image.type);
  return {
    name: withImageExtension(image.name, type),
    type,
    dataUrl: best,
    originalBytes,
    requestBytes: dataUrlByteLength(best),
    compressed: best !== image.dataUrl,
  };
}

async function referenceImagesForRequest(images: UploadedReference[]) {
  const prepared = await Promise.all(images.map(prepareReferenceForRequest));
  return prepared.map((image) => ({
    name: image.name,
    type: image.type,
    dataUrl: image.dataUrl,
  }));
}

function preparedReferenceMetaForLog(images: Array<{ name: string; type: string; dataUrl: string }>) {
  return images.map((image, index) => ({
    index,
    name: image.name,
    type: image.type,
    requestBytes: dataUrlByteLength(image.dataUrl),
  }));
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

function isImageResolution(value: unknown): value is ImageResolution {
  return value === "1K" || value === "2K" || value === "4K";
}

function safeImageResolution(value: unknown): ImageResolution {
  return isImageResolution(value) ? value : DEFAULT_IMAGE_RESOLUTION;
}

function scaleSize(size: string, resolution: ImageResolution) {
  const [width, height] = size.split("x").map((item) => Number(item));
  const multiplier = IMAGE_RESOLUTIONS.find((item) => item.value === resolution)?.multiplier || 1;
  if (!Number.isFinite(width) || !Number.isFinite(height) || multiplier === 1) return size;
  return `${Math.round(width * multiplier)}x${Math.round(height * multiplier)}`;
}

function resolveSize(aspectRatio: string, resolution: ImageResolution = DEFAULT_IMAGE_RESOLUTION) {
  const baseSize = SIZE_BY_RATIO[aspectRatio] || SIZE_BY_RATIO["1:1"];
  return scaleSize(baseSize, safeImageResolution(resolution));
}

function normalizeImageParams(params: Partial<ImageParams> = {}): ImageParams {
  const aspectRatio = typeof params.aspectRatio === "string" ? params.aspectRatio : "1:1";
  const resolution = safeImageResolution(params.resolution);
  return {
    aspectRatio,
    resolution,
    size: resolveSize(aspectRatio, resolution),
    quality: typeof params.quality === "string" ? params.quality : "auto",
    outputFormat: params.outputFormat === "jpeg" || params.outputFormat === "webp" ? params.outputFormat : "png",
    batchCount: clampNumber(Number(params.batchCount || 4), 1, 20),
    concurrency: clampNumber(Number(params.concurrency || 2), 1, 6),
    retryLimit: Number.isFinite(Number(params.retryLimit)) ? clampNumber(Number(params.retryLimit), 0, 5) : 2,
    seed: typeof params.seed === "string" ? params.seed : "",
    negativePrompt: typeof params.negativePrompt === "string" ? params.negativePrompt : "",
  };
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

function apiConnectionKey(config: ApiConfig) {
  return `${config.protocol}|${normalizeApiBaseUrl(config.baseUrl)}|${config.apiKey.trim()}`;
}

function errorStatus(detail: ErrorDetail) {
  if (!detail || typeof detail !== "object") return undefined;
  const record = detail as Record<string, unknown>;
  if (typeof record.status === "number") return record.status;
  const error = record.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).status === "number") {
    return (error as Record<string, unknown>).status as number;
  }
  return undefined;
}

function isApiKeyAuthError(detail: ErrorDetail) {
  const status = errorStatus(detail);
  if (status === 401 || status === 403) return true;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? "");
  return /api key|apikey|unauthorized|forbidden|invalid key|invalid api|无权限|认证|鉴权/i.test(text);
}

function modelValidationErrorMessage(detail: ErrorDetail) {
  return isApiKeyAuthError(detail)
    ? "API Key 错误或无权限，请检查后重试"
    : formatError(detail);
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
    params: normalizeImageParams(record.params),
    referenceImages: normalizeStoredReferenceImages(record.referenceImages),
    submittedReferenceImages: record.submittedReferenceImages,
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
    agentId: record.agentId,
    agentName: record.agentName,
    agentScenario: record.agentScenario,
    promptVariant: record.promptVariant,
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
      params: normalizeImageParams(record.params),
      referenceImages: normalizeStoredReferenceImages(record.referenceImages),
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

async function deleteFailedHistoryRecords() {
  const db = await openDb();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const deletedIds: string[] = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as StoredHistoryRecord;
      if (record.status === "error") {
        deletedIds.push(record.id);
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(deletedIds);
    tx.onerror = () => reject(tx.error);
    request.onerror = () => reject(request.error);
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

function createReferenceThumbnail(dataUrl: string, maxEdge = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = longestEdge > 0 ? Math.min(1, maxEdge / longestEdge) : 1;
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        reject(new Error("无法创建缩略图"));
        return;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "medium";
      context.drawImage(image, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/webp", 0.72));
      } catch {
        resolve(canvas.toDataURL("image/png"));
      }
    };
    image.onerror = () => reject(new Error("无法读取参考图缩略图"));
    image.src = dataUrl;
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

  let thumbnailDataUrl = dataUrl;
  try {
    thumbnailDataUrl = await createReferenceThumbnail(dataUrl);
  } catch {
    thumbnailDataUrl = dataUrl;
  }

  const shortestEdge = Math.min(dimensions.width, dimensions.height);
  const longestEdge = Math.max(dimensions.width, dimensions.height);
  if (shortestEdge < MIN_REFERENCE_EDGE) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      thumbnailDataUrl,
      status: "error",
      message: `短边小于 ${MIN_REFERENCE_EDGE}px`,
    };
  }

  if (longestEdge > LARGE_REFERENCE_EDGE) {
    return {
      ...baseReference,
      ...dimensions,
      dataUrl,
      thumbnailDataUrl,
      status: "warning",
      message: "尺寸较大",
    };
  }

  return {
    ...baseReference,
    ...dimensions,
    dataUrl,
    thumbnailDataUrl,
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
    return JSON.stringify(sanitizeClientLogValue(detail), null, 2);
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

function truncateForLog(value: string, limit = LOG_TEXT_LIMIT) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...(${value.length} chars)`;
}

function describeReferenceForLog(summary: ReferenceSummary, model: string) {
  if (summary.status === "none") return `模型 ${model}，无参考图。`;
  if (summary.status === "skipped_unsupported") {
    return `模型 ${model}，用户上传 ${summary.count} 张参考图，但${summary.unsupportedReason || "当前协议不支持参考图"}，已跳过。`;
  }
  const sizeLabel = summary.totalBytes > 0 ? `（压缩后 ${formatBytes(summary.totalBytes)}）` : "";
  if (summary.status === "prepared") return `模型 ${model}，参考图 ${summary.count} 张${sizeLabel}已准备发送。`;
  if (summary.status === "sent_ok") return `模型 ${model}，参考图 ${summary.count} 张${sizeLabel}已上传到上游。`;
  if (summary.status === "sent_failed") return `模型 ${model}，参考图 ${summary.count} 张${sizeLabel}发送失败。`;
  return `模型 ${model}，参考图 ${summary.count} 张${sizeLabel}。`;
}

function clientImageOmittedPlaceholder(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.*)$/);
  const mime = match?.[1] || "application/octet-stream";
  const base64Body = match?.[2] ?? value;
  const cleaned = base64Body.replace(/\s+/g, "");
  const bytes = Math.round((cleaned.length * 3) / 4);
  return {
    __omitted: "image" as const,
    mime,
    bytes,
  };
}

function sanitizeClientLogValue(value: unknown, key = "", depth = 0): unknown {
  const lowerKey = key.toLowerCase();
  if (depth > 8) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (lowerKey === "apikey" || lowerKey === "api_key" || lowerKey === "authorization" || lowerKey === "password" || lowerKey === "token") {
    return "[redacted]";
  }
  if (typeof value === "string") {
    if (
      value.startsWith("data:image/")
      || lowerKey === "dataurl"
      || lowerKey === "thumbnaildataurl"
      || lowerKey === "b64_json"
      || (lowerKey === "data" && value.length > 180 && /^[A-Za-z0-9+/=\r\n]+$/.test(value))
    ) {
      return clientImageOmittedPlaceholder(value);
    }
    return truncateForLog(value, 4000);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => sanitizeClientLogValue(item, key, depth + 1));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeClientLogValue(entryValue, entryKey, depth + 1),
      ]),
    );
  }
  return String(value);
}

function safeLogError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (!error || typeof error !== "object") return error;
  try {
    return sanitizeClientLogValue(JSON.parse(JSON.stringify(error)));
  } catch {
    return String(error);
  }
}

function isRetryableError(errorDetail: unknown): boolean {
  if (!errorDetail) return true;
  if (typeof errorDetail !== "object") return false;
  const record = errorDetail as Record<string, unknown>;
  const status = typeof record.status === "number"
    ? record.status
    : typeof record.httpStatus === "number"
      ? record.httpStatus
      : null;
  if (status !== null) {
    if (status >= 500 && status < 600) return true;
    if (status === 429) return true;
    return false;
  }
  const errorField = record.error;
  let messageRaw = "";
  if (errorField && typeof errorField === "object") {
    const inner = (errorField as Record<string, unknown>).message;
    if (typeof inner === "string") messageRaw = inner;
  } else if (typeof errorField === "string") {
    messageRaw = errorField;
  } else if (typeof record.errorMessage === "string") {
    messageRaw = record.errorMessage;
  }
  return /timeout|network|connection|abort|fetch failed|econnreset|etimedout|enotfound/.test(messageRaw.toLowerCase());
}

async function readApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const looksHtml = /^\s*</.test(text);
    throw {
      status: response.status,
      endpoint,
      contentType,
      error: looksHtml
        ? "服务返回了 HTML，不是 JSON。线上通常是 /api 路由未命中、请求体过大、网关拦截或部署平台返回了错误页。"
        : "服务返回了不可解析的 JSON。",
      raw: truncateForLog(text, 1600),
    };
  }
}

function maskApiKeyForLog(apiKey: string, rememberKey: boolean) {
  const trimmed = apiKey.trim();
  return {
    present: trimmed.length > 0,
    length: trimmed.length,
    prefix: trimmed ? trimmed.slice(0, 6) : "",
    suffix: trimmed.length > 4 ? trimmed.slice(-4) : "",
    source: trimmed
      ? rememberKey
        ? "localStorage:imageStudioApiKey"
        : "sessionStorage:imageStudioApiKey"
      : "empty",
  };
}

function referenceMetaForLog(images: UploadedReference[]) {
  return images.map((image) => ({
    id: image.id,
    name: image.name,
    type: image.type,
    size: image.size,
    width: image.width,
    height: image.height,
    status: image.status || "ready",
    hasDataUrl: Boolean(image.dataUrl),
  }));
}

function loadLocalLogs(): LocalLogEntry[] {
  const raw = localStorage.getItem(LOCAL_LOG_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, LOCAL_LOG_LIMIT) as LocalLogEntry[] : [];
  } catch {
    return [];
  }
}

function saveLocalLogs(logs: LocalLogEntry[]) {
  try {
    localStorage.setItem(LOCAL_LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, LOCAL_LOG_LIMIT)));
  } catch {
    // Local request logs are diagnostic only. Ignore quota failures.
  }
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
    return normalizeImageParams({
      aspectRatio: "1:1",
      resolution: DEFAULT_IMAGE_RESOLUTION,
      quality: "auto",
      outputFormat: "png",
      batchCount: 4,
      concurrency: 2,
      seed: "",
      negativePrompt: "",
    });
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ImageParams>;
    return normalizeImageParams(parsed);
  } catch {
    return normalizeImageParams({
      aspectRatio: "1:1",
      resolution: DEFAULT_IMAGE_RESOLUTION,
      quality: "auto",
      outputFormat: "png",
      batchCount: 4,
      concurrency: 2,
      seed: "",
      negativePrompt: "",
    });
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
    size: resolveSize(
      isAspectRatioSupported(protocol, suggestedAspectRatio) ? suggestedAspectRatio : getSupportedAspectRatios(protocol)[0] || "1:1",
      params.resolution,
    ),
    resolution: params.resolution,
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
    resolution: isImageResolution(record.resolution) ? record.resolution : fallback.resolution,
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
  agentContext?: AgentContext,
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
    agentId: agentContext?.plan.agentId,
    agentName: agentContext?.plan.agentName,
    agentScenario: agentContext?.plan.scenario,
    promptVariant: agentContext?.variant,
    attempt: 1,
    maxAttempts: 1 + clampNumber(Number(params.retryLimit ?? 2), 0, 5),
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
  const [verifiedModelKey, setVerifiedModelKey] = useState("");
  const [verifiedModelAt, setVerifiedModelAt] = useState(0);
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
  const [isAutoPromptAnalysisEnabled, setIsAutoPromptAnalysisEnabled] = useState(() =>
    loadBooleanSetting("imageStudioAutoPromptAnalysisEnabled", true),
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
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);
  const [isAgentHintSeen, setIsAgentHintSeen] = useState(() =>
    localStorage.getItem("imageStudioAgentHintSeen") === "true",
  );
  const [isAgentHintVisible, setIsAgentHintVisible] = useState(false);
  const [isAgentQuickbarExpanded, setIsAgentQuickbarExpanded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentValues, setAgentValues] = useState<Record<string, string>>({});
  const [agentPlan, setAgentPlan] = useState<AgentPlan | null>(null);
  const [agentPhase, setAgentPhase] = useState<AgentRunPhase>("collecting");
  const [lastAppliedAgent, setLastAppliedAgent] = useState<AgentContext | null>(null);
  const [localLogs, setLocalLogs] = useState<LocalLogEntry[]>(loadLocalLogs);
  const [isLocalLogOpen, setIsLocalLogOpen] = useState(false);
  const [analysisCountdown, setAnalysisCountdown] = useState<AnalysisCountdown | null>(null);
  const [isComposerCollapsed, setIsComposerCollapsed] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [isSendLaunching, setIsSendLaunching] = useState(false);
  const [analysisState, setAnalysisState] = useState<PromptAnalysisState>({
    status: "idle",
    mode: "send",
    message: "",
  });
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [availableFrontendVersion, setAvailableFrontendVersion] = useState("");
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
  const analysisCountdownTimerRef = useRef<number | undefined>(undefined);
  const composerCollapseTimerRef = useRef<number | undefined>(undefined);
  const scrollFrameRef = useRef<number | undefined>(undefined);
  const protocolDefinition = getProtocolDefinition(apiConfig.protocol);
  const currentApiConnectionKey = apiConnectionKey(apiConfig);
  const isModelConnectionVerified = modelState.status === "ready" && verifiedModelKey === currentApiConnectionKey;
  const selectedAspectRatio = getAspectDefinition(params.aspectRatio);
  const selectedResolution = safeImageResolution(params.resolution);
  const selectedResolutionDefinition = IMAGE_RESOLUTIONS.find((item) => item.value === selectedResolution) || IMAGE_RESOLUTIONS[0];
  const resolvedRequestSize = resolveSize(params.aspectRatio, selectedResolution);
  const aspectRatioSupported = isAspectRatioSupported(apiConfig.protocol, params.aspectRatio);
  const composerConfigSummary = `${params.batchCount}张 · ${params.aspectRatio} · ${selectedResolution}`;
  const composerConfigDetail = `${resolvedRequestSize} · ${params.quality} · ${params.outputFormat.toUpperCase()} · 并发 ${params.concurrency}`;

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
  const referenceMetaLabel = referenceImages.length > 0
    ? protocolDefinition.supportsReferenceImages
      ? `将发送参考图 ${usableReferenceImages.length}/${referenceImages.length}`
      : `参考图不会发送 · 当前协议不支持`
    : `${protocolDefinition.shortLabel} · ${resolvedRequestSize}`;
  const failedVisibleRecordCount = visibleStats.error;
  const isPromptAnalyzing = analysisState.status === "analyzing" || analysisState.status === "receiving";
  const selectedAgent = useMemo(
    () => INDUSTRY_AGENTS.find((agent) => agent.id === selectedAgentId) || null,
    [selectedAgentId],
  );
  const isAgentEnabled = Boolean(selectedAgent);
  const latestLocalLogLevel = localLogs[0]?.level;
  const modelStatusMessage = isAutoLoadingModels
    ? "正在自动验证 API Key 并读取 image-2 模型..."
    : isModelConnectionVerified && verifiedModelAt
      ? `${modelState.message} · ${formatDate(verifiedModelAt)}`
      : modelState.message;
  const currentAnalysisMessage = ANALYSIS_STEPS[analysisStepIndex % ANALYSIS_STEPS.length];
  const canGenerate =
    prompt.trim().length > 0 &&
    selectedModel.length > 0 &&
    isAllowedImageModel(selectedModel) &&
    models.includes(selectedModel) &&
    isModelConnectionVerified &&
    aspectRatioSupported;
  const canRequestGenerate = canGenerate && !isPromptAnalyzing && !analysisCountdown;

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
    if (activePage !== "studio" || isAgentHintSeen || isAgentPanelOpen || isComposerCollapsed) {
      setIsAgentHintVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setIsAgentHintVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, [activePage, isAgentHintSeen, isAgentPanelOpen, isComposerCollapsed]);

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
    localStorage.setItem("imageStudioAutoPromptAnalysisEnabled", String(isAutoPromptAnalysisEnabled));
    if (!isAutoPromptAnalysisEnabled && analysisState.mode === "send") {
      cancelAnalysisCountdown();
      setAnalysisState({ status: "idle", mode: "send", message: "" });
    }
  }, [isAutoPromptAnalysisEnabled, analysisState.mode]);

  useEffect(() => {
    if (isAspectRatioSupported(apiConfig.protocol, params.aspectRatio)) return;
    const fallbackRatio = getSupportedAspectRatios(apiConfig.protocol)[0] || "1:1";
    updateParams({ aspectRatio: fallbackRatio, size: resolveSize(fallbackRatio, params.resolution) });
  }, [apiConfig.protocol, params.aspectRatio, params.resolution]);

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
      if (analysisCountdownTimerRef.current) {
        window.clearInterval(analysisCountdownTimerRef.current);
      }
      if (composerCollapseTimerRef.current) {
        window.clearTimeout(composerCollapseTimerRef.current);
      }
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activePage !== "studio") return;
    const apiKey = apiConfig.apiKey.trim();
    if (apiKey.length < API_KEY_MIN_LENGTH) {
      lastAutoModelLoadKeyRef.current = "";
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "idle", message: "填写 API Key 后自动验证" });
      return;
    }
    const normalizedBaseUrl = normalizeApiBaseUrl(apiConfig.baseUrl);
    const autoLoadKey = `${apiConfig.protocol}|${normalizedBaseUrl}|${apiKey}`;
    if (verifiedModelKey !== autoLoadKey) {
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "idle", message: "API Key 已变化，等待自动验证" });
    }
    if (lastAutoModelLoadKeyRef.current === autoLoadKey && verifiedModelKey === autoLoadKey) return;

    const timer = window.setTimeout(() => {
      if (lastAutoModelLoadKeyRef.current === autoLoadKey && verifiedModelKey === autoLoadKey) return;
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
  }, [activePage, apiConfig.apiKey, apiConfig.baseUrl, apiConfig.protocol, verifiedModelKey]);

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
    if (!isAgentPanelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAgentPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAgentPanelOpen]);

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
      if (record.status === "error") {
        window.setTimeout(() => previewCurrent(record), 220);
      }
    } else if (record.objectUrl || record.status === "error") {
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

  async function clearFailedRecords() {
    const storedFailedIds = await deleteFailedHistoryRecords();
    const failedIds = new Set(storedFailedIds);
    visibleRecords.forEach((record) => {
      if (record.status === "error") failedIds.add(record.id);
    });
    sidebarRecords.forEach((record) => {
      if (record.status === "error") failedIds.add(record.id);
    });
    if (failedIds.size === 0) return;

    setSidebarRecords((current) => {
      current.forEach((record) => {
        if (failedIds.has(record.id) && record.objectUrl) URL.revokeObjectURL(record.objectUrl);
      });
      return current.filter((record) => !failedIds.has(record.id) && record.status !== "error");
    });
    setVisibleRecords((current) => {
      current.forEach((record) => {
        if ((failedIds.has(record.id) || record.status === "error") && record.imageUrl) {
          URL.revokeObjectURL(record.imageUrl);
        }
      });
      return current.filter((record) => !failedIds.has(record.id) && record.status !== "error");
    });
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      failedIds.forEach((id) => next.delete(id));
      return next;
    });
    setHighlightedRecordId((current) => (failedIds.has(current) ? "" : current));
  }

  async function handleFiles(files: FileList | File[]) {
    const incomingFiles = Array.from(files);
    if (incomingFiles.length === 0) return;
    cancelAnalysisCountdown();
    setIsComposerCollapsed(false);
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

  function apiLogSnapshot(config = apiConfig) {
    return {
      protocol: config.protocol,
      baseUrl: normalizeApiBaseUrl(config.baseUrl),
      apiKey: maskApiKeyForLog(config.apiKey, config.rememberKey),
    };
  }

  function pushLocalLog(entry: Omit<LocalLogEntry, "id" | "createdAt">) {
    const sanitized: Omit<LocalLogEntry, "id" | "createdAt"> = {
      ...entry,
      params: entry.params ? sanitizeClientLogValue(entry.params) as Record<string, unknown> : entry.params,
      response: entry.response ? sanitizeClientLogValue(entry.response) as Record<string, unknown> : entry.response,
      error: entry.error !== undefined ? sanitizeClientLogValue(entry.error) : entry.error,
    };
    setLocalLogs((current) => {
      const next = [{ id: uid(), createdAt: Date.now(), ...sanitized }, ...current].slice(0, LOCAL_LOG_LIMIT);
      saveLocalLogs(next);
      return next;
    });
  }

  function clearLocalLogs() {
    saveLocalLogs([]);
    setLocalLogs([]);
  }

  function exportLocalDiagnostics() {
    const exportedAt = new Date().toISOString();
    const filename = `image-studio-local-diagnostics-${exportedAt.replace(/[:.]/g, "-")}.json`;
    const refStatusBuckets: Record<ReferenceUploadStatus, number> = {
      none: 0,
      prepared: 0,
      sent_ok: 0,
      sent_failed: 0,
      skipped_unsupported: 0,
    };
    let imageGenLogCount = 0;
    let totalRefBytes = 0;
    for (const log of localLogs) {
      if (log.type !== "image_generation") continue;
      imageGenLogCount += 1;
      if (log.referenceSummary) {
        refStatusBuckets[log.referenceSummary.status] += 1;
        totalRefBytes += log.referenceSummary.totalBytes;
      }
    }
    const visibleSnapshot = visibleRecords.map((record) => ({
      id: record.id,
      requestId: record.requestId,
      batchId: record.batchId,
      index: record.index,
      total: record.total,
      protocol: record.protocol,
      model: record.model,
      promptPreview: record.prompt?.slice(0, 200) || "",
      promptLength: record.prompt?.length || 0,
      params: record.params,
      referenceCount: record.referenceImages?.length ?? 0,
      status: record.status,
      attempt: record.attempt,
      maxAttempts: record.maxAttempts,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      durationMs: record.durationMs,
      errorDetail: record.errorDetail ? sanitizeClientLogValue(record.errorDetail) : undefined,
      agentName: record.agentName,
      promptVariant: record.promptVariant,
    }));
    const payload = {
      exportedAt,
      schemaVersion: 2,
      apiConfig: {
        protocol: apiConfig.protocol,
        baseUrl: apiConfig.baseUrl,
        apiKey: maskApiKeyForLog(apiConfig.apiKey, apiConfig.rememberKey),
      },
      params,
      selectedModel,
      selectedAnalysisModel,
      modelState,
      queueStats,
      summary: {
        localLogs: localLogs.length,
        imageGenerationLogs: imageGenLogCount,
        referenceUploadStatusDistribution: refStatusBuckets,
        totalReferenceBytesSent: totalRefBytes,
        visibleRecords: visibleRecords.length,
        sidebarRecords: sidebarRecords.length,
        retryLimit: params.retryLimit,
      },
      visibleRecords: visibleSnapshot,
      localLogs: localLogs.map((log) => sanitizeClientLogValue(log)),
      currentFrontendVersion: CURRENT_FRONTEND_VERSION,
      availableFrontendVersion,
      userAgent: navigator.userAgent,
      origin: window.location.origin,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function imageRequestParamsForLog(job: Job, config: ApiConfig) {
    return {
      ...apiLogSnapshot(config),
      request: {
        batchId: job.batchId,
        index: job.index,
        total: job.total,
        protocol: job.protocol,
        model: job.model,
        prompt: truncateForLog(job.prompt),
        aspectRatio: job.params.aspectRatio,
        size: job.params.size || resolveSize(job.params.aspectRatio, job.params.resolution),
        resolution: job.params.resolution,
        quality: job.params.quality,
        outputFormat: job.params.outputFormat,
        seed: job.params.seed,
        negativePrompt: truncateForLog(job.params.negativePrompt || "", 400),
        agentId: job.agentId,
        agentName: job.agentName,
        agentScenario: job.agentScenario,
        promptVariant: job.promptVariant,
        referenceCount: job.referenceImages.length,
        referenceImages: referenceMetaForLog(job.referenceImages),
      },
    };
  }

  async function loadModels({
    silent = false,
    config = apiConfig,
  }: {
    silent?: boolean;
    config?: ApiConfig;
  } = {}): Promise<boolean> {
    const normalizedBaseUrl = normalizeApiBaseUrl(config.baseUrl);
    const modelLoadKey = `${config.protocol}|${normalizedBaseUrl}|${config.apiKey.trim()}`;
    const startedAt = Date.now();
    if (config.apiKey.trim().length < API_KEY_MIN_LENGTH) {
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "error", message: "请先填写有效的 API Key" });
      pushLocalLog({
        type: "model_load",
        level: "error",
        title: silent ? "自动读取模型失败" : "读取模型失败",
        message: "API Key 为空或长度不足，已阻止请求上游。",
        endpoint: "/api/models",
        durationMs: 0,
        params: apiLogSnapshot(config),
      });
      return false;
    }
    const requestId = modelLoadRequestRef.current + 1;
    modelLoadRequestRef.current = requestId;
    setVerifiedModelKey("");
    setVerifiedModelAt(0);
    if (silent) {
      setIsAutoLoadingModels(true);
      setModelState({ status: "loading", message: "正在自动验证 API Key" });
    } else {
      lastAutoModelLoadKeyRef.current = modelLoadKey;
      setIsAutoLoadingModels(false);
      setModelState({ status: "loading", message: "正在验证 API Key 并读取模型" });
    }
    pushLocalLog({
      type: "model_load",
      level: "info",
      title: silent ? "自动读取模型" : "读取模型列表",
      message: "正在通过 /api/models 验证 API Key 并读取模型列表。",
      endpoint: "/api/models",
      params: apiLogSnapshot(config),
    });
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
      const payload = await readApiJson<{ ok?: boolean; models?: string[]; raw?: unknown; detail?: unknown }>(response, "/api/models");
      if (!response.ok || !payload.ok) {
        throw payload.detail || payload;
      }
      if (requestId !== modelLoadRequestRef.current) return false;
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
      setVerifiedModelKey(modelLoadKey);
      setVerifiedModelAt(Date.now());
      setModels(nextModels);
      setSelectedModel(nextSelectedModel);
      setAnalysisModels(nextAnalysisModels);
      setSelectedAnalysisModel(nextSelectedAnalysisModel);
      setModelFilter("");
      setModelState({ status: "ready", message: `API Key 有效 · ${nextModels.length} 个 image-2 模型` });
      pushLocalLog({
        type: "model_load",
        level: "success",
        title: silent ? "自动读取模型成功" : "读取模型成功",
        message: `已读取 ${nextModels.length} 个 image-2 模型，选中 ${nextSelectedModel}。`,
        endpoint: "/api/models",
        durationMs: Date.now() - startedAt,
        params: apiLogSnapshot(config),
        response: {
          modelCount: nextModels.length,
          analysisModelCount: nextAnalysisModels.length,
          selectedModel: nextSelectedModel,
          selectedAnalysisModel: nextSelectedAnalysisModel,
        },
      });
      if (silent && showOnboarding && onboardingStep < 2) {
        setOnboardingStep(2);
      }
      return true;
    } catch (error) {
      if (requestId !== modelLoadRequestRef.current) return false;
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "error", message: modelValidationErrorMessage(error) });
      pushLocalLog({
        type: "model_load",
        level: "error",
        title: silent ? "自动读取模型失败" : "读取模型失败",
        message: modelValidationErrorMessage(error),
        endpoint: "/api/models",
        durationMs: Date.now() - startedAt,
        params: apiLogSnapshot(config),
        error: safeLogError(error),
      });
      return false;
    } finally {
      if (silent) {
        setIsAutoLoadingModels(false);
      }
    }
  }

  async function verifyApiKeyBeforeGeneration() {
    const modelLoadKey = apiConnectionKey(apiConfig);
    const startedAt = Date.now();
    if (apiConfig.apiKey.trim().length < API_KEY_MIN_LENGTH) {
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "error", message: "请先填写有效的 API Key" });
      pushLocalLog({
        type: "api_health",
        level: "error",
        title: "提交前验证失败",
        message: "API Key 为空或长度不足，已阻止生成。",
        endpoint: "/api/models",
        durationMs: 0,
        params: apiLogSnapshot(),
      });
      return false;
    }

    setIsAutoLoadingModels(false);
    setModelState({ status: "loading", message: "提交前验证 API Key" });
    pushLocalLog({
      type: "api_health",
      level: "info",
      title: "提交前验证 API Key",
      message: "生成前先请求模型列表，避免无效 Key 进入生图链路。",
      endpoint: "/api/models",
      params: apiLogSnapshot(),
    });
    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: apiConfig.protocol,
          baseUrl: normalizeApiBaseUrl(apiConfig.baseUrl),
          apiKey: apiConfig.apiKey,
        }),
      });
      const payload = await readApiJson<{ ok?: boolean; models?: string[]; raw?: unknown; detail?: unknown }>(response, "/api/models");
      if (!response.ok || !payload.ok) {
        throw payload.detail || payload;
      }
      const nextModels = filterAllowedImageModels(Array.isArray(payload.models) ? payload.models : []);
      const nextAnalysisModels = filterAnalysisModels(Array.isArray(payload.models) ? payload.models : []);
      if (nextModels.length === 0) {
        throw new Error("未找到可用的 image-2 模型");
      }
      setVerifiedModelKey(modelLoadKey);
      setVerifiedModelAt(Date.now());
      setModels(nextModels);
      setAnalysisModels(nextAnalysisModels);
      if (!nextModels.includes(selectedModel)) {
        setSelectedModel(preferModel(nextModels, selectedModel));
        setModelState({ status: "ready", message: "模型列表已刷新，请再次点击生成" });
        pushLocalLog({
          type: "api_health",
          level: "warning",
          title: "提交前验证通过但模型已刷新",
          message: "当前选中模型不在最新 image-2 模型列表中，已自动改选，需要用户再次确认生成。",
          endpoint: "/api/models",
          durationMs: Date.now() - startedAt,
          params: apiLogSnapshot(),
          response: {
            modelCount: nextModels.length,
            selectedModel,
            nextSelectedModel: preferModel(nextModels, selectedModel),
          },
        });
        return false;
      }
      setModelState({ status: "ready", message: `API Key 有效 · ${nextModels.length} 个 image-2 模型` });
      pushLocalLog({
        type: "api_health",
        level: "success",
        title: "提交前验证通过",
        message: `API Key 可用，已确认 ${nextModels.length} 个 image-2 模型。`,
        endpoint: "/api/models",
        durationMs: Date.now() - startedAt,
        params: apiLogSnapshot(),
        response: {
          modelCount: nextModels.length,
          selectedModel,
        },
      });
      return true;
    } catch (error) {
      setVerifiedModelKey("");
      setVerifiedModelAt(0);
      setModels([]);
      setSelectedModel("");
      setAnalysisModels([]);
      setSelectedAnalysisModel("");
      setModelState({ status: "error", message: modelValidationErrorMessage(error) });
      pushLocalLog({
        type: "api_health",
        level: "error",
        title: "提交前验证失败",
        message: modelValidationErrorMessage(error),
        endpoint: "/api/models",
        durationMs: Date.now() - startedAt,
        params: apiLogSnapshot(),
        error: safeLogError(error),
      });
      return false;
    }
  }

  async function generateSingle(job: Job, config: ApiConfig) {
    const startedAt = Date.now();
    let requestParamsForLog: Record<string, unknown> = imageRequestParamsForLog(job, config);
    patchVisibleRecord(job.id, { status: "running", startedAt, durationMs: 0 });

    const protocolSupportsRefs = getProtocolDefinition(job.protocol).supportsReferenceImages;
    const userRefsCount = job.referenceImages.length;
    let preparedSummary: ReferenceSummary;
    if (userRefsCount === 0) {
      preparedSummary = { hasReferences: false, count: 0, totalBytes: 0, status: "none" };
    } else if (!protocolSupportsRefs) {
      preparedSummary = {
        hasReferences: true,
        count: userRefsCount,
        totalBytes: 0,
        status: "skipped_unsupported",
        unsupportedReason: `当前协议 ${job.protocol} 不支持参考图`,
      };
    } else {
      preparedSummary = {
        hasReferences: true,
        count: userRefsCount,
        totalBytes: 0,
        status: "prepared",
      };
    }

    let submittedRefSnapshot: SubmittedReference[] = [];

    try {
      let requestReferenceImages: Awaited<ReturnType<typeof referenceImagesForRequest>> = [];
      if (protocolSupportsRefs && userRefsCount > 0) {
        const prepared = await Promise.all(job.referenceImages.map(prepareReferenceForRequest));
        requestReferenceImages = prepared.map((image) => ({
          name: image.name,
          type: image.type,
          dataUrl: image.dataUrl,
        }));
        submittedRefSnapshot = prepared.map((image) => ({
          name: image.name,
          type: image.type,
          dataUrl: image.dataUrl,
          originalBytes: image.originalBytes,
          requestBytes: image.requestBytes,
          compressed: image.compressed,
        }));
        preparedSummary = {
          hasReferences: true,
          count: prepared.length,
          totalBytes: prepared.reduce((sum, image) => sum + image.requestBytes, 0),
          status: "prepared",
          items: prepared.map((image) => ({
            name: image.name,
            type: image.type,
            originalBytes: image.originalBytes,
            requestBytes: image.requestBytes,
            compressed: image.compressed,
          })),
        };
        patchVisibleRecord(job.id, { submittedReferenceImages: submittedRefSnapshot });
      }
      requestParamsForLog = {
        ...requestParamsForLog,
        request: {
          ...(requestParamsForLog.request as Record<string, unknown>),
          preparedReferenceImages: preparedReferenceMetaForLog(requestReferenceImages),
          preparedReferenceTotalBytes: preparedSummary.totalBytes,
          referenceSummary: preparedSummary,
        },
      };
      const startMessage = describeReferenceForLog(preparedSummary, job.model);
      pushLocalLog({
        type: "image_generation",
        level: "info",
        title: `开始生成图片 #${job.index}/${job.total}${preparedSummary.hasReferences ? ` · 参考图 ${preparedSummary.count} 张` : " · 无参考图"}`,
        message: startMessage,
        endpoint: "/api/images/generate",
        referenceSummary: preparedSummary,
        params: requestParamsForLog,
      });

      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: normalizeApiBaseUrl(config.baseUrl),
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
            size: job.params.size || resolveSize(job.params.aspectRatio, job.params.resolution),
            resolution: job.params.resolution,
            quality: job.params.quality,
            outputFormat: job.params.outputFormat,
            seed: job.params.seed,
            negativePrompt: job.params.negativePrompt,
            agentId: job.agentId,
            agentName: job.agentName,
            agentScenario: job.agentScenario,
            promptVariant: job.promptVariant,
            referenceImages: requestReferenceImages,
          },
        }),
      });
      const payload = await readApiJson<GenerateProxyResponse>(response, "/api/images/generate");
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
      const successSummary: ReferenceSummary = preparedSummary.hasReferences && preparedSummary.status === "prepared"
        ? { ...preparedSummary, status: "sent_ok" }
        : preparedSummary;
      pushLocalLog({
        type: "image_generation",
        level: "success",
        title: `图片生成成功 #${job.index}/${job.total}${successSummary.hasReferences ? ` · 参考图 ${successSummary.count} 张已上传` : " · 无参考图"}`,
        message: `生成完成，尺寸 ${width} x ${height}。${successSummary.hasReferences ? `参考图 ${successSummary.count} 张${successSummary.totalBytes > 0 ? `（${formatBytes(successSummary.totalBytes)}）` : ""}已发送给上游。` : ""}`,
        endpoint: "/api/images/generate",
        requestId: payload.requestId,
        durationMs,
        referenceSummary: successSummary,
        params: requestParamsForLog,
        response: {
          width,
          height,
          revisedPrompt: truncateForLog(revisedPrompt || "", 500),
          imageCount: payload.images.length,
          proxyResponse: sanitizeClientLogValue(payload),
        },
      });

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
        referenceImages: referenceImagesForHistory(job.referenceImages),
        submittedReferenceImages: submittedRefSnapshot.length > 0 ? submittedRefSnapshot : undefined,
        status: "success",
        createdAt: job.createdAt,
        startedAt,
        finishedAt,
        durationMs,
        imageBlob: blob,
        width,
        height,
        revisedPrompt,
        agentId: job.agentId,
        agentName: job.agentName,
        agentScenario: job.agentScenario,
        promptVariant: job.promptVariant,
      };
      await saveHistoryRecord(historyRecord);
      setSidebarRecords((current) => mergeHistoryRecords(current, [{
        ...historyRecord,
        referenceImages: normalizeStoredReferenceImages(historyRecord.referenceImages),
        objectUrl,
      }]));
    } catch (error) {
      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;
      const errorDetail = error instanceof Error ? { error: error.message } : error;
      const requestId = errorDetail && typeof errorDetail === "object" && "requestId" in errorDetail
        ? String((errorDetail as { requestId?: unknown }).requestId || "")
        : undefined;
      const attempt = job.attempt ?? 1;
      const maxAttempts = job.maxAttempts ?? 1;
      const canRetry = attempt < maxAttempts && isRetryableError(errorDetail);
      if (canRetry) {
        const nextAttempt = attempt + 1;
        const backoffMs = Math.min(8000, 500 * Math.pow(2, attempt - 1));
        const retrySummary: ReferenceSummary = preparedSummary.hasReferences && preparedSummary.status === "prepared"
          ? { ...preparedSummary, status: "sent_failed" }
          : preparedSummary;
        pushLocalLog({
          type: "image_generation",
          level: "warning",
          title: `图片生成失败 #${job.index}/${job.total}，${Math.round(backoffMs / 1000)}s 后重试 (${nextAttempt}/${maxAttempts})${retrySummary.hasReferences ? ` · 参考图 ${retrySummary.count} 张` : ""}`,
          message: formatError(errorDetail),
          endpoint: "/api/images/generate",
          requestId,
          durationMs,
          referenceSummary: retrySummary,
          params: requestParamsForLog,
          response: {
            ok: false,
            requestId,
            detail: sanitizeClientLogValue(errorDetail),
            retry: { attempt, nextAttempt, maxAttempts, backoffMs },
          },
          error: safeLogError(errorDetail),
        });
        patchVisibleRecord(job.id, {
          requestId,
          status: "queued",
          errorDetail,
          startedAt: undefined,
          finishedAt: undefined,
          durationMs: undefined,
          attempt: nextAttempt,
          maxAttempts,
        });
        window.setTimeout(() => {
          enqueueJobs([{ ...job, attempt: nextAttempt, status: "queued" }], config);
        }, backoffMs);
        return;
      }
      const failedSummary: ReferenceSummary = preparedSummary.hasReferences && preparedSummary.status === "prepared"
        ? { ...preparedSummary, status: "sent_failed" }
        : preparedSummary;
      pushLocalLog({
        type: "image_generation",
        level: "error",
        title: `图片生成失败 #${job.index}/${job.total}${attempt > 1 ? `（已重试 ${attempt - 1} 次）` : ""}${failedSummary.hasReferences ? ` · 参考图 ${failedSummary.count} 张` : " · 无参考图"}`,
        message: formatError(errorDetail),
        endpoint: "/api/images/generate",
        requestId,
        durationMs,
        referenceSummary: failedSummary,
        params: requestParamsForLog,
        response: {
          ok: false,
          requestId,
          detail: sanitizeClientLogValue(errorDetail),
          retry: { attempt, maxAttempts, exhausted: true },
        },
        error: safeLogError(errorDetail),
      });
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
        referenceImages: referenceImagesForHistory(job.referenceImages),
        submittedReferenceImages: submittedRefSnapshot.length > 0 ? submittedRefSnapshot : undefined,
        status: "error",
        createdAt: job.createdAt,
        startedAt,
        finishedAt,
        durationMs,
        errorDetail,
        agentId: job.agentId,
        agentName: job.agentName,
        agentScenario: job.agentScenario,
        promptVariant: job.promptVariant,
      };
      await saveHistoryRecord(historyRecord);
      setSidebarRecords((current) => mergeHistoryRecords(current, [{
        ...historyRecord,
        referenceImages: normalizeStoredReferenceImages(historyRecord.referenceImages),
      }]));
    }
  }

  function analysisFallback(
    mode: AnalysisMode,
    promptText = prompt.trim(),
    analysisParams = params,
    analysisReferences = referenceImages,
  ) {
    const usableAnalysisReferences = analysisReferences.filter(isReferenceUsable);
    return buildLocalPromptAnalysis({
      promptText,
      params: analysisParams,
      protocol: apiConfig.protocol,
      selectedModel,
      referenceImages: analysisReferences,
      usableReferenceImages: usableAnalysisReferences,
      mode,
    });
  }

  async function runPromptAnalysis(
    mode: AnalysisMode,
    promptText = prompt.trim(),
    analysisParams = params,
    agentContext?: AgentContext,
    analysisReferences = referenceImages,
  ) {
    const usableAnalysisReferences = analysisReferences.filter(isReferenceUsable);
    const fallback = analysisFallback(mode, promptText, analysisParams, analysisReferences);
    const analysisModel = preferAnalysisModel(analysisModels, selectedAnalysisModel);
    if (!analysisModel || !apiConfig.apiKey.trim()) {
      pushLocalLog({
        type: "prompt_analysis",
        level: "warning",
        title: "提示词分析使用本地预检",
        message: analysisModel ? "未配置 API Key，未请求 AI 分析接口。" : "未检测到可用分析模型，未请求 AI 分析接口。",
        endpoint: "/api/prompt/analyze",
        params: {
          ...apiLogSnapshot(),
          mode,
          prompt: truncateForLog(promptText),
          referenceCount: usableAnalysisReferences.length,
        },
      });
      return {
        ...fallback,
        analysisModel: analysisModel || "本地预检",
        source: "local" as const,
        summary: analysisModel
          ? "未配置 API Key，已先用本地规则完成预检。"
          : "未检测到 GPT 分析模型，已先用本地规则完成预检。",
      };
    }

    const startedAt = Date.now();
    const requestParamsForLog = {
      ...apiLogSnapshot(),
      analysisModel,
      prompt: truncateForLog(promptText),
      negativePrompt: truncateForLog(analysisParams.negativePrompt || "", 400),
      aspectRatio: analysisParams.aspectRatio,
      size: analysisParams.size || resolveSize(analysisParams.aspectRatio, analysisParams.resolution),
      resolution: analysisParams.resolution,
      quality: analysisParams.quality,
      outputFormat: analysisParams.outputFormat,
      count: analysisParams.batchCount,
      concurrency: analysisParams.concurrency,
      referenceCount: usableAnalysisReferences.length,
      referenceIssues: analysisReferences
        .filter((image) => image.status && image.status !== "ready")
        .map((image) => ({ name: image.name, status: image.status, message: image.message })),
      protocol: apiConfig.protocol,
      imageModel: selectedModel,
      mode,
      agentId: agentContext?.plan.agentId,
      agentName: agentContext?.plan.agentName,
      agentScenario: agentContext?.plan.scenario,
      promptVariant: agentContext?.variant,
    };
    pushLocalLog({
      type: "prompt_analysis",
      level: "info",
      title: "开始提示词分析",
      message: `使用 ${analysisModel} 做 ${analysisModeLabel(mode)}。`,
      endpoint: "/api/prompt/analyze",
      params: requestParamsForLog,
    });
    try {
      const response = await fetch("/api/prompt/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
        baseUrl: normalizeApiBaseUrl(apiConfig.baseUrl),
        apiKey: apiConfig.apiKey,
        clientId: getClientId(),
        analysisModel,
        prompt: promptText,
        negativePrompt: analysisParams.negativePrompt,
        aspectRatio: analysisParams.aspectRatio,
        size: analysisParams.size || resolveSize(analysisParams.aspectRatio, analysisParams.resolution),
        resolution: analysisParams.resolution,
        quality: analysisParams.quality,
        outputFormat: analysisParams.outputFormat,
        count: analysisParams.batchCount,
        concurrency: analysisParams.concurrency,
        referenceCount: usableAnalysisReferences.length,
        referenceIssues: analysisReferences
          .filter((image) => image.status && image.status !== "ready")
          .map((image) => ({ name: image.name, status: image.status, message: image.message })),
        protocol: apiConfig.protocol,
        imageModel: selectedModel,
        mode,
        agentId: agentContext?.plan.agentId,
        agentName: agentContext?.plan.agentName,
        agentScenario: agentContext?.plan.scenario,
        promptVariant: agentContext?.variant,
        }),
      });

      // 后端可能仍然走非流式（旧版兜底）
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const payload = await readApiJson<{ ok?: boolean; requestId?: string; analysis?: unknown; detail?: unknown }>(response, "/api/prompt/analyze");
        if (!response.ok || !payload.ok) {
          throw payload.detail || payload;
        }
        const result = normalizePromptAnalysisResult(payload.analysis, {
          ...fallback,
          analysisModel,
          source: "ai",
        });
        pushLocalLog({
          type: "prompt_analysis",
          level: "success",
          title: "提示词分析完成（非流式）",
          message: result.summary,
          endpoint: "/api/prompt/analyze",
          requestId: payload.requestId,
          durationMs: Date.now() - startedAt,
          params: requestParamsForLog,
          response: {
            score: result.score,
            riskLevel: result.riskLevel,
            safe: result.safe,
            source: result.source,
            analysis: sanitizeClientLogValue(result),
          },
        });
        return result;
      }

      if (!response.body) throw new Error("分析响应体为空");
      if (!response.ok) {
        const errorText = await response.text();
        throw { error: `HTTP ${response.status}`, raw: truncateForLog(errorText, 1600) };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let analysis: unknown = null;
      let upstreamRequestId: string | undefined;
      let chunkCount = 0;
      let firstByteAt: number | undefined;
      let receivingAt: number | undefined;
      let lastError: unknown = null;
      let totalLength = 0;

      const flushFrame = (event: string, data: unknown) => {
        switch (event) {
          case "started":
            upstreamRequestId = (data as { requestId?: string })?.requestId;
            setAnalysisState((current) => ({ ...current, status: "analyzing", message: "已发送，等待模型响应..." }));
            break;
          case "upstream_connected":
            firstByteAt = Date.now();
            setAnalysisState((current) => ({ ...current, status: "analyzing", message: "上游已连接，等待模型生成..." }));
            break;
          case "receiving":
            receivingAt = Date.now();
            setAnalysisState((current) => ({ ...current, status: "receiving", message: "正在接收结果..." }));
            break;
          case "chunk":
            chunkCount += 1;
            totalLength = (data as { totalLength?: number })?.totalLength ?? totalLength;
            setAnalysisState((current) => current.status === "receiving"
              ? { ...current, message: `接收中... 已 ${totalLength} 字符` }
              : current);
            break;
          case "done":
            analysis = (data as { analysis?: unknown })?.analysis ?? null;
            break;
          case "error":
            lastError = (data as { detail?: unknown })?.detail ?? data;
            break;
        }
      };

      // 解析 SSE 帧
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            let eventName = "message";
            const dataParts: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataParts.push(line.slice(5).trim());
            }
            if (dataParts.length === 0) continue;
            const dataStr = dataParts.join("\n");
            let data: unknown = dataStr;
            try { data = JSON.parse(dataStr); } catch { /* leave as string */ }
            flushFrame(eventName, data);
          }
        }
      } finally {
        try { reader.releaseLock(); } catch {}
      }

      if (lastError) throw lastError;
      if (!analysis) throw new Error("分析流结束但未收到 done 事件");

      const result = normalizePromptAnalysisResult(analysis, {
        ...fallback,
        analysisModel,
        source: "ai",
      });
      const totalMs = Date.now() - startedAt;
      pushLocalLog({
        type: "prompt_analysis",
        level: "success",
        title: "提示词分析完成（流式）",
        message: result.summary,
        endpoint: "/api/prompt/analyze",
        requestId: upstreamRequestId,
        durationMs: totalMs,
        params: requestParamsForLog,
        response: {
          score: result.score,
          riskLevel: result.riskLevel,
          safe: result.safe,
          source: result.source,
          stream: {
            chunkCount,
            totalLength,
            firstByteMs: firstByteAt ? firstByteAt - startedAt : null,
            receivingMs: receivingAt ? receivingAt - startedAt : null,
            totalMs,
          },
          analysis: sanitizeClientLogValue(result),
        },
      });
      return result;
    } catch (error) {
      pushLocalLog({
        type: "prompt_analysis",
        level: "error",
        title: "提示词分析失败",
        message: formatError(error),
        endpoint: "/api/prompt/analyze",
        durationMs: Date.now() - startedAt,
        params: requestParamsForLog,
        error: safeLogError(error),
        response: {
          phase: "stream_error",
          rawDetail: sanitizeClientLogValue(error),
        },
      });
      throw error;
    }
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

  function buildParamsFromAnalysis(
    result: PromptAnalysisResult,
    applyRecommendedParams = true,
    baseParams = params,
  ) {
    const suggestedRatio = result.suggestedParams.aspectRatio || baseParams.aspectRatio;
    const nextRatio = applyRecommendedParams && isAspectRatioSupported(apiConfig.protocol, suggestedRatio)
      ? suggestedRatio
      : baseParams.aspectRatio;
    const nextResolution = applyRecommendedParams && result.suggestedParams.resolution
      ? safeImageResolution(result.suggestedParams.resolution)
      : safeImageResolution(baseParams.resolution);
    return {
      ...baseParams,
      aspectRatio: nextRatio,
      resolution: nextResolution,
      size: resolveSize(nextRatio, nextResolution),
      quality: applyRecommendedParams && protocolDefinition.supportsQuality && result.suggestedParams.quality
        ? result.suggestedParams.quality
        : baseParams.quality,
      batchCount: applyRecommendedParams && result.suggestedParams.count
        ? clampNumber(Number(result.suggestedParams.count), 1, 20)
        : baseParams.batchCount,
      negativePrompt: applyRecommendedParams && result.suggestedNegativePrompt && !baseParams.negativePrompt.trim()
        ? result.suggestedNegativePrompt
        : baseParams.negativePrompt,
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
    cancelAnalysisCountdown();
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

  function cancelAnalysisCountdown() {
    if (analysisCountdownTimerRef.current) {
      window.clearInterval(analysisCountdownTimerRef.current);
      analysisCountdownTimerRef.current = undefined;
    }
    setAnalysisCountdown(null);
  }

  function abandonAnalysisCountdown() {
    if (analysisCountdown) {
      setPrompt((current) => current.trim() ? current : analysisCountdown.prompt);
      if (analysisCountdown.referenceImages.length > 0) {
        setReferenceImages((current) => current.length > 0 ? current : analysisCountdown.referenceImages);
      }
      if (analysisCountdown.agentContext && !lastAppliedAgent) {
        setLastAppliedAgent(analysisCountdown.agentContext);
      }
    }
    cancelAnalysisCountdown();
    setAnalysisState({ status: "idle", mode: "send", message: "" });
  }

  function startAnalysisCountdown({
    prompt: countdownPrompt,
    params: countdownParams,
    referenceImages: countdownReferenceImages,
    result,
    agentContext,
  }: {
    prompt: string;
    params: ImageParams;
    referenceImages: UploadedReference[];
    result?: PromptAnalysisResult;
    agentContext?: AgentContext;
  }) {
    cancelAnalysisCountdown();
    const runId = uid();
    const label = agentContext
      ? `10 秒后使用 ${agentContext.plan.agentName} · ${PROMPT_VARIANT_LABELS[agentContext.variant]} 自动生成`
      : "10 秒后将按原始提示词自动生成";
    let secondsLeft = 10;
    setAnalysisCountdown({
      runId,
      secondsLeft,
      prompt: countdownPrompt,
      params: countdownParams,
      referenceImages: countdownReferenceImages,
      result,
      agentContext,
      label,
    });
    if (agentContext) setAgentPhase("countdown");
    analysisCountdownTimerRef.current = window.setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        if (analysisCountdownTimerRef.current) {
          window.clearInterval(analysisCountdownTimerRef.current);
          analysisCountdownTimerRef.current = undefined;
        }
        setAnalysisCountdown(null);
        setAnalysisState({ status: "idle", mode: "send", message: "" });
        if (agentContext) setAgentPhase("generating");
        void startBatch(undefined, {
          promptOverride: countdownPrompt,
          paramsOverride: countdownParams,
          referenceImagesOverride: countdownReferenceImages,
          clearReferenceImages: false,
          agentContext,
        });
        return;
      }
      setAnalysisCountdown((current) =>
        current?.runId === runId ? { ...current, secondsLeft } : current,
      );
    }, 1000);
  }

  async function analyzeBeforeGenerate(
    submittedPrompt: string,
    options: { paramsOverride?: ImageParams; referenceImagesOverride?: UploadedReference[]; agentContext?: AgentContext } = {},
  ) {
    const analysisParams = options.paramsOverride || params;
    const analysisReferences = options.referenceImagesOverride || referenceImages;
    setShowPromptPresets(false);
    setAnalysisState({
      status: "analyzing",
      mode: "send",
      message: options.agentContext ? "Agent 行业预检" : "发送前智能检查",
    });
    try {
      const result = await runPromptAnalysis("send", submittedPrompt, analysisParams, options.agentContext, analysisReferences);
      setAnalysisState({
        status: "ready",
        mode: "send",
        message: result.riskLevel === "high" ? "已完成预检，建议先查看风险" : "已完成预检",
        result,
      });
      startAnalysisCountdown({
        prompt: submittedPrompt,
        params: analysisParams,
        referenceImages: analysisReferences,
        result,
        agentContext: options.agentContext,
      });
    } catch (error) {
      const result = {
        ...analysisFallback("send", submittedPrompt, analysisParams, analysisReferences),
        summary: "AI 分析暂时不可用，已降级为本地预检。倒计时结束后仍会按当前提示词生成。",
        analysisModel: "本地预检",
        source: "local" as const,
      };
      setAnalysisState({
        status: "ready",
        mode: "send",
        message: `智能分析失败，已降级处理：${formatError(error)}`,
        result,
      });
      startAnalysisCountdown({
        prompt: submittedPrompt,
        params: analysisParams,
        referenceImages: analysisReferences,
        result,
        agentContext: options.agentContext,
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
    const countdownContext = analysisCountdown?.agentContext;
    const basePrompt = analysisCountdown?.prompt || prompt.trim();
    const baseParams = analysisCountdown?.params || params;
    const baseReferenceImages = analysisCountdown?.referenceImages || referenceImages;
    const submittedPrompt = useOptimizedPrompt && result?.optimizedPrompt ? result.optimizedPrompt : basePrompt;
    if (!submittedPrompt) return;
    const nextParams = result ? buildParamsFromAnalysis(result, applyRecommendedParams, baseParams) : baseParams;
    if (result && applyRecommendedParams) {
      setParams(nextParams);
    }
    cancelAnalysisCountdown();
    triggerSendLaunchAnimation();
    setAnalysisState({ status: "idle", mode: "send", message: "" });
    if (countdownContext) setAgentPhase("generating");
    void startBatch(undefined, {
      promptOverride: submittedPrompt,
      paramsOverride: nextParams,
      referenceImagesOverride: baseReferenceImages,
      clearReferenceImages: false,
      agentContext: countdownContext,
    });
  }

  async function startBatch(
    event?: FormEvent,
    options: {
      promptOverride?: string;
      paramsOverride?: ImageParams;
      referenceImagesOverride?: UploadedReference[];
      clearReferenceImages?: boolean;
      agentContext?: AgentContext;
    } = {},
  ) {
    event?.preventDefault();
    const batchParams = options.paramsOverride || params;
    const submittedPrompt = (options.promptOverride || prompt).trim();
    if (!submittedPrompt) return;
    if (
      !selectedModel ||
      !isAllowedImageModel(selectedModel) ||
      !models.includes(selectedModel) ||
      modelState.status !== "ready" ||
      !isAspectRatioSupported(apiConfig.protocol, batchParams.aspectRatio)
    ) {
      return;
    }
    const total = clampNumber(Number(batchParams.batchCount), 1, 20);
    const concurrency = clampNumber(Number(batchParams.concurrency), 1, 6);
    const batchId = uid();
    const batchCreatedAt = Date.now();
    const snapshotConfig = { ...apiConfig };
    const snapshotParams = {
      ...batchParams,
      batchCount: total,
      concurrency,
      resolution: safeImageResolution(batchParams.resolution),
      size: resolveSize(batchParams.aspectRatio, safeImageResolution(batchParams.resolution)),
    };
    const candidateReferenceImages = options.referenceImagesOverride ?? usableReferenceImages;
    const snapshotReferenceImages = getProtocolDefinition(apiConfig.protocol).supportsReferenceImages
      ? candidateReferenceImages.filter(isReferenceUsable)
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
        options.agentContext,
      ),
    );
    setHighlightedRecordId("");
    setVisibleRecords((current) => sortGenerationRecords([...nextJobs, ...current]));
    enqueueJobs(nextJobs, snapshotConfig);
    if (options.clearReferenceImages !== false) {
      setReferenceImages([]);
    }
  }

  async function requestStartBatch() {
    if (!canRequestGenerate) return;
    const nextStart = performance.now();
    if (nextStart - startIntentRef.current < 400) return;
    startIntentRef.current = nextStart;
    const apiKeyReady = await verifyApiKeyBeforeGeneration();
    if (!apiKeyReady) return;
    const submittedPrompt = prompt.trim();
    const snapshotReferenceImages = getProtocolDefinition(apiConfig.protocol).supportsReferenceImages
      ? usableReferenceImages
      : [];
    const agentContext = lastAppliedAgent ?? undefined;
    triggerSendLaunchAnimation();
    if (agentContext) setAgentPhase("generating");
    setPrompt("");
    setReferenceImages([]);
    setLastAppliedAgent(null);
    if (!isAutoPromptAnalysisEnabled) {
      cancelAnalysisCountdown();
      setAnalysisState({ status: "idle", mode: "send", message: "" });
      void startBatch(undefined, {
        promptOverride: submittedPrompt,
        referenceImagesOverride: snapshotReferenceImages,
        clearReferenceImages: false,
        agentContext,
      });
      return;
    }
    void analyzeBeforeGenerate(submittedPrompt, {
      referenceImagesOverride: snapshotReferenceImages,
      agentContext,
    });
  }

  async function retryJob(job: Job) {
    const retry = {
      ...createJob(
      job.index,
      job.total,
      uid(),
      job.protocol,
      job.prompt,
      job.model,
      job.params,
      job.referenceImages,
      ),
      agentId: job.agentId,
      agentName: job.agentName,
      agentScenario: job.agentScenario,
      promptVariant: job.promptVariant,
    };
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
    cancelAnalysisCountdown();
    setParams((current) => {
      const nextAspectRatio = patch.aspectRatio || current.aspectRatio;
      const nextResolution = patch.resolution ? safeImageResolution(patch.resolution) : safeImageResolution(current.resolution);
      return {
        ...current,
        ...patch,
        aspectRatio: nextAspectRatio,
        resolution: nextResolution,
        size: resolveSize(nextAspectRatio, nextResolution),
        batchCount: patch.batchCount !== undefined
          ? clampNumber(Number(patch.batchCount), 1, 20)
          : current.batchCount,
        concurrency: patch.concurrency !== undefined
          ? clampNumber(Number(patch.concurrency), 1, 6)
          : current.concurrency,
        retryLimit: patch.retryLimit !== undefined
          ? clampNumber(Number(patch.retryLimit), 0, 5)
          : current.retryLimit,
      };
    });
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
    cancelAnalysisCountdown();
    setReferenceImages((current) => current.filter((image) => image.id !== id));
  }

  function applyPromptStarter(nextPrompt: string) {
    cancelAnalysisCountdown();
    setIsComposerCollapsed(false);
    setPrompt((current) => (current.trim() ? `${current.trim()}\n${nextPrompt}` : nextPrompt));
    setShowPromptPresets(false);
    window.requestAnimationFrame(resizePromptTextarea);
  }

  function updatePromptValue(nextPrompt: string) {
    cancelAnalysisCountdown();
    setIsComposerCollapsed(false);
    setPrompt(nextPrompt);
  }

  function markAgentHintSeen() {
    if (!isAgentHintSeen) {
      localStorage.setItem("imageStudioAgentHintSeen", "true");
      setIsAgentHintSeen(true);
    }
    setIsAgentHintVisible(false);
  }

  function disableAgent() {
    setSelectedAgentId("");
    setAgentValues({});
    setAgentPlan(null);
    setAgentPhase("collecting");
    setIsAgentPanelOpen(false);
    setLastAppliedAgent(null);
  }

  function openAgentPanel(agentId?: string) {
    const targetAgentId = agentId ?? selectedAgentId;
    const nextAgent = targetAgentId ? INDUSTRY_AGENTS.find((agent) => agent.id === targetAgentId) || null : null;
    markAgentHintSeen();
    setIsAgentQuickbarExpanded(true);
    if (nextAgent) {
      // 同一个 Agent 重开：保留 agentValues / agentPlan / agentPhase，避免用户填好的字段被冲掉
      // 切换到不同 Agent：才重置
      if (selectedAgentId !== nextAgent.id) {
        setSelectedAgentId(nextAgent.id);
        setAgentValues(createAgentDefaults(nextAgent));
        setAgentPlan(null);
        setAgentPhase("collecting");
      }
    } else {
      setSelectedAgentId("");
      setAgentValues({});
      setAgentPlan(null);
      setAgentPhase("collecting");
    }
    setShowPromptPresets(false);
    setIsComposerCollapsed(false);
    setIsAgentPanelOpen(true);
  }

  function selectAgent(agent: IndustryAgent) {
    setIsAgentQuickbarExpanded(true);
    if (selectedAgentId !== agent.id) {
      setLastAppliedAgent(null);
    }
    setSelectedAgentId(agent.id);
    setAgentValues(createAgentDefaults(agent));
    setAgentPlan(null);
    setAgentPhase("collecting");
  }

  function updateAgentValue(fieldId: string, value: string) {
    setAgentValues((current) => ({ ...current, [fieldId]: value }));
    setAgentPlan(null);
    setAgentPhase("collecting");
  }

  function generateAgentPlan() {
    if (!selectedAgent) return;
    setAgentPhase("planning");
    window.setTimeout(() => {
      const nextPlan = buildAgentPlan(selectedAgent, agentValues);
      setAgentPlan(nextPlan);
      setAgentPhase("prompting");
    }, 420);
  }

  function paramsFromAgentPlan(plan: AgentPlan) {
    const recommendedRatio = typeof plan.recommendedParams.aspectRatio === "string"
      ? plan.recommendedParams.aspectRatio
      : params.aspectRatio;
    const nextRatio = isAspectRatioSupported(apiConfig.protocol, recommendedRatio)
      ? recommendedRatio
      : params.aspectRatio;
    const nextResolution = safeImageResolution(plan.recommendedParams.resolution || params.resolution);
    return {
      ...params,
      ...plan.recommendedParams,
      aspectRatio: nextRatio,
      resolution: nextResolution,
      size: resolveSize(nextRatio, nextResolution),
      batchCount: clampNumber(Number(plan.recommendedParams.batchCount || params.batchCount), 1, 20),
      concurrency: params.concurrency,
      outputFormat: params.outputFormat,
      seed: params.seed,
      quality: protocolDefinition.supportsQuality
        ? String(plan.recommendedParams.quality || params.quality)
        : params.quality,
      negativePrompt: plan.negativePrompt || params.negativePrompt,
    } as ImageParams;
  }

  function applyAgentVariant(variant: PromptVariant) {
    const plan = agentPlan || (selectedAgent ? buildAgentPlan(selectedAgent, agentValues) : null);
    if (!plan) return;
    // 应用新 variant 等于覆盖当前 prompt —— 任何待执行的旧倒计时（snapshot 着旧 prompt）必须取消，
    // 否则会用旧 prompt 跑生成而 UI 显示新 prompt，行为割裂。
    cancelAnalysisCountdown();
    setAnalysisState({ status: "idle", mode: "send", message: "" });
    const nextPrompt = plan.promptVariants[variant];
    const nextParams = paramsFromAgentPlan(plan);
    setAgentPlan(plan);
    setParams(nextParams);
    setPrompt(nextPrompt);
    setIsAgentPanelOpen(false);
    setIsComposerCollapsed(false);
    setAgentPhase("collecting");
    setLastAppliedAgent({ plan, variant });
    window.requestAnimationFrame(() => {
      resizePromptTextarea();
      promptTextareaRef.current?.focus();
    });
  }

  function handleCanvasScroll() {
    if (scrollFrameRef.current) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = undefined;
      if (composerCollapseTimerRef.current) {
        window.clearTimeout(composerCollapseTimerRef.current);
      }
      if (
        prompt.trim() ||
        isAgentPanelOpen ||
        analysisState.status !== "idle" ||
        analysisCountdown ||
        referenceImages.length > 0
      ) {
        return;
      }
      composerCollapseTimerRef.current = window.setTimeout(() => setIsComposerCollapsed(true), 120);
    });
  }

  function previewCurrent(item: Job | HistoryRecord) {
    const url = (item as Job).imageUrl || (item as HistoryRecord).objectUrl;
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
      agentId: item.agentId,
      agentName: item.agentName,
      agentScenario: item.agentScenario,
      promptVariant: item.promptVariant,
      submittedReferenceImages: item.submittedReferenceImages,
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
  const suggestedSize = analysisResult?.suggestedParams.size || (suggestedRatio ? resolveSize(suggestedRatio, selectedResolution) : "");
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
              <img src={imageStudioLogo} alt="" />
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
            cancelAnalysisCountdown();
            setPrompt("");
            setReferenceImages([]);
            setIsAgentPanelOpen(false);
            setLastAppliedAgent(null);
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
            <button
              type="button"
              className={`topbar-log-button ${latestLocalLogLevel ? `is-${latestLocalLogLevel}` : ""}`}
              title="查看本地请求日志"
              onClick={() => setIsLocalLogOpen((value) => !value)}
            >
              <Database size={15} />
              <span>{localLogs.length}</span>
            </button>
            <SidebarToggleButton
              side="right"
              open={isSettingsOpen}
              title={isSettingsOpen ? "收起配置" : "打开配置"}
              onClick={() => setIsSettingsOpen((value) => !value)}
            />
          </div>
        </header>
        {isLocalLogOpen && (
          <section className="local-log-panel" role="dialog" aria-label="本地请求日志">
            <div className="local-log-head">
              <div>
                <strong>本地请求日志</strong>
                <span>只保存在当前浏览器，API Key 和参考图内容已脱敏。</span>
              </div>
              <div className="local-log-actions">
                <button type="button" className="subtle-button compact" onClick={exportLocalDiagnostics} disabled={localLogs.length === 0} title="导出本地诊断为 JSON（图片内容已脱敏）">
                  <DownloadCloud size={14} />
                  导出
                </button>
                <button type="button" className="subtle-button compact" onClick={clearLocalLogs} disabled={localLogs.length === 0}>
                  <Trash2 size={14} />
                  清空
                </button>
                <button type="button" className="icon-button" title="关闭日志" onClick={() => setIsLocalLogOpen(false)}>
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="local-log-list">
              {localLogs.length === 0 ? (
                <div className="local-log-empty">暂无日志。提交生成或读取模型后会显示请求详情。</div>
              ) : (
                localLogs.map((log, index) => (
                  <details className={`local-log-item ${log.level}`} key={log.id} open={index === 0}>
                    <summary>
                      <span>{formatFullDate(log.createdAt)}</span>
                      <strong>{log.title}</strong>
                      <small>
                        {log.endpoint || log.type}
                        {log.durationMs !== undefined ? ` · ${formatDuration(log.durationMs)}` : ""}
                        {log.referenceSummary && (
                          <em className={`ref-pill ref-pill-${log.referenceSummary.status}`}>
                            {log.referenceSummary.status === "none" && "无参考图"}
                            {log.referenceSummary.status === "skipped_unsupported" && `${log.referenceSummary.count} 张未发送`}
                            {log.referenceSummary.status === "prepared" && `${log.referenceSummary.count} 张待发送${log.referenceSummary.totalBytes > 0 ? ` · ${formatBytes(log.referenceSummary.totalBytes)}` : ""}`}
                            {log.referenceSummary.status === "sent_ok" && `${log.referenceSummary.count} 张已上传${log.referenceSummary.totalBytes > 0 ? ` · ${formatBytes(log.referenceSummary.totalBytes)}` : ""}`}
                            {log.referenceSummary.status === "sent_failed" && `${log.referenceSummary.count} 张发送失败`}
                          </em>
                        )}
                      </small>
                    </summary>
                    <div className="local-log-body">
                      <p>{log.message}</p>
                      {log.requestId && <span className="local-log-request-id">requestID：{log.requestId}</span>}
                      <pre>{JSON.stringify({
                        params: log.params,
                        response: log.response,
                        error: log.error,
                      }, null, 2)}</pre>
                    </div>
                  </details>
                ))
              )}
            </div>
          </section>
        )}

        <section className="canvas" ref={canvasRef} onScroll={handleCanvasScroll}>
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
                      failedCount={failedVisibleRecordCount}
                      isDownloading={isBulkDownloading}
                      onSelectAll={selectAllVisibleRecords}
                      onClearFailed={() => void clearFailedRecords()}
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
          className={[
            "composer",
            isPromptAnalyzing ? "is-analyzing" : "",
            isComposerCollapsed ? "is-collapsed" : "",
            isAgentPanelOpen ? "has-agent-panel" : "",
          ].filter(Boolean).join(" ")}
          data-onboarding-target="composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (isAgentPanelOpen) return;
            requestStartBatch();
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onComposerDrop}
        >
          {isComposerCollapsed && (
            <button
              type="button"
              className="composer-mini"
              onClick={() => {
                setIsComposerCollapsed(false);
                window.requestAnimationFrame(() => promptTextareaRef.current?.focus());
              }}
            >
              <WandSparkles size={16} />
              <span>描述你想生成的图片...</span>
              <Send size={16} />
            </button>
          )}
          <div className="agent-quickbar">
            <button
              type="button"
              className={[
                "agent-entry-button",
                lastAppliedAgent ? "is-active" : isAgentEnabled ? "is-enabled" : "is-muted",
                !isAgentHintSeen ? "needs-attention" : "",
              ].filter(Boolean).join(" ")}
              title={
                lastAppliedAgent
                  ? `${lastAppliedAgent.plan.agentName} · ${PROMPT_VARIANT_LABELS[lastAppliedAgent.variant]} 已应用到当前提示词`
                  : isAgentEnabled
                    ? "已选行业，点开面板应用 variant"
                    : "打开行业 Agent 选择器"
              }
              onClick={() => openAgentPanel()}
            >
              <WandSparkles size={15} />
              {lastAppliedAgent
                ? `${lastAppliedAgent.plan.agentName} · ${PROMPT_VARIANT_LABELS[lastAppliedAgent.variant]} 已应用`
                : isAgentEnabled
                  ? `${selectedAgent?.name || "行业 Agent"} · 已选`
                  : "行业 Agent · 未启用"}
              <ChevronRight size={14} />
              <small>
                {lastAppliedAgent ? "送出后清" : isAgentEnabled ? "可应用" : "可开启"}
              </small>
            </button>
            {isAgentEnabled && (
              <button
                type="button"
                className="agent-disable-button"
                onClick={(event) => {
                  event.stopPropagation();
                  disableAgent();
                }}
                title="停用行业 Agent"
                aria-label="停用行业 Agent"
              >
                <X size={13} />
              </button>
            )}
            {lastAppliedAgent && (
              <div className="agent-applied-chip" role="status">
                <WandSparkles size={12} />
                <span>{lastAppliedAgent.plan.agentName} · {PROMPT_VARIANT_LABELS[lastAppliedAgent.variant]}</span>
                <button
                  type="button"
                  className="agent-applied-chip-clear"
                  onClick={() => setLastAppliedAgent(null)}
                  title="清除 Agent 标签（保留提示词）"
                  aria-label="清除 Agent 标签"
                >
                  <X size={11} />
                </button>
              </div>
            )}
            <button
              type="button"
              className="agent-expand-button"
              onClick={() => setIsAgentQuickbarExpanded((value) => !value)}
              aria-expanded={isAgentQuickbarExpanded}
              title={isAgentQuickbarExpanded ? "收起行业 Agent 快捷入口" : "展开行业 Agent 快捷入口"}
            >
              {isAgentQuickbarExpanded ? "收起" : "展开"}
              <ChevronRight size={13} />
            </button>
            {isAgentHintVisible && (
              <div className="agent-entry-hint" role="status">
                选择行业工作流，不填也能生成标准图
              </div>
            )}
            {isAgentQuickbarExpanded && (
              <div className="agent-chip-row" aria-label="行业 Agent 快捷入口">
                {INDUSTRY_AGENTS.slice(0, 8).map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    className={`agent-chip ${selectedAgentId === agent.id ? "active" : ""}`}
                    title={agent.clickHint}
                    onClick={() => openAgentPanel(agent.id)}
                  >
                    <span>{agent.icon}</span>
                    {agent.name}
                    <small>{selectedAgentId === agent.id ? "已选" : "开启"}</small>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {isAgentPanelOpen && (
            <div className="agent-modal">
              <button
                type="button"
                className="agent-modal-backdrop"
                aria-label="关闭行业 Agent 背景"
                onClick={() => setIsAgentPanelOpen(false)}
              />
              <section className="agent-panel" role="dialog" aria-modal="true" aria-label="行业 Agent">
                <div className="agent-panel-head">
                  <div>
                    <span className="eyebrow">AI + Image workflow</span>
                    <strong>行业 Agent</strong>
                    <p>选择行业即可生成标准方案。下方信息可选填，不填写也会使用行业默认值。</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    title="关闭行业 Agent"
                    aria-label="关闭行业 Agent"
                    onClick={() => setIsAgentPanelOpen(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="agent-layout">
                  <div className="agent-list" aria-label="行业 Agent 列表">
                    {INDUSTRY_AGENTS.map((agent) => (
                      <button
                        type="button"
                        key={agent.id}
                        className={`agent-list-item ${selectedAgentId === agent.id ? "active" : ""}`}
                        onClick={() => selectAgent(agent)}
                      >
                        <span>{agent.icon}</span>
                        <div>
                          <strong>{agent.name}</strong>
                          <small>{agent.tag} · {agent.recommendedRatio}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="agent-workspace">
                    {selectedAgent ? (
                      <>
                    <div className="agent-current">
                      <div>
                        <strong>{selectedAgent.name}</strong>
                        <span>{selectedAgent.description}</span>
                        <small>{selectedAgent.emptyStateHint}</small>
                      </div>
                      <div className="agent-meta-pills">
                        <span>{selectedAgent.recommendedRatio}</span>
                        <span>{selectedAgent.defaultCount} 张</span>
                        <span>{selectedAgent.defaultQuality}</span>
                      </div>
                    </div>
                    {agentPlan && (
                      <div className="agent-plan">
                        <div className="agent-brief">
                          <strong>生图 Brief</strong>
                          <p>{agentPlan.brief}</p>
                        </div>
                        <div className="agent-variant-grid">
                          {(Object.keys(agentPlan.promptVariants) as PromptVariant[]).map((variant) => (
                            <button
                              type="button"
                              className={`agent-variant-card ${variant === "stable" ? "recommended" : ""}`}
                              key={variant}
                              onClick={() => applyAgentVariant(variant)}
                            >
                              <strong>{PROMPT_VARIANT_LABELS[variant]}</strong>
                              <span>{agentPlan.promptVariants[variant]}</span>
                              <small>应用到提示词，可继续编辑</small>
                            </button>
                          ))}
                        </div>
                        <div className="agent-note-grid">
                          {agentPlan.notes.map((note) => <span key={note}>{note}</span>)}
                        </div>
                      </div>
                    )}
                    <div className="agent-form-grid">
                      {selectedAgent.fields.map((field) => (
                        <label className={field.type === "textarea" ? "agent-field wide" : "agent-field"} key={field.id}>
                          <span>{field.label}{field.required ? " · 建议" : ""}</span>
                          {field.type === "select" ? (
                            <select value={agentValues[field.id] || field.defaultValue || ""} onChange={(event) => updateAgentValue(field.id, event.target.value)}>
                              {(field.options || []).map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : field.type === "textarea" ? (
                            <textarea
                              rows={3}
                              value={agentValues[field.id] || ""}
                              placeholder={field.placeholder}
                              onChange={(event) => updateAgentValue(field.id, event.target.value)}
                            />
                          ) : (
                            <input
                              value={agentValues[field.id] || ""}
                              placeholder={field.placeholder}
                              onChange={(event) => updateAgentValue(field.id, event.target.value)}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="agent-supplement-row">
                      {selectedAgent.supplements.map((item) => <span key={item}>{item}</span>)}
                      {selectedAgent.qualityChecklist.map((item) => <span key={item}>验收：{item}</span>)}
                    </div>
                    {agentPhase === "planning" && (
                      <div className="agent-scan">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                      </>
                    ) : (
                      <div className="agent-empty-select">
                        <WandSparkles size={24} />
                        <strong>先选择一个行业 Agent</strong>
                        <span>默认不启用行业工作流。选择左侧行业后，系统会自动填入行业默认目标、比例、张数和负面提示词。</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="agent-panel-actions">
                  {!selectedAgent ? (
                    <button type="button" className="primary-action compact" disabled>
                      <WandSparkles size={15} />
                      先选择行业 Agent
                    </button>
                  ) : agentPlan ? (
                    <>
                      {(Object.keys(agentPlan.promptVariants) as PromptVariant[]).map((variant) => (
                        <button
                          type="button"
                          className={variant === "stable" ? "primary-action compact" : "subtle-button"}
                          key={variant}
                          onClick={() => applyAgentVariant(variant)}
                        >
                          <WandSparkles size={15} />
                          应用{PROMPT_VARIANT_LABELS[variant]}到提示词
                        </button>
                      ))}
                      <button type="button" className="subtle-button" onClick={generateAgentPlan} disabled={agentPhase === "planning"}>
                        {agentPhase === "planning" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                        重新生成方案
                      </button>
                    </>
                  ) : (
                    <button type="button" className="primary-action compact" onClick={generateAgentPlan} disabled={agentPhase === "planning"}>
                      {agentPhase === "planning" ? <Loader2 size={15} className="spin" /> : <WandSparkles size={15} />}
                      生成行业方案
                    </button>
                  )}
                  {selectedAgent && (
                    <button type="button" className="subtle-button danger" onClick={disableAgent}>
                      停用行业 Agent
                    </button>
                  )}
                  <button
                    type="button"
                    className="subtle-button"
                    onClick={() => setIsAgentPanelOpen(false)}
                  >
                    取消
                  </button>
                </div>
              </section>
            </div>
          )}
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
                    <img src={image.thumbnailDataUrl || image.dataUrl} alt="" />
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
                  {(analysisState.status === "analyzing" || analysisState.status === "receiving") ? <Loader2 size={16} className="spin" /> : <WandSparkles size={16} />}
                </div>
                <div>
                  <strong>
                    {analysisState.status === "receiving"
                      ? "正在接收结果"
                      : analysisState.message || analysisModeLabel(analysisState.mode)}
                  </strong>
                  <span>
                    {analysisState.status === "analyzing"
                      ? currentAnalysisMessage
                      : analysisState.status === "receiving"
                        ? analysisState.message || "AI 正在流式返回..."
                        : analysisResult
                          ? `${analysisSourceLabel} · 评分 ${analysisResult.score}`
                          : analysisState.error || "可以稍后重试"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="关闭智能建议"
                  onClick={() => {
                    cancelAnalysisCountdown();
                    setAnalysisState({ status: "idle", mode: "send", message: "" });
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {analysisCountdown && (
                <div className="analysis-countdown">
                  <div>
                    <strong>{analysisCountdown.secondsLeft}s</strong>
                    <span>{analysisCountdown.label}</span>
                  </div>
                  <div className="analysis-countdown-track" aria-hidden="true">
                    <span style={{ width: `${(analysisCountdown.secondsLeft / 10) * 100}%` }} />
                  </div>
                  <button type="button" className="subtle-button" onClick={abandonAnalysisCountdown}>
                    停止自动生成
                  </button>
                </div>
              )}

              {(analysisState.status === "analyzing" || analysisState.status === "receiving") && (
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
              onChange={(event) => updatePromptValue(event.target.value)}
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
              className={`composer-config-button ${isSettingsOpen ? "active" : ""}`}
              title={`打开生成配置：${composerConfigSummary} · ${composerConfigDetail}`}
              aria-label={`打开生成配置，当前 ${composerConfigSummary}`}
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings2 size={15} />
              <span>{params.batchCount}张</span>
              <span>{params.aspectRatio}</span>
              <span>{selectedResolution}</span>
            </button>
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
          <div className="composer-meta">
            <span className={referenceIssueCount > 0 ? "has-error" : referenceWarningCount > 0 ? "has-warning" : ""}>
              {referenceMetaLabel}
            </span>
            <span className={`composer-config-meta ${aspectRatioSupported ? "" : "has-error"}`}>
              {composerConfigSummary} · {resolvedRequestSize} · {params.outputFormat.toUpperCase()}
            </span>
            <label className="composer-auto-toggle" title="发送前自动优化提示词">
              <input
                type="checkbox"
                checked={isAutoPromptAnalysisEnabled}
                onChange={(event) => setIsAutoPromptAnalysisEnabled(event.target.checked)}
              />
              <span>发送前优化</span>
            </label>
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
          <button
            className="icon-button"
            type="button"
            title="收起配置"
            aria-label="收起配置"
            onClick={() => setIsSettingsOpen(false)}
          >
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
          <div className="prompt-group-hint api-key-hint" role="note">
            <WandSparkles size={14} />
            <span>
              推荐使用 <strong>banana Pro 官转</strong> 或 <strong>OpenRouter</strong> 分组。
            </span>
          </div>
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
            <span>{modelStatusMessage}</span>
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
              {!isAutoPromptAnalysisEnabled
                ? "已关闭发送前自动优化，点击发送会直接进入生图队列"
                : analysisModels.length > 0
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
            <small>{aspectRatioSupported ? `${selectedResolution} · 请求尺寸 ${resolvedRequestSize}` : "当前协议不支持此比例"}</small>
          </div>
          <label>
            <span>分辨率</span>
            <select
              value={selectedResolution}
              onChange={(event) => updateParams({ resolution: event.target.value as ImageResolution })}
            >
              {IMAGE_RESOLUTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ratio-preview">
            <strong>{selectedResolution}</strong>
            <span>{selectedResolutionDefinition.hint}</span>
            <small>尺寸会随宽高比自动换算</small>
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
          <label title="生成失败时（5xx / 429 / 网络错误）自动重试的次数。范围 0–5，默认 2。">
            <span>失败自动重试</span>
            <input
              type="number"
              min={0}
              max={5}
              value={params.retryLimit}
              onChange={(event) => updateParams({ retryLimit: Number(event.target.value) })}
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
          onDownload={() => {
            if (!previewItem.url) return;
            downloadUrl(
              previewItem.url,
              `${previewItem.model}-${previewItem.width || "image"}x${previewItem.height || "image"}-${previewItem.id}.${previewItem.params.outputFormat}`,
            );
          }}
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
  const [expandedLogId, setExpandedLogId] = useState("");

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

  async function exportAdminLogs() {
    setAdminError("");
    try {
      const response = await fetch("/api/admin/logs/export", {
        method: "GET",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw detail || new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const dispositionFilename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1];
      const filename = dispositionFilename || `image-studio-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const url = URL.createObjectURL(blob);
      downloadUrl(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setAdminError(formatError(error));
    }
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
      setExpandedLogId((current) =>
        logsPayload.logs.some((log) => log.requestId === current) ? current : "",
      );
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
          <span className="admin-badge"><img src={imageStudioLogo} alt="" /> Image Studio Admin</span>
          <h1>请求日志后台</h1>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="subtle-button" onClick={onEnterStudio}>工作台</button>
          <button type="button" className="subtle-button" onClick={() => void refreshDashboard()}>
            <RefreshCw size={16} />
            刷新
          </button>
          <button type="button" className="subtle-button" onClick={exportAdminLogs} title="下载完整请求日志为 JSON（图片内容已脱敏）">
            <DownloadCloud size={16} />
            导出日志
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
            <span>点击任意请求可查看脱敏请求参数、上游 payload 与返回内容；图片内容不会记录。</span>
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
                <th>类型</th>
                <th>Agent</th>
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
                  <td colSpan={10} className="admin-empty-cell">
                    {isLoadingLogs ? "正在读取日志..." : "暂无请求记录"}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <Fragment key={log.requestId}>
                    <tr
                      className={`admin-log-row ${expandedLogId === log.requestId ? "expanded" : ""}`}
                      onClick={() => setExpandedLogId((current) => current === log.requestId ? "" : log.requestId)}
                    >
                      <td>
                        <div className="admin-status-cell">
                          <ChevronRight size={14} />
                          <span className={`admin-status ${log.status}`}>{log.status}</span>
                        </div>
                      </td>
                      <td>{log.requestType === "prompt_analysis" ? "提示词分析" : "生图"}</td>
                      <td className="admin-model-cell" title={log.agentScenario || ""}>
                        {log.agentName ? `${log.agentName}${log.promptVariant ? ` · ${log.promptVariant}` : ""}` : "-"}
                      </td>
                      <td><code title={log.requestId}>{log.requestId.slice(0, 8)}</code></td>
                      <td className="admin-prompt-cell" title={log.prompt}>{log.prompt || "-"}</td>
                      <td className="admin-model-cell" title={log.model}>{log.model || "-"}</td>
                      <td
                        title={[
                          `API：${log.apiBaseUrl}`,
                          `Key：${log.apiKeyPresent ? `${log.apiKeyPrefix || ""}...${log.apiKeySuffix || ""} · ${log.apiKeyLength || 0} 位` : "未读取到"}`,
                          log.upstreamPayloadKeys?.length ? `上游字段：${log.upstreamPayloadKeys.join(", ")}` : "",
                          log.upstreamReferenceMode ? `参考图模式：${log.upstreamReferenceMode}` : "",
                        ].filter(Boolean).join("\n")}
                      >
                        {[
                          log.aspectRatio,
                          log.resolution,
                          log.upstreamSize ? `上游 ${log.upstreamSize}` : log.size,
                          log.outputFormat,
                          log.upstreamReferenceCount ? `上游 ${log.upstreamReferenceCount} 图` : log.referenceCount ? `${log.referenceCount} 图` : "",
                        ].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td>{formatCompactDuration(log.durationMs || 0)}</td>
                      <td>{formatFullDate(log.createdAt)}</td>
                      <td className="admin-error-cell" title={log.errorRaw || log.errorMessage || ""}>{log.errorMessage || "-"}</td>
                    </tr>
                    {expandedLogId === log.requestId && (
                      <tr className="admin-log-detail-row">
                        <td colSpan={10}>
                          <div className="admin-log-detail-head">
                            <div>
                              <strong>请求详情</strong>
                              <span>{log.requestId} · {log.endpoint}</span>
                            </div>
                            <span className="admin-log-safety">图片内容已脱敏，不记录 API Key 原文</span>
                          </div>
                          <div className="admin-log-detail-grid">
                            <AdminJsonBlock title="请求参数" value={log.requestParams || {
                              protocol: log.protocol,
                              apiBaseUrl: log.apiBaseUrl,
                              credential: {
                                present: log.apiKeyPresent,
                                length: log.apiKeyLength,
                                prefix: log.apiKeyPrefix,
                                suffix: log.apiKeySuffix,
                              },
                              model: log.model,
                              prompt: log.prompt,
                              negativePrompt: log.negativePrompt,
                              aspectRatio: log.aspectRatio,
                              size: log.size,
                              resolution: log.resolution,
                              quality: log.quality,
                              outputFormat: log.outputFormat,
                              seed: log.seed,
                              referenceCount: log.referenceCount,
                            }} />
                            <AdminJsonBlock title="上游请求" value={log.upstreamRequest || {
                              endpoint: log.endpoint,
                              payloadKeys: log.upstreamPayloadKeys,
                              referenceMode: log.upstreamReferenceMode,
                              referenceCount: log.upstreamReferenceCount,
                              upstreamSize: log.upstreamSize,
                            }} />
                            <AdminJsonBlock title="返回内容" value={log.responseBody || {
                              status: log.status,
                              httpStatus: log.httpStatus,
                              errorMessage: log.errorMessage,
                              errorType: log.errorType,
                              errorCode: log.errorCode,
                              errorRaw: log.errorRaw,
                            }} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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

function AdminJsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <article className="admin-json-block">
      <strong>{title}</strong>
      <pre>{JSON.stringify(value ?? {}, null, 2)}</pre>
    </article>
  );
}

function HomePage({ onEnter, onAdmin }: { onEnter: () => void; onAdmin: () => void }) {
  const featureBands = [
    {
      title: "统一记录流",
      body: "所有生成任务按时间自然归档，最新作品永远在最前。灵感、失败、重试和成片不再散落在不同页面。",
    },
    {
      title: "发送前智能分析",
      body: "在真正消耗生图额度前，先检查提示词风险、参数匹配度和可能失败的环节，再把建议交还给创作者决定。",
    },
    {
      title: "本地图库资产",
      body: "图片、参数、提示词和错误详情保存在当前浏览器本地。作品属于你的工作台，不被服务端额外留存。",
    },
  ];
  const metrics = [
    { value: "20/页", label: "按需懒加载" },
    { value: "并行队列", label: "生成中继续提交" },
    { value: "本地优先", label: "IndexedDB 保存" },
  ];
  const detailItems = [
    "提示词优化、风格增强、失败预判和参数推荐被收进同一个发送流程。",
    "左右侧栏可收起，主画布为图片记录让出更多空间。",
    "多选、全选已显示、反选、批量下载和清除失败，让图库管理更接近专业素材库。",
  ];
  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="home-page">
      <section
        className="home-hero"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(247, 247, 245, 0.96) 0%, rgba(247, 247, 245, 0.84) 34%, rgba(247, 247, 245, 0.1) 72%), url(${homeHeroImage})`,
        }}
      >
        <img className="home-hero-logo" src={imageStudioLogo} alt="" aria-hidden="true" />
        <nav className="home-nav">
          <div className="home-brand">
            <span>
              <img src={imageStudioLogo} alt="" />
            </span>
            <strong>Image Studio</strong>
          </div>
          <div className="home-nav-links" aria-label="首页导航">
            <button type="button" onClick={() => scrollToSection("home-product")}>
              工作台
            </button>
            <button type="button" onClick={() => scrollToSection("home-analysis")}>
              智能分析
            </button>
            <button type="button" onClick={() => scrollToSection("home-agents")}>
              行业 Agent
            </button>
            <button type="button" onClick={() => scrollToSection("home-local")}>
              本地优先
            </button>
          </div>
          <div className="home-nav-actions">
            <button type="button" className="home-nav-action" onClick={onEnter}>
              打开工作台
            </button>
            <button type="button" className="home-admin-link" onClick={onAdmin}>
              <ShieldCheck size={16} />
              管理后台
            </button>
          </div>
        </nav>

        <div className="home-hero-copy">
          <span className="home-kicker">AI image workspace</span>
          <h1>Image Studio</h1>
          <p>
            从一句提示词，到一组可复用的视觉资产。把智能分析、批量生成、并行队列和本地图库，放进一个安静、清晰、反应迅速的创作空间。
          </p>
          <div className="home-hero-actions">
            <button type="button" className="home-primary" onClick={onEnter}>
              开始生成
              <ArrowRight size={18} />
            </button>
            <button type="button" className="home-secondary" onClick={() => scrollToSection("home-flow")}>
              了解流程
            </button>
          </div>
          <div className="home-metric-row" aria-label="产品能力摘要">
            {metrics.map((metric) => (
              <div className="home-metric" key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-flow" id="home-flow">
        <div className="home-section-copy">
          <span className="home-kicker">Built for creation</span>
          <h2>一个屏幕，完成从构思到归档。</h2>
          <p>
            首页不再只是入口，而是产品能力的缩影：先让用户看到真实工作台，再用更少的文字说明它为什么值得信任。
          </p>
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

      <section className="home-product-showcase" id="home-product">
        <div className="home-showcase-copy">
          <span className="home-kicker">Studio overview</span>
          <h2>让生成记录，成为可以继续工作的画布。</h2>
          <p>
            中间区域统一展示全部生成记录，左侧保留最近记录入口，右侧承载配置。用户可以在生成中继续提交新批次，让探索过程保持连续。
          </p>
        </div>
        <figure className="home-preview-frame home-preview-frame-wide">
          <img src={homeStudioPreview} alt="Image Studio 工作台截图，展示生成记录流、左侧历史和右侧配置面板" />
        </figure>
      </section>

      <section className="home-analysis-showcase" id="home-analysis">
        <div className="home-analysis-media">
          <img src={homePromptPreview} alt="Image Studio 提示词输入和预设提示词截图" />
        </div>
        <div className="home-showcase-copy">
          <span className="home-kicker">Prompt intelligence</span>
          <h2>发送之前，先把想法打磨到更接近成片。</h2>
          <p>
            默认开启自动优化。系统会在提交前分析提示词、推荐参数、预判失败原因，并把风格增强建议收束成可执行的生成方案。
          </p>
          <ul className="home-detail-list">
            {detailItems.map((item) => (
              <li key={item}>
                <CheckCircle2 size={17} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="home-agent-section" id="home-agents">
        <div className="home-section-copy">
          <span className="home-kicker">Industry agents</span>
          <h2>不是模板，是为行业准备的生图流程。</h2>
          <p>
            选择一个行业 Agent，填写业务目标，系统会自动补全 Brief、生成三套提示词、推荐比例和负面提示词，再进入发送前分析与批量生成。
          </p>
        </div>
        <div className="home-agent-grid">
          {INDUSTRY_AGENTS.slice(0, 6).map((agent) => (
            <article className="home-agent-card" key={agent.id}>
              <div>
                <span>{agent.icon}</span>
                <strong>{agent.name}</strong>
              </div>
              <p>{agent.description}</p>
              <small>{agent.scenario}</small>
              <button type="button" onClick={onEnter}>
                进入工作台
                <ArrowRight size={15} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="home-insight" id="home-local">
        <div>
          <span className="home-kicker">Private by design</span>
          <h2>作品留在本地。创作更安心。</h2>
        </div>
        <p>
          生成图片和历史仅保存到当前浏览器本地，服务端只做无状态协议转发。你可以批量下载、清理失败记录，也可以在下一次打开时继续查看自己的素材库。
        </p>
        <button type="button" className="home-primary dark" onClick={onEnter}>
          进入工作台
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
    body: "回到底部输入框描述画面，选择宽高比、分辨率、张数和并发。提交后提示词会在发送动画完成后自动清空。",
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

const JobCard = memo(function JobCard({
  job,
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
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    if (job.status !== "running" || !job.startedAt) return;
    setTickNow(Date.now());
    const timer = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job.status, job.startedAt]);
  const elapsed = job.status === "running" && job.startedAt ? tickNow - job.startedAt : job.durationMs || 0;
  const previewClass = aspectClass(job.width, job.height, job.params.aspectRatio);
  const sizeLabel = job.width && job.height ? `${job.width} x ${job.height}` : job.params.size;
  const durationLabel = job.status === "queued" ? "等待" : elapsed > 0 ? formatDuration(elapsed) : "-";
  const compactPrompt = job.prompt.replace(/\s+/g, " ").trim();
  const compactPromptChars = Array.from(compactPrompt);
  const promptPreview = compactPromptChars.length > 64 ? `${compactPromptChars.slice(0, 64).join("")}...` : compactPrompt;
  const storedReferenceImages = normalizeStoredReferenceImages(job.referenceImages);
  return (
    <article
      ref={recordRef}
      className={`job-card ${job.status} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""} ${selectionMode ? "selection-mode" : ""}`}
    >
      <div className={`tile-preview ${previewClass}`}>
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
            <img src={job.imageUrl} alt="" loading="lazy" decoding="async" />
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
            <strong>{(job.attempt ?? 1) > 1 ? `重试中 ${job.attempt}/${job.maxAttempts}` : "排队中"}</strong>
          </div>
        )}
        {job.status === "error" && (
          <button type="button" className="tile-state tile-state-button error" onClick={onPreview} title="查看失败详情">
            <AlertCircle size={22} />
            <strong>生成失败</strong>
            <span>{(job.attempt ?? 1) > 1 ? `重试 ${(job.attempt ?? 1) - 1} 次后仍失败 · 查看详情` : "查看详情"}</span>
          </button>
        )}
        <div className="tile-index">#{job.index}</div>
        {storedReferenceImages.length > 0 && (
          <div className="tile-reference-stack" title={`已保存 ${storedReferenceImages.length} 张参考图`}>
            <span>参考图 {storedReferenceImages.length}</span>
            <div>
              {storedReferenceImages.slice(0, 3).map((image) => (
                <img key={image.id} src={image.thumbnailDataUrl || image.dataUrl} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="tile-body">
        <div className="tile-summary-line">
          <StatusBadge status={job.status} elapsed={elapsed} />
          <strong className="tile-model" title={job.model}>{job.model}</strong>
          <div className="tile-meta-compact">
            <span>{job.params.aspectRatio}</span>
            <span>{job.params.resolution || DEFAULT_IMAGE_RESOLUTION}</span>
            <span title={sizeLabel}>{sizeLabel}</span>
            <span>{durationLabel}</span>
          </div>
        </div>

        {job.agentName && (
          <div className="tile-agent-line" title={job.agentScenario || ""}>
            <WandSparkles size={13} />
            <span>{job.agentName}</span>
            {job.promptVariant && <small>{PROMPT_VARIANT_LABELS[job.promptVariant]}</small>}
          </div>
        )}

        {job.status === "error" && (
          <button type="button" className="tile-error-line" title={serializeError(job.errorDetail)} onClick={onPreview}>
            {formatError(job.errorDetail)}
          </button>
        )}

        <div className="tile-bottom-line">
          <div className="tile-prompt" title={job.prompt}>{promptPreview}</div>
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
              <button type="button" className="icon-button" title="查看失败详情" onClick={onPreview}>
                <AlertCircle size={16} />
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
}, (previous, next) =>
  previous.job === next.job &&
  previous.highlighted === next.highlighted &&
  previous.selected === next.selected &&
  previous.selectionMode === next.selectionMode &&
  previous.selectable === next.selectable
);

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
  failedCount,
  isDownloading,
  onSelectAll,
  onClearFailed,
  onInvert,
  onDownload,
  onDelete,
  onCancel,
}: {
  selectedCount: number;
  downloadableCount: number;
  selectableCount: number;
  failedCount: number;
  isDownloading: boolean;
  onSelectAll: () => void;
  onClearFailed: () => void;
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
      <button type="button" className="subtle-button danger" onClick={onClearFailed} disabled={failedCount === 0}>
        <Trash2 size={16} />
        清除失败 {failedCount || ""}
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
        <dt>分辨率</dt>
        <dd>{params.resolution || DEFAULT_IMAGE_RESOLUTION}</dd>
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
      {"agentName" in job && job.agentName && (
        <div>
          <dt>Agent</dt>
          <dd>{job.agentName}{job.promptVariant ? ` · ${PROMPT_VARIANT_LABELS[job.promptVariant]}` : ""}</dd>
        </div>
      )}
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
  const storedReferenceImages = normalizeStoredReferenceImages(record.referenceImages);
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

      {storedReferenceImages.length > 0 && (
        <div className="reference-readonly">
          {storedReferenceImages.map((image) => (
            <div key={image.id}>
              <img src={image.thumbnailDataUrl || image.dataUrl} alt="" />
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewClass = aspectClass(item.width, item.height, item.params.aspectRatio);
  const hasImage = Boolean(item.url);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isFullscreen) {
        setIsFullscreen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, onClose]);

  return (
    <div className="preview-modal" role="dialog" aria-modal="true" aria-label={hasImage ? "图片预览" : "失败详情"}>
      <button className="preview-backdrop" type="button" aria-label="关闭预览" onClick={onClose} />
      <div className={`preview-shell ${isFullscreen ? "is-fullscreen" : ""}`}>
        <div className={`preview-stage ${hasImage ? previewClass : "is-error-detail"}`}>
          {hasImage ? (
            <button
              type="button"
              className="preview-image-frame"
              title={isFullscreen ? "退出全屏查看" : "全屏查看图片"}
              onClick={() => setIsFullscreen((value) => !value)}
            >
              <img src={item.url} alt="" />
            </button>
          ) : (
            <div className="preview-error-frame">
              <AlertCircle size={30} />
              <strong>生成失败</strong>
              <span>{formatError(item.errorDetail)}</span>
              {item.requestId && <code>requestID: {item.requestId}</code>}
            </div>
          )}
          {hasImage && isFullscreen && (
            <div className="preview-fullscreen-toolbar">
              <button type="button" className="icon-button" onClick={() => setIsFullscreen(false)} title="退出全屏">
                <X size={17} />
              </button>
            </div>
          )}
        </div>
        <aside className="preview-side">
          <div className="preview-head">
            <div>
              <span className="eyebrow">{hasImage ? "预览" : "失败详情"}</span>
              <strong>{item.model}</strong>
            </div>
            <div className="preview-head-actions">
              <button type="button" className="icon-button" onClick={onCopyPrompt} title="复制提示词">
                <Copy size={16} />
              </button>
              {hasImage && (
                <button type="button" className="icon-button" onClick={onDownload} title="下载图片">
                  <Download size={16} />
                </button>
              )}
              <button className="icon-button" type="button" onClick={onClose} title="关闭">
                <X size={17} />
              </button>
            </div>
          </div>
          <ImageInfo job={item} />
          {item.agentName && (
            <div className="preview-agent-meta">
              <span>{item.agentName}</span>
              <small>{item.promptVariant ? PROMPT_VARIANT_LABELS[item.promptVariant] : "Agent"}</small>
            </div>
          )}
          {item.submittedReferenceImages && item.submittedReferenceImages.length > 0 && (
            <div className="preview-submitted-refs">
              <div className="preview-submitted-refs-head">
                <strong>提交的参考图</strong>
                <small>压缩后 · 实际发送给上游的版本</small>
              </div>
              <div className="preview-submitted-refs-grid">
                {item.submittedReferenceImages.map((ref, index) => (
                  <a
                    key={`${ref.name}-${index}`}
                    className="preview-submitted-ref"
                    href={ref.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`${ref.name} · ${formatBytes(ref.requestBytes)}${ref.compressed ? `（原 ${formatBytes(ref.originalBytes)}）` : ""}`}
                  >
                    <img src={ref.dataUrl} alt={ref.name} />
                    <span>
                      <strong>#{index + 1}</strong>
                      <small>{formatBytes(ref.requestBytes)}{ref.compressed ? ` · 压缩自 ${formatBytes(ref.originalBytes)}` : " · 原图"}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {!hasImage && (
            <div className="preview-error-detail">
              <strong>失败详情</strong>
              <pre>{serializeError(item.errorDetail)}</pre>
            </div>
          )}
          <div className="preview-prompt">{item.prompt}</div>
        </aside>
      </div>
    </div>
  );
}
