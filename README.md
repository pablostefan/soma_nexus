# Soma Nexus MCP

MCP server em TypeScript para VS Code, focado em leitura de dados do Figma e contexto para design-to-code.

## O que faz

- Busca árvore de arquivo do Figma
- Busca nós específicos por ID
- Resolve URL completa do Figma (`fileKey` + `node-id`)
- Busca nó direto a partir de URL
- Retorna saída normalizada para design-to-code
- Busca imagens exportadas
- Busca components, styles e variables
- Valida contrato federado de mapeamento Figma -> Design System

## Arquitetura (simples e prática)

Aplicamos SOLID + Clean Architecture sem excesso de abstração:

- `src/index.ts`: composition root
- `src/presentation/register-tools.ts`: camada de entrada (tools MCP)
- `src/infrastructure/figma-api-client.ts`: integração com API Figma
- `src/domain/figma-url.ts`: regras de URL e IDs
- `src/application/node-normalizer.ts`: normalização para design-to-code
- `src/core/errors.ts` e `src/core/responses.ts`: erros e contrato de resposta

Regras usadas:

- Responsabilidade única por módulo
- Dependências apontando para dentro (presentation -> application/domain/infrastructure)
- Infra isolada (troca de API client sem mexer em tools)
- Erro e resposta padronizados para todas as tools

## Requisitos

- Node.js 18+
- `FIGMA_TOKEN` definido no ambiente do cliente MCP
- Opcional: `FIGMA_NODES_CACHE_TTL_MS` (default: `90000`)

## Desenvolvimento local

```bash
npm install
npm run build
npm run dev
npm test
```

## Tools disponíveis

- `get_figma_file`: payload bruto do arquivo inteiro (debug pesado)
- `parse_figma_url`: extrai `fileKey` e `nodeId` de URL
- `get_figma_nodes`: busca nós por IDs
- `get_figma_node_from_url`: busca nó direto com URL completa
- `get_figma_node_normalized`: metadata + estilos/tokens/assets normalizados
- `get_figma_images`: URLs de renderização de nós
- `get_figma_components`: componentes publicados
- `get_figma_styles`: estilos publicados
- `get_figma_variables`: variáveis locais
- `validate_figma_to_code_index`: valida índice global e docs por componente
- `preview_figma_component_mapping`: mostra melhor match de componente DS para um node Figma
- `generate_flutter_component_from_figma`: gera snippet Flutter mínimo via mapping federado

## Economia de tokens (recomendado)

Use estes parâmetros em tools de leitura/mapping/geração:

- `responseMode`: `compact` | `standard`
- `debugTelemetry`: `true` | `false`

Sugestão para uso normal:

- `responseMode: "compact"`
- `debugTelemetry: false`

Quando quiser medir custo real de payload:

- `debugTelemetry: true` retorna `meta.payloadSizeBytes` e `meta.responseSizeBytes`.

Observações:

- Tools com `depth` usam default conservador `1` quando não informado.
- Preview de matching limita candidatos por padrão para reduzir resposta (`compact`: 3, `standard`: 10).

## Modelo federado Figma -> Code

Cada componente do Design System deve manter seu próprio arquivo:

- `{component}/docs/figma-to-code.md`

E todos os componentes devem ser registrados em:

- `docs/figma-to-code-index.yaml`

Documentação de suporte:

- `docs/specs/figma-to-code-component-doc-spec.md`
- `docs/figma-to-code-authoring-guide.md`
- `docs/templates/component-figma-to-code.template.md`

## Configuração no VS Code

No workspace, use `.vscode/mcp.json`:

```jsonc
{
	"inputs": [
		{
			"id": "figma-token",
			"type": "promptString",
			"description": "FIGMA_TOKEN for Soma Nexus MCP",
			"password": true
		}
	],
	"servers": {
		"soma-nexus-figma-mcp": {
			"type": "stdio",
			"command": "npm",
			"args": ["run", "dev"],
			"env": {
				"FIGMA_TOKEN": "${input:figma-token}"
			}
		}
	}
}
```

Na primeira vez, VS Code pergunta token e guarda valor localmente.

## Fluxo recomendado (design-to-code)

0. `validate_figma_to_code_index`
1. `parse_figma_url`
2. `preview_figma_component_mapping`
3. `generate_flutter_component_from_figma`
4. `get_figma_node_normalized` (debug/inspeção)
5. `get_figma_images` (se precisar assets)

Esse fluxo evita payload gigante e melhora estabilidade da geração de código.

## Contrato de resposta

Sucesso:

```json
{
	"ok": true,
	"data": {}
}
```

Erro:

```json
{
	"ok": false,
	"error": {
		"code": "FIGMA_UNAUTHORIZED",
		"message": "Figma token unauthorized.",
		"details": {}
	}
}
```
