# SumAPI 生图工作台

SumAPI 生图工作台基于 `d100000/ImageHub` 最新代码二次开发，保留原项目的工作台、批量生图、参考图、本地图库、Agent 模式、广场和管理员后台能力。

本仓库只做少量适配：

- 品牌统一为 `SumAPI`
- 默认 API URL 为 `https://api.clawopen.top/`
- 页面里的 API URL 可以由用户自行填写
- API Key 由用户自己填写，本项目不内置站长 Key
- 支持 OwlAi / NewAPI 这类 OpenAI 兼容生图接口：`POST /v1/images/generations`
- 中转兼容模式会把 `1:1`、`16:9` 等比例自动转换成 `1024x1024`、`1792x1024` 这类合法 `size`

## 使用方式

1. 打开工作台。
2. 在右侧配置区填写 API URL，默认是 `https://api.clawopen.top/`。
3. 填写你自己的 API Key。
4. 点击读取/刷新模型。
5. 选择模型并输入提示词生成图片。

## 本地开发

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:8877
```

## Docker 部署

复制环境变量文件：

```bash
cp .env.example .env
```

启动：

```bash
docker compose up -d --build
```

默认宿主机端口是 `3010`，宝塔反向代理到：

```text
http://127.0.0.1:3010
```

## 宝塔更新

服务器目录示例：

```bash
cd /www/wwwroot/sum-image-new
git pull origin main
docker compose up -d --build
```

如果之前做过强制重置，`git pull` 报历史冲突，可以用：

```bash
cd /www/wwwroot/sum-image-new
git fetch origin main
git reset --hard origin/main
docker compose up -d --build
```

## 数据与安全

- 用户 API Key 不写入服务器持久文件。
- 勾选“记住 API Key”时，只保存在当前用户浏览器本地。
- 生成图片和历史记录默认保存在当前用户浏览器本地。
- 管理员日志会记录请求元信息用于排查问题，但不会保存完整 API Key。

## 来源说明

本项目基于 `d100000/ImageHub` 二次开发。当前改动仅用于 SumAPI 品牌、默认接口和部署适配。
