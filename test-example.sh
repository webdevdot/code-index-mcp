#!/bin/bash

# Code Index MCP - Example Test Script
# Tests all 8 MCP tools

set -e

API_URL="${1:-http://localhost:3000/mcp}"
echo "🧪 Testing Code Index MCP at $API_URL"
echo ""

# Helper function to call API
call_tool() {
    local tool_name=$1
    local arguments=$2

    echo "📡 Calling: $tool_name"
    curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": 1,
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"$tool_name\",
                \"arguments\": $arguments
            }
        }" | jq '.' 2>/dev/null || echo "Error: Unable to call $tool_name"
    echo ""
}

echo "Test 1: Get Stats"
echo "================"
call_tool "get_stats" "{}"

echo "Test 2: List Files (first 10)"
echo "============================="
call_tool "list_files" "{\"limit\": 10}"

echo "Test 3: Search Code"
echo "==================="
call_tool "search_code" "{\"query\": \"function\", \"limit\": 5}"

echo "Test 4: Find Symbol"
echo "===================="
call_tool "find_symbol" "{\"name\": \"handleClick\", \"limit\": 5}"

echo "Test 5: Get Context"
echo "==================="
call_tool "get_context" "{\"query\": \"error handling\", \"limit\": 5}"

echo "Test 6: List JavaScript Files"
echo "=============================="
call_tool "list_files" "{\"language\": \"javascript\", \"limit\": 5}"

echo "✅ All tests completed!"
echo ""
echo "Next steps:"
echo "- Use get_file tool to retrieve specific file content"
echo "- Use get_imports tool to see imports from a file"
echo "- Use get_dependents to find files that depend on a target"
