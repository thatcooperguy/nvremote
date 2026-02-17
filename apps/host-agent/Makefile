# NVIDIA Remote Stream Host Agent - Makefile
# Build targets for Windows amd64

BINARY_NAME := nvrs-agent.exe
BUILD_DIR := build
INSTALL_DIR := C:\ProgramData\NVRemoteStream
GO := go
GOFLAGS := -trimpath
LDFLAGS := -s -w

# Version information (override via environment or command line)
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
LDFLAGS += -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)

.PHONY: all build test clean install uninstall fmt vet lint

all: build

## build: Compile the agent binary for Windows amd64.
build:
	@echo Building $(BINARY_NAME) $(VERSION)...
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 $(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS)" \
		-o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/agent

## test: Run all unit tests.
test:
	$(GO) test -v -race -count=1 ./...

## test-cover: Run tests with coverage report.
test-cover:
	$(GO) test -v -race -coverprofile=coverage.out ./...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo Coverage report: coverage.html

## fmt: Format all Go source files.
fmt:
	$(GO) fmt ./...

## vet: Run go vet on all packages.
vet:
	$(GO) vet ./...

## lint: Run staticcheck (must be installed separately).
lint: vet
	staticcheck ./...

## tidy: Run go mod tidy to clean up dependencies.
tidy:
	$(GO) mod tidy

## install: Build and copy the binary to the install directory.
install: build
	@echo Installing to $(INSTALL_DIR)...
	@mkdir -p "$(INSTALL_DIR)"
	cp $(BUILD_DIR)/$(BINARY_NAME) "$(INSTALL_DIR)/$(BINARY_NAME)"
	@echo Installed. Run the install script to configure and register:
	@echo   powershell -ExecutionPolicy Bypass -File scripts/install.ps1

## uninstall: Remove the agent binary from the install directory.
uninstall:
	@echo Uninstalling from $(INSTALL_DIR)...
	rm -f "$(INSTALL_DIR)/$(BINARY_NAME)"
	@echo Binary removed. Run the uninstall script for full cleanup:
	@echo   powershell -ExecutionPolicy Bypass -File scripts/uninstall.ps1

## clean: Remove build artifacts.
clean:
	@echo Cleaning build artifacts...
	rm -rf $(BUILD_DIR)
	rm -f coverage.out coverage.html
	@echo Clean.

## help: Show this help message.
help:
	@echo Available targets:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /'
