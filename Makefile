.PHONY: setup start stop status logs dev check test build benchmark docker

setup:
	pnpm install --frozen-lockfile --ignore-scripts
	cd apps/api && uv sync --frozen

start:
	./pokerlab

stop:
	./pokerlab stop

status:
	./pokerlab status

logs:
	./pokerlab logs

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
	./pokerlab
