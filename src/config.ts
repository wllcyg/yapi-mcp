import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AppError } from "./errors.js";

export interface AppConfig {
  baseUrl: string;
  tokenFilePath: string;
  timeoutMs: number;
  retryCount: number;
  fallbackToken?: string;
}

export function getConfig(): AppConfig {
  const baseUrl = process.env.YAPI_BASE_URL?.trim();
  if (!baseUrl) {
    throw new AppError({
      code: "INVALID_ARGUMENT",
      message: "Missing required env: YAPI_BASE_URL",
      suggestion: "Set YAPI_BASE_URL, e.g. http://10.255.30.245:3000",
    });
  }

  return {
    baseUrl,
    tokenFilePath: process.env.YAPI_TOKEN_FILE?.trim() || path.join(os.homedir(), ".yapi-mcp-tokens.json"),
    timeoutMs: Number(process.env.YAPI_TIMEOUT_MS || 8000),
    retryCount: Number(process.env.YAPI_RETRY_COUNT || 1),
    fallbackToken: process.env.YAPI_TOKEN?.trim() || undefined,
  };
}

export function loadTokenMap(tokenFilePath: string): Record<string, string> {
  if (!fs.existsSync(tokenFilePath)) {
    return {};
  }

  const raw = fs.readFileSync(tokenFilePath, "utf8");
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("token file is not an object");
    }

    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) {
        result[k] = v.trim();
      }
    }
    return result;
  } catch {
    throw new AppError({
      code: "INVALID_ARGUMENT",
      message: `Invalid token file JSON: ${tokenFilePath}`,
      suggestion: "Ensure token file format is like: { \"695\": \"token_xxx\" }",
    });
  }
}

export function resolveProjectId(input: {
  projectId?: number;
  projectUrl?: string;
  groupUrl?: string;
}): number {
  if (typeof input.projectId === "number" && Number.isFinite(input.projectId)) {
    return input.projectId;
  }

  if (input.projectUrl) {
    const matched = input.projectUrl.match(/\/project\/(\d+)/i);
    if (matched) return Number(matched[1]);

    if (/\/group\/\d+/i.test(input.projectUrl)) {
      throw new AppError({
        code: "TOKEN_SCOPE_UNSUPPORTED",
        message: "Group URL is not supported for token resolution",
        suggestion: "Provide projectId or projectUrl like /project/695/interface/api",
      });
    }
  }

  if (input.groupUrl) {
    throw new AppError({
      code: "TOKEN_SCOPE_UNSUPPORTED",
      message: "Group URL is not supported for token resolution",
      suggestion: "Provide projectId or projectUrl like /project/695/interface/api",
    });
  }

  throw new AppError({
    code: "PROJECT_ID_REQUIRED",
    message: "Cannot determine projectId from input",
    suggestion: "Provide projectId or projectUrl",
  });
}

export function resolveToken(args: {
  projectId: number;
  tokenMap: Record<string, string>;
  fallbackToken?: string;
}): string {
  const token = args.tokenMap[String(args.projectId)] || args.fallbackToken;
  if (!token) {
    throw new AppError({
      code: "PROJECT_TOKEN_REQUIRED",
      message: `Missing token for projectId=${args.projectId}`,
      suggestion: `Add \"${args.projectId}\": \"<token>\" to ~/.yapi-mcp-tokens.json`,
      context: { projectId: args.projectId },
    });
  }
  return token;
}
