/**
 * Claude AI Client
 *
 * Wrapper for Anthropic SDK with prompt caching and hierarchical context management.
 *
 * Features:
 * - Anthropic prompt caching (cache_control: ephemeral)
 * - Hierarchical context chunking for AAS content (L1/L2/L3)
 * - Local response cache for repeated queries
 * - Token usage tracking
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { Logger } from 'pino';

/**
 * AI Client configuration
 */
export interface AIClientConfig {
  /** Anthropic API key */
  apiKey: string;

  /** Model to use */
  model: string;

  /** Maximum tokens for responses */
  maxTokens: number;

  /** Enable local response caching */
  enableCaching: boolean;

  /** Local cache TTL in seconds */
  cacheTtlSeconds: number;

  /** Enable Anthropic prompt caching (cache_control) */
  enablePromptCaching: boolean;
}

/**
 * Default AI client configuration
 */
export const DEFAULT_AI_CONFIG: AIClientConfig = {
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  enableCaching: true,
  cacheTtlSeconds: 300,
  enablePromptCaching: true,
};

/**
 * Context chunk level for hierarchical retrieval
 */
export type ContextLevel = 'L1' | 'L2' | 'L3';

/**
 * Context chunk with level metadata
 */
export interface ContextChunk {
  /** Hierarchical level: L1 (summary), L2 (submodel), L3 (element) */
  level: ContextLevel;

  /** Semantic ID or path for this chunk */
  path: string;

  /** Content of the chunk */
  content: string;

  /** Estimated token count */
  tokenEstimate: number;
}

/**
 * Hierarchical context for AAS documents
 *
 * L1: Document summary (AAS, submodel counts, key identifiers)
 * L2: Submodel level (semantic IDs, element summaries)
 * L3: Element level (full property/collection details)
 */
export interface HierarchicalContext {
  /** L1: High-level document summary */
  summary: ContextChunk;

  /** L2: Submodel-level context */
  submodels: ContextChunk[];

  /** L3: Element-level context (loaded on demand) */
  elements: Map<string, ContextChunk>;

  /** Total token budget */
  tokenBudget: number;

  /** Current token usage */
  currentTokens: number;
}

/**
 * Message for AI conversation
 */
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI completion options
 */
export interface CompletionOptions {
  /** System prompt */
  system?: string;

  /** Messages to send */
  messages: AIMessage[];

  /** Override max tokens */
  maxTokens?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Temperature (0-1) */
  temperature?: number;

  /** Enable prompt caching for system prompt */
  cacheSystemPrompt?: boolean;

  /** Enable prompt caching for first message */
  cacheFirstMessage?: boolean;
}

/**
 * AI completion result
 */
export interface CompletionResult {
  /** Response content */
  content: string;

  /** Tokens used */
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens read from Anthropic's prompt cache */
    cacheReadInputTokens?: number;
    /** Tokens written to Anthropic's prompt cache */
    cacheCreationInputTokens?: number;
  };

  /** Stop reason */
  stopReason: string;

  /** Whether local cache was used */
  cacheHit: boolean;

  /** Whether Anthropic prompt cache was used */
  promptCacheHit: boolean;
}

/**
 * Claude AI client with caching
 */
export class AIClient {
  private client: Anthropic;
  private config: AIClientConfig;
  private logger: Logger;
  private cache: Map<string, { result: CompletionResult; expiresAt: number }>;

  constructor(config: Partial<AIClientConfig>, logger: Logger) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.logger = logger.child({ component: 'ai-client' });
    this.cache = new Map();

    if (!this.config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Generate a completion with optional Anthropic prompt caching
   */
  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const {
      system,
      messages,
      maxTokens,
      stopSequences,
      temperature,
      cacheSystemPrompt = true,
      cacheFirstMessage = false,
    } = options;

    // Check local response cache
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(options);
      const cached = this.cache.get(cacheKey);

      if (cached && cached.expiresAt > Date.now()) {
        this.logger.debug({ cacheKey }, 'Local cache hit');
        return { ...cached.result, cacheHit: true };
      }
    }

    this.logger.debug(
      { model: this.config.model, messageCount: messages.length },
      'Sending completion request'
    );

    // Build system prompt with optional cache_control
    const systemBlocks = this.buildSystemBlocks(system, cacheSystemPrompt);

    // Build messages with optional cache_control on first message
    const apiMessages = this.buildMessages(messages, cacheFirstMessage);

    // Make API call
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: maxTokens ?? this.config.maxTokens,
      system: systemBlocks,
      messages: apiMessages,
      stop_sequences: stopSequences,
      temperature,
    });

    // Extract cache usage from response
    const cacheReadTokens = (response.usage as { cache_read_input_tokens?: number })
      .cache_read_input_tokens;
    const cacheCreationTokens = (response.usage as { cache_creation_input_tokens?: number })
      .cache_creation_input_tokens;

    const result: CompletionResult = {
      content:
        response.content[0]?.type === 'text' ? response.content[0].text : '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: cacheReadTokens,
        cacheCreationInputTokens: cacheCreationTokens,
      },
      stopReason: response.stop_reason ?? 'unknown',
      cacheHit: false,
      promptCacheHit: (cacheReadTokens ?? 0) > 0,
    };

    // Store in local cache
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(options);
      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
      });
    }

    this.logger.debug(
      {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheRead: cacheReadTokens,
        cacheCreation: cacheCreationTokens,
      },
      'Completion received'
    );

    return result;
  }

  /**
   * Build system prompt blocks with optional cache_control
   */
  private buildSystemBlocks(
    system: string | undefined,
    enableCache: boolean
  ): TextBlockParam[] | undefined {
    if (!system) return undefined;

    const block: TextBlockParam = {
      type: 'text',
      text: system,
    };

    // Add cache_control if prompt caching is enabled
    if (enableCache && this.config.enablePromptCaching) {
      (block as TextBlockParam & { cache_control?: { type: 'ephemeral' } }).cache_control = {
        type: 'ephemeral',
      };
    }

    return [block];
  }

  /**
   * Build message array with optional cache_control on first message
   */
  private buildMessages(messages: AIMessage[], cacheFirst: boolean): MessageParam[] {
    return messages.map((m, index) => {
      const content: TextBlockParam = {
        type: 'text',
        text: m.content,
      };

      // Cache the first user message if enabled (typically contains AAS context)
      if (index === 0 && cacheFirst && this.config.enablePromptCaching && m.role === 'user') {
        (content as TextBlockParam & { cache_control?: { type: 'ephemeral' } }).cache_control = {
          type: 'ephemeral',
        };
      }

      return {
        role: m.role,
        content: [content],
      };
    });
  }

  /**
   * Generate a structured JSON response
   */
  async completeJson<T>(options: CompletionOptions): Promise<T> {
    // Add JSON instruction to system prompt
    const jsonSystem = `${options.system || ''}

IMPORTANT: Respond ONLY with valid JSON. No markdown code blocks, no explanation.`;

    const result = await this.complete({
      ...options,
      system: jsonSystem,
    });

    try {
      // Try to extract JSON from response
      let content = result.content.trim();

      // Strip markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.error({ content: result.content, error }, 'Failed to parse JSON response');
      throw new Error('AI response was not valid JSON', { cause: error });
    }
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Generate cache key from options
   */
  private getCacheKey(options: CompletionOptions): string {
    const key = JSON.stringify({
      model: this.config.model,
      system: options.system,
      messages: options.messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });

    // Simple hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `cache_${hash}`;
  }
}

/**
 * Hierarchical context builder for AAS documents
 *
 * Creates a tiered context representation:
 * - L1: Document summary (cached, always included)
 * - L2: Submodel summaries (cached, included based on relevance)
 * - L3: Element details (on-demand, for specific queries)
 */
export class HierarchicalContextBuilder {
  private readonly DEFAULT_TOKEN_BUDGET = 100000;
  private readonly CHARS_PER_TOKEN = 4; // Rough estimate

  /**
   * Build hierarchical context from an AAS Environment
   */
  buildContext(
    environment: Record<string, unknown>,
    tokenBudget: number = this.DEFAULT_TOKEN_BUDGET
  ): HierarchicalContext {
    const summary = this.buildL1Summary(environment);
    const submodels = this.buildL2Submodels(environment);

    return {
      summary,
      submodels,
      elements: new Map(),
      tokenBudget,
      currentTokens: summary.tokenEstimate + submodels.reduce((sum, s) => sum + s.tokenEstimate, 0),
    };
  }

  /**
   * Build L1: High-level document summary
   */
  private buildL1Summary(environment: Record<string, unknown>): ContextChunk {
    const aas = (environment.assetAdministrationShells as unknown[]) || [];
    const submodels = (environment.submodels as unknown[]) || [];
    const conceptDescriptions = (environment.conceptDescriptions as unknown[]) || [];

    const summaryLines: string[] = [
      '## AAS Document Summary',
      '',
      `- Asset Administration Shells: ${aas.length}`,
      `- Submodels: ${submodels.length}`,
      `- Concept Descriptions: ${conceptDescriptions.length}`,
      '',
    ];

    // List AAS identifiers
    if (aas.length > 0) {
      summaryLines.push('### Asset Administration Shells');
      for (const shell of aas) {
        const s = shell as { id?: string; idShort?: string };
        summaryLines.push(`- ${s.idShort || 'unnamed'} (${s.id || 'no-id'})`);
      }
      summaryLines.push('');
    }

    // List submodel semantic IDs
    if (submodels.length > 0) {
      summaryLines.push('### Submodels');
      for (const sm of submodels) {
        const s = sm as { idShort?: string; semanticId?: { keys?: { value?: string }[] } };
        const semanticId = s.semanticId?.keys?.[0]?.value || 'no-semantic-id';
        summaryLines.push(`- ${s.idShort || 'unnamed'}: ${semanticId}`);
      }
      summaryLines.push('');
    }

    const content = summaryLines.join('\n');
    return {
      level: 'L1',
      path: '/',
      content,
      tokenEstimate: this.estimateTokens(content),
    };
  }

  /**
   * Build L2: Submodel-level context
   */
  private buildL2Submodels(environment: Record<string, unknown>): ContextChunk[] {
    const submodels = (environment.submodels as unknown[]) || [];
    const chunks: ContextChunk[] = [];

    for (let i = 0; i < submodels.length; i++) {
      const sm = submodels[i] as {
        idShort?: string;
        semanticId?: { keys?: { value?: string }[] };
        submodelElements?: unknown[];
      };

      const path = `/submodels/${i}`;
      const semanticId = sm.semanticId?.keys?.[0]?.value || 'no-semantic-id';
      const elements = sm.submodelElements || [];

      const lines: string[] = [
        `## Submodel: ${sm.idShort || 'unnamed'}`,
        `Semantic ID: ${semanticId}`,
        `Elements: ${elements.length}`,
        '',
        '### Element Summary',
      ];

      // Summarize elements (just types and idShorts)
      for (const elem of elements) {
        const e = elem as { modelType?: string; idShort?: string };
        lines.push(`- ${e.idShort || 'unnamed'} (${e.modelType || 'unknown'})`);
      }

      const content = lines.join('\n');
      chunks.push({
        level: 'L2',
        path,
        content,
        tokenEstimate: this.estimateTokens(content),
      });
    }

    return chunks;
  }

  /**
   * Build L3: Element-level detail (on-demand)
   */
  buildL3Element(element: unknown, path: string): ContextChunk {
    const content = JSON.stringify(element, null, 2);
    return {
      level: 'L3',
      path,
      content,
      tokenEstimate: this.estimateTokens(content),
    };
  }

  /**
   * Select context chunks within token budget
   *
   * Strategy:
   * 1. Always include L1 summary
   * 2. Include L2 submodels up to 60% of budget
   * 3. Reserve 40% for L3 elements and response
   */
  selectForBudget(
    context: HierarchicalContext,
    relevantPaths?: string[]
  ): { system: string; userContext: string } {
    const systemParts: string[] = [context.summary.content];
    let usedTokens = context.summary.tokenEstimate;
    const l2Budget = context.tokenBudget * 0.6;

    // Add relevant submodels first
    const sortedSubmodels = this.sortByRelevance(context.submodels, relevantPaths);

    for (const chunk of sortedSubmodels) {
      if (usedTokens + chunk.tokenEstimate > l2Budget) break;
      systemParts.push(chunk.content);
      usedTokens += chunk.tokenEstimate;
    }

    // Build user context from any L3 elements
    const userContextParts: string[] = [];
    for (const [path, chunk] of context.elements) {
      if (relevantPaths && !relevantPaths.some((rp) => path.startsWith(rp))) continue;
      userContextParts.push(`### Element at ${path}\n${chunk.content}`);
    }

    return {
      system: systemParts.join('\n\n'),
      userContext: userContextParts.join('\n\n'),
    };
  }

  /**
   * Sort chunks by relevance to given paths
   */
  private sortByRelevance(chunks: ContextChunk[], relevantPaths?: string[]): ContextChunk[] {
    if (!relevantPaths || relevantPaths.length === 0) {
      return chunks;
    }

    return [...chunks].sort((a, b) => {
      const aRelevance = relevantPaths.some((rp) => a.path.startsWith(rp) || rp.startsWith(a.path))
        ? 1
        : 0;
      const bRelevance = relevantPaths.some((rp) => b.path.startsWith(rp) || rp.startsWith(b.path))
        ? 1
        : 0;
      return bRelevance - aRelevance;
    });
  }

  /**
   * Estimate token count from string length
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }
}
