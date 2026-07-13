# Soma Nexus MCP

MCP server em TypeScript para puxar dados do Figma e preparar a montagem de código Flutter.

## O que faz

- Busca árvore de arquivo do Figma
- Busca nós específicos por ID
- Busca imagens exportadas
- Busca components, styles e variables
- Serve como base para futuras regras de geração Flutter

## Requisitos

- Node.js 18+
- `FIGMA_TOKEN` definido no ambiente do cliente MCP

## Desenvolvimento local

```bash
npm install
npm run build
npm run dev
```

## Instalação para outros usuários (npx + GitHub)

No VS Code, abra `mcp.json` e use:

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
			"command": "npx",
			"args": ["-y", "github:pablostefan/soma_nexus"],
			"env": {
				"FIGMA_TOKEN": "${input:figma-token}"
			}
		}
	}
}
```

Na primeira vez, VS Code pergunta token e guarda valor localmente. Sem `.env`, sem segredo no repo.

## Configuração para quem desenvolve este repositório

Se você estiver rodando o código local em modo watch:

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

## Próximos passos

- Normalizar a resposta do Figma em JSON intermediário
- Separar camadas de leitura e geração
- Adicionar tools para mapear estrutura Flutter
