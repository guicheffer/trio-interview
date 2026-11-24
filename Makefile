.PHONY: help install config start start-log stop start-prod dev dev-frontend dev-backend test typecheck clean reset check-node export delete

# Default target
help:
	@printf '\n\033[1mTrio, live coding interviews\033[0m\n'
	@printf '\033[2mAI-assisted pair programming on your own machine, shared with the candidate through a tunnel.\033[0m\n\n'
	@printf '\033[1;32mInterview\033[0m\n'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make start' 'Check setup, pick an exercise, start everything and share a tunnel URL'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make start LOG=1' 'Same, but show the full server logs (also: make start-log)'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make config' 'Choose which assistants, exercises and settings this machine allows'
	@printf '  \033[2m%-22s %s\033[0m\n' '' 'Check only, no questions: make config CHECK=1'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make stop' 'Stop the servers, exercise apps and tunnel'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make export' 'Export a candidate as a zip (code, conversations, viewer.html)'
	@printf '  \033[2m%-22s %s\033[0m\n' '' 'Non interactive: make export CANDIDATE=name EXERCISE=id'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make delete' 'Delete a candidate and their exercise folder (asks twice)'
	@printf '  \033[2m%-22s %s\033[0m\n' '' 'Non interactive: make delete CANDIDATE=name YES=1'
	@printf '\n\033[1;32mExercises\033[0m\n'
	@printf '  \033[2m%s\033[0m\n' 'Every folder in exercises/ with a description.md shows up in make start. See CONTRIBUTING.md to add one.'
	@printf '\n\033[1;32mDevelopment\033[0m\n'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make dev' 'Frontend and backend with hot reload'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make test' 'Run the tests'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make typecheck' 'Type check the project'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make install' 'Install dependencies and check Claude Code, OpenCode and the tunnel'
	@printf '\n\033[1;32mCleanup\033[0m\n'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make reset' 'Reset exercise templates to the committed state'
	@printf '  \033[36m%-22s\033[0m %s\n' 'make clean' 'Remove node_modules and build output'
	@printf '\n'

# Install dependencies
install:
	@echo "Installing dependencies..."
	@npm install --no-audit --no-fund
	@node scripts/doctor.mjs
	@if [ ! -f interview.config.yaml ] && [ -t 0 ]; then echo ""; echo "No interview settings yet. Choosing them now (run make config again any time)."; npx tsx scripts/config.ts || true; fi

# Choose what this machine allows (assistants, exercises, retention). Writes interview.config.yaml, ignored by git.
config:
	@npx tsx scripts/config.ts $(if $(CHECK),--check,)

# Start interview (interactive exercise selection)
start:
	@./scripts/start-with-tunnel.sh $(if $(LOG),--log,)

delete:
	@node scripts/delete-candidate.mjs

start-log:
	@./scripts/start-with-tunnel.sh --log

# Start in production mode (no dev toolbar/error overlays)
start-prod:
	@echo "Building for production..."
	npm run interview:prod

# Full development mode (hot reload, tsx watch, all dev tools)
dev:
	npm run dev

# Frontend only (port 3000) and backend only (port 3001)
dev-frontend:
	npm run dev:next

dev-backend:
	npm run dev:server

test:
	npm test

typecheck:
	npm run type-check

# Stop all servers, exercise apps and the tunnel (only this repository's processes)
stop:
	@./scripts/stop.sh

# Cleanup
reset:
	@echo "Resetting exercises to original state..."
	git checkout exercises/
	@echo "Exercises reset."

clean:
	@echo "Cleaning..."
	rm -rf node_modules .next dist tsconfig.tsbuildinfo
	@echo "Run 'make install' to reinstall."

check-node:
	@node scripts/check-node-version.js && echo "Node version OK"


# Export a candidate (interactive, or CANDIDATE=name EXERCISE=id)
export:
	@npx tsx scripts/export-candidate.ts $(CANDIDATE) $(EXERCISE)
