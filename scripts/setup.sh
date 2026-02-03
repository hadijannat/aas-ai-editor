#!/bin/bash
# AASX AI Editor - Development Setup Script
# Usage: ./scripts/setup.sh

set -e

echo "========================================="
echo "  AASX AI Editor - Development Setup"
echo "========================================="
echo ""

# Check prerequisites
check_prereq() {
    if ! command -v $1 &> /dev/null; then
        echo "Error: $1 is not installed"
        exit 1
    fi
    echo "✓ $1 found"
}

echo "Checking prerequisites..."
check_prereq node
check_prereq pnpm
check_prereq python3
check_prereq docker

echo ""
echo "Node version: $(node --version)"
echo "pnpm version: $(pnpm --version)"
echo "Python version: $(python3 --version)"
echo "Docker version: $(docker --version)"
echo ""

# Install Node dependencies
echo "Installing Node.js dependencies..."
pnpm install

# Set up Python virtual environment for validation service
echo ""
echo "Setting up Python virtual environment..."
cd packages/validation-service

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
deactivate

cd ../..

# Copy environment template
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please update .env with your configuration (especially ANTHROPIC_API_KEY)"
fi

# Build packages
echo ""
echo "Building packages..."
pnpm build

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Update .env with your ANTHROPIC_API_KEY"
echo "  2. Run 'pnpm dev' to start development servers"
echo "  3. Open http://localhost:5173 in your browser"
echo ""
