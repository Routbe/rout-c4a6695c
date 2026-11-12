/** Only allowlisted provider codes are logged; never URLs, keys or response bodies. */
export function storageFailureCode(body: string): string {
  const code = /<Code>([A-Za-z0-9]+)<\/Code>/.exec(body)?.[1];
  const allowed = new Set(["AccessDenied", "NoSuchBucket", "InvalidAccessKeyId", "SignatureDoesNotMatch", "AuthorizationHeaderMalformed", "SlowDown", "InternalError", "RequestTimeout"]);
  return code && allowed.has(code) ? code : "StorageRejected";
}
export function storageNetworkCode(error: unknown): string {
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  return code === "ENOTFOUND" || code === "EAI_AGAIN" ? "DnsFailure" : error instanceof Error && error.name === "TimeoutError" ? "RequestTimeout" : "NetworkFailure";
}