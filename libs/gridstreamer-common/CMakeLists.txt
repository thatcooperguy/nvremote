################################################################################
# gridstreamer-common — Static library shared by host and viewer
#
# Contains:
#   - Wire-format packet definitions (header-only)
#   - DTLS 1.2 context wrapper (OpenSSL)
#   - STUN binding client (RFC 5389)
#   - ICE-lite agent (candidate gathering + connectivity checks)
#   - QoS feedback helpers (header-only)
#   - Common utilities (logging, timestamps, platform socket helpers)
################################################################################

# Source files (compiled into the static library)
set(CS_COMMON_SOURCES
    src/transport/dtls_context.cpp
    src/p2p/stun_client.cpp
    src/p2p/ice_agent.cpp
)

# Header files (for IDE integration / install targets)
set(CS_COMMON_HEADERS
    include/cs/common.h
    include/cs/transport/packet.h
    include/cs/transport/dtls_context.h
    include/cs/p2p/stun_client.h
    include/cs/p2p/ice_agent.h
    include/cs/qos/feedback_packet.h
    include/cs/qos/gaming_modes.h
)

# ---------------------------------------------------------------------------
# Define the static library
# ---------------------------------------------------------------------------
add_library(gridstreamer-common STATIC ${CS_COMMON_SOURCES} ${CS_COMMON_HEADERS})

# C++17
target_compile_features(gridstreamer-common PUBLIC cxx_std_17)

# Export the include directory so consumers get it automatically via
# target_link_libraries(... gridstreamer-common)
target_include_directories(gridstreamer-common
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

# ---------------------------------------------------------------------------
# Link dependencies
# ---------------------------------------------------------------------------

# OpenSSL (found by the parent CMakeLists.txt)
target_link_libraries(gridstreamer-common
    PUBLIC
        OpenSSL::SSL
        OpenSSL::Crypto
        Threads::Threads
)

# Platform socket libraries
if(WIN32)
    target_link_libraries(gridstreamer-common
        PUBLIC
            ws2_32
            iphlpapi
    )
endif()

# ---------------------------------------------------------------------------
# Compiler warnings
# ---------------------------------------------------------------------------
if(MSVC)
    target_compile_options(gridstreamer-common PRIVATE /W4)
else()
    target_compile_options(gridstreamer-common PRIVATE -Wall -Wextra -Wpedantic)
endif()
