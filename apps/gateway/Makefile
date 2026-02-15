BINARY_NAME := nvremote-gateway
MODULE := github.com/nvidia/nvremote/gateway
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

DOCKER_IMAGE := nvremote-gateway
DOCKER_TAG ?= $(VERSION)
DOCKER_REGISTRY ?= ghcr.io/nvidia/nvremote

GO := go
GOFLAGS := -trimpath
LDFLAGS := -s -w -X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME)

.PHONY: build docker-build docker-push deploy test clean fmt lint help

## build: Compile the gateway binary for linux/amd64
build:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GOFLAGS) \
		-ldflags='$(LDFLAGS)' \
		-o bin/$(BINARY_NAME) \
		./src/

## build-local: Compile for the current platform
build-local:
	$(GO) build $(GOFLAGS) \
		-ldflags='$(LDFLAGS)' \
		-o bin/$(BINARY_NAME) \
		./src/

## docker-build: Build the Docker image
docker-build:
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .
	docker tag $(DOCKER_IMAGE):$(DOCKER_TAG) $(DOCKER_IMAGE):latest

## docker-push: Push the Docker image to the registry
docker-push: docker-build
	docker tag $(DOCKER_IMAGE):$(DOCKER_TAG) $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):$(DOCKER_TAG)
	docker tag $(DOCKER_IMAGE):latest $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):latest
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):$(DOCKER_TAG)
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):latest

## deploy: Deploy the gateway to a remote VM via SSH
deploy: build
	@if [ -z "$(GATEWAY_HOST)" ]; then \
		echo "Error: GATEWAY_HOST is not set. Usage: make deploy GATEWAY_HOST=user@host"; \
		exit 1; \
	fi
	scp bin/$(BINARY_NAME) $(GATEWAY_HOST):/usr/local/bin/$(BINARY_NAME)
	scp scripts/nvremote-gateway.service $(GATEWAY_HOST):/etc/systemd/system/nvremote-gateway.service
	ssh $(GATEWAY_HOST) "systemctl daemon-reload && systemctl restart nvremote-gateway"
	@echo "Deployed $(BINARY_NAME) to $(GATEWAY_HOST)"

## test: Run all tests
test:
	$(GO) test -v -race -count=1 ./src/...

## test-cover: Run tests with coverage report
test-cover:
	$(GO) test -v -race -coverprofile=coverage.out ./src/...
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

## fmt: Format Go source code
fmt:
	$(GO) fmt ./src/...

## lint: Run Go linters
lint:
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run ./src/...; \
	else \
		echo "golangci-lint not installed, running go vet only"; \
		$(GO) vet ./src/...; \
	fi

## clean: Remove build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

## help: Show this help message
help:
	@echo "NVRemote - Gateway Service"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /'
