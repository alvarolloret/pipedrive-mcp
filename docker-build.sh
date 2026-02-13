#!/bin/bash
# Helper script to build the Docker image for Pipedrive MCP

set -e

echo "🔨 Building TypeScript code..."
npm run build

echo "🐳 Building Docker image..."
docker build -t pipedrive-mcp .

echo "✅ Docker image 'pipedrive-mcp' built successfully!"
echo ""
echo "To run the container, use:"
echo "  docker run -i --rm \\"
echo "    -e PIPEDRIVE_API_TOKEN=your_token \\"
echo "    -e PIPEDRIVE_OVERDUE_FILTER_ID=123 \\"
echo "    -e PIPEDRIVE_TODAY_FILTER_ID=456 \\"
echo "    -e PIPEDRIVE_MISSING_ACTION_FILTER_ID=789 \\"
echo "    pipedrive-mcp"
echo ""
echo "Or use docker compose:"
echo "  docker compose up -d"
