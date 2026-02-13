#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SalesQueueService } from './sales-queue.js';

// Get API token from environment
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
if (!PIPEDRIVE_API_TOKEN) {
  console.error('Error: PIPEDRIVE_API_TOKEN environment variable is required');
  process.exit(1);
}

// Get filter IDs from environment
const OVERDUE_FILTER_ID = process.env.PIPEDRIVE_OVERDUE_FILTER_ID;
const TODAY_FILTER_ID = process.env.PIPEDRIVE_TODAY_FILTER_ID;
const MISSING_ACTION_FILTER_ID = process.env.PIPEDRIVE_MISSING_ACTION_FILTER_ID;

if (!OVERDUE_FILTER_ID || !TODAY_FILTER_ID || !MISSING_ACTION_FILTER_ID) {
  console.error('Error: Required filter IDs not set:');
  console.error('  - PIPEDRIVE_OVERDUE_FILTER_ID');
  console.error('  - PIPEDRIVE_TODAY_FILTER_ID');
  console.error('  - PIPEDRIVE_MISSING_ACTION_FILTER_ID');
  process.exit(1);
}

// Initialize service
const salesQueueService = new SalesQueueService(PIPEDRIVE_API_TOKEN);

// Define the tool
const SALES_QUEUE_TOOL: Tool = {
  name: 'miinta.sales_queue.get',
  description: 'Get the morning sales digest with overdue activities, today\'s activities, and deals missing next action from Pipedrive',
  inputSchema: {
    type: 'object',
    properties: {
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return per category (default: 50)',
        default: 50,
      },
    },
  },
};

// Create server
const server = new Server(
  {
    name: 'miinta-pipedrive-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [SALES_QUEUE_TOOL],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'miinta.sales_queue.get') {
    const maxResults = (request.params.arguments?.max_results as number) || 50;

    try {
      const digest = await salesQueueService.getSalesQueueDigest(
        parseInt(OVERDUE_FILTER_ID),
        parseInt(TODAY_FILTER_ID),
        parseInt(MISSING_ACTION_FILTER_ID),
        maxResults
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(digest, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
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
  console.error('Miinta Pipedrive MCP v0.1 server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
