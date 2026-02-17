# Stage 1: Build the gateway binary
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git gcc musl-dev

WORKDIR /build

# Copy module files first for layer caching.
COPY go.mod go.sum ./
RUN go mod download

# Copy source code and build.
COPY src/ ./src/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /build/nvrs-gateway \
    ./src/

# Stage 2: Runtime image
FROM alpine:latest

RUN apk add --no-cache \
    wireguard-tools \
    iptables \
    ip6tables \
    ca-certificates \
    tzdata

# Create non-root user for the service.
RUN addgroup -S nvrs && adduser -S nvrs -G nvrs

# Create config directory.
RUN mkdir -p /etc/nvrs-gateway && chown nvrs:nvrs /etc/nvrs-gateway

# Copy the built binary from the builder stage.
COPY --from=builder /build/nvrs-gateway /usr/local/bin/nvrs-gateway

# The gateway needs to manage WireGuard, which requires elevated privileges.
# The container must run with NET_ADMIN capability.

EXPOSE 8080/tcp
EXPOSE 51820/udp

ENTRYPOINT ["/usr/local/bin/nvrs-gateway"]
