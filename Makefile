# Quizzivy web -- developer entry points.
# See CONTRIBUTING.md for the branch model; the API runs from Quizzivy/api.

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help doctor install dev-web build test test-unit test-integration e2e e2e-live e2e-slow lint typecheck format-check check deck sdk

help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

doctor: ## Check prerequisites
	@command -v node >/dev/null && echo "  node     $$(node --version)" || echo "  node     MISSING"
	@command -v pnpm >/dev/null && echo "  pnpm     $$(pnpm --version)" || echo "  pnpm     MISSING"
	@grep -q '^//npm.pkg.github.com/:_authToken=' ~/.npmrc 2>/dev/null \
		&& echo "  registry token for @quizzivy/sdk: set" \
		|| echo "  registry token for @quizzivy/sdk: MISSING -> README.md, \"Install\""

install: ## Install the web dependencies exactly as the lockfile pins them (needs the registry token)
	cd web && pnpm install --frozen-lockfile

sdk: ## Pin @quizzivy/sdk to VERSION and update the lockfile: make sdk VERSION=0.13.3
	@[ -n "$(VERSION)" ] || { echo "usage: make sdk VERSION=<version from Quizzivy/sdk>"; exit 1; }
	cd web && pnpm add --save-exact "@quizzivy/sdk@$(VERSION)"

dev-web: ## Vite on :5173, against the API on :8080 (make dev-api in Quizzivy/api)
	cd web && pnpm dev

build: ## Production build into web/dist
	cd web && pnpm build

test: ## Every Vitest test
	cd web && pnpm test

test-unit: ## Unit tests
	cd web && pnpm test:unit

test-integration: ## Integration tests
	cd web && pnpm test:integration

e2e: ## Playwright against a production build, API stubbed
	cd web && pnpm e2e

e2e-live: ## Playwright against a running API from Quizzivy/api (docs/ci.md, "E2E (live API)")
	cd web && pnpm e2e:live

e2e-slow: ## The specs that wait on real time
	cd web && pnpm e2e:slow

lint: ## eslint
	cd web && pnpm lint

typecheck: ## tsc -b
	cd web && pnpm typecheck

format-check: ## prettier --check
	cd web && pnpm format:check

deck: ## Check the design deck against its manifest
	node scripts/check-design-deck.mjs

check: lint typecheck format-check test ## What a PR needs before it is opened
