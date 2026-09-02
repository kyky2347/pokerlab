.PHONY: setup dev check test build benchmark docker

setup:
	pnpm install --frozen-lockfile --ignore-scripts
	cd apps/api && uv sync --frozen

dev:
	pnpm dev

test:
	pnpm test

check:
	pnpm check

build:
	pnpm build

benchmark:
	pnpm benchmark

docker:
	docker compose up --build
