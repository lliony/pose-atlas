# 姿势图鉴 · React 前端项目

[![CI](https://github.com/lliony/pose-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lliony/pose-atlas/actions/workflows/ci.yml)

基于 **React + TypeScript + Tailwind CSS + Vite** 的摄影姿势卡管理应用。三套可切换配色（纸本 / 白墙 / 暗房）、纸张自适应的双面打印，内置18张AI参考图片、6个场景。

## 启动

需要 Node.js **22.13+**（建议使用 Node 24 LTS）和 npm。

```bash
npm install
npm run dev
```

打开终端显示的地址，默认 `http://127.0.0.1:5174`。

AI 推荐需要在**第二个终端**启动本机服务：

```bash
npm run dev:ai
```

两个终端分别保持 `npm run dev` 和 `npm run dev:ai` 运行，并使用 `http://127.0.0.1:5174` 打开页面。没有系统默认配置时，点击总览导航中的「系统设置」，填写兼容 **OpenAI Chat Completions** 的公网 HTTPS 基础地址、API key 和支持文字/图片的模型。个人配置优先；失败后只有点「改用默认 AI 重试」才会切换。也可在仅后端读取的 `.env.local` 中配置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 作为系统默认。`.env.example` 提供假值格式；不要使用 `VITE_*` 保存服务密钥。

「记住本机」会把个人配置（**包括密钥**）写到当前浏览器的 localStorage；不勾选则只在本次页面会话中使用。清理站点数据或点「清除个人配置」会移除保存的配置。推荐可用文字、一张 JPEG/PNG/WebP 图片或两者；原图最多 10 MiB，浏览器缩至最长边 1600px、JPEG 最多 2 MiB 后发送。候选卡片只含教学字段，不含私人备注、来源或库内图片。每次最多返回 5 张现有卡片，可选中加入已有卡片册。

AI 后端当前**只监听 127.0.0.1**。静态 `dist`、构建成功和开发代理都不等于公开部署完成。要对外提供 AI 服务，须先接入真实身份验证、按用户调用限流、HTTPS 反向代理及相应的密钥管理；当前服务没有未经认证的公网启动选项。接口与错误见 [AI API 契约](docs/api-contract.md)，验收记录见 [验证记录](docs/verification.md)。

```bash
npm run typecheck  # TypeScript 检查
npm test           # 领域逻辑测试
npm run build      # 检查并构建 dist/
npm run preview    # 预览生产构建，默认端口4174
npm run format     # 格式化源码
```

有锁文件的环境可使用 `npm ci` 安装固定版本。`dist` 必须通过HTTP服务器访问，不支持双击HTML使用。

## 功能

- 场景分类新增、重命名、排序和删除迁移。
- 卡片新增与编辑，多图上传、封面选择、图片排序、每图专属说明。
- 正反翻面动画；五项教学：动作、机位、构图、光线、注意事项。
- 搜索、选择、卡片册排序、回收站与草稿恢复。
- 独立分享快照；私人备注与册外分类不进入快照。
- 70 × 100 mm双面卡，A4横向每面8张，校验页与长/短边翻转。
- 打印预加载图片、测量溢出；支持浏览器打印对话框另存PDF。
- 手机布局、键盘焦点、原生对话框与减少动态效果偏好。

## 数据模式

### 本机模式（默认）

无需账号、密钥或服务器，第一次启动写入演示资料，使用 **IndexedDB** 保存工作区、图片与卡册预览。草稿使用按本机用户隔离的 localStorage。

**本机预览链接只能在创建它的浏览器、同一来源下打开，不是互联网公开分享。** 清理站点数据会删除本机资料。`localhost` 与 `127.0.0.1`、不同端口属于不同来源，数据不会自动互通。

### API模式

复制 `.env.example` 为 `.env.local`：

```dotenv
VITE_DATA_MODE=api
API_PROXY_TARGET=http://127.0.0.1:5173
```

重启 Vite。此模式调用 `/api/workspace`、`/api/images` 和 `/api/shares`，使用后端提供的账号登录；不读写本机演示数据库。API代理目标必须是实现同一接口契约的后端，并允许开发来源。完整接口见 [docs/api-contract.md](docs/api-contract.md)。

**这个交付是独立前端工程，不包含账号服务、云数据库、对象存储或可独立部署的后端。** 已上线的旧网站保持原状。要让该新工程具备跨设备云同步和真正公开分享，需要接入后端；不能仅把静态文件上传后就视为云端完成。

生产环境建议将前端与API部署在同一域名，后端处理 `/api/*` 和登录回调，其余前端路径回退至 `index.html`。构建时的 `VITE_*` 变量会暴露到浏览器，不要放密钥。开发代理不随 `dist` 部署。

## 目录

```text
src/
  main.tsx            React入口
  App.tsx             路径分发和错误边界
  Atlas.tsx           工作台及页面交互
  components/         卡片、编辑器、弹窗、分类/卡册表单、打印与配色切换
  lib/types.ts        领域类型
  lib/model.ts        教学继承、分享快照、校验、双面排版
  lib/print.ts        纸张/比例/尺寸 → 每面行列与卡面毫米数
  lib/theme.ts        三套配色的解析、持久化与预览链接
  lib/seed.json       18张初始参考卡
  services/api.ts     本机/API模式切换，统一请求与上传
  services/storage.ts IndexedDB基础设施
  styles/app.css     Tailwind入口、主题令牌、@apply与交互样式
  styles/print.css   变量驱动的毫米尺寸打印和预检样式
public/images/        六张三联AI图片，SVG视窗展示单张
tests/                领域逻辑、主题与打印版式测试
docs/                 接口契约、配色方案与打印说明
```

Tailwind CSS 4通过官方PostCSS插件启用，使用 `@theme` 定义颜色、`@apply` 组合组件样式，同时在React中使用工具类。翻面3D变换、复杂响应式规则与实体打印尺寸使用CSS维护。

## 打印与素材

打印对话框只选纸张（A5 / A4 / A3 / Letter）与横竖方向；卡片按图片原始比例显示（1:1 / 2:3 / 3:4 / 9:16 / 3:2 / 4:3 / 16:9），工具栏可按比例筛选，相同比例的图片打在一起；上传时自动识别原图比例，非标准比例会提示并可居中裁切，版面按纸张平分平铺，正面与反面相邻成对输出。打印前会把图片压成 1600px 缩略图，示例 6 面的 PDF 约 5.5MB。打印时选 100% 实际大小，关闭页眉页脚并启用背景图形。先打印方向校验页确认翻转方向；超过80字的栏目先精简，实际排版溢出也会阻止打印。详见 [打印说明](docs/design/print-and-grid.md)。

图片为AI生成参考，界面标注AI，保留原始灵感来源链接，并非抖音原视频截图。下载文字资料提供JSON及图片引用；离线完整图文请另存PDF。

AI 推荐入口固定在页面右下角，展开为非遮罩浮窗；收起后保留本次输入及结果。新增/编辑卡片时可用「AI 帮我填满」：把当前图片交给模型，一次生成标题、标签、性别、气质风格与五段教学（已填写的内容不覆盖）。系统设置里可以保存多个模型档案，并分别指定「推荐用」与「填充用」的模型。改动服务端后需要重启 `npm run dev:ai`，否则新接口不会生效（会返回 404）。构图网格可通过工具栏的文字开关切换，也可在系统设置中调整；显示偏好保存在当前浏览器。
