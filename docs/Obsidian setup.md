# Obsidian setup

This project's notes vault lives in `docs/`. Cursor can read and write these notes via the Obsidian MCP when the Local REST API plugin is enabled.

## 1. Open the vault in Obsidian

1. Open **Obsidian**
2. **Open folder as vault** → select `wardrobe-app/docs`
3. You should see this note and the linked project docs

## 2. Install Local REST API

1. Settings → **Community plugins** → turn on community plugins
2. **Browse** → search **Local REST API**
3. Install and **Enable**
4. In plugin settings:
   - Copy your **API key**
   - Enable **HTTP server** (port 27123) — required for Cursor; the HTTPS endpoint uses a self-signed cert Cursor won't trust

## 3. Configure Cursor MCP

Copy the example config and add your API key:

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
# edit .cursor/mcp.json and replace YOUR_OBSIDIAN_API_KEY
```

Restart Cursor after saving. Obsidian must stay open while using the MCP.

## 4. Verify

In Cursor, the **obsidian** MCP server should show as connected. You can ask the agent to search or update vault notes (e.g. "add a note about the try-on API").

## Git notes

These files are tracked in git:

- `docs/*.md` — project notes
- `docs/.obsidian/app.json`, `core-plugins.json`, etc.

Ignored (local UI state):

- `docs/.obsidian/workspace.json`
- `docs/.obsidian/workspace-mobile.json`

## Related

- [[Wardrobe App]]
