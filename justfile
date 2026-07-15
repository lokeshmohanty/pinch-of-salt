# Set HF_TOKEN in .env or as an environment variable

# Default command
default:
        @just --list

# Run the core engine
run:
        mkdir -p data
        uv run src/python/main.py

# Serve the frontend UI locally
serve:
        @pkill -f "python3 -m http.server 8000" || true
        @mkdir -p public/data/clusters public/data/articles
        @cp -r src/frontend/* public/
        @cp data/index.json public/data/
        @cp -r data/clusters/ public/data/clusters/
        @cp -r data/articles/ public/data/articles/
        @echo "🌍 Serving UI at http://localhost:8000/"
        @python3 -m http.server 8000 --directory public

# Prepare for deployment (used by CI)
deploy-prep:
        mkdir -p public/data/clusters public/data/articles
        cp -r src/frontend/* public/
        cp data/index.json public/data/
        cp -r data/clusters/ public/data/clusters/
        cp -r data/articles/ public/data/articles/

# Build is NO-OP for Python but kept for compatibility
build:
        @echo "Python core does not require builds."

# Run tests
test:
        uv run pytest src/python/

# Clean build artifacts
clean:
        rm -rf public
        find . -type d -name "__pycache__" -exec rm -rf {} +
