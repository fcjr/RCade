[doc('Run trunk and the RCade cabinet together; ctrl-c stops both')]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    PORT=8080
    trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
    trunk serve --port "$PORT" &
    npx rcade@latest dev "http://localhost:$PORT" &
    wait -n

[doc('Build a release bundle into dist/')]
build:
    trunk build --release
