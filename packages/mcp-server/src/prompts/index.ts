/**
 * MCP Prompts Registration
 *
 * Reusable prompt templates for common AI-assisted tasks.
 */

import type { TransportHandler } from '../transport/handler.js';
import type { PromptDefinition, PromptMessage } from '../types.js';

/**
 * Describe document structure
 */
const describeDocument: PromptDefinition = {
  name: 'describe_document',
  description: 'Generate a human-readable description of the current AAS document',
  arguments: {
    type: 'object',
    properties: {
      detailLevel: {
        type: 'string',
        enum: ['brief', 'detailed', 'comprehensive'],
        description: 'Level of detail in the description',
      },
    },
  },
  handler: async (args, context): Promise<PromptMessage[]> => {
    const { detailLevel = 'detailed' } = args as { detailLevel?: string };
    const { session } = context;

    if (!session.documentState?.environment) {
      return [
        {
          role: 'user',
          content: 'No document is currently loaded. Please load a document first.',
        },
      ];
    }

    const envJson = JSON.stringify(session.documentState.environment, null, 2);

    return [
      {
        role: 'user',
        content: `Please describe the following AAS Environment at a ${detailLevel} level.
Focus on:
- Asset information and purpose
- Submodel structure and semantic IDs
- Key properties and their values
- Any notable patterns or issues

Environment JSON:
\`\`\`json
${envJson}
\`\`\``,
      },
    ];
  },
};

/**
 * Fix validation errors
 */
const fixValidationErrors: PromptDefinition = {
  name: 'fix_validation_errors',
  description: 'Generate patches to fix validation errors',
  arguments: {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        description: 'Validation errors to fix',
      },
    },
    required: ['errors'],
  },
  handler: async (args, context): Promise<PromptMessage[]> => {
    const { errors } = args as { errors: unknown[] };
    const { session } = context;

    if (!session.documentState?.environment) {
      return [
        {
          role: 'user',
          content: 'No document is loaded.',
        },
      ];
    }

    return [
      {
        role: 'user',
        content: `The following validation errors need to be fixed. Generate JSON Patch operations to correct them.

Validation Errors:
\`\`\`json
${JSON.stringify(errors, null, 2)}
\`\`\`

Current Document State:
\`\`\`json
${JSON.stringify(session.documentState.environment, null, 2)}
\`\`\`

Requirements:
1. Generate valid RFC 6902 JSON Patch operations
2. Each patch should address one error
3. Preserve existing valid data
4. Follow AAS metamodel constraints
5. Include a "reason" field explaining each fix

Respond with an array of patch operations.`,
      },
    ];
  },
};

/**
 * Extract data from datasheet
 */
const extractFromDatasheet: PromptDefinition = {
  name: 'extract_from_datasheet',
  description: 'Extract structured data from a product datasheet',
  arguments: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The datasheet content (text or base64 image)',
      },
      targetTemplate: {
        type: 'string',
        description: 'Target IDTA template semantic ID',
      },
    },
    required: ['content'],
  },
  handler: async (args, _context): Promise<PromptMessage[]> => {
    const { content, targetTemplate } = args as {
      content: string;
      targetTemplate?: string;
    };

    const templateHint = targetTemplate
      ? `Map the extracted data to the "${targetTemplate}" template structure.`
      : 'Suggest an appropriate IDTA template for this data.';

    return [
      {
        role: 'user',
        content: `Extract structured product data from the following datasheet content.

${templateHint}

Datasheet Content:
${content}

Instructions:
1. Identify all product specifications, technical data, and metadata
2. Map values to appropriate AAS property types (Property, MultiLanguageProperty, etc.)
3. Include semantic IDs where known (use ECLASS or IRDI codes)
4. Organize into a SubmodelElementCollection structure if appropriate
5. Output as JSON suitable for AAS Environment

Focus on:
- Manufacturer information
- Product identification (serial number, part number)
- Technical specifications
- Physical properties
- Compliance/certification data`,
      },
    ];
  },
};

/**
 * Suggest improvements
 */
const suggestImprovements: PromptDefinition = {
  name: 'suggest_improvements',
  description: 'Analyze document and suggest improvements for completeness and quality',
  handler: async (_args, context): Promise<PromptMessage[]> => {
    const { session } = context;

    if (!session.documentState?.environment) {
      return [
        {
          role: 'user',
          content: 'No document is loaded.',
        },
      ];
    }

    return [
      {
        role: 'user',
        content: `Analyze the following AAS document and suggest improvements.

Document:
\`\`\`json
${JSON.stringify(session.documentState.environment, null, 2)}
\`\`\`

Please evaluate:
1. **Completeness**: Are required fields populated? Are there missing standard properties?
2. **Semantic IDs**: Are appropriate semantic IDs used? Could ECLASS or IRDI codes be added?
3. **Structure**: Is the submodel structure well-organized? Are collections used appropriately?
4. **Data Quality**: Are values properly typed? Are descriptions helpful?
5. **Interoperability**: Will this document work well with other AAS tools?

For each suggestion:
- Explain the issue
- Provide specific improvement
- Rate importance (high/medium/low)
- Indicate if it can be auto-fixed`,
      },
    ];
  },
};

/**
 * Generate submodel from template
 */
const generateFromTemplate: PromptDefinition = {
  name: 'generate_from_template',
  description: 'Generate a complete submodel structure from an IDTA template',
  arguments: {
    type: 'object',
    properties: {
      templateId: {
        type: 'string',
        description: 'IDTA template semantic ID',
      },
      context: {
        type: 'string',
        description: 'Additional context about the asset/product',
      },
    },
    required: ['templateId'],
  },
  handler: async (args, _context): Promise<PromptMessage[]> => {
    const { templateId, context: productContext } = args as {
      templateId: string;
      context?: string;
    };

    return [
      {
        role: 'user',
        content: `Generate a complete submodel structure based on the IDTA template: ${templateId}

${productContext ? `Product Context: ${productContext}` : ''}

Requirements:
1. Follow the template structure exactly
2. Include all mandatory elements
3. Add common optional elements where appropriate
4. Use proper semantic IDs
5. Set reasonable default values or TODO placeholders
6. Output as valid AAS Submodel JSON

The output should be ready to add to an AAS Environment.`,
      },
    ];
  },
};

export const allPrompts: PromptDefinition[] = [
  describeDocument,
  fixValidationErrors,
  extractFromDatasheet,
  suggestImprovements,
  generateFromTemplate,
];

/**
 * Register all prompts with the transport handler
 */
export function registerPrompts(handler: TransportHandler): void {
  for (const prompt of allPrompts) {
    handler.registerPrompt(prompt);
  }
}
