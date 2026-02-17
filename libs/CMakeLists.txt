################################################################################
# NVRemote — Top-Level Native Libraries Build
#
# Usage (from libs/):
#   cmake -B build -G "Visual Studio 17 2022" -A x64
#   cmake --build build --config Release
#
# Or with Ninja:
#   cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build build
################################################################################

cmake_minimum_required(VERSION 3.22)
project(NVRemote VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---------------------------------------------------------------------------
# Global options
# ---------------------------------------------------------------------------
option(CS_BUILD_HOST    "Build nvremote-host (streamer)"  ON)
option(CS_BUILD_VIEWER  "Build nvremote-viewer (client)"  ON)
option(CS_BUILD_TESTS   "Build unit tests"                   OFF)

# ---------------------------------------------------------------------------
# Platform detection
# ---------------------------------------------------------------------------
if(WIN32)
  add_compile_definitions(CS_PLATFORM_WINDOWS=1)
  add_compile_definitions(WIN32_LEAN_AND_MEAN NOMINMAX _CRT_SECURE_NO_WARNINGS)
elseif(UNIX)
  add_compile_definitions(CS_PLATFORM_LINUX=1)
endif()

# ---------------------------------------------------------------------------
# Find third-party dependencies
# ---------------------------------------------------------------------------

# OpenSSL (for DTLS 1.2)
find_package(OpenSSL REQUIRED)

# Threads
find_package(Threads REQUIRED)

# NVIDIA Video Codec SDK (NVENC / NVDEC)
# Users set -DNVCODEC_SDK_PATH=<path> to the extracted SDK
set(NVCODEC_SDK_PATH "" CACHE PATH "Path to NVIDIA Video Codec SDK")
if(NVCODEC_SDK_PATH)
  set(NVCODEC_INCLUDE_DIR "${NVCODEC_SDK_PATH}/Interface")
  if(NOT EXISTS "${NVCODEC_INCLUDE_DIR}/nvEncodeAPI.h")
    message(WARNING "nvEncodeAPI.h not found in ${NVCODEC_INCLUDE_DIR}")
  endif()
else()
  message(STATUS "NVCODEC_SDK_PATH not set — NVENC/NVDEC headers must be in system path")
  set(NVCODEC_INCLUDE_DIR "")
endif()

# NvFBC SDK
set(NVFBC_SDK_PATH "" CACHE PATH "Path to NVIDIA Capture SDK (NvFBC)")
if(NVFBC_SDK_PATH)
  set(NVFBC_INCLUDE_DIR "${NVFBC_SDK_PATH}/inc")
else()
  message(STATUS "NVFBC_SDK_PATH not set — NvFBC headers must be in system path")
  set(NVFBC_INCLUDE_DIR "")
endif()

# CUDA Toolkit (for NvFBC + GPU interop)
find_package(CUDAToolkit QUIET)
if(CUDAToolkit_FOUND)
  message(STATUS "CUDA Toolkit found: ${CUDAToolkit_VERSION}")
else()
  message(STATUS "CUDA Toolkit not found — some GPU features may be unavailable")
endif()

# Opus (audio codec)
# Try vcpkg/CMake config first, then pkg-config, then FetchContent
find_package(Opus CONFIG QUIET)
if(Opus_FOUND OR TARGET Opus::opus)
  message(STATUS "Opus found via CMake config")
  set(OPUS_LIBRARIES Opus::opus)
  set(OPUS_INCLUDE_DIRS "")
  set(OPUS_FOUND TRUE)
else()
  find_package(PkgConfig QUIET)
  if(PkgConfig_FOUND)
    pkg_check_modules(OPUS opus)
    if(OPUS_FOUND)
      # pkg-config may not set full paths; add link directories
      link_directories(${OPUS_LIBRARY_DIRS})
    endif()
  endif()
  if(NOT OPUS_FOUND)
    # Fall back to FetchContent
    include(FetchContent)
    FetchContent_Declare(opus
      GIT_REPOSITORY https://github.com/xiph/opus.git
      GIT_TAG        v1.5.2
    )
    set(OPUS_BUILD_SHARED_LIBRARY OFF CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(opus)
    set(OPUS_LIBRARIES opus)
    set(OPUS_INCLUDE_DIRS "${opus_SOURCE_DIR}/include")
  endif()
endif()

# FFmpeg (for hardware decode abstraction on client side)
# We look for avcodec, avutil, avformat
if(PkgConfig_FOUND)
  pkg_check_modules(AVCODEC libavcodec)
  pkg_check_modules(AVUTIL libavutil)
  pkg_check_modules(AVFORMAT libavformat)
  pkg_check_modules(SWSCALE libswscale)
endif()

# ---------------------------------------------------------------------------
# Sub-projects
# ---------------------------------------------------------------------------
add_subdirectory(nvremote-common)

if(CS_BUILD_HOST)
  add_subdirectory(nvremote-host)
endif()

if(CS_BUILD_VIEWER)
  add_subdirectory(nvremote-viewer)
endif()
