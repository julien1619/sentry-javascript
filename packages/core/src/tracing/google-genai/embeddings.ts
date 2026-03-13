import { GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE } from '../ai/gen-ai-attributes';
import type { Span } from '../../types-hoist/span';

/**
 * Add private request attributes for embeddings methods.
 * Records the embeddings input on gen_ai.embeddings.input instead of gen_ai.input.messages.
 * The input is NOT truncated (matching OpenAI behavior).
 */
export function addEmbeddingsRequestAttributes(span: Span, params: Record<string, unknown>): void {
  if (!('contents' in params)) {
    return;
  }

  const contents = params.contents;

  if (contents == null) {
    return;
  }

  if (typeof contents === 'string' && contents.length === 0) {
    return;
  }

  if (Array.isArray(contents) && contents.length === 0) {
    return;
  }

  span.setAttribute(
    GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
}
