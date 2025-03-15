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
const VERSION = "1.0.0";

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
  temperature: z
    .number()
    .optional()
    .describe("Controls randomness in the response (between 0 and 2)"),
  max_completion_tokens: z
    .number()
    .optional()
    .describe("Maximum number of tokens for completion"),
  top_p: z
    .number()
    .optional()
    .describe("Controls diversity via nucleus sampling"),
  presence_penalty: z
    .number()
    .optional()
    .describe("Penalty for tokens based on presence in text (-2.0 to 2.0)"),
  frequency_penalty: z
    .number()
    .optional()
    .describe("Penalty for tokens based on frequency in text (-2.0 to 2.0)"),
  seed: z.number().optional().describe("Seed for deterministic sampling"),
  logprobs: z
    .boolean()
    .optional()
    .describe("Whether to return log probabilities of output tokens"),
  top_logprobs: z
    .number()
    .optional()
    .describe("Number of most likely tokens to return (0-20)"),
  response_format: z
    .object({
      type: z
        .enum(["json_object", "text", "json_schema"])
        .describe("Format of the response"),
      json_schema: z
        .any()
        .optional()
        .describe("JSON schema for structured outputs"),
    })
    .optional()
    .describe("Format of model's response"),
  stop: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Sequences to stop generation"),
  stream: z.boolean().optional().describe("Whether to stream the response"),
  user: z
    .string()
    .optional()
    .describe("A unique identifier representing your end-user"),
  service_tier: z
    .enum(["auto", "default"])
    .optional()
    .describe("Latency tier to use for processing"),
  reasoning_effort: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe("Effort on reasoning for reasoning models"),
  store: z
    .boolean()
    .optional()
    .describe("Whether to store the output for model distillation"),
  parallel_tool_calls: z
    .boolean()
    .optional()
    .describe("Whether to enable parallel function calling during tool use"),
});

const WebSearchResponsesSchema = z.object({
  model: z.string().describe("Model to use for response generation"),
  tools: z
    .array(
      z.object({
        type: z.literal("web_search_preview"),
        web_search_preview: z
          .object({
            user_location: ApproximateLocationSchema.optional().describe(
              "Optional user location to refine search results",
            ),
            search_context_size: z
              .enum(["low", "medium", "high"])
              .optional()
              .describe("Amount of context retrieved from the web"),
          })
          .optional(),
      }),
    )
    .describe("Tools the model can use"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .describe(
      "Conversation messages (will be converted to input/instructions format)",
    ),
  temperature: z
    .number()
    .optional()
    .describe("Controls randomness in the response"),
  max_tokens: z
    .number()
    .optional()
    .describe("Maximum number of tokens to generate"),
  top_p: z
    .number()
    .optional()
    .describe("Controls diversity via nucleus sampling"),
  presence_penalty: z
    .number()
    .optional()
    .describe("Penalty for new tokens based on presence in text"),
  frequency_penalty: z
    .number()
    .optional()
    .describe("Penalty for new tokens based on frequency in text"),
  response_format: z
    .object({
      type: z
        .enum(["text", "json_object"])
        .optional()
        .describe("Format of the response"),
    })
    .optional()
    .describe("Format of model's response"),
  truncation: z
    .enum(["auto", "disabled"])
    .optional()
    .describe("Truncation strategy for long inputs"),
  stream: z.boolean().optional().describe("Whether to stream the response"),
  user: z
    .string()
    .optional()
    .describe("A unique identifier representing your end-user"),
  instructions: z
    .string()
    .optional()
    .describe("System-level instructions for the model"),
  store: z
    .boolean()
    .optional()
    .describe("Whether to store the response for later retrieval"),
  parallel_tool_calls: z
    .boolean()
    .optional()
    .describe("Whether to allow parallel tool calls"),
  previous_response_id: z
    .string()
    .optional()
    .describe("ID of the previous response for multi-turn conversations"),
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
    // Extract system message as instructions if present
    let instructions: string | undefined;
    const userAndAssistantMessages: { role: string; content: string }[] = [];

    // Process messages
    params.messages.forEach((message) => {
      if (message.role === "system") {
        // Use the last system message as instructions
        instructions = message.content;
      } else {
        // Collect user and assistant messages
        userAndAssistantMessages.push({
          role: message.role,
          content: message.content,
        });
      }
    });

    // Get the last user message as input, or use the last message if no user messages
    let input = "";
    let previousMessages: { role: string; content: string }[] = [];

    // Find the last user message to use as input
    for (let i = userAndAssistantMessages.length - 1; i >= 0; i--) {
      if (userAndAssistantMessages[i].role === "user") {
        input = userAndAssistantMessages[i].content;
        // Everything before this becomes context
        previousMessages = userAndAssistantMessages.slice(0, i);
        break;
      }
    }

    // If no user message found, use the last message (shouldn't happen with normal usage)
    if (!input && userAndAssistantMessages.length > 0) {
      input =
        userAndAssistantMessages[userAndAssistantMessages.length - 1].content;
      previousMessages = userAndAssistantMessages.slice(
        0,
        userAndAssistantMessages.length - 1,
      );
    }

    // Build request body
    const requestBody: any = {
      model: params.model,
      tools: params.tools,
      input: input,
    };

    // Add optional parameters
    if (instructions !== undefined) requestBody.instructions = instructions;
    if (previousMessages.length > 0) {
      // The Responses API doesn't use 'context' - we need to handle this differently
      // This is a simplification - in real implementation you'd need to handle previous state differently
      requestBody.previous_response_id = params.previous_response_id;
    }

    if (params.temperature !== undefined)
      requestBody.temperature = params.temperature;
    if (params.max_tokens !== undefined)
      requestBody.max_output_tokens = params.max_tokens;
    if (params.top_p !== undefined) requestBody.top_p = params.top_p;
    if (params.presence_penalty !== undefined)
      requestBody.presence_penalty = params.presence_penalty;
    if (params.frequency_penalty !== undefined)
      requestBody.frequency_penalty = params.frequency_penalty;
    if (params.response_format !== undefined) {
      requestBody.text = {
        format: params.response_format,
      };
    }
    if (params.truncation !== undefined)
      requestBody.truncation = params.truncation;
    if (params.stream !== undefined) requestBody.stream = params.stream;
    if (params.user !== undefined) requestBody.user = params.user;
    if (params.parallel_tool_calls !== undefined)
      requestBody.parallel_tool_calls = params.parallel_tool_calls;
    if (params.store !== undefined) requestBody.store = params.store;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
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
