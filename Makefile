.PHONY: help build up down logs restart clean test health

# Default target
help:
	@echo "Available commands:"
	@echo "  build    - Build the Docker containers"
	@echo "  up       - Start the services"
	@echo "  down     - Stop the services"
	@echo "  logs     - View logs"
	@echo "  restart  - Restart the services"
	@echo "  clean    - Clean up containers and images"
	@echo "  test     - Test the MCP server"
	@echo "  health   - Check health status"
	@echo "  setup    - Initial setup (copy .env file)"

# Setup environment file
setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file. Please edit it with your GitHub token."; \
	else \
		echo ".env file already exists."; \
	fi

# Build containers
build:
	docker-compose build --no-cache

# Start services
up:
	docker-compose up -d

# Stop services
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# Restart services
restart: down up

# Clean up
clean:
	docker-compose down -v --rmi all
	docker system prune -f

# Test the server
test:
	@echo "Testing MCP server..."
	@curl -s http://localhost:3000/health | jq .
	@echo "\nTesting tools endpoint..."
	@curl -s http://localhost:3000/tools | jq .

# Check health
health:
	@curl -s http://localhost:3000/health | jq .