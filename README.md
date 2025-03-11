# OpenAI Web Search MCP Server

MCP Server for OpenAI's Web Search API, enabling AI models to search the web
for current information before generating responses.

## Features

- **Always-on Web Search**: When using Chat Completions API with dedicated
search models, always retrieves web information

- **Conditional Web Search**: When using Responses API, only searches when
necessary for responding to queries

- **Geographic Customization**: Refine search results based on user location

- **Configurable Context Size**: Balance between quality, cost, and latency

- **Automatic Citations**: Includes inline citations and annotations for
sources used

## Tools

### `web_search_chat_completion`

Perform a web search using OpenAI's Chat Completions API with search-enabled models.

**Inputs:**
- `model` (string): Model to use for web search
  - `gpt-4o-search-preview`
  - `gpt-4o-mini-search-preview`
- `messages` (array): Conversation messages
  - `role` (string): Message role (`user`, `assistant`, or `system`)
  - `content` (string): Message content
- `web_search_options` (object, optional): Configuration options for web search
  - `user_location` (object, optional): User location to refine search results
    - `type` (string): Always "approximate"
    - `approximate` (object):
      - `country` (string, optional): Two-letter ISO country code (e.g., "US")
      - `city` (string, optional): City name (e.g., "San Francisco")
      - `region` (string, optional): Region or state (e.g., "California")
	  - `timezone` (string, optional): IANA timezone (e.g.,
"America/Los_Angeles")
  - `search_context_size` (string, optional): Amount of context retrieved from
the web
    - `low`: Least context, lowest cost, fastest response
    - `medium` (default): Balanced context, cost, and latency
    - `high`: Most comprehensive context, highest cost, slower response

**Returns:** Response with model-generated content and citations

### `web_search_responses`

Perform a web search using OpenAI's Responses API with web_search_preview tool.

**Inputs:**
- `model` (string): Model to use for response generation
- `tools` (array): Tools the model can use
  - Must include a single tool object:
    ```
    {
      "type": "web_search_preview",
      "web_search_preview": {
        // Same options as web_search_options above
      }
    }
    ```
- `messages` (array): Conversation messages (same format as above)

**Returns:** Response with model-generated content and citations

## Setup

### Personal Access Token

Create an OpenAI API key with access to the required models:

1. Go to [OpenAI API Keys](https://platform.openai.com/account/api-keys)
2. Create a new API key
3. Copy the generated key

### Usage with Claude Desktop

To use this with Claude Desktop, add the following to your
`claude_desktop_config.json`:

#### Using NPX

```json
{
  "mcpServers": {
    "websearch": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-websearch"
      ],
      "env": {
        "OPENAI_API_KEY": "<YOUR_OPENAI_API_KEY>"
      }
    }
  }
}
```

#### Using Docker

```json
{
  "mcpServers": {
    "websearch": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "OPENAI_API_KEY",
        "mcp/websearch"
      ],
      "env": {
        "OPENAI_API_KEY": "<YOUR_OPENAI_API_KEY>"
      }
    }
  }
}
```

## Examples

### Basic Web Search

```javascript
// Using web_search_chat_completion
const result = await agent.callTool("web_search_chat_completion", {
  model: "gpt-4o-search-preview",
  messages: [
	{ role: "user", content: "What are the latest AI advancements this month?"
}
  ]
});
```

### Location-Specific Search

```javascript
// Search with location context
const result = await agent.callTool("web_search_chat_completion", {
  model: "gpt-4o-search-preview",
  web_search_options: {
    user_location: {
      type: "approximate",
      approximate: {
        country: "GB",
        city: "London",
        region: "London"
      }
    }
  },
  messages: [
	{ role: "user", content: "What are the best restaurants around Granary
Square?" }
  ]
});
```

### Adjusting Search Context Size

```javascript
// Using lower context size for faster, cheaper results
const result = await agent.callTool("web_search_chat_completion", {
  model: "gpt-4o-search-preview",
  web_search_options: {
    search_context_size: "low"
  },
  messages: [
    { role: "user", content: "What movie won best picture in 2025?" }
  ]
});
```

### Conditional Search with Responses API

```javascript
// Using web_search_responses for conditional search
const result = await agent.callTool("web_search_responses", {
  model: "gpt-4o",
  tools: [
    {
      type: "web_search_preview",
      web_search_preview: {
        search_context_size: "medium",
        user_location: {
          type: "approximate",
          approximate: {
            country: "US",
            city: "New York"
          }
        }
      }
    }
  ],
  messages: [
    { role: "user", content: "What's playing at Broadway theaters this week?" }
  ]
});
```

## Response Format

The server returns OpenAI API responses that include:

- Generated content from the model
- Inline citations referencing sources
- Annotations with detailed citation information
- Location in text where sources were referenced

Example response snippet:
```json
{
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
		"content": "According to recent reports, NASA's Artemis program has
reached a new milestone...[1]",
        "annotations": [
          {
            "type": "url_citation",
            "url_citation": {
              "start_index": 158,
              "end_index": 161,
              "url": "https://www.nasa.gov/artemis-news/",
              "title": "NASA Artemis Program Updates"
            }
          }
        ]
      },
      "finish_reason": "stop"
    }
  ]
}
```

## Limitations

- This tool does not support zero data retention or data residency
- The search-enabled models only support a subset of API parameters
- When used as a tool in the Responses API, web search has tiered rate limits
- When displaying search results to end users, inline citations must be made
clearly visible and clickable in your UI

## Build

Docker build:

```bash
docker build -t mcp/websearch -f src/websearch/Dockerfile .
```

## License

This MCP server is licensed under the MIT License. This means you are free to
use, modify, and distribute the software, subject to the terms and conditions
of the MIT License.
