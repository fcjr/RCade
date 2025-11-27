#!/bin/bash
set -e

# Install rcade cabinet as a systemd service

SERVICE_NAME="rcade-cabinet"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER="${SUDO_USER:-$(whoami)}"

echo "Building rcade cabinet..."
cd "$PROJECT_DIR"
sudo -u "$USER" -i bash -c "cd '$PROJECT_DIR' && bun run build:linux"

# Find the AppImage
APP_PATH=$(ls "$PROJECT_DIR"/release/rcade*.AppImage 2>/dev/null | head -1)

if [ -z "$APP_PATH" ] || [ ! -f "$APP_PATH" ]; then
    echo "Error: Build failed - could not find AppImage"
    exit 1
fi

chmod +x "$APP_PATH"
APP_PATH=$(realpath "$APP_PATH")

echo "Installing $SERVICE_NAME service..."
echo "  User: $USER"
echo "  App: $APP_PATH"

# Create systemd service file
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=rcade Cabinet
After=graphical.target
Wants=graphical.target

[Service]
Type=simple
User=$USER
Environment=DISPLAY=:0
ExecStart=$APP_PATH
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
EOF

echo "Created /etc/systemd/system/${SERVICE_NAME}.service"

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}.service
systemctl start ${SERVICE_NAME}.service

echo ""
echo "Service installed and started!"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status ${SERVICE_NAME}   # Check status"
echo "  sudo systemctl stop ${SERVICE_NAME}     # Stop service"
echo "  sudo systemctl restart ${SERVICE_NAME}  # Restart service"
echo "  sudo journalctl -u ${SERVICE_NAME} -f   # View logs"
