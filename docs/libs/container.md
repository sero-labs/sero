# container - Linux Containers on Mac

`container` is a command-line tool for creating and running Linux containers as lightweight virtual machines on Apple silicon Macs. Written in Swift and optimized for Apple silicon, it uses the [Containerization](https://github.com/apple/containerization) package to run a dedicated lightweight VM for each container, providing strong isolation with minimal overhead. The tool consumes and produces OCI-compatible container images, enabling seamless interoperability with any standard container registry.

The architecture differs from traditional container solutions by running each container in its own VM rather than sharing a single Linux VM. This approach provides enhanced security through full VM isolation, improved privacy by mounting only necessary data per container, and performance comparable to shared-VM containers. `container` integrates deeply with macOS technologies including the Virtualization framework, vmnet for networking, XPC for interprocess communication, launchd for service management, and Keychain for registry credentials.

## Core Commands

### Run a Container

Creates and starts a container from an image. Supports interactive sessions, detached mode, resource limits, environment variables, volume mounts, port publishing, and network configuration.

```bash
# Run an interactive shell in Ubuntu
container run -it ubuntu:latest /bin/bash

# Run a detached web server with port forwarding and resource limits
container run -d --name web --rm \
  -p 127.0.0.1:8080:80 \
  --cpus 2 --memory 4G \
  -e NODE_ENV=production \
  nginx:latest

# Mount host directory into container
container run --rm \
  --volume ${HOME}/projects:/app \
  -w /app \
  node:18 npm install

# Run with custom network and MAC address
container run -d --name db \
  --network mynetwork,mac=02:42:ac:11:00:02 \
  postgres:15

# Forward SSH agent for git operations
container run -it --rm --ssh alpine:latest sh -c "
  apk add openssh-client git
  ssh-add -l
  git clone git@github.com:org/private-repo.git
"
```

### Build Container Images

Builds an OCI image from a Dockerfile or Containerfile using BuildKit. Supports multi-platform builds, build arguments, caching control, and multiple output formats.

```bash
# Basic build with tag
container build -t myapp:latest .

# Build with custom Dockerfile and build arguments
container build \
  -f docker/Dockerfile.prod \
  --build-arg VERSION=1.0.0 \
  --build-arg NODE_VERSION=18 \
  -t myapp:prod .

# Multi-platform build for ARM64 and AMD64
container build \
  --arch arm64 --arch amd64 \
  -t registry.example.com/myapp:latest .

# Build specific stage with no cache
container build \
  --target production \
  --no-cache \
  -t myapp:prod .

# Configure builder resources for large builds
container builder start --cpus 8 --memory 32G
container build -t large-app:latest .
```

### Execute Commands in Running Containers

Runs a new command inside an already running container. Useful for debugging, administration, and running additional processes.

```bash
# Run a single command
container exec mycontainer ls -la /app

# Interactive shell session
container exec -it mycontainer /bin/bash

# Run as specific user with environment variables
container exec -it \
  --user www-data \
  --workdir /var/www \
  -e DEBUG=true \
  webserver cat /var/log/app.log

# Detached command execution
container exec -d mycontainer /scripts/backup.sh
```

## Container Lifecycle Management

### Create, Start, Stop, and Delete Containers

Full lifecycle management for containers including creation without starting, graceful shutdown with configurable timeouts, and forced termination.

```bash
# Create container without starting
container create --name myapp \
  -p 8080:80 \
  --cpus 2 --memory 2G \
  nginx:latest

# Start created container with output attached
container start -a myapp

# Stop with custom timeout (default 5 seconds)
container stop --time 30 myapp

# Stop all running containers
container stop --all

# Force kill with specific signal
container kill --signal SIGKILL myapp

# Delete stopped container
container delete myapp

# Force delete running container
container delete --force myapp

# Delete all containers
container delete --all

# Remove stopped containers and reclaim space
container prune
```

### List and Inspect Containers

View container status, resource usage, and detailed configuration information.

```bash
# List running containers
container list
# Output:
# ID      IMAGE            OS     ARCH   STATE    ADDR
# web     nginx:latest     linux  arm64  running  192.168.64.2
# db      postgres:15      linux  arm64  running  192.168.64.3

# List all containers including stopped
container list --all

# List container IDs only (useful for scripting)
container list -q

# JSON output for programmatic access
container list --format json | jq '.[] | select(.status == "running") | .configuration.id'

# Detailed container inspection
container inspect web | jq
# Returns detailed JSON with networks, mounts, resource config, etc.

# Real-time resource statistics
container stats
# Output:
# Container ID  Cpu %    Memory Usage          Net Rx/Tx            Block I/O            Pids
# web           2.45%    45.23 MiB / 1.00 GiB  1.23 MiB / 856 KiB   4.50 MiB / 2.10 MiB  3

# Single snapshot of stats in JSON
container stats --no-stream --format json web
```

### View Container Logs

Fetch stdout/stderr output or VM boot logs from containers.

```bash
# View container application logs
container logs myapp

# Follow logs in real-time
container logs -f myapp

# Show last 100 lines
container logs -n 100 myapp

# View VM boot and init logs
container logs --boot myapp
```

## Image Management

### Pull, Push, and Manage Images

Transfer images between local storage and OCI registries, with support for multi-platform images.

```bash
# Pull image from registry
container image pull nginx:latest

# Pull specific platform
container image pull --platform linux/arm64 node:18

# List local images
container image list
# Output:
# NAME    TAG     DIGEST
# nginx   latest  sha256:abc123...
# node    18      sha256:def456...

# Verbose listing with size and creation time
container image list --verbose

# Tag image for registry
container image tag myapp:latest registry.example.com/myorg/myapp:v1.0.0

# Push to registry
container image push registry.example.com/myorg/myapp:v1.0.0

# Delete local image
container image delete myapp:latest

# Delete all unused images
container image prune --all

# Inspect image details
container image inspect nginx:latest | jq

# Save image to tar archive
container image save -o backup.tar nginx:latest myapp:latest

# Load image from tar archive
container image load -i backup.tar
```

### Registry Authentication

Manage credentials for container registries.

```bash
# Interactive login
container registry login registry.example.com

# Login with username (prompts for password)
container registry login -u myuser registry.example.com

# Login with password from stdin (for CI/CD)
echo $REGISTRY_TOKEN | container registry login \
  --username myuser \
  --password-stdin registry.example.com

# Logout from registry
container registry logout registry.example.com
```

## Network Management

### Create and Manage Networks

User-defined networks provide isolated network environments for containers. Available on macOS 26+.

```bash
# Create network with auto-assigned subnet
container network create mynetwork

# Create network with custom IPv4 and IPv6 subnets
container network create mynetwork \
  --subnet 192.168.100.0/24 \
  --subnet-v6 fd00:1234::/64

# List networks
container network list
# Output:
# NETWORK    STATE    SUBNET
# default    running  192.168.64.0/24
# mynetwork  running  192.168.100.0/24

# Inspect network details
container network inspect mynetwork

# Run container on specific network
container run -d --name app --network mynetwork nginx:latest

# Delete network (must have no attached containers)
container network delete mynetwork

# Remove all unused networks
container network prune
```

## Volume Management

### Create and Manage Persistent Volumes

Named volumes persist data across container restarts and can be shared between containers.

```bash
# Create named volume
container volume create mydata

# Create volume with size limit
container volume create --opt size=10G mydata

# List volumes
container volume list

# Run container with named volume
container run -d --name db \
  -v mydata:/var/lib/postgresql/data \
  postgres:15

# Run with bind mount
container run --rm \
  -v ${HOME}/code:/app:ro \
  node:18 npm test

# Anonymous volume (auto-created, requires manual cleanup)
container run -v /data alpine touch /data/file.txt

# Inspect volume
container volume inspect mydata

# Delete volume
container volume delete mydata

# Remove all unused volumes
container volume prune
```

## System Management

### Start and Stop Services

Control the container apiserver and helper services.

```bash
# Start container services (installs kernel if needed)
container system start

# Start with kernel auto-install enabled
container system start --enable-kernel-install

# Check service status
container system status
# Output: container apiserver is running

# View system version information
container system version
# Output:
# COMPONENT    VERSION  BUILD    COMMIT
# CLI          1.0.0    release  abc123
# API Server   1.0.0    release  abc123

# View system logs
container system logs --last 1h

# Follow logs in real-time
container system logs -f

# Stop all services
container system stop

# View disk usage
container system df
# Output:
# TYPE        TOTAL  ACTIVE  SIZE       RECLAIMABLE
# Images      5      2       2.3 GiB    1.1 GiB (47%)
# Containers  3      1       512 MiB    256 MiB (50%)
# Volumes     2      1       100 MiB    50 MiB (50%)
```

### Configure System Properties

Customize container behavior through system properties.

```bash
# List all properties
container system property list
# Output:
# ID                TYPE    VALUE        DESCRIPTION
# build.rosetta     Bool    true         Build amd64 on arm64 using Rosetta
# dns.domain        String  *undefined*  Local DNS domain for containers
# network.subnet    String  *undefined*  Default IPv4 subnet

# Get specific property
container system property get dns.domain

# Set DNS domain for container name resolution
container system property set dns.domain test

# Configure default registry
container system property set registry.domain ghcr.io

# Disable Rosetta for x86 builds
container system property set build.rosetta false

# Set default network subnets
container system property set network.subnet 192.168.100.1/24
container system property set network.subnetv6 fd00:abcd::/64

# Clear property to default
container system property clear dns.domain
```

### DNS Configuration

Configure local DNS domains for container hostname resolution. Requires sudo.

```bash
# Create local DNS domain
sudo container system dns create test

# Set as default DNS domain
container system property set dns.domain test

# Now containers are accessible by name
container run -d --name web nginx:latest
curl http://web.test  # Resolves to container IP

# Create domain for host access from containers
sudo container system dns create host.container.internal --localhost 203.0.113.113

# Access host services from container
container run --rm alpine/curl curl http://host.container.internal:8000

# List DNS domains
container system dns list

# Delete DNS domain
sudo container system dns delete test
```

### Kernel Management

Install and manage the Linux kernel used by container VMs.

```bash
# Install recommended kernel
container system kernel set --recommended

# Install kernel from URL
container system kernel set \
  --tar https://github.com/kata-containers/kata-containers/releases/download/3.17.0/kata-static-3.17.0-arm64.tar.xz \
  --binary opt/kata/share/kata-containers/vmlinux.container

# Force overwrite existing kernel
container system kernel set --recommended --force
```

## Sero-Specific: Ghost Containers & Safe Lifecycle

### The Ghost Container Problem

A "ghost container" is a container that exists in the API server's registry but whose storage directory (`~/Library/Application Support/com.apple.container/containers/<id>/`) has been deleted or corrupted. Ghost containers:

- **Cannot be started** — fails with `config.json couldn't be opened`
- **Cannot be deleted** — `container delete --force` fails with same error
- **Cannot be recreated** — `container run --name <id>` fails with `already exists`
- **Poison the namespace** — the name is permanently reserved until the API server is restarted

### What Creates Ghosts

1. **Deleting the container storage directory directly** (`rm -rf .../containers/<id>/`) — the API server's in-memory registry still holds the entry
2. **`container system stop && start`** — may purge storage directories while leaving registry entries (race condition during unclean shutdown)
3. **Interrupted stops** — if the process calling `container stop` is killed mid-operation

### How to Clear Ghosts (Last Resort Only)

```bash
container system stop   # Kills ALL containers, resets API server registry
sleep 3
container system start  # Fresh registry — ghosts are gone
```

**WARNING:** This destroys ALL running containers and may delete their storage. Only use as a last resort. In Sero, the bind-mount design (AD-010) ensures project files survive even this scenario.

### Safe Container Lifecycle for Sero

The correct lifecycle that avoids ghosts:

```
App quit:     container stop <id>           → container is stopped, directory intact
App restart:  container start <id>          → container resumes, all state preserved
Recovery:     container delete --force <id> → clean removal (only works if directory exists)
              container run --name <id> ... → recreate with same bind mount
Last resort:  container system stop/start   → nuclear option, clears all ghosts
```

### Rules

1. **NEVER delete container storage directories directly** — always use `container delete`
2. **NEVER use `container rm`** — the command doesn't exist; the correct command is `container delete`
3. **NEVER restart the API server in normal operation** — it's destructive to all containers
4. **ALWAYS use bind mounts for project data** — files on host survive any container lifecycle event
5. **The `container stop` / `container start` cycle is safe and preserves everything** — config.json, filesystem, network config all survive

## Summary

`container` provides a comprehensive solution for running Linux containers on macOS with Apple silicon, offering Docker-compatible CLI semantics while leveraging per-container VM isolation for enhanced security. The primary use cases include local development environments where developers need to run and test Linux-based services, building OCI-compatible container images that can be deployed to any container platform, and running multi-architecture workloads with ARM64 native execution plus Rosetta-translated AMD64 support.

Integration patterns center around the standard OCI ecosystem: pull images from any compliant registry (Docker Hub, GitHub Container Registry, private registries), build images using standard Dockerfiles with BuildKit, push images for deployment elsewhere, and use named volumes and bind mounts for persistent data. The system property configuration allows customization of default registries, DNS domains, and build settings to match organizational requirements. For CI/CD integration, use `--password-stdin` for non-interactive registry login and `--format json` output for programmatic parsing of container, image, and system status.