# yapi-mcp-server

YApi MCP Server（Node.js + MCP SDK），提供按需查询的两个核心工具：

- `search_yapi_interfaces`
- `get_yapi_interface_detail`

> Token 仅支持 **project 级**。`group` 级 URL 不支持鉴权。

## 1. 安装与构建

```bash
npm install
npm run build
```

本地开发：

```bash
npm run dev
```

## 2. 配置

### 环境变量

- `YAPI_BASE_URL`（必填）
- `YAPI_TOKEN_FILE`（可选，默认 `~/.yapi-mcp-tokens.json`）
- `YAPI_TIMEOUT_MS`（可选，默认 `8000`）
- `YAPI_RETRY_COUNT`（可选，默认 `1`）
- `YAPI_TOKEN`（可选，单项目临时兜底）

### Token 文件

路径：`~/.yapi-mcp-tokens.json`

```json
{
  "695": "token_for_project_695",
  "703": "token_for_project_703"
}
```

## 3. MCP 客户端配置示例（Cursor）

```json
{
  "mcpServers": {
    "yapi": {
      "command": "node",
      "args": ["D:/self/yapi-mcp/dist/index.js"],
      "env": {
        "YAPI_BASE_URL": "http://10.255.30.245:3000"
      }
    }
  }
}
```

如果你后续发布 npm 包，也可改为：

```json
{
  "mcpServers": {
    "yapi": {
      "command": "npx",
      "args": ["-y", "yapi-mcp-server"],
      "env": {
        "YAPI_BASE_URL": "http://10.255.30.245:3000"
      }
    }
  }
}
```

## 4. 工具定义

### `search_yapi_interfaces`

输入：

- `keyword: string`（必填）
- `projectId?: number`
- `projectUrl?: string`（如 `.../project/695/interface/api`）
- `method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"`
- `pathHint?: string`
- `limit?: number`（默认 10，最大 50）

输出：

- 匹配接口列表：`interfaceId / name / method / path / projectId / score`

### `get_yapi_interface_detail`

输入：

- `interfaceId: number`（必填）
- `projectId?: number`
- `projectUrl?: string`
- `includeMock?: boolean`（默认 false）

输出：

- 接口详情（request/response schema，默认不返回 mock）

## 5. 错误码

- `INVALID_ARGUMENT`
- `PROJECT_ID_REQUIRED`
- `PROJECT_TOKEN_REQUIRED`
- `TOKEN_SCOPE_UNSUPPORTED`
- `PROJECT_NOT_ACCESSIBLE`
- `INTERFACE_NOT_FOUND`
- `UPSTREAM_TIMEOUT`
- `UPSTREAM_ERROR`
- `RATE_LIMITED`
