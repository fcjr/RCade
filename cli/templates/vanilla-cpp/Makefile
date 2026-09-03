# Emscripten compiler
EMCC = em++

# Source files
SRC = src/main.cpp sdk/cpp/src/canvas.cpp sdk/cpp/src/input.cpp

# Output directory
BUILD_DIR = build
DIST_DIR = dist

# Output files
OUTPUT = $(BUILD_DIR)/main.js

# Compiler flags
EMCC_FLAGS = -s WASM=1 \
             -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall"]' \
             -s MODULARIZE=1 \
             -s EXPORT_NAME='createModule' \
             -s ALLOW_MEMORY_GROWTH=1 \
             -Isdk/cpp/include \
             --bind

# Development flags
DEV_FLAGS = $(EMCC_FLAGS) \
            -s ASSERTIONS=1 \
            -O0 \
            -g

# Production flags
PROD_FLAGS = $(EMCC_FLAGS) \
             -O3

# Default target
.PHONY: all
all: dev

# Development build
.PHONY: dev
dev: clean
	@mkdir -p $(BUILD_DIR)
	$(EMCC) $(SRC) $(DEV_FLAGS) -o $(OUTPUT)

# Production build
.PHONY: build
build: clean
	@mkdir -p $(DIST_DIR)
	$(EMCC) $(SRC) $(PROD_FLAGS) -o $(DIST_DIR)/main.js
	@cp index.html $(DIST_DIR)/

# Clean build artifacts
.PHONY: clean
clean:
	@rm -rf $(BUILD_DIR) $(DIST_DIR)

# Serve with Python (for local testing)
.PHONY: serve
serve: dev
	@echo "Starting local server at http://localhost:8000"
	@python3 -m http.server 8000

# Help
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  make dev     - Build for development (with debug symbols)"
	@echo "  make build   - Build for production (optimized)"
	@echo "  make serve   - Build and serve locally on port 8000"
	@echo "  make clean   - Remove build artifacts"
