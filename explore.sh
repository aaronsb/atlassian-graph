#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting Atlassian GraphQL Schema Graph…${NC}"

# Require .env with credentials — we grep instead of sourcing so a
# malformed .env (quoting, CRLF, BOM, etc.) can't poison the shell.
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found.${NC}"
  echo "Copy .env.example to .env and fill in ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN."
  exit 1
fi
if ! grep -q '^ATLASSIAN_EMAIL=' .env || ! grep -q '^ATLASSIAN_API_TOKEN=' .env; then
  echo -e "${RED}Error: ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN must be set in .env.${NC}"
  exit 1
fi

# Generate the introspection schema on first boot (or if it was purged)
if [ ! -f introspection-schema.json ]; then
  echo -e "${YELLOW}introspection-schema.json not found — fetching from Atlassian…${NC}"
  node fetch-introspection.js
fi

echo -e "${GREEN}Schema Graph:${NC} http://localhost:4000/"
echo "(Ctrl+C to stop)"
echo ""

# `exec` replaces the bash process with node so the server isn't a child
# of a shell that might exit and take it down via SIGHUP.
exec node explorer-server.js
