import "server-only";
import type { StructuredRequest } from "./types";

/**
 * Feature-specific deterministic responders for the mock AI provider. Each returns data
 * that must satisfy the feature's Zod schema. Extended as features are built.
 */
export type MockResponder = (req: StructuredRequest<unknown>) => unknown | Promise<unknown>;

export const mockResponders: Record<string, MockResponder | undefined> = {};

export function registerMockResponder(key: string, responder: MockResponder) {
  mockResponders[key] = responder;
}
