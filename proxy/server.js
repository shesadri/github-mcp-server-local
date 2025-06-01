const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// MCP Server process
let mcpProcess = null;
let isProcessReady = false;
let mcpBinaryPath = '/app/github-mcp-server';

// Download GitHub MCP Server binary
async function downloadMCPBinary() {
  return new Promise((resolve, reject) => {
    console.log('Downloading GitHub MCP Server binary...');
    
    // For Alpine Linux, download the Linux binary
    const downloadUrl = 'https://github.com/github/github-mcp-server/releases/latest/download/github-mcp-server-linux';
    
    const file = fs.createWriteStream(mcpBinaryPath);
    
    https.get(downloadUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            fs.chmodSync(mcpBinaryPath, '755'); // Make executable
            console.log('GitHub MCP Server binary downloaded successfully');
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.chmodSync(mcpBinaryPath, '755'); // Make executable
          console.log('GitHub MCP Server binary downloaded successfully');
          resolve();
        });
      }
    }).on('error', reject);
    
    file.on('error', (err) => {
      fs.unlink(mcpBinaryPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

// Initialize MCP Server
async function initializeMCPServer() {
  try {
    // Check if binary exists, if not download it
    if (!fs.existsSync(mcpBinaryPath)) {
      await downloadMCPBinary();
    }

    console.log('Starting GitHub MCP Server...');
    
    const env = {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      GITHUB_TOOLSETS: process.env.GITHUB_TOOLSETS || 'all',
      GITHUB_DYNAMIC_TOOLSETS: process.env.GITHUB_DYNAMIC_TOOLSETS || '0'
    };

    // Start the MCP server with stdio
    mcpProcess = spawn(mcpBinaryPath, ['stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env
    });

    mcpProcess.on('error', (error) => {
      console.error('MCP Server error:', error);
      isProcessReady = false;
      
      // Try to restart after a delay
      setTimeout(() => {
        if (!isProcessReady) {
          initializeMCPServer();
        }
      }, 5000);
    });

    mcpProcess.on('exit', (code, signal) => {
      console.log(`MCP Server exited with code ${code} and signal ${signal}`);
      isProcessReady = false;
      
      // Restart after a delay if not intentionally stopped
      if (code !== 0) {
        setTimeout(() => {
          initializeMCPServer();
        }, 5000);
      }
    });

    mcpProcess.stderr.on('data', (data) => {
      console.error('MCP Server stderr:', data.toString());
    });

    mcpProcess.stdout.on('data', (data) => {
      console.log('MCP Server stdout:', data.toString());
    });

    // Wait a bit for the server to initialize
    setTimeout(() => {
      isProcessReady = true;
      console.log('GitHub MCP Server is ready');
    }, 2000);

  } catch (error) {
    console.error('Failed to initialize MCP Server:', error);
    setTimeout(() => initializeMCPServer(), 10000);
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'GitHub MCP Server HTTP Proxy',
    version: '1.0.0',
    status: isProcessReady ? 'ready' : 'initializing',
    endpoints: {
      health: '/health',
      mcp: '/mcp (POST)',
      tools: '/tools (GET)'
    },
    documentation: 'https://github.com/shesadri/github-mcp-server-local'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: isProcessReady ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mcpServerReady: isProcessReady
  });
});

app.get('/tools', async (req, res) => {
  if (!isProcessReady || !mcpProcess) {
    return res.status(503).json({
      error: 'MCP Server not ready',
      message: 'The MCP server is still initializing. Please try again in a few seconds.'
    });
  }

  try {
    const toolsRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    };

    const response = await sendMCPRequest(toolsRequest);
    res.json(response);
  } catch (error) {
    console.error('Tools request error:', error);
    res.status(500).json({
      error: 'Failed to get tools',
      message: error.message
    });
  }
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
        message: 'Request must be valid JSON-RPC 2.0 format with jsonrpc and method fields'
      });
    }

    // Ensure request has an ID
    if (!mcpRequest.id) {
      mcpRequest.id = Date.now();
    }

    console.log('MCP Request:', JSON.stringify(mcpRequest, null, 2));

    const response = await sendMCPRequest(mcpRequest);
    res.json(response);

  } catch (error) {
    console.error('MCP Request error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Helper function to send requests to MCP server
function sendMCPRequest(mcpRequest) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || !isProcessReady) {
      reject(new Error('MCP Server not available'));
      return;
    }

    const requestString = JSON.stringify(mcpRequest) + '\n';
    let responseData = '';
    let timeoutId;

    const dataHandler = (data) => {
      responseData += data.toString();
      
      // Try to parse complete JSON responses
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line.trim());
            if (response.id === mcpRequest.id || (response.jsonrpc && !response.id)) {
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

    // Send the request
    mcpProcess.stdin.write(requestString);
  });
}

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
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: ['/', '/health', '/mcp (POST)', '/tools']
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