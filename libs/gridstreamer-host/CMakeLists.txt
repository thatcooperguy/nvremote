################################################################################
# gridstreamer-host -- GPU Streaming Host Application
#
# Captures the screen via NvFBC (or DXGI fallback), encodes with NVENC,
# captures audio via WASAPI + Opus, and sends everything over a custom
# UDP protocol with DTLS encryption and adaptive QoS.
#
# Dependencies (resolved by the parent libs/CMakeLists.txt):
#   - gridstreamer-common  (sibling library)
#   - NVIDIA Video Codec SDK (NVENC headers)
#   - NvFBC SDK headers
#   - CUDA Toolkit (optional, for GPU-direct capture)
#   - OpenSSL (DTLS 1.2)
#   - Opus (audio codec)
#   - nlohmann/json (fetched automatically)
#   - Windows: ws2_32, d3d11, dxgi, ole32
################################################################################

cmake_minimum_required(VERSION 3.22)
project(gridstreamer-host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# Fetch nlohmann/json (header-only JSON library)
# ---------------------------------------------------------------------------
include(FetchContent)
FetchContent_Declare(json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(json)

# ---------------------------------------------------------------------------
# Source files
# ---------------------------------------------------------------------------
set(HOST_SOURCES
    src/main.cpp

    # Capture
    src/capture/nvfbc_capture.cpp
    src/capture/dxgi_capture.cpp

    # Encode
    src/encode/nvenc_encoder.cpp

    # Transport
    src/transport/udp_transport.cpp
    src/transport/fec.cpp

    # QoS
    src/qos/qos_controller.cpp
    src/qos/bandwidth_estimator.cpp

    # Audio
    src/audio/wasapi_capture.cpp
    src/audio/opus_encoder.cpp

    # IPC
    src/ipc/pipe_server.cpp

    # Input
    src/input/controller_inject.cpp
    src/input/clipboard_inject.cpp

    # Session
    src/session/session_manager.cpp
)

set(HOST_HEADERS
    # Capture
    src/capture/capture_interface.h
    src/capture/nvfbc_capture.h
    src/capture/dxgi_capture.h

    # Encode
    src/encode/encoder_interface.h
    src/encode/nvenc_encoder.h

    # Transport
    src/transport/udp_transport.h
    src/transport/fec.h

    # QoS
    src/qos/qos_controller.h
    src/qos/kalman_filter.h
    src/qos/bandwidth_estimator.h

    # Audio
    src/audio/wasapi_capture.h
    src/audio/opus_encoder.h

    # IPC
    src/ipc/pipe_server.h

    # Input
    src/input/controller_inject.h
    src/input/clipboard_inject.h

    # Session
    src/session/session_manager.h
)

# ---------------------------------------------------------------------------
# Executable target
# ---------------------------------------------------------------------------
add_executable(gridstreamer-host ${HOST_SOURCES} ${HOST_HEADERS})

target_include_directories(gridstreamer-host PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# ---------------------------------------------------------------------------
# Link gridstreamer-common (static library — networking, DTLS, ICE, STUN)
# ---------------------------------------------------------------------------
target_link_libraries(gridstreamer-host PRIVATE gridstreamer-common)

# ---------------------------------------------------------------------------
# nlohmann/json
# ---------------------------------------------------------------------------
target_link_libraries(gridstreamer-host PRIVATE nlohmann_json::nlohmann_json)

# ---------------------------------------------------------------------------
# NVIDIA Video Codec SDK (NVENC headers -- no .lib needed, we dlopen)
# ---------------------------------------------------------------------------
if(NVCODEC_INCLUDE_DIR AND EXISTS "${NVCODEC_INCLUDE_DIR}")
    target_include_directories(gridstreamer-host PRIVATE ${NVCODEC_INCLUDE_DIR})
    message(STATUS "[gridstreamer-host] NVENC headers: ${NVCODEC_INCLUDE_DIR}")
else()
    message(STATUS "[gridstreamer-host] NVENC headers not specified; using bundled declarations")
endif()

# ---------------------------------------------------------------------------
# NvFBC SDK (headers only -- we dlopen NvFBC64.dll at runtime)
# ---------------------------------------------------------------------------
if(NVFBC_INCLUDE_DIR AND EXISTS "${NVFBC_INCLUDE_DIR}")
    target_include_directories(gridstreamer-host PRIVATE ${NVFBC_INCLUDE_DIR})
    message(STATUS "[gridstreamer-host] NvFBC headers: ${NVFBC_INCLUDE_DIR}")
else()
    message(STATUS "[gridstreamer-host] NvFBC headers not specified; using bundled declarations")
endif()

# ---------------------------------------------------------------------------
# CUDA Toolkit (optional -- enables GPU-direct capture path)
# ---------------------------------------------------------------------------
if(CUDAToolkit_FOUND)
    target_link_libraries(gridstreamer-host PRIVATE CUDA::cuda_driver)
    target_compile_definitions(gridstreamer-host PRIVATE CS_HAS_CUDA=1)
    message(STATUS "[gridstreamer-host] CUDA enabled")
else()
    message(STATUS "[gridstreamer-host] CUDA not found; GPU-direct capture disabled")
endif()

# ---------------------------------------------------------------------------
# OpenSSL (DTLS 1.2 encryption)
# ---------------------------------------------------------------------------
target_link_libraries(gridstreamer-host PRIVATE OpenSSL::SSL OpenSSL::Crypto)

# ---------------------------------------------------------------------------
# Opus audio codec
# ---------------------------------------------------------------------------
if(OPUS_INCLUDE_DIRS)
    target_include_directories(gridstreamer-host PRIVATE ${OPUS_INCLUDE_DIRS})
endif()
target_link_libraries(gridstreamer-host PRIVATE ${OPUS_LIBRARIES})

# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------
target_link_libraries(gridstreamer-host PRIVATE Threads::Threads)

# ---------------------------------------------------------------------------
# Windows system libraries
# ---------------------------------------------------------------------------
if(WIN32)
    target_link_libraries(gridstreamer-host PRIVATE
        ws2_32
        d3d11
        dxgi
        ole32
        winmm       # timeBeginPeriod for high-res timer
    )
endif()

# ---------------------------------------------------------------------------
# Compiler options
# ---------------------------------------------------------------------------
if(MSVC)
    target_compile_options(gridstreamer-host PRIVATE /W4 /MP)
    target_compile_definitions(gridstreamer-host PRIVATE _SILENCE_ALL_MS_EXT_DEPRECATION_WARNINGS)
else()
    target_compile_options(gridstreamer-host PRIVATE -Wall -Wextra -Wpedantic)
endif()
