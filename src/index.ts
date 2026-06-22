#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getConfig,
  loadTokenMap,
  resolveProjectId,
  resolveToken,
} from "./config.js";
import { AppError } from "./errors.js";
import type { DetailInput, SearchInput } from "./types.js";
import { YApiClient } from "./yapi.js";

const config = getConfig();
const tokenMap = loadTokenMap(config.tokenFilePath);
const yapi = new YApiClient({
  baseUrl: config.baseUrl,
  timeoutMs: config.timeoutMs,
  retryCount: config.retryCount,
});

const server = new Server(
  {
    name: "yapi-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_yapi_interfaces",
        description:
          "Search YApi interfaces by natural language keyword within a project. Token scope is project-level only.",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", minLength: 1 },
            projectId: { type: "number" },
            projectUrl: { type: "string" },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            },
            pathHint: { type: "string" },
            limit: { type: "number", minimum: 1, maximum: 50 },
          },
          required: ["keyword"],
          additionalProperties: false,
        },
      },
      {
        name: "get_yapi_interface_detail",
        description:
          "Get YApi interface detail including request/response schema. Token scope is project-level only.",
        inputSchema: {
          type: "object",
          properties: {
            interfaceId: { type: "number" },
            projectId: { type: "number" },
            projectUrl: { type: "string" },
            includeMock: { type: "boolean" },
          },
          required: ["interfaceId"],
          additionalProperties: false,
        },
      },
    ],
  };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    try {
      const { name, arguments: args } = request.params;

      if (name === "search_yapi_interfaces") {
        const input = (args ?? {}) as unknown as SearchInput;
        if (!input.keyword?.trim()) {
          throw new AppError({
            code: "INVALID_ARGUMENT",
            message: "keyword is required",
            suggestion: "Pass keyword like '工单详情'",
          });
        }

        const projectId = resolveProjectId({
          projectId: input.projectId,
          projectUrl: input.projectUrl,
        });

        const token = resolveToken({
          projectId,
          tokenMap,
          fallbackToken: config.fallbackToken,
        });

        const limit = clampLimit(input.limit);
        const result = await yapi.searchInterfaces({
          projectId,
          token,
          keyword: input.keyword,
          method: input.method,
          pathHint: input.pathHint,
          limit,
        });

        return ok({
          projectId,
          count: result.length,
          items: result,
        });
      }

      if (name === "get_yapi_interface_detail") {
        const input = (args ?? {}) as unknown as DetailInput;
        if (!Number.isFinite(input.interfaceId)) {
          throw new AppError({
            code: "INVALID_ARGUMENT",
            message: "interfaceId is required and must be a number",
          });
        }

        const projectId = resolveProjectId({
          projectId: input.projectId,
          projectUrl: input.projectUrl,
        });

        const token = resolveToken({
          projectId,
          tokenMap,
          fallbackToken: config.fallbackToken,
        });

        const detail = await yapi.getInterfaceDetail({
          interfaceId: input.interfaceId,
          token,
          includeMock: input.includeMock,
        });

        return ok({
          projectId,
          interfaceId: input.interfaceId,
          detail,
        });
      }

      throw new AppError({
        code: "INVALID_ARGUMENT",
        message: `Unknown tool: ${name}`,
      });
    } catch (error) {
      return fail(error);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            data,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function fail(error: unknown) {
  if (error instanceof AppError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: false,
              error: error.toShape(),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: false,
            error: {
              code: "UPSTREAM_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(50, Math.max(1, Number(limit)));
}

main().catch((error) => {
  const payload =
    error instanceof AppError
      ? { ok: false, error: error.toShape() }
      : {
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message:
              error instanceof Error ? error.message : "Unknown startup error",
          },
        };

  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
});
