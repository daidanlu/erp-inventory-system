#!/usr/bin/env bash
set -e

source .venv/Scripts/activate
export LLM_PROVIDER=openai_compat
export LLM_BASE_URL=http://127.0.0.1:8002/v1
export LLM_MODEL="Llama 3.2 1B Instruct"

python manage.py runserver 8001
