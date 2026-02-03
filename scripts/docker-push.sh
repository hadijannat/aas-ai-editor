#!/bin/bash
# AASX AI Editor - Docker Push Script
# Usage: ./scripts/docker-push.sh [tag]

set -e

TAG=${1:-latest}
REGISTRY=${DOCKER_REGISTRY:-""}

if [ -z "$REGISTRY" ]; then
    echo "Error: DOCKER_REGISTRY environment variable is not set"
    echo "Usage: DOCKER_REGISTRY=your-registry.com ./scripts/docker-push.sh [tag]"
    exit 1
fi

echo "Pushing Docker images to $REGISTRY with tag: $TAG"
echo ""

services=("web-ui" "mcp-server" "validation-service")

for service in "${services[@]}"; do
    IMAGE_NAME="$REGISTRY/aas-editor-$service:$TAG"

    echo "Pushing $IMAGE_NAME..."
    docker push "$IMAGE_NAME"
    echo "✓ Pushed $IMAGE_NAME"
    echo ""
done

echo "========================================="
echo "All images pushed successfully!"
echo "========================================="
