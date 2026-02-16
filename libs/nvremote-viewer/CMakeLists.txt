################################################################################
# nvremote-viewer -- GPU-Accelerated Game Stream Viewer (Node.js N-API Addon)
#
# Receives video/audio over a custom UDP+DTLS protocol, decodes with
# hardware acceleration (NVDEC / D3D11VA / software fallback via FFmpeg),
# and renders to a D3D11 swap chain attached to an Electron window.
#
# Build via cmake-js (preferred for Node addons):
#   npx cmake-js compile -G "Visual Studio 17 2022" -A x64
#
# Or from the parent libs/ CMake:
#   cmake -B build -G "Visual Studio 17 2022" -A x64 -DCS_BUILD_VIEWER=ON
#   cmake --build build --config Release
#
# Dependencies (resolved by parent libs/CMakeLists.txt or locally):
#   - nvremote-common  (sibling header-only library)
#   - FFmpeg: avcodec, avutil, swscale
#   - OpenSSL (DTLS 1.2)
#   - Opus (audio codec)
#   - Node.js N-API via node-addon-api
#   - Windows: ws2_32, d3d11, dxgi, ole32, d3dcompiler
################################################################################

cmake_minimum_required(VERSION 3.22)
if(APPLE)
    project(nvremote-viewer LANGUAGES CXX OBJCXX)
else()
    project(nvremote-viewer LANGUAGES CXX)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ---------------------------------------------------------------------------
# Detect if we are building via cmake-js (it defines CMAKE_JS_VERSION)
# ---------------------------------------------------------------------------
if(DEFINED CMAKE_JS_VERSION)
    message(STATUS "[nvremote-viewer] Building via cmake-js ${CMAKE_JS_VERSION}")
    set(CS_BUILDING_VIA_CMAKE_JS TRUE)
else()
    message(STATUS "[nvremote-viewer] Building via standalone CMake")
    set(CS_BUILDING_VIA_CMAKE_JS FALSE)
endif()

# ---------------------------------------------------------------------------
# Fetch node-addon-api (C++ N-API wrappers)
# ---------------------------------------------------------------------------
include(FetchContent)

# node-addon-api provides the C++ wrapper for N-API
if(CS_BUILDING_VIA_CMAKE_JS)
    # cmake-js provides the Node.js include paths and library
    # We still need node-addon-api headers
    execute_process(
        COMMAND node -p "require('node-addon-api').include"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        OUTPUT_VARIABLE NAPI_INCLUDE_DIR
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
    )
    if(NOT NAPI_INCLUDE_DIR)
        # Fallback: fetch from GitHub
        FetchContent_Declare(node_addon_api
            GIT_REPOSITORY https://github.com/nodejs/node-addon-api.git
            GIT_TAG        v7.1.0
        )
        FetchContent_MakeAvailable(node_addon_api)
        set(NAPI_INCLUDE_DIR "${node_addon_api_SOURCE_DIR}")
    endif()
    # Strip surrounding quotes if present
    string(REPLACE "\"" "" NAPI_INCLUDE_DIR "${NAPI_INCLUDE_DIR}")
    message(STATUS "[nvremote-viewer] node-addon-api include: ${NAPI_INCLUDE_DIR}")
else()
    # When building from parent CMake, fetch node-addon-api and node headers
    FetchContent_Declare(node_addon_api
        GIT_REPOSITORY https://github.com/nodejs/node-addon-api.git
        GIT_TAG        v7.1.0
    )
    FetchContent_MakeAvailable(node_addon_api)
    set(NAPI_INCLUDE_DIR "${node_addon_api_SOURCE_DIR}")

    # We need Node.js headers for N-API
    # Users should set -DNODE_INCLUDE_DIR=<path> or have node-gyp style headers
    set(NODE_INCLUDE_DIR "" CACHE PATH "Path to Node.js include directory (containing node_api.h)")
    if(NOT NODE_INCLUDE_DIR)
        execute_process(
            COMMAND node -p "require('path').dirname(process.execPath) + '/include/node'"
            OUTPUT_VARIABLE NODE_INCLUDE_DIR
            OUTPUT_STRIP_TRAILING_WHITESPACE
            ERROR_QUIET
        )
    endif()
    message(STATUS "[nvremote-viewer] Node.js include: ${NODE_INCLUDE_DIR}")
endif()

# ---------------------------------------------------------------------------
# Source files
# ---------------------------------------------------------------------------
# Cross-platform sources
set(VIEWER_SOURCES
    src/addon.cpp
    src/viewer.cpp

    # Transport (cross-platform)
    src/transport/udp_receiver.cpp
    src/transport/jitter_buffer.cpp
    src/transport/nack_sender.cpp

    # QoS (cross-platform)
    src/qos/stats_reporter.cpp

    # Audio codec (cross-platform)
    src/audio/opus_decoder.cpp

    # Input (cross-platform)
    src/input/input_capture.cpp
    src/input/input_sender.cpp
    src/input/clipboard_sync.cpp
)

set(VIEWER_HEADERS
    src/viewer.h

    # Decode
    src/decode/decoder_interface.h

    # Render
    src/render/renderer_interface.h
    src/render/render_surface.h

    # Transport
    src/transport/udp_receiver.h
    src/transport/jitter_buffer.h
    src/transport/nack_sender.h

    # QoS
    src/qos/stats_reporter.h

    # Audio
    src/audio/audio_playback_interface.h
    src/audio/opus_decoder.h

    # Input
    src/input/input_capture.h
    src/input/input_sender.h
    src/input/clipboard_sync.h
)

# Platform-specific sources
if(WIN32)
    list(APPEND VIEWER_SOURCES
        src/decode/nvdec_decoder.cpp
        src/decode/d3d11va_decoder.cpp
        src/render/d3d11_renderer.cpp
        src/audio/wasapi_playback.cpp
        src/input/controller_capture.cpp
    )
    list(APPEND VIEWER_HEADERS
        src/decode/nvdec_decoder.h
        src/decode/d3d11va_decoder.h
        src/render/d3d11_renderer.h
        src/audio/wasapi_playback.h
        src/input/controller_capture.h
    )
elseif(APPLE)
    list(APPEND VIEWER_SOURCES
        src/decode/videotoolbox_decoder.mm
        src/render/metal_renderer.mm
        src/audio/coreaudio_playback.mm
    )
    list(APPEND VIEWER_HEADERS
        src/decode/videotoolbox_decoder.h
        src/render/metal_renderer.h
        src/audio/coreaudio_playback.h
    )
endif()

# ---------------------------------------------------------------------------
# Shared library target (.node extension for N-API addon)
# ---------------------------------------------------------------------------
add_library(nvremote-viewer SHARED ${VIEWER_SOURCES} ${VIEWER_HEADERS})

# N-API addons use .node extension
set_target_properties(nvremote-viewer PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

# N-API: do not throw C++ exceptions, use return-value error handling
target_compile_definitions(nvremote-viewer PRIVATE
    NAPI_DISABLE_CPP_EXCEPTIONS
    NAPI_VERSION=8
    BUILDING_NODE_EXTENSION
)

target_include_directories(nvremote-viewer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# ---------------------------------------------------------------------------
# nvremote-common (static library — networking, DTLS, ICE, STUN)
# ---------------------------------------------------------------------------
target_link_libraries(nvremote-viewer PRIVATE nvremote-common)

# ---------------------------------------------------------------------------
# Node.js / N-API headers
# ---------------------------------------------------------------------------
if(CS_BUILDING_VIA_CMAKE_JS)
    # cmake-js sets CMAKE_JS_INC and CMAKE_JS_LIB
    target_include_directories(nvremote-viewer PRIVATE
        ${CMAKE_JS_INC}
        ${NAPI_INCLUDE_DIR}
    )
    target_link_libraries(nvremote-viewer PRIVATE ${CMAKE_JS_LIB})
else()
    target_include_directories(nvremote-viewer PRIVATE
        ${NAPI_INCLUDE_DIR}
        ${NODE_INCLUDE_DIR}
    )
    # Link against node.lib for N-API symbols
    # node.lib should be alongside NODE_INCLUDE_DIR or specified via NODE_LIB_PATH
    set(NODE_LIB_PATH "" CACHE FILEPATH "Path to node.lib for N-API linking")
    if(NOT NODE_LIB_PATH)
        # Try to find node.lib next to the headers directory
        get_filename_component(_node_dir "${NODE_INCLUDE_DIR}" DIRECTORY)
        get_filename_component(_node_dir "${_node_dir}" DIRECTORY)
        if(EXISTS "${_node_dir}/node.lib")
            set(NODE_LIB_PATH "${_node_dir}/node.lib")
        endif()
    endif()
    if(NODE_LIB_PATH)
        target_link_libraries(nvremote-viewer PRIVATE "${NODE_LIB_PATH}")
        message(STATUS "[nvremote-viewer] Linking node.lib: ${NODE_LIB_PATH}")
    else()
        message(WARNING "[nvremote-viewer] node.lib not found — N-API symbols will be unresolved")
    endif()
endif()

# ---------------------------------------------------------------------------
# FFmpeg (avcodec, avutil, swscale)
# ---------------------------------------------------------------------------
if(AVCODEC_FOUND AND AVUTIL_FOUND AND SWSCALE_FOUND)
    target_include_directories(nvremote-viewer PRIVATE
        ${AVCODEC_INCLUDE_DIRS}
        ${AVUTIL_INCLUDE_DIRS}
        ${SWSCALE_INCLUDE_DIRS}
    )
    target_link_directories(nvremote-viewer PRIVATE
        ${AVCODEC_LIBRARY_DIRS}
        ${AVUTIL_LIBRARY_DIRS}
        ${SWSCALE_LIBRARY_DIRS}
    )
    target_link_libraries(nvremote-viewer PRIVATE
        ${AVCODEC_LIBRARIES}
        ${AVUTIL_LIBRARIES}
        ${SWSCALE_LIBRARIES}
    )
else()
    # Fallback: assume FFmpeg is installed in system paths or user sets
    # -DFFMPEG_ROOT=<path>
    set(FFMPEG_ROOT "" CACHE PATH "Path to FFmpeg installation (include/ and lib/)")
    if(FFMPEG_ROOT)
        target_include_directories(nvremote-viewer PRIVATE "${FFMPEG_ROOT}/include")
        target_link_directories(nvremote-viewer PRIVATE "${FFMPEG_ROOT}/lib")
    endif()
    target_link_libraries(nvremote-viewer PRIVATE avcodec avutil swscale)
    message(STATUS "[nvremote-viewer] Using FFmpeg from system/FFMPEG_ROOT")
endif()

# ---------------------------------------------------------------------------
# OpenSSL (DTLS 1.2 encryption)
# ---------------------------------------------------------------------------
target_link_libraries(nvremote-viewer PRIVATE OpenSSL::SSL OpenSSL::Crypto)

# ---------------------------------------------------------------------------
# Opus audio codec
# ---------------------------------------------------------------------------
if(OPUS_INCLUDE_DIRS)
    target_include_directories(nvremote-viewer PRIVATE ${OPUS_INCLUDE_DIRS})
endif()
target_link_libraries(nvremote-viewer PRIVATE ${OPUS_LIBRARIES})

# ---------------------------------------------------------------------------
# CUDA Toolkit (optional -- enables CUDA hwaccel path)
# ---------------------------------------------------------------------------
if(CUDAToolkit_FOUND)
    target_link_libraries(nvremote-viewer PRIVATE CUDA::cuda_driver)
    target_compile_definitions(nvremote-viewer PRIVATE CS_HAS_CUDA=1)
    message(STATUS "[nvremote-viewer] CUDA enabled for NVDEC")
else()
    message(STATUS "[nvremote-viewer] CUDA not found; NVDEC will use D3D11VA fallback")
endif()

# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------
target_link_libraries(nvremote-viewer PRIVATE Threads::Threads)

# ---------------------------------------------------------------------------
# Windows system libraries
# ---------------------------------------------------------------------------
if(WIN32)
    target_link_libraries(nvremote-viewer PRIVATE
        ws2_32
        d3d11
        dxgi
        ole32
        d3dcompiler
        winmm
        uuid
    )
endif()

# ---------------------------------------------------------------------------
# macOS frameworks
# ---------------------------------------------------------------------------
if(APPLE)
    find_library(METAL_FRAMEWORK Metal REQUIRED)
    find_library(METALKIT_FRAMEWORK MetalKit REQUIRED)
    find_library(QUARTZCORE_FRAMEWORK QuartzCore REQUIRED)
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
    find_library(VIDEOTOOLBOX_FRAMEWORK VideoToolbox REQUIRED)
    find_library(COREMEDIA_FRAMEWORK CoreMedia REQUIRED)
    find_library(COREVIDEO_FRAMEWORK CoreVideo REQUIRED)
    find_library(AUDIOTOOLBOX_FRAMEWORK AudioToolbox REQUIRED)
    find_library(FOUNDATION_FRAMEWORK Foundation REQUIRED)

    target_link_libraries(nvremote-viewer PRIVATE
        ${METAL_FRAMEWORK}
        ${METALKIT_FRAMEWORK}
        ${QUARTZCORE_FRAMEWORK}
        ${COCOA_FRAMEWORK}
        ${VIDEOTOOLBOX_FRAMEWORK}
        ${COREMEDIA_FRAMEWORK}
        ${COREVIDEO_FRAMEWORK}
        ${AUDIOTOOLBOX_FRAMEWORK}
        ${FOUNDATION_FRAMEWORK}
    )

    # Enable Objective-C++ for .mm files
    set_source_files_properties(
        src/decode/videotoolbox_decoder.mm
        src/render/metal_renderer.mm
        src/audio/coreaudio_playback.mm
        PROPERTIES COMPILE_FLAGS "-fobjc-arc"
    )

    # Allow undefined N-API symbols — resolved at runtime by Node.js
    target_link_options(nvremote-viewer PRIVATE "LINKER:-undefined,dynamic_lookup")
endif()

# ---------------------------------------------------------------------------
# Compiler options
# ---------------------------------------------------------------------------
if(MSVC)
    target_compile_options(nvremote-viewer PRIVATE /W4 /MP)
    target_compile_definitions(nvremote-viewer PRIVATE
        _SILENCE_ALL_MS_EXT_DEPRECATION_WARNINGS
    )
else()
    target_compile_options(nvremote-viewer PRIVATE -Wall -Wextra -Wpedantic)
endif()
