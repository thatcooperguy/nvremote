# Contributing to NVRemote

Thanks for your interest in contributing to NVRemote! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Go 1.22+ (for host agent)
- Visual Studio 2022 with C++17 (for native libs, Windows only)
- Android Studio (for Android client)
- Xcode 15+ (for macOS client)

### Setup

```bash
# Clone the repository
git clone https://github.com/thatcooperguy/nvremote.git
cd nvremote

# Install dependencies (npm workspaces)
npm install

# Copy environment files
cp apps/server-api/.env.example apps/server-api/.env
cp apps/client-desktop/.env.example apps/client-desktop/.env

# Start the API in development mode
npm run dev:api

# Start the website in development mode
npm run dev:website

# Start the Electron client in development mode
npm run dev:client
```

## Project Structure

```
nvremote/
  apps/
    server-api/     # NestJS control plane API
    website/        # Next.js marketing site + dashboard
    client-desktop/ # Electron desktop client
    host-agent/     # Go host agent
    android/        # Kotlin/Compose Android client
    mac-client/     # Swift/Metal macOS client
  libs/
    nvremote-host/    # C++17 capture + encode + transport
    nvremote-viewer/  # C++17 decode + render (N-API addon)
    nvremote-common/  # Shared C++ utilities
  infra/
    terraform/      # GCP infrastructure as code
    docker/         # Docker Compose for local development
```

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Ensure TypeScript compiles: `npx tsc --noEmit` in the relevant workspace
4. Test your changes locally
5. Open a pull request against `main`

## Code Style

- **TypeScript/JavaScript** — Prettier + ESLint (run `npm run format` and `npm run lint`)
- **Go** — `gofmt` and `go vet`
- **C++** — clang-format with project `.clang-format`
- **Swift** — SwiftFormat
- **Kotlin** — ktlint

## Commit Messages

Use clear, concise commit messages that describe the "why":

```
Add reconnection overlay to Electron client

When the P2P connection drops, show a reconnection overlay with
attempt counter and cancel button instead of immediately disconnecting.
```

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Link to any relevant issues
- Ensure CI passes before requesting review

## Reporting Issues

- Use [GitHub Issues](https://github.com/thatcooperguy/nvremote/issues) for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
