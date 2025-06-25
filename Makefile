# -----------------------------------------------------------------------------
# Minimalistic Makefile – powered by *uv*
# -----------------------------------------------------------------------------
# This project uses the `uv` package manager, which handles:
#   • creating an isolated virtual-env on first run
#   • resolving dependencies from *pyproject.toml* / *uv.lock*
#   • executing commands inside that env ( `uv run …` )
#
# Therefore we **do not** need explicit pip / venv plumbing here – every target
# is just a thin alias around `uv run …` so you can muscle-memory the common
# tasks.
# -----------------------------------------------------------------------------


# Changeables
#   – override at invocation: `make run PORT=8001`
#   – If 5000 is already bound, pick any free port this way.
PORT    ?= 5000
APP     ?= app.py
# Optionally export DB_URL=postgres://user:pass@host:5432/dbname when you need
# persistence.  If DB_URL is *unset* we tell the application to skip DB
# initialisation (`--skip-db`) so you can preview the UI without Postgres.

# The uv CLI binary – adjust if it lives elsewhere
UV      ?= uv

.PHONY: help run test lint format shell sync lock update docker-build docker-up docker-down docker-logs clean

# -----------------------------------------------------------------------------
# Help (default)
# -----------------------------------------------------------------------------

help: ## Show this help message
	@echo "Available targets:" && \
	grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | \
	awk 'BEGIN{FS=":.*?##"} {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' | sort

# -----------------------------------------------------------------------------
# Core workflows – all routed through `uv run`
# -----------------------------------------------------------------------------

run: ## Start the Flask dev server (UI-only if DB_URL unset)
	$(UV) run bash -c 'if [ -z "$$DB_URL" ]; then echo "→ DB_URL not set – launching without DB"; exec python $(APP) --host 0.0.0.0 --port $(PORT) --skip-db; else exec python $(APP) --host 0.0.0.0 --port $(PORT); fi'

test: ## Run pytest suite
	DB_URL=sqlite:///data/test.db $(UV) run pytest -q $(ARGS)

lint: ## Ruff static-analysis
	$(UV) run ruff check .

format: ## Ruff auto-formatter
	$(UV) run ruff format .

# -----------------------------------------------------------------------------
# Misc helpers
# -----------------------------------------------------------------------------

shell: ## Spawn an interactive shell inside the env
	$(UV) run bash || $(UV) run sh

sync: ## Ensure env matches lockfile (same as "uv pip sync")
	$(UV) pip sync

lock: ## Re-solve deps & regenerate uv.lock (write-time ~)
	$(UV) pip compile --all-extras --upgrade

update: ## Update deps to latest (writes new lockfile)
	$(UV) pip sync --upgrade

# -----------------------------------------------------------------------------
# Docker wrappers – unchanged
# -----------------------------------------------------------------------------

docker-build: ## Build Docker image
	docker build -t collector:latest .

docker-up: ## docker-compose up (detached)
	docker compose up -d --build

docker-down: ## docker-compose down
	docker compose down

docker-logs: ## Tail compose logs
	docker compose logs -f

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

clean: ## Remove *uv* cache & Python artefacts
	$(UV) cache prune || true
	find . -type f -name '*.py[co]' -delete
	find . -type d -name '__pycache__' -exec rm -rf {} +
