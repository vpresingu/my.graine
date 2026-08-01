.PHONY: dev backend frontend build

# Run backend and frontend dev servers together (Ctrl+C stops both)
dev:
	$(MAKE) -j2 backend frontend

backend:
	cd backend && uvicorn main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

# Pre-compute all model analyses so every screen loads instantly (run before demos)
warm:
	cd backend && python warm.py
