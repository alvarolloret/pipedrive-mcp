# Miinta Pipedrive MCP v0.1

Read-only MCP (Model Context Protocol) server for Pipedrive that provides a digest-ready sales queue with:
- **Overdue follow-up activities** (from a Pipedrive filter)
- **Due today follow-up activities** (from a Pipedrive filter)
- **Deals missing next action** (from a Pipedrive filter)

## Features

- **Single Tool**: `miinta.sales_queue.get` - Returns a comprehensive sales digest
- **Pipedrive API v2**: Uses modern Pipedrive API for activities, deals, persons, organizations, and stages
- **Data Enrichment**: 
  - Stage names for deals
  - Contact information (email) for persons
  - Direct deal URLs with configurable company domain
  - Days overdue calculation for activities
  - Deal metadata (undone activities count, last mail times)
- **Smart Features**:
  - Cursor-based pagination support
  - Bulk fetching for persons/organizations (avoids N+1 queries)
  - Caching for improved performance (configurable TTL)
  - Configurable timezone support (default: Europe/Madrid)
  - Standard MCP stdio transport for streaming communication
  - Bearer authentication for Pipedrive API
- **Flexible**: Filter IDs provided per request (not hardcoded in environment)

## Quick Start

1. `git clone https://github.com/alvarolloret/pipedrive-mcp.git && cd pipedrive-mcp`
2. `make all`
3. Add MCP with one command (pick one): `claude mcp add pipedrive -- docker run -i --rm --env-file /Users/alvarodemuller/miinta/pipedrive-mcp/.env pipedrive-mcp` or `codex mcp add pipedrive -- docker run -i --rm --env-file /Users/alvarodemuller/miinta/pipedrive-mcp/.env pipedrive-mcp`

## Configuration

### Pipedrive API Token

Get your API token from Pipedrive:
1. Go to your Pipedrive account settings
2. Navigate to Personal preferences → API
3. Copy your API token

Create a `.env` file based on `.env.example`:

```bash
# Required: Pipedrive API Token (Bearer token)
PIPEDRIVE_API_TOKEN=your_pipedrive_api_token_here

# Optional: Pipedrive API Base URL (default: https://api.pipedrive.com/v2)
PIPEDRIVE_API_BASE=https://api.pipedrive.com/v2

# Optional: Pipedrive Company Domain for deal URLs (default: app.pipedrive.com)
# Example: yourcompany.pipedrive.com
PIPEDRIVE_COMPANY_DOMAIN=yourcompany.pipedrive.com

# Optional: MCP Authentication Token (required if not localhost)
MCP_AUTH_TOKEN=your_mcp_auth_token_here

# Optional: Default timezone (default: Europe/Madrid)
DEFAULT_TIMEZONE=Europe/Madrid

# Optional: Cache TTL in seconds (default: 3600)
CACHE_TTL_SECONDS=3600

# Optional: Maximum items per section (default: 50)
MAX_ITEMS_PER_SECTION=50

# Optional: Transport mode - stdio, http, or sse (default: stdio)
TRANSPORT_MODE=stdio

# Optional: HTTP Server Port (default: 3000, only used if TRANSPORT_MODE is http or sse)
HTTP_PORT=3000
```

### Required Pipedrive Filters

You need to create three saved filters in your Pipedrive account:

1. **Overdue Activities Filter**: Filter for activities with `done=false` and `due_date < today`
2. **Today's Activities Filter**: Filter for activities with `done=false` and `due_date = today`
3. **Deals Missing Next Action Filter**: Filter for open deals without a next activity scheduled

Get the filter IDs from the Pipedrive UI or API. These will be provided when calling the tool (not in environment variables).

## MCP Tool

The server exposes one tool: `miinta.sales_queue.get`

**Input Schema (JSON Schema):**

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "filters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "overdue_activities_filter_id": { "type": "integer" },
        "today_activities_filter_id": { "type": "integer" },
        "missing_next_action_deals_filter_id": { "type": "integer" }
      },
      "required": [
        "overdue_activities_filter_id",
        "today_activities_filter_id",
        "missing_next_action_deals_filter_id"
      ]
    },
    "limits": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "overdue": { "type": "integer", "minimum": 1, "maximum": 200, "default": 25 },
        "today": { "type": "integer", "minimum": 1, "maximum": 200, "default": 25 },
        "missing": { "type": "integer", "minimum": 1, "maximum": 200, "default": 25 }
      }
    },
    "timezone": { "type": "string", "default": "Europe/Madrid" },
    "now": {
      "type": "string",
      "description": "Optional ISO datetime override for deterministic testing"
    },
    "include_people_orgs": { "type": "boolean", "default": true }
  },
  "required": ["filters"]
}
```

**Example Request:**

```json
{
  "filters": {
    "overdue_activities_filter_id": 111,
    "today_activities_filter_id": 222,
    "missing_next_action_deals_filter_id": 333
  },
  "limits": {
    "overdue": 25,
    "today": 25,
    "missing": 25
  },
  "timezone": "Europe/Madrid",
  "include_people_orgs": true
}
```

**Example Response:**

```json
{
  "generated_at": "2026-02-16T07:45:00+01:00",
  "timezone": "Europe/Madrid",
  "sections": {
    "overdue": [
      {
        "activity_id": 123,
        "activity_subject": "Follow-up email",
        "activity_type": "email",
        "due_date": "2026-02-14",
        "days_overdue": 2,
        "deal": {
          "deal_id": 456,
          "title": "Escola X — Pilot",
          "stage_id": 3,
          "stage_name": "Conversation open neutral",
          "url": "https://yourcompany.pipedrive.com/deal/456"
        },
        "person": {
          "id": 10,
          "name": "Maria Rius",
          "email": "maria@example.com"
        },
        "org": {
          "id": 20,
          "name": "Escola X"
        }
      }
    ],
    "due_today": [],
    "missing_next_action": [
      {
        "deal_id": 789,
        "title": "Universitat Y — Training",
        "stage_id": 2,
        "stage_name": "Contact",
        "owner_id": 1,
        "undone_activities_count": 0,
        "next_activity_id": null,
        "last_outgoing_mail_time": "2026-02-10T09:12:00Z",
        "last_incoming_mail_time": null,
        "url": "https://yourcompany.pipedrive.com/deal/789",
        "person": {
          "id": 11,
          "name": "Joan Garcia"
        },
        "org": {
          "id": 21,
          "name": "Universitat Y"
        }
      }
    ]
  },
  "stats": {
    "overdue_count": 1,
    "due_today_count": 0,
    "missing_next_action_count": 1
  },
  "source": {
    "filter_ids": {
      "overdue_activities_filter_id": 111,
      "today_activities_filter_id": 222,
      "missing_next_action_deals_filter_id": 333
    }
  }
}
```

## Architecture

- **Pipedrive Client** (`pipedrive-client.ts`): Handles all Pipedrive API v2 interactions
  - Activities filtering with `done=false`, sorting
  - Deals filtering with `status=open`, `include_fields`
  - Cursor-based pagination
  - Bulk fetching for persons/organizations
- **Cache** (`cache.ts`): In-memory caching with TTL support
- **Sales Queue Service** (`sales-queue.ts`): Business logic for aggregating and enriching data
  - Stage name resolution
  - Days overdue calculation
  - Person/org enrichment with bulk fetching
  - Deal URL generation with company domain
- **MCP Server** (`index.ts`): MCP protocol implementation with stdio transport

## API Version

This server uses Pipedrive API v2 endpoints:
- `/v2/activities` - with `filter_id`, `done=false`, `sort_by=due_date`
- `/v2/deals` - with `filter_id`, `status=open`, `include_fields`
- `/v2/persons` - with bulk `ids` parameter
- `/v2/organizations` - with bulk `ids` parameter
- `/v2/stages` - cached for stage name resolution

## Error Handling

The server implements two layers of error handling as per MCP spec:

1. **Protocol errors** (JSON-RPC) for invalid args/unknown tool
2. **Tool execution errors**: returns `isError: true` with readable error messages for:
   - Pipedrive auth failures
   - Rate limit / transient upstream errors
   - Invalid filter_id / permission issues
   - Missing required parameters

## Development

```bash
# Build TypeScript only
make build

# Full rebuild (clean + Docker image)
make all

# Clean compiled output
make clean
```

## Acceptance Criteria

The server is considered "production-ready" when it:

- ✅ Accepts three filter IDs via tool call parameters
- ✅ Returns correct items from each filter
- ✅ Calculates correct `days_overdue` in specified timezone
- ✅ Resolves correct `stage_name` values from cached stage map
- ✅ Includes person/org names when available
- ✅ Generates valid deal links using `PIPEDRIVE_COMPANY_DOMAIN`
- ✅ Handles pagination via `cursor` until requested limits are filled
- ✅ Includes deal fields: `undone_activities_count`, `last_incoming_mail_time`, `last_outgoing_mail_time`
- ✅ Uses bulk fetching for persons/orgs to avoid N+1 queries
- ✅ Returns output in exact spec format with `sections`, `stats`, `source`

## License

ISC
