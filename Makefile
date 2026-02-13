IMAGE_NAME := pipedrive-mcp
CONTAINER_NAME := pipedrive-mcp

# Load .env file if it exists
ifneq (,$(wildcard ./.env))
	include .env
	export
endif

.PHONY: build docker-build docker-run docker-stop clean all

## build: Compile TypeScript to dist/
build:
	npm run build

## docker-build: Build TS then build the Docker image
docker-build: build
	docker build -t $(IMAGE_NAME) .

## docker-run: Run the MCP container (stdio, interactive) with .env vars
docker-run:
	docker run -i --rm \
		--name $(CONTAINER_NAME) \
		--env-file .env \
		$(IMAGE_NAME)

## docker-stop: Stop the running container
docker-stop:
	-docker stop $(CONTAINER_NAME)

## clean: Remove compiled output
clean:
	rm -rf dist

## all: Full rebuild (clean + docker-build)
all: clean docker-build

## help: Show available targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | column -t -s ':'
