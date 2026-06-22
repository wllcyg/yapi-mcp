import axios, { type AxiosInstance } from "axios";
import { AppError } from "./errors.js";
import type { YApiInterfaceSummary } from "./types.js";

interface YApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  retryCount: number;
}

export class YApiClient {
  private readonly client: AxiosInstance;
  private readonly retryCount: number;

  constructor(options: YApiClientOptions) {
    this.client = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs,
    });
    this.retryCount = options.retryCount;
  }

  async searchInterfaces(args: {
    projectId: number;
    token: string;
    keyword: string;
    method?: string;
    pathHint?: string;
    limit: number;
  }): Promise<YApiInterfaceSummary[]> {
    const menuData = await this.requestWithRetry("/api/interface/list_menu", {
      project_id: args.projectId,
      token: args.token,
    });

    const flat = flattenMenuInterfaces(menuData, args.projectId);
    const keyword = args.keyword.trim().toLowerCase();
    const method = args.method?.toUpperCase();
    const pathHint = args.pathHint?.toLowerCase();

    const scored = flat
      .filter((item) => {
        if (method && (item.method || "").toUpperCase() !== method) return false;
        return true;
      })
      .map((item) => {
        const title = (item.name || "").toLowerCase();
        const path = (item.path || "").toLowerCase();

        let score = 0;
        if (title.includes(keyword)) score += 50;
        if (path.includes(keyword)) score += 40;
        if (pathHint && path.includes(pathHint)) score += 30;
        if (title.startsWith(keyword)) score += 20;
        if ((item.method || "").toUpperCase() === method) score += 10;

        return {
          ...item,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, args.limit);

    return scored;
  }

  async getInterfaceDetail(args: {
    interfaceId: number;
    token: string;
    includeMock?: boolean;
  }): Promise<Record<string, unknown>> {
    const detail = await this.requestWithRetry("/api/interface/get", {
      id: args.interfaceId,
      token: args.token,
    });

    if (!detail || typeof detail !== "object") {
      throw new AppError({
        code: "INTERFACE_NOT_FOUND",
        message: `Interface ${args.interfaceId} not found`,
      });
    }

    if (!args.includeMock && "mock" in detail) {
      const copy = { ...(detail as Record<string, unknown>) };
      delete copy.mock;
      return copy;
    }

    return detail as Record<string, unknown>;
  }

  private async requestWithRetry(url: string, params: Record<string, unknown>): Promise<unknown> {
    let attempt = 0;
    const maxAttempts = Math.max(1, this.retryCount + 1);

    while (attempt < maxAttempts) {
      try {
        const res = await this.client.get(url, { params });
        const payload = res.data as any;

        if (payload?.errcode === 0) {
          return payload.data;
        }

        const errcode = payload?.errcode;
        const errmsg = payload?.errmsg || "Unknown YApi error";

        if (errcode === 40011 || errcode === 40012) {
          throw new AppError({
            code: "PROJECT_NOT_ACCESSIBLE",
            message: errmsg,
          });
        }

        throw new AppError({
          code: "UPSTREAM_ERROR",
          message: errmsg,
          context: { errcode },
        });
      } catch (error: any) {
        const status = error?.response?.status as number | undefined;

        if (status === 429) {
          throw new AppError({
            code: "RATE_LIMITED",
            message: "YApi rate limited",
          });
        }

        if (error instanceof AppError) {
          throw error;
        }

        if (error?.code === "ECONNABORTED") {
          if (attempt + 1 < maxAttempts) {
            attempt += 1;
            continue;
          }
          throw new AppError({
            code: "UPSTREAM_TIMEOUT",
            message: "YApi request timed out",
          });
        }

        if (attempt + 1 < maxAttempts) {
          attempt += 1;
          continue;
        }

        throw new AppError({
          code: "UPSTREAM_ERROR",
          message: error?.message || "Failed to request YApi",
        });
      }
    }

    throw new AppError({
      code: "UPSTREAM_ERROR",
      message: "Unexpected request state",
    });
  }
}

function flattenMenuInterfaces(menuData: unknown, projectId: number): YApiInterfaceSummary[] {
  if (!Array.isArray(menuData)) return [];

  const out: YApiInterfaceSummary[] = [];

  for (const category of menuData as any[]) {
    const list = category?.list;
    if (!Array.isArray(list)) continue;

    for (const item of list) {
      const interfaceId = Number(item?._id ?? item?.id);
      if (!Number.isFinite(interfaceId)) continue;

      out.push({
        interfaceId,
        name: String(item?.title ?? item?.name ?? ""),
        method: item?.method ? String(item.method) : undefined,
        path: item?.path ? String(item.path) : undefined,
        projectId,
        score: 0,
      });
    }
  }

  return out;
}
