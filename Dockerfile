# Dockerfile for Pipedrive MCP Server
# Note: Build the project locally with `npm run build` before building the Docker image

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev && npm cache clean --force

# Copy pre-built application
COPY dist ./dist

# Set environment variables (will be overridden at runtime)
ENV NODE_ENV=production

# Run the MCP server
CMD ["node", "dist/index.js"]
