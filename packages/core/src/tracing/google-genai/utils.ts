import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { SpanAttributeValue } from '../../types-hoist/span';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { getFinalOperationName } from '../ai/utils';
import { GOOGLE_GENAI_INSTRUMENTED_METHODS, GOOGLE_GENAI_SYSTEM_NAME } from './constants';
import type { GoogleGenAIIstrumentedMethod } from './types';

/**
 * Check if a method path should be instrumented
 */
export function shouldInstrument(methodPath: string): methodPath is GoogleGenAIIstrumentedMethod {
  // Check for exact matches first (like 'models.generateContent')
  if (GOOGLE_GENAI_INSTRUMENTED_METHODS.includes(methodPath as GoogleGenAIIstrumentedMethod)) {
    return true;
  }

  // Check for method name matches (like 'sendMessage' from chat instances)
  const methodName = methodPath.split('.').pop();
  return GOOGLE_GENAI_INSTRUMENTED_METHODS.includes(methodName as GoogleGenAIIstrumentedMethod);
}

/**
 * Check if a method is a streaming method
 */
export function isStreamingMethod(methodPath: string): boolean {
  return methodPath.includes('Stream');
}

/**
 * Check if a method is an embeddings method
 */
export function isEmbeddingsMethod(methodPath: string): boolean {
  return methodPath.includes('embedContent');
}

/**
 * Extract model from parameters or chat context object
 * For chat instances, the model is available on the chat object as 'model' (older versions) or 'modelVersion' (newer versions)
 */
export function extractModel(params: Record<string, unknown>, context?: unknown): string {
  if ('model' in params && typeof params.model === 'string') {
    return params.model;
  }

  // Try to get model from chat context object (chat instance has model property)
  if (context && typeof context === 'object') {
    const contextObj = context as Record<string, unknown>;

    // Check for 'model' property (older versions, and streaming)
    if ('model' in contextObj && typeof contextObj.model === 'string') {
      return contextObj.model;
    }

    // Check for 'modelVersion' property (newer versions)
    if ('modelVersion' in contextObj && typeof contextObj.modelVersion === 'string') {
      return contextObj.modelVersion;
    }
  }

  return 'unknown';
}

/**
 * Extract generation config parameters
 */
function extractConfigAttributes(config: Record<string, unknown>): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {};

  if ('temperature' in config && typeof config.temperature === 'number') {
    attributes[GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = config.temperature;
  }
  if ('topP' in config && typeof config.topP === 'number') {
    attributes[GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = config.topP;
  }
  if ('topK' in config && typeof config.topK === 'number') {
    attributes[GEN_AI_REQUEST_TOP_K_ATTRIBUTE] = config.topK;
  }
  if ('maxOutputTokens' in config && typeof config.maxOutputTokens === 'number') {
    attributes[GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE] = config.maxOutputTokens;
  }
  if ('frequencyPenalty' in config && typeof config.frequencyPenalty === 'number') {
    attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = config.frequencyPenalty;
  }
  if ('presencePenalty' in config && typeof config.presencePenalty === 'number') {
    attributes[GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = config.presencePenalty;
  }

  return attributes;
}

/**
 * Extract request attributes from method arguments
 * Builds the base attributes for span creation including system info, model, and config
 */
export function extractRequestAttributes(
  methodPath: string,
  params?: Record<string, unknown>,
  context?: unknown,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_SYSTEM_ATTRIBUTE]: GOOGLE_GENAI_SYSTEM_NAME,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: getFinalOperationName(methodPath),
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.google_genai',
  };

  if (params) {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = extractModel(params, context);

    // Extract generation config parameters
    if ('config' in params && typeof params.config === 'object' && params.config) {
      const config = params.config as Record<string, unknown>;
      Object.assign(attributes, extractConfigAttributes(config));

      // Extract available tools from config
      if ('tools' in config && Array.isArray(config.tools)) {
        const functionDeclarations = config.tools.flatMap(
          (tool: { functionDeclarations: unknown[] }) => tool.functionDeclarations,
        );
        attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = JSON.stringify(functionDeclarations);
      }
    }
  } else {
    attributes[GEN_AI_REQUEST_MODEL_ATTRIBUTE] = extractModel({}, context);
  }

  return attributes;
}

// Copied from https://googleapis.github.io/js-genai/release_docs/index.html
export type ContentListUnion = Content | Content[] | PartListUnion;
export type ContentUnion = Content | PartUnion[] | PartUnion;
export type Content = {
  parts?: Part[];
  role?: string;
};
export type PartUnion = Part | string;
export type Part = Record<string, unknown> & {
  inlineData?: {
    data?: string;
    displayName?: string;
    mimeType?: string;
  };
  text?: string;
};
export type PartListUnion = PartUnion[] | PartUnion;

// our consistent span message shape
export type Message = Record<string, unknown> & {
  role: string;
  content?: PartListUnion;
  parts?: PartListUnion;
};

/**
 *
 */
export function contentUnionToMessages(content: ContentListUnion, role = 'user'): Message[] {
  if (typeof content === 'string') {
    return [{ role, content }];
  }
  if (Array.isArray(content)) {
    return content.flatMap(content => contentUnionToMessages(content, role));
  }
  if (typeof content !== 'object' || !content) return [];
  if ('role' in content && typeof content.role === 'string') {
    return [content as Message];
  }
  if ('parts' in content) {
    return [{ ...content, role } as Message];
  }
  return [{ role, content }];
}
