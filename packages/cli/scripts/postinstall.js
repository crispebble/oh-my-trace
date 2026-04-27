#!/usr/bin/env node
import { formatAgentsText } from '@oh-my-trace/core/agents.js';

console.log(`@oh-my-trace/cli installed.

Command:
  omt --help

${formatAgentsText()}

MCP server is a separate package:
  npm install -g @oh-my-trace/mcp
`);
