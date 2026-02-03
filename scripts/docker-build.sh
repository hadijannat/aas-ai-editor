#!/bin/bash
# AASX AI Editor - Docker Build Script
# Usage: ./scripts/docker-build.sh [tag]

set -e

TAG=${1:-latest}
REGISTRY=${DOCKER_REGISTRY:-""}

echo "Building Docker images with tag: $TAG"
echo ""

# Build each service
services=("web-ui" "mcp-server" "validation-service")

for service in "${services[@]}"; do
    echo "----------------------------------------"
    echo "Building $service..."
    echo "----------------------------------------"

    if [ -n "$REGISTRY" ]; then
        IMAGE_NAME="$REGISTRY/aas-editor-$service:$TAG"
    else
        IMAGE_NAME="aas-editor-$service:$TAG"
    fi

    docker build \
        -t "$IMAGE_NAME" \
        -f "packages/$service/Dockerfile" \
        "packages/$service"

    echo "✓ Built $IMAGE_NAME"
    echo ""
done

echo "========================================="
echo "All images built successfully!"
echo "========================================="
echo ""
echo "Images:"
for service in "${services[@]}"; do
    if [ -n "$REGISTRY" ]; then
        echo "  - $REGISTRY/aas-editor-$service:$TAG"
    else
        echo "  - aas-editor-$service:$TAG"
    fi
done
echo ""
echo "To push images, run: ./scripts/docker-push.sh $TAG"
