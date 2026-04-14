# action-deploy

GitHub Action for deploying games to RCade.

## Usage

This action is automatically included in games created with `create-rcade`. You typically don't need to configure it manually.

```yaml
- name: Deploy to RCade
  uses: fcjr/rcade/action-deploy@main
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `manifestPath` | Path to rcade.manifest.json | `./rcade.manifest.json` |
| `artifactPath` | Path to built game files | `./dist/` |

## Authentication

Uses GitHub OIDC tokens - no secrets required. Your GitHub account must be linked to your RC profile at [recurse.com/settings/general](https://www.recurse.com/settings/general).

## Development

```bash
pnpm install
pnpm run build
```
