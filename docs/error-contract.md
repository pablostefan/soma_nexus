# Error Contract

All tools return structured JSON. Success format:

```json
{
  "ok": true,
  "data": {}
}
```

Error format:

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "details": {}
  }
}
```

## Error codes

- `INVALID_INPUT`: Invalid parameter shape/content.
- `INVALID_URL`: URL is malformed or non-Figma.
- `NODE_ID_MISSING`: URL has no `node-id` for node-based operations.
- `FIGMA_UNAUTHORIZED`: Invalid or missing token permissions.
- `FIGMA_NOT_FOUND`: File/node/resource not found.
- `FIGMA_RATE_LIMIT`: Figma API rate limit hit.
- `FIGMA_API_ERROR`: Upstream API failed for another reason.
- `INTERNAL_ERROR`: Unexpected local failure.

## Handling guidelines

1. Never retry blindly on `INVALID_URL` or `NODE_ID_MISSING`.
2. Retry with backoff only for `FIGMA_RATE_LIMIT`.
3. For `FIGMA_UNAUTHORIZED`, rotate token and retry once.
4. For `FIGMA_NOT_FOUND`, verify `fileKey` and `node-id` from URL.
