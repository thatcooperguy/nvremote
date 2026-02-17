///////////////////////////////////////////////////////////////////////////////
// drm_capture.cpp -- DRM/KMS framebuffer capture for Linux ARM64
//
// Implementation of the DRM capture backend for Jetson/Orin/DGX Spark.
// This file is only compiled on Linux ARM64 targets (aarch64).
///////////////////////////////////////////////////////////////////////////////

#ifdef __linux__
#ifdef __aarch64__

#include "drm_capture.h"

#include <cstring>
#include <fstream>
#include <sstream>
#include <chrono>

// DRM/KMS headers (provided by libdrm-dev on Jetson)
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <xf86drm.h>
#include <xf86drmMode.h>

namespace cs::host {

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

static std::string readFileContent(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) return "";
    std::ostringstream ss;
    ss << f.rdbuf();
    std::string content = ss.str();
    // Trim trailing whitespace/null bytes
    while (!content.empty() && (content.back() == '\0' || content.back() == '\n' || content.back() == '\r')) {
        content.pop_back();
    }
    return content;
}

JetsonPlatformInfo detectJetsonPlatform() {
    JetsonPlatformInfo info;

    // Read device model from device tree
    info.model = readFileContent("/proc/device-tree/model");

    // Determine SoC from model string
    if (info.model.find("Orin") != std::string::npos) {
        info.soc = "Orin";
        info.has_nvmm = true;
        info.max_nvenc_sessions = 4;
    } else if (info.model.find("Xavier") != std::string::npos) {
        info.soc = "Xavier";
        info.has_nvmm = true;
        info.max_nvenc_sessions = 2;
    } else if (info.model.find("DGX") != std::string::npos || info.model.find("Grace") != std::string::npos) {
        info.soc = "Grace Blackwell";
        info.has_nvmm = true;
        info.has_nvfbc = true;  // DGX Spark has full desktop GPU — may support NvFBC
        info.max_nvenc_sessions = 8;
    } else if (info.model.find("Nano") != std::string::npos || info.model.find("Tegra") != std::string::npos) {
        info.soc = "Tegra X1";
        info.has_nvmm = true;
        info.max_nvenc_sessions = 1;
    } else {
        info.soc = "Unknown ARM64";
        info.has_nvmm = false;
        info.max_nvenc_sessions = 0;
    }

    // Parse L4T / JetPack version from /etc/nv_tegra_release
    std::string tegra_release = readFileContent("/etc/nv_tegra_release");
    if (!tegra_release.empty()) {
        // Format: "# R35 (release), REVISION: 4.1, ..."
        auto r_pos = tegra_release.find("# R");
        auto rev_pos = tegra_release.find("REVISION: ");
        if (r_pos != std::string::npos && rev_pos != std::string::npos) {
            std::string major = tegra_release.substr(r_pos + 3, tegra_release.find(' ', r_pos + 3) - r_pos - 3);
            std::string minor = tegra_release.substr(rev_pos + 10);
            auto comma = minor.find(',');
            if (comma != std::string::npos) minor = minor.substr(0, comma);
            info.l4t_version = major + "." + minor;
        }
    }

    // Read JetPack version from dpkg if available
    // (JetPack meta-package: nvidia-jetpack)
    // For now, derive from L4T version:
    //   L4T 35.x = JetPack 5.x
    //   L4T 36.x = JetPack 6.x
    if (!info.l4t_version.empty()) {
        int major_l4t = 0;
        try { major_l4t = std::stoi(info.l4t_version); } catch (...) {}
        if (major_l4t >= 36) {
            info.jetpack_version = "6.0";
        } else if (major_l4t >= 35) {
            info.jetpack_version = "5.1";
        } else if (major_l4t >= 32) {
            info.jetpack_version = "4.6";
        }
    }

    // Read current power mode from nvpmodel (Jetson-specific)
    std::ifstream power_file("/sys/devices/platform/gpu.0/load");
    // Actually, read nvpmodel: /etc/nvpmodel/status
    std::string nvpmodel_status = readFileContent("/var/lib/nvpmodel/status");
    if (!nvpmodel_status.empty()) {
        info.power_mode = nvpmodel_status;
    } else {
        info.power_mode = "UNKNOWN";
    }

    return info;
}

// ---------------------------------------------------------------------------
// DrmCapture implementation
// ---------------------------------------------------------------------------

DrmCapture::DrmCapture() = default;

DrmCapture::~DrmCapture() {
    release();
}

bool DrmCapture::initialize(int gpu_index) {
    platform_info_ = detectJetsonPlatform();

    // If DGX Spark has NvFBC, caller should prefer NvfbcCapture instead
    if (platform_info_.has_nvfbc) {
        // Still initialize DRM as fallback
    }

    if (!openDrmDevice(gpu_index)) {
        return false;
    }

    if (!setupCrtc()) {
        release();
        return false;
    }

    if (!mapFramebuffer()) {
        release();
        return false;
    }

    // Enable NVMM zero-copy if available on this platform
    nvmm_enabled_ = platform_info_.has_nvmm;

    return true;
}

bool DrmCapture::captureFrame(CapturedFrame& frame) {
    if (drm_fd_ < 0 || !mapped_buffer_) {
        return false;
    }

    // On DRM, the framebuffer is memory-mapped and continuously updated
    // by the display controller. We just read the current state.
    frame.gpu_ptr      = mapped_buffer_;
    frame.width        = buffer_width_;
    frame.height       = buffer_height_;
    frame.pitch        = buffer_pitch_;
    frame.format       = FrameFormat::BGRA8;  // DRM typically provides XRGB8888
    frame.is_new_frame = true;  // TODO: compare with previous frame hash for skip

    // Timestamp from steady clock
    auto now = std::chrono::steady_clock::now();
    frame.timestamp_us = static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::microseconds>(now.time_since_epoch()).count()
    );

    return true;
}

void DrmCapture::release() {
    if (mapped_buffer_) {
        munmap(mapped_buffer_, buffer_height_ * buffer_pitch_);
        mapped_buffer_ = nullptr;
    }

    if (drm_fd_ >= 0) {
        close(drm_fd_);
        drm_fd_ = -1;
    }

    crtc_id_ = 0;
    connector_id_ = 0;
    fb_id_ = 0;
    buffer_width_ = 0;
    buffer_height_ = 0;
    buffer_pitch_ = 0;
}

std::string DrmCapture::getName() const {
    return "DRM/KMS (" + platform_info_.soc + ")";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

bool DrmCapture::openDrmDevice(int gpu_index) {
    // Try common DRM device paths on Jetson
    const char* drm_paths[] = {
        "/dev/dri/card0",
        "/dev/dri/card1",
        "/dev/dri/renderD128",
    };

    int target = gpu_index < 3 ? gpu_index : 0;
    drm_fd_ = open(drm_paths[target], O_RDWR | O_CLOEXEC);
    if (drm_fd_ < 0) {
        // Try each path
        for (const char* path : drm_paths) {
            drm_fd_ = open(path, O_RDWR | O_CLOEXEC);
            if (drm_fd_ >= 0) break;
        }
    }

    return drm_fd_ >= 0;
}

bool DrmCapture::setupCrtc() {
    drmModeRes* resources = drmModeGetResources(drm_fd_);
    if (!resources) {
        return false;
    }

    // Find the first connected connector
    drmModeConnector* connector = nullptr;
    for (int i = 0; i < resources->count_connectors; ++i) {
        connector = drmModeGetConnector(drm_fd_, resources->connectors[i]);
        if (connector && connector->connection == DRM_MODE_CONNECTED) {
            connector_id_ = connector->connector_id;
            break;
        }
        if (connector) {
            drmModeFreeConnector(connector);
            connector = nullptr;
        }
    }

    if (!connector) {
        drmModeFreeResources(resources);
        return false;
    }

    // Get the encoder and CRTC
    drmModeEncoder* encoder = nullptr;
    if (connector->encoder_id) {
        encoder = drmModeGetEncoder(drm_fd_, connector->encoder_id);
    }

    if (encoder) {
        crtc_id_ = encoder->crtc_id;
        drmModeFreeEncoder(encoder);
    }

    // Get the current framebuffer from the CRTC
    if (crtc_id_) {
        drmModeCrtc* crtc = drmModeGetCrtc(drm_fd_, crtc_id_);
        if (crtc) {
            fb_id_ = crtc->buffer_id;
            buffer_width_ = crtc->width;
            buffer_height_ = crtc->height;
            drmModeFreeCrtc(crtc);
        }
    }

    drmModeFreeConnector(connector);
    drmModeFreeResources(resources);

    return crtc_id_ != 0 && fb_id_ != 0;
}

bool DrmCapture::mapFramebuffer() {
    if (fb_id_ == 0) return false;

    drmModeFB* fb = drmModeGetFB(drm_fd_, fb_id_);
    if (!fb) return false;

    buffer_pitch_ = fb->pitch;

    // Create a dumb buffer map to read the framebuffer
    struct drm_mode_map_dumb map_req = {};
    map_req.handle = fb->handle;

    if (drmIoctl(drm_fd_, DRM_IOCTL_MODE_MAP_DUMB, &map_req) != 0) {
        drmModeFreeFB(fb);
        return false;
    }

    size_t map_size = static_cast<size_t>(buffer_height_) * buffer_pitch_;
    mapped_buffer_ = mmap(nullptr, map_size, PROT_READ, MAP_SHARED, drm_fd_, map_req.offset);

    drmModeFreeFB(fb);

    if (mapped_buffer_ == MAP_FAILED) {
        mapped_buffer_ = nullptr;
        return false;
    }

    return true;
}

} // namespace cs::host

#endif // __aarch64__
#endif // __linux__
