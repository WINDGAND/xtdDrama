import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "DB_ERROR"
  | "UNEXPECTED";

export type ApiOk<T extends object> = { success: true; requestId: string } & T;
export type ApiFail = { success: false; requestId: string; code: ApiErrorCode; error: string };

export function newRequestId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ok<T extends object>(data: T, init?: ResponseInit) {
  const requestId = newRequestId();
  const res = NextResponse.json<ApiOk<T>>({ success: true, requestId, ...data }, init);
  res.headers.set("x-request-id", requestId);
  return res;
}

export function fail(code: ApiErrorCode, error: string, status = 400, init?: ResponseInit) {
  const requestId = newRequestId();
  const res = NextResponse.json<ApiFail>(
    { success: false, requestId, code, error },
    { status, ...init }
  );
  res.headers.set("x-request-id", requestId);
  return res;
}

