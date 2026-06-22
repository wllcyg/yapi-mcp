# 产品需求文档 (PRD)：YApi MCP Server

## 1. 背景与痛点 (Background & Pain points)

在日常前端开发中，团队通常依赖 YApi 作为接口管理工具。当前的工作流存在以下痛点：
1. **冗余的批量生成**：现有的 `yapi-codegen` 脚本会一次性拉取整个项目的所有接口，生成大量可能永远不会用到的本地 `.js` 文件，导致项目体积膨胀。
2. **人工上下文割裂**：开发者需要离开 IDE，去 YApi 网页端搜索接口，然后再回到代码中引入对应的方法，来回切换打断心流。
3. **接口同步滞后**：后端修改接口后，前端往往不知道，或者忘记重新跑脚本，导致联调时参数报错。

## 2. 解决方案 (Solution Overview)

利用 **MCP (Model Context Protocol)** 技术，开发一个独立的 `yapi-mcp-server`。
该方案的核心在于**颠覆传统的“提前全量生成”模式，走向“AI 按需动态获取”模式**。

把 YApi 变成 AI 助手（Cursor / Claude Desktop）的外挂大脑。开发者只需用自然语言描述需求（如“帮我接一下新增工单的接口”），AI 即可在后台自动调用 MCP Server 实时查阅 YApi 文档，并在当前组件中精确生成包含正确类型定义的代码。

## 3. 核心功能特性 (Core Features)

### 3.1 基于自然语言的接口搜索
- **描述**：AI 可根据开发者口语化的需求，在指定的 YApi 项目中搜索匹配的接口。
- **MCP 工具定义**：`search_yapi_interfaces`
- **入参（建议 Schema）**：
  - `keyword: string`（必填，如“工单详情”）
  - `projectId?: number`（可选，优先显式传入）
  - `projectUrl?: string`（可选，如 `.../project/695/interface/api`，可自动解析 projectId）
  - `method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"`（可选）
  - `pathHint?: string`（可选，如 `/api/work-order`）
  - `limit?: number`（可选，默认 `10`，最大 `50`）
- **出参**：匹配的接口列表（包含接口 ID、名称、Method、Path、所属项目 ID、匹配分数摘要）。

### 3.2 接口详情与契约精准获取
- **描述**：获取具体某个接口的详细定义，包括 Request Query、Request Body 结构，以及完整的 Response JSON Schema。
- **MCP 工具定义**：`get_yapi_interface_detail`
- **入参（建议 Schema）**：
  - `interfaceId: number`（必填，从搜索结果中获得）
  - `projectId?: number`（可选，建议传入以避免跨项目歧义）
  - `projectUrl?: string`（可选，可自动解析 projectId）
  - `includeMock?: boolean`（可选，默认 `false`，为 Phase 2 预留）
- **出参**：精确到每个字段是否必填、数据类型、默认值/示例值（若有）的完整接口定义。

### 3.3 多项目环境下的 Token 管理（仅 Project 级）
- **关键事实**：YApi 的 Token 是基于「项目级别 (Project)」的，不是 Group 级别。
  - 示例：`/group/896` 没有可用 token；`/project/695/...` 才有对应 token。
- **解决方案 (Token Map)**：不支持单一全局 Token，而是采用 **Token 映射表**。
  - **本地配置文件**：MCP Server 启动时，读取本机 `~/.yapi-mcp-tokens.json`，格式：`{ "695": "token_A", "703": "token_B" }`。
  - **动态调用**：优先从 `projectId` / `projectUrl` 解析出项目 ID，再去映射表读取对应 token。
  - **不支持 group 级鉴权**：传入 `groupUrl` 时直接返回结构化错误，提示补充 `projectId` 或 `projectUrl`。

## 4. 典型用户故事 (User Stories)

- **场景 A（新功能开发）**：前端接手一个新页面，在 Cursor 里输入：“帮我写一下用户配置表单，对接保存配置的接口”。Cursor 自动通过 MCP 查到接口参数，并把完整的 `axios.post` 及 React/Vue 表单组件全部写好。
- **场景 B（接口变更修复）**：联调时后端提示增加了一个必填字段。前端在代码中对 AI 说：“查一下目前获取详情接口最新的返回体，同步更新一下本地的 TypeScript Interface”。

## 5. 技术架构与选型 (Architecture)

- **运行时环境**：Node.js (v18+)
- **核心依赖**：
  - `@modelcontextprotocol/sdk`：实现标准 MCP 协议
  - `axios`：用于与公司内部的 YApi 服务器通信
- **通信方式**：Stdio Transport (标准输入输出，适配绝大部分本地 IDE)
- **配置管理（统一口径）**：
  - `process.env.YAPI_BASE_URL`：必填
  - `~/.yapi-mcp-tokens.json`：必填（projectId -> token）
  - `process.env.YAPI_TOKEN`：仅作为单项目/临时兜底，不作为主流程依赖
- **安全与稳定性要求**：
  - Token 不写入日志；日志中对凭证字段统一脱敏
  - `~/.yapi-mcp-tokens.json` 建议仅当前用户可读写（如 `600` 权限）
  - 请求超时（建议 5~10s）+ 有限重试（建议 1~2 次，仅幂等查询）
  - 仅允许访问 `YAPI_BASE_URL` 所属域名，避免 SSRF 风险

## 6. 错误模型与返回规范 (Error Model)

为保证 AI 可恢复调用，所有失败返回统一结构：
- `code: string`
- `message: string`
- `suggestion?: string`
- `context?: object`

建议错误码：
- `INVALID_ARGUMENT`：参数非法或缺失
- `PROJECT_ID_REQUIRED`：无法从参数中确定 projectId
- `PROJECT_TOKEN_REQUIRED`：缺少指定项目 token
- `TOKEN_SCOPE_UNSUPPORTED`：仅提供了 group 信息，当前仅支持 project 级 token
- `PROJECT_NOT_ACCESSIBLE`：项目不存在或无权限
- `INTERFACE_NOT_FOUND`：接口不存在
- `UPSTREAM_TIMEOUT`：YApi 请求超时
- `UPSTREAM_ERROR`：YApi 返回非预期错误
- `RATE_LIMITED`：触发限流

## 7. 演进路线 (Roadmap)

- **Phase 1: 核心查询能力（MVP）**
  - 完成 MCP Server 基础骨架
  - 实现 `search_yapi_interfaces` 和 `get_yapi_interface_detail`
  - 打通 `projectId/projectUrl -> token map -> YApi` 主链路
  - 实现统一错误码与结构化返回
  - 在 Cursor 或 Claude Desktop 本地配置跑通
- **Phase 2: 上下文感知增强**
  - 支持直接提供当前打开文件的代码片段，让 AI 判断是否需要根据 YApi 更新代码
  - 解析 YApi 中的 Mock 数据并直接返回，供 AI 自动生成 Mock Server 脚本
- **Phase 3: 团队工程化发布**
  - 封装为 NPM 私有包，提供 `npx yapi-mcp-server` 的一键启动能力
  - 编写团队内部操作手册，全员推广“无代码生成”开发模式

## 8. Phase 1 验收标准 (Acceptance Criteria)

- 在至少 2 个不同项目（如 `695`、`703`）下可正确读取各自 token 并查询成功
- 对仅提供 `groupUrl` 的请求，返回 `TOKEN_SCOPE_UNSUPPORTED`，且提示可执行的下一步操作
- 搜索接口结果默认返回前 10 条，且包含 `interfaceId/name/method/path/projectId`
- 详情接口返回请求参数、响应 Schema、必填信息，不丢关键字段
- 网络异常和上游超时场景下，服务不崩溃，返回统一错误结构
