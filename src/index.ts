#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ComponentMatcher } from "./application/component-matcher.js";
import { ContractValidator } from "./application/contract-validator.js";
import { FlutterComponentGenerator } from "./application/flutter-component-generator.js";
import { FlutterPageGenerator } from "./application/flutter-page-generator.js";
import { ComponentDocLoader } from "./infrastructure/component-doc-loader.js";
import { FigmaApiClient } from "./infrastructure/figma-api-client.js";
import { MappingIndexLoader } from "./infrastructure/mapping-index-loader.js";
import { registerTools } from "./presentation/register-tools.js";

const figmaToken = process.env.FIGMA_TOKEN;

if (!figmaToken) {
  console.error("Missing FIGMA_TOKEN environment variable. Set it in MCP client config.");
  process.exit(1);
}

const server = new McpServer({
  name: "soma-nexus-figma-mcp",
  version: "0.1.0"
});
const figmaClient = new FigmaApiClient(figmaToken);
const mappingIndexLoader = new MappingIndexLoader(process.cwd());
const componentDocLoader = new ComponentDocLoader();
const contractValidator = new ContractValidator(mappingIndexLoader, componentDocLoader);
const componentMatcher = new ComponentMatcher(mappingIndexLoader, componentDocLoader);
const flutterGenerator = new FlutterComponentGenerator();
const flutterPageGenerator = new FlutterPageGenerator(componentMatcher, flutterGenerator);

registerTools({
  server,
  figmaClient,
  contractValidator,
  componentMatcher,
  flutterGenerator,
  flutterPageGenerator
});

const transport = new StdioServerTransport();
await server.connect(transport);
