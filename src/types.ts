export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "PROJECT_ID_REQUIRED"
  | "PROJECT_TOKEN_REQUIRED"
  | "TOKEN_SCOPE_UNSUPPORTED"
  | "PROJECT_NOT_ACCESSIBLE"
  | "INTERFACE_NOT_FOUND"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED";

export interface ApiErrorShape {
  code: ErrorCode;
  message: string;
  suggestion?: string;
  context?: Record<string, unknown>;
}

export interface SearchInput {
  keyword: string;
  projectId?: number;
  projectUrl?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  pathHint?: string;
  limit?: number;
}

export interface DetailInput {
  interfaceId: number;
  projectId?: number;
  projectUrl?: string;
  includeMock?: boolean;
}

export interface YApiInterfaceSummary {
  interfaceId: number;
  name: string;
  method?: string;
  path?: string;
  projectId: number;
  score: number;
}
