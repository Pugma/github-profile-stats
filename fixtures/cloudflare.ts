export function unexpectedCloudflareCall(): never {
  throw new Error("Unexpected Cloudflare call");
}

export function executionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    waitUntil: unexpectedCloudflareCall,
    passThroughOnException: unexpectedCloudflareCall,
    get exports() {
      return unexpectedCloudflareCall();
    },
    props: undefined,
    get tracing() {
      return unexpectedCloudflareCall();
    },
    abort: unexpectedCloudflareCall,
    ...overrides,
  };
}
