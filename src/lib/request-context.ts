/**
 * Server-only request helpers.
 *
 * `@tanstack/react-start/server` must never reach the browser bundle. Server
 * route handlers dynamically import `.server.ts` modules, and the preview
 * bundler follows those imports into the client graph, so modules on that
 * path read cookies/headers through these wrappers instead of importing the
 * server entry directly. `createServerOnlyFn` bodies are stripped from the
 * client build (and throw if ever called there).
 */
import { createServerOnlyFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestHeader,
  setCookie,
  setResponseStatus,
} from "@tanstack/react-start/server";

export const readRequestCookie = createServerOnlyFn((name: string) => getCookie(name));

export const writeResponseCookie = createServerOnlyFn(
  (name: string, value: string, options?: Parameters<typeof setCookie>[2]) => setCookie(name, value, options),
);

export const clearResponseCookie = createServerOnlyFn(
  (name: string, options?: Parameters<typeof deleteCookie>[1]) => deleteCookie(name, options),
);

export const readRequestHeader = createServerOnlyFn((name: string) => getRequestHeader(name as never) as string | undefined);

export const currentRequest = createServerOnlyFn(() => getRequest());

export const setCurrentResponseStatus = createServerOnlyFn((code: number) => setResponseStatus(code));
