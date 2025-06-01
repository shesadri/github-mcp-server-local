#!/bin/bash

# Test script for GitHub MCP Server Local

BASE_URL="http://localhost:3000"

echo "=== GitHub MCP Server Local Test Script ==="
echo

# Test 1: Health Check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq .
echo

# Test 2: Server Info
echo "2. Testing server info..."
curl -s "$BASE_URL/" | jq .
echo

# Test 3: List Tools
echo "3. Testing tools list..."
curl -s "$BASE_URL/tools" | jq .
echo

# Test 4: MCP Request - Get User Info
echo "4. Testing MCP request (get user info)..."
curl -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_me",
      "arguments": {}
    }
  }' | jq .
echo

# Test 5: MCP Request - List Tools
echo "5. Testing MCP request (list tools)..."
curl -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' | jq .
echo

echo "=== Test completed ==="