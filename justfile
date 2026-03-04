# Default command
default:
    @just --list

# Run the core engine
run:
    mkdir -p data
    cd core && cargo run

# Serve the frontend UI locally
serve:
    @mkdir -p dist/data
    @cp frontend/* dist/
    @cp data/pinch.db dist/data/ 2>/dev/null || echo "⚠️ Warning: data/pinch.db not found. Run 'just run' first."
    @cp data/history_data.json dist/data/ 2>/dev/null || true
    @echo "🌍 Serving UI at http://localhost:8000/"
    python3 -m http.server 8000 --directory dist

# Build the core engine
build:
    cd core && cargo build --release

# Run tests
test:
    cd core && cargo test

# Generate the static site (old python version)
gen-site-py:
    uv run src/generate_site.py

# Clean build artifacts
clean:
    cargo clean
    rm -rf core/target
    rm -f data/pinch.db
