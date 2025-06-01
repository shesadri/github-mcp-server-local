const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// MCP Server process
let mcpProcess = null;
let isProcessReady = false;

// Initialize MCP Server
function initializeMCPServer() {
  console.log('Starting GitHub MCP Server...');
  
  const env = {
    ...process.env,
    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    GITHUB_TOOLSETS: process.env.GITHUB_TOOLSETS || 'all',
    GITHUB_DYNAMIC_TOOLSETS: process.env.GITHUB_DYNAMIC_TOOLSETS || '0'
  };

  mcpProcess = spawn('docker', [
    'run',
    '-i',
    '--rm',
    '--network', 'github-mcp-server-local_mcp-network',
    '-e', `GITHUB_PERSONAL_ACCESS_TOKEN=${env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
    '-e', `GITHUB_TOOLSETS=${env.GITHUB_TOOLSETS}`,
    '-e', `GITHUB_DYNAMIC_TOOLSETS=${env.GITHUB_DYNAMIC_TOOLSETS}`,
    'ghcr.io/github/github-mcp-server:latest'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: env
  });

  mcpProcess.on('error', (error) => {
    console.error('MCP Server error:', error);
    isProcessReady = false;
  });

  mcpProcess.on('exit', (code, signal) => {
    console.log(`MCP Server exited with code ${code} and signal ${signal}`);
    isProcessReady = false;
    // Restart after a delay
    setTimeout(() => {
      if (!isProcessReady) {
        initializeMCPServer();
      }
    }, 5000);
  });

  mcpProcess.stderr.on('data', (data) => {
    console.error('MCP Server stderr:', data.toString());
  });

  // Wait a bit for the server to initialize
  setTimeout(() => {
    isProcessReady = true;
    console.log('GitHub MCP Server is ready');
  }, 3000);
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'GitHub MCP Server HTTP Proxy',
    version: '1.0.0',
    status: isProcessReady ? 'ready' : 'initializing',
    endpoints: {
      health: '/health',
      mcp: '/mcp (POST)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: isProcessReady ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.post('/mcp', async (req, res) => {
  if (!isProcessReady || !mcpProcess) {
    return res.status(503).json({
      error: 'MCP Server not ready',
      message: 'The MCP server is still initializing. Please try again in a few seconds.'
    });
  }

  try {
    const mcpRequest = req.body;
    
    // Validate JSON-RPC format
    if (!mcpRequest.jsonrpc || !mcpRequest.method) {
      return res.status(400).json({
        error: 'Invalid MCP request',
        message: 'Request must be valid JSON-RPC 2.0 format'
      });
    }

    console.log('MCP Request:', JSON.stringify(mcpRequest, null, 2));

    // Send request to MCP server
    const requestString = JSON.stringify(mcpRequest) + '\n';
    mcpProcess.stdin.write(requestString);

    // Set up response handler
    let responseData = '';
    let timeoutId;

    const responsePromise = new Promise((resolve, reject) => {
      const dataHandler = (data) => {
        responseData += data.toString();
        
        // Try to parse complete JSON responses
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id === mcpRequest.id || response.jsonrpc) {
                mcpProcess.stdout.removeListener('data', dataHandler);
                clearTimeout(timeoutId);
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue if not valid JSON
            }
          }
        }
      };

      mcpProcess.stdout.on('data', dataHandler);
      
      // Timeout after 30 seconds
      timeoutId = setTimeout(() => {
        mcpProcess.stdout.removeListener('data', dataHandler);
        reject(new Error('Request timeout'));
      }, 30000);
    });

    const response = await responsePromise;
    res.json(response);

  } catch (error) {
    console.error('MCP Request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (mcpProcess) {
    mcpProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (mcpProcess) {
    mcpProcess.kill('SIGINT');
  }
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`GitHub MCP HTTP Proxy listening on port ${PORT}`);
  initializeMCPServer();
});

module.exports = app;