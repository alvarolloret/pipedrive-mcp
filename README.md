# Miinta Pipedrive MCP v0.1

Read-only MCP (Model Context Protocol) server for Pipedrive that provides a morning sales digest with overdue activities, today's activities, and deals missing next action.

## Features

- **Single Tool**: `miinta.sales_queue.get` - Returns a comprehensive sales digest
- **Pipedrive API v2**: Uses modern Pipedrive API for activities, deals, persons, organizations, and stages
- **Data Enrichment**: 
  - Stage names for deals
  - Contact information (email, phone) for persons
  - Direct deal URLs
- **Smart Features**:
  - Pagination support (configurable max results)
  - Caching for improved performance
  - Europe/Madrid timezone support
  - Standard MCP stdio transport for streaming communication
  - Bearer authentication for Pipedrive API

## Installation

```bash
npm install
npm run build
```

## Configuration

### Pipedrive API Token

Get your API token from Pipedrive:
1. Go to your Pipedrive account settings
2. Navigate to Personal preferences → API
3. Copy your API token

Create a `.env` file based on `.env.example`:

```bash
# Pipedrive API Token (Bearer token)
PIPEDRIVE_API_TOKEN=your_pipedrive_api_token_here

# Pipedrive Filter IDs
PIPEDRIVE_OVERDUE_FILTER_ID=123
PIPEDRIVE_TODAY_FILTER_ID=456
PIPEDRIVE_MISSING_ACTION_FILTER_ID=789
```

### Required Pipedrive Filters

You need to create three saved filters in your Pipedrive account:

1. **Overdue Activities Filter**: Filter for activities with due dates in the past
2. **Today's Activities Filter**: Filter for activities due today
3. **Deals Missing Next Action Filter**: Filter for deals without a next activity scheduled

Get the filter IDs from the Pipedrive UI or API and set them in your `.env` file.

## Usage

### MCP Client Configuration

To use this server with an MCP client (like Claude Desktop), add the following to your MCP configuration file:

```json
{
  "mcpServers": {
    "pipedrive": {
      "command": "node",
      "args": ["/absolute/path/to/pipedrive-mcp/dist/index.js"],
      "env": {
        "PIPEDRIVE_API_TOKEN": "your_api_token_here",
        "PIPEDRIVE_OVERDUE_FILTER_ID": "123",
        "PIPEDRIVE_TODAY_FILTER_ID": "456",
        "PIPEDRIVE_MISSING_ACTION_FILTER_ID": "789"
      }
    }
  }
}
```

See `mcp-config-example.json` for a template.

### Running the Server

```bash
npm start
```

Or with environment variables directly:

```bash
PIPEDRIVE_API_TOKEN=xxx \
PIPEDRIVE_OVERDUE_FILTER_ID=123 \
PIPEDRIVE_TODAY_FILTER_ID=456 \
PIPEDRIVE_MISSING_ACTION_FILTER_ID=789 \
npm start
```

### MCP Tool

The server exposes one tool: `miinta.sales_queue.get`

**Parameters:**
- `max_results` (optional, default: 50): Maximum number of results per category

**Returns:**
A JSON object containing:
- `generated_at`: Timestamp when the digest was generated (Europe/Madrid timezone)
- `timezone`: The timezone used for date calculations
- `overdue_activities`: Array of enriched overdue activities
- `today_activities`: Array of enriched activities due today
- `deals_missing_next_action`: Array of enriched deals without next action
- `summary`: Counts for each category

**Example Response:**
```json
{
  "generated_at": "2026-02-13 22:30:00 CET",
  "timezone": "Europe/Madrid",
  "overdue_activities": [
    {
      "id": 123,
      "subject": "Follow up call",
      "type": "call",
      "due_date": "2026-02-12",
      "due_time": "10:00",
      "person_name": "John Doe",
      "person_email": "john@example.com",
      "person_phone": "+34123456789",
      "org_name": "Example Corp",
      "deal_title": "Annual Contract",
      "deal_url": "https://app.pipedrive.com/deal/456",
      "is_overdue": true
    }
  ],
  "today_activities": [...],
  "deals_missing_next_action": [...],
  "summary": {
    "total_overdue": 5,
    "total_today": 12,
    "total_deals_missing_action": 3
  }
}
```

## Architecture

- **Pipedrive Client** (`pipedrive-client.ts`): Handles all Pipedrive API v2 interactions
- **Cache** (`cache.ts`): In-memory caching with TTL support
- **Sales Queue Service** (`sales-queue.ts`): Business logic for aggregating and enriching data
- **MCP Server** (`index.ts`): MCP protocol implementation with stdio transport

## Development

```bash
# Build
npm run build

# Development mode (rebuild + run)
npm run dev
```

## API Version

This server uses Pipedrive API v2 endpoints:
- `/v2/activities`
- `/v2/deals`
- `/v2/persons`
- `/v2/organizations`
- `/v2/stages`

## License

ISC
