#!/bin/bash
# ==========================================
# Script de build y push a Azure Container Registry
# ==========================================
# Uso: ./deploy-to-acr.sh <acr-name> <image-name> <version>
# Ejemplo: ./deploy-to-acr.sh oroverde api v1.0.0

set -e

ACR_NAME=${1:-oroverde}
IMAGE_NAME=${2:-oroverde-api}
VERSION=${3:-latest}
REGISTRY="${ACR_NAME}.azurecr.io"

echo "🔨 Building Docker image..."
docker build -f Dockerfile.prod -t ${IMAGE_NAME}:${VERSION} .
docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${IMAGE_NAME}:${VERSION}
docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${IMAGE_NAME}:latest

echo "🔐 Logging in to ACR..."
az acr login --name ${ACR_NAME}

echo "📤 Pushing to ACR..."
docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}
docker push ${REGISTRY}/${IMAGE_NAME}:latest

echo "✅ Successfully pushed ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "📝 Use this image in your deployment:"
echo "   ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
