#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Define the version
const VERSION = "1.1.2";

// Schemas for Web Search API
const ApproximateLocationSchema = z.object({
  type: z.literal("approximate"),
  approximate: z.object({
    country: z
      .string()
      .length(2)
      .optional()
      .describe("Two-letter ISO country code (e.g., 'US')"),
    city: z.string().optional().describe("City name (e.g., 'San Francisco')"),
    region: z
      .string()
      .optional()
      .describe("Region or state (e.g., 'California')"),
    timezone: z
      .string()
      .optional()
      .describe("IANA timezone (e.g., 'America/Los_Angeles')"),
  }),
});

const WebSearchChatCompletionSchema = z.object({
  model: z
    .enum(["gpt-4o-search-preview", "gpt-4o-mini-search-preview"])
    .describe("Model to use for web search"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system", "developer"]),
        content: z.string(),
      }),
    )
    .describe("Conversation messages"),
  web_search_options: z
    .object({
      user_location: ApproximateLocationSchema.optional().describe(
        "Optional user location to refine search results",
      ),
      search_context_size: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Amount of context retrieved from the web"),
    })
    .optional()
    .describe("Configuration options for web search"),
});

const WebSearchResponsesSchema = z.object({
  model: z.enum(["gpt-4o"]).describe("Model to use for response generation"),
  tools: z
    .array(
      z.object({
        type: z.enum(["web_search_preview", "web_search_preview_2025_03_11"]),
        user_location: ApproximateLocationSchema.optional().describe(
          "Optional user location to refine search results",
        ),
        search_context_size: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Amount of context retrieved from the web"),
      }),
    )
    .describe("Tools the model can use"),
  input: z
    .union([
      z.string(),
      z.array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        }),
      ),
    ])
    .describe(
      "Conversation messages (will be converted to input/instructions format)",
    ),
});

// API implementation functions
async function performWebSearchChatCompletion(
  params: z.infer<typeof WebSearchChatCompletionSchema>,
) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        web_search_options: params.web_search_options || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Web search chat completion error: ${error.message}`);
    }
    throw error;
  }
}

async function performWebSearchResponses(
  params: z.infer<typeof WebSearchResponsesSchema>,
) {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Web search responses error: ${error.message}`);
    }
    throw error;
  }
}

// Server setup
const server = new Server(
  {
    name: "openai-websearch-mcp-server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "web_search_chat_completion",
        description:
          "Perform a web search using OpenAI's Chat Completions API with search-enabled models",
        inputSchema: zodToJsonSchema(WebSearchChatCompletionSchema),
      },
      {
        name: "web_search_responses",
        description:
          "Perform a web search using OpenAI's Responses API with web_search_preview tool",
        inputSchema: zodToJsonSchema(WebSearchResponsesSchema),
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "web_search_chat_completion": {
        const args = WebSearchChatCompletionSchema.parse(
          request.params.arguments,
        );
        const result = await performWebSearchChatCompletion(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "web_search_responses": {
        const args = WebSearchResponsesSchema.parse(request.params.arguments);
        const result = await performWebSearchResponses(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid input: ${JSON.stringify(error.errors)}`);
    }
    throw error;
  }
});

// Error handling class
class OpenAIAPIError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenAIAPIError";
    this.status = status;
  }
}

function formatOpenAIError(error: Error): string {
  let message = `API Error: ${error.message}`;

  if (error instanceof OpenAIAPIError) {
    message = `OpenAI API Error ${error.status ? `(${error.status})` : ""}: ${error.message}`;
  }

  return message;
}

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenAI Web Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
