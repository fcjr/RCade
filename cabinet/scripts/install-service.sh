#!/bin/bash
set -e

# Install rcade cabinet as a systemd service

SERVICE_NAME="rcade-cabinet"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CURRENT_USER="$(whoami)"

# Find bun
BUN_PATH=$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")
if [ ! -x "$BUN_PATH" ]; then
    echo "Error: bun not found"
    exit 1
fi

echo "Building rcade cabinet..."
cd "$PROJECT_DIR"

# Clean old build artifacts to ensure fresh rebuild
rm -rf "$PROJECT_DIR/release"

"$BUN_PATH" run build:linux

# Find the AppImage
APP_PATH=$(ls "$PROJECT_DIR"/release/rcade*.AppImage 2>/dev/null | head -1)

if [ -z "$APP_PATH" ] || [ ! -f "$APP_PATH" ]; then
    echo "Error: Build failed - could not find AppImage"
    exit 1
fi

chmod +x "$APP_PATH"
APP_PATH=$(realpath "$APP_PATH")

echo "Installing $SERVICE_NAME service..."
echo "  User: $CURRENT_USER"
echo "  App: $APP_PATH"

# Create systemd service file (requires sudo)
sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << EOF
[Unit]
Description=rcade Cabinet
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
User=$CURRENT_USER
Environment=DISPLAY=:0
Environment=CABINET_API_KEY=${CABINET_API_KEY:-}
ExecStart=$APP_PATH
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
EOF

echo "Created /etc/systemd/system/${SERVICE_NAME}.service"

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}.service
sudo systemctl start ${SERVICE_NAME}.service

echo ""
echo "Service installed and started!"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status ${SERVICE_NAME}   # Check status"
echo "  sudo systemctl stop ${SERVICE_NAME}     # Stop service"
echo "  sudo systemctl restart ${SERVICE_NAME}  # Restart service"
echo "  sudo journalctl -u ${SERVICE_NAME} -f   # View logs"
