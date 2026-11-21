#!/bin/sh
set -eu

python -m skillforge.migrate
exec python -m uvicorn skillforge.main:app --host 0.0.0.0 --port "${PORT:-10000}" --no-access-log
