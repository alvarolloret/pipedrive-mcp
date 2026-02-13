#!/usr/bin/env node

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SalesQueueService } from "./sales-queue.js";

// Get configuration from environment
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
if (!PIPEDRIVE_API_TOKEN) {
  console.error("Error: PIPEDRIVE_API_TOKEN environment variable is required");
  process.exit(1);
}

const PIPEDRIVE_API_BASE =
  process.env.PIPEDRIVE_API_BASE || "https://api.pipedrive.com/v2";
const PIPEDRIVE_COMPANY_DOMAIN =
  process.env.PIPEDRIVE_COMPANY_DOMAIN || "app.pipedrive.com";
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Europe/Madrid";
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "3600", 10);
const MAX_ITEMS_PER_SECTION = parseInt(
  process.env.MAX_ITEMS_PER_SECTION || "50",
  10,
);
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

// Initialize service
const salesQueueService = new SalesQueueService(
  PIPEDRIVE_API_TOKEN,
  PIPEDRIVE_API_BASE,
  PIPEDRIVE_COMPANY_DOMAIN,
  DEFAULT_TIMEZONE,
  CACHE_TTL_SECONDS,
);

// Define the tools
const FILTERS_LIST_TOOL: Tool = {
  name: "miinta.filters.list",
  description:
    "List all available Pipedrive saved filters. Useful for discovering filter IDs and names " +
    "before calling miinta.sales_queue.get. Optionally filter by type.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        description:
          'Optional filter type to narrow results.',
        enum: ["deals", "activities", "people", "org", "products", "projects", "leads"],
      },
    },
  },
};

const SALES_QUEUE_TOOL: Tool = {
  name: "miinta.sales_queue.get",
  description:
    'Return a structured "morning queue" payload using three Pipedrive filters (by ID or name), ' +
    'plus enrichment (deal title, stage name, org/person names, URLs). ' +
    'Use miinta.filters.list to discover available filter names.',
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          overdue_activities_filter_id: {
            oneOf: [{ type: "integer" }, { type: "string" }],
            description: "Pipedrive filter ID (integer) or filter name (string) for overdue activities",
          },
          today_activities_filter_id: {
            oneOf: [{ type: "integer" }, { type: "string" }],
            description: "Pipedrive filter ID (integer) or filter name (string) for today's activities",
          },
          missing_next_action_deals_filter_id: {
            oneOf: [{ type: "integer" }, { type: "string" }],
            description: "Pipedrive filter ID (integer) or filter name (string) for deals missing next action",
          },
        },
        required: [
          "overdue_activities_filter_id",
          "today_activities_filter_id",
          "missing_next_action_deals_filter_id",
        ],
      },
      limits: {
        type: "object",
        additionalProperties: false,
        properties: {
          overdue: { type: "integer", minimum: 1, maximum: 200, default: 25 },
          today: { type: "integer", minimum: 1, maximum: 200, default: 25 },
          missing: { type: "integer", minimum: 1, maximum: 200, default: 25 },
        },
      },
      timezone: { type: "string", default: "Europe/Madrid" },
      now: {
        type: "string",
        description: "Optional ISO datetime override for deterministic testing",
      },
      include_people_orgs: { type: "boolean", default: true },
    },
    required: ["filters"],
  },
};

// Create server
const server = new Server(
  {
    name: "miinta-pipedrive-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [FILTERS_LIST_TOOL, SALES_QUEUE_TOOL],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "miinta.filters.list") {
    try {
      const args = request.params.arguments as any;
      const filters = await salesQueueService.listFilters(args?.type);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(filters, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching filters: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "miinta.sales_queue.get") {
    try {
      const args = request.params.arguments as any;

      // Validate filters are provided
      if (!args?.filters) {
        return {
          content: [
            {
              type: "text",
              text: "Error: filters object is required",
            },
          ],
          isError: true,
        };
      }

      const {
        overdue_activities_filter_id,
        today_activities_filter_id,
        missing_next_action_deals_filter_id,
      } = args.filters;

      // Validate filter values are provided
      if (
        !overdue_activities_filter_id ||
        !today_activities_filter_id ||
        !missing_next_action_deals_filter_id
      ) {
        return {
          content: [
            {
              type: "text",
              text: "Error: All three filter IDs or names are required in filters object",
            },
          ],
          isError: true,
        };
      }

      // Resolve filter IDs (accepts integers or string names)
      let resolvedOverdue: number;
      let resolvedToday: number;
      let resolvedMissing: number;

      try {
        [resolvedOverdue, resolvedToday, resolvedMissing] = await Promise.all([
          salesQueueService.resolveFilterId(overdue_activities_filter_id, "activities"),
          salesQueueService.resolveFilterId(today_activities_filter_id, "activities"),
          salesQueueService.resolveFilterId(missing_next_action_deals_filter_id, "deals"),
        ]);
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error resolving filter: ${error.message}`,
            },
          ],
          isError: true,
        };
      }

      // Get limits with defaults
      const limits = {
        overdue: args.limits?.overdue || MAX_ITEMS_PER_SECTION,
        today: args.limits?.today || MAX_ITEMS_PER_SECTION,
        missing: args.limits?.missing || MAX_ITEMS_PER_SECTION,
      };

      // Validate limits
      const validateLimit = (value: number, name: string): boolean => {
        if (value < 1 || value > 200) {
          return false;
        }
        return true;
      };

      if (
        !validateLimit(limits.overdue, "overdue") ||
        !validateLimit(limits.today, "today") ||
        !validateLimit(limits.missing, "missing")
      ) {
        return {
          content: [
            {
              type: "text",
              text: "Error: All limits must be between 1 and 200",
            },
          ],
          isError: true,
        };
      }

      const timezone = args.timezone || DEFAULT_TIMEZONE;
      const includePeopleOrgs = args.include_people_orgs !== false;
      const now = args.now ? new Date(args.now) : undefined;

      const digest = await salesQueueService.getSalesQueueDigest(
        resolvedOverdue,
        resolvedToday,
        resolvedMissing,
        limits,
        timezone,
        now,
        includePeopleOrgs,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(digest, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching sales queue digest: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Miinta Pipedrive MCP v0.1 server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
