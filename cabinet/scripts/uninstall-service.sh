#!/bin/bash
set -e

# Uninstall rcade cabinet systemd service

SERVICE_NAME="rcade-cabinet"

echo "Uninstalling $SERVICE_NAME service..."

# Stop and disable service if it exists
if systemctl is-active --quiet ${SERVICE_NAME} 2>/dev/null; then
    sudo systemctl stop ${SERVICE_NAME}
    echo "Stopped service"
fi

if systemctl is-enabled --quiet ${SERVICE_NAME} 2>/dev/null; then
    sudo systemctl disable ${SERVICE_NAME}
    echo "Disabled service"
fi

# Remove service file
if [ -f /etc/systemd/system/${SERVICE_NAME}.service ]; then
    sudo rm /etc/systemd/system/${SERVICE_NAME}.service
    echo "Removed service file"
fi

sudo systemctl daemon-reload

echo "Service uninstalled successfully!"
