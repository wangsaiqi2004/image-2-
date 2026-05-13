#!/bin/sh
set -e

mkdir -p /app/.data
chown -R node:node /app/.data

exec su node -s /bin/sh -c 'npm run preview'
