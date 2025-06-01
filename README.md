# GitHub MCP Server - Local Docker Setup

This repository provides an easy way to run the [GitHub MCP Server](https://github.com/github/github-mcp-server) locally using Docker Compose with HTTP access on port 3000.

## What is GitHub MCP Server?

The GitHub MCP Server is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that provides seamless integration with GitHub APIs, enabling advanced automation and interaction capabilities for developers and tools.

## Features

- **Easy Setup**: Just run `docker-compose up` to start the server
- **HTTP Access**: Access the MCP server via HTTP on port 3000
- **Configurable**: Support for all GitHub MCP Server configuration options
- **Auto-restart**: Containers automatically restart on failure

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) installed and running
- [Docker Compose](https://docs.docker.com/compose/) installed
- A [GitHub Personal Access Token](https://github.com/settings/personal-access-tokens/new)

### Setup

1. **Clone this repository:**
   ```bash
   git clone https://github.com/shesadri/github-mcp-server-local.git
   cd github-mcp-server-local
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Configure your GitHub token:**
   Edit `.env` file and replace `your_github_token_here` with your actual GitHub Personal Access Token.

4. **Start the server:**
   ```bash
   docker-compose up -d
   ```

5. **Access the server:**
   The server will be available at `http://localhost:3000`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Your GitHub Personal Access Token | **Required** |
| `GITHUB_TOOLSETS` | Comma-separated list of toolsets to enable | `all` |
| `GITHUB_DYNAMIC_TOOLSETS` | Enable dynamic toolset discovery (0 or 1) | `0` |
| `PORT` | HTTP server port | `3000` |

### Available Toolsets

- `repos` - Repository-related tools (file operations, branches, commits)
- `issues` - Issue-related tools (create, read, update, comment)
- `users` - Anything relating to GitHub Users
- `pull_requests` - Pull request operations (create, merge, review)
- `code_security` - Code scanning alerts and security features
- `experiments` - Experimental features (not considered stable)

To enable specific toolsets, set `GITHUB_TOOLSETS=repos,issues,pull_requests` in your `.env` file.

## Usage

### Check Server Status

```bash
curl http://localhost:3000/health
```

### Make MCP Requests

The server accepts MCP protocol requests via HTTP POST:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

## Docker Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### View logs
```bash
docker-compose logs -f
```

### Rebuild and restart
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Troubleshooting

### Check if containers are running
```bash
docker-compose ps
```

### View container logs
```bash
docker-compose logs github-mcp-server
docker-compose logs mcp-http-proxy
```

### Reset everything
```bash
docker-compose down -v
docker-compose up -d
```

## Security Notes

- Keep your GitHub Personal Access Token secure
- Only grant the minimum permissions necessary for your use case
- Consider using GitHub App tokens for production deployments
- The server runs on localhost by default - configure firewall rules appropriately

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the original [GitHub MCP Server](https://github.com/github/github-mcp-server) for license details.

## Related Projects

- [GitHub MCP Server](https://github.com/github/github-mcp-server) - The original GitHub MCP Server
- [Model Context Protocol](https://modelcontextprotocol.io/) - Learn more about MCP
