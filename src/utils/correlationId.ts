/**
 * Request Correlation IDs for tracing AI calls frontend → backend.
 *
 * Every API call gets a unique ID that flows through the request lifecycle.
 * This enables tracing in logs, debugging, and eventual distributed tracing.
 */

let counter = 0;

export function generateCorrelationId(prefix = 'rg'): string {
  counter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${timestamp}-${random}-${counter}`;
}

// ── Active request registry for cancellation / tracking ──

const activeRequests = new Map<string, AbortController>();

export function registerRequest(correlationId: string): AbortController {
  const controller = new AbortController();
  activeRequests.set(correlationId, controller);
  return controller;
}

export function completeRequest(correlationId: string): void {
  activeRequests.delete(correlationId);
}

export function cancelRequest(correlationId: string): void {
  const controller = activeRequests.get(correlationId);
  if (controller) {
    controller.abort();
    activeRequests.delete(correlationId);
  }
}

export function getActiveRequestCount(): number {
  return activeRequests.size;
}
