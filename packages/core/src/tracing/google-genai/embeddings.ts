import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import type { Span } from '../../types-hoist/span';
import type { GoogleGenAIEmbedContentResponse } from './types';

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

/**
 * Add response attributes from the Google GenAI embedContent response.
 * The EmbedContentResponse has no usageMetadata/candidates/modelVersion.
 * Token counts come from embeddings[].statistics.tokenCount.
 * @see https://ai.google.dev/api/embeddings#EmbedContentResponse
 */
export function addEmbedContentResponseAttributes(span: Span, response: unknown): void {
  if (!response || typeof response !== 'object') return;

  const embedResponse = response as GoogleGenAIEmbedContentResponse;

  if (Array.isArray(embedResponse.embeddings)) {
    let totalTokenCount = 0;
    for (const embedding of embedResponse.embeddings) {
      if (embedding.statistics && typeof embedding.statistics.tokenCount === 'number') {
        totalTokenCount += embedding.statistics.tokenCount;
      }
    }

    if (totalTokenCount > 0) {
      span.setAttributes({
        [GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE]: totalTokenCount,
        [GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE]: totalTokenCount,
      });
    }
  }
}
