///////////////////////////////////////////////////////////////////////////////
// jetson_encoder.cpp -- NVIDIA Multimedia API encoder for Jetson/Orin/DGX
//
// Implementation of the Jetson hardware encoder using V4L2 / NVMM.
// This file is only compiled on Linux ARM64 targets (aarch64).
///////////////////////////////////////////////////////////////////////////////

#ifdef __linux__
#ifdef __aarch64__

#include "jetson_encoder.h"

#include <cstring>
#include <fstream>
#include <chrono>
#include <algorithm>

// Linux / V4L2 headers
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <linux/videodev2.h>

namespace cs::host {

// ---------------------------------------------------------------------------
// V4L2 codec format mapping
// ---------------------------------------------------------------------------

uint32_t JetsonEncoder::codecToV4l2Format(CodecType codec) {
    switch (codec) {
        case CodecType::H264: return V4L2_PIX_FMT_H264;
        case CodecType::HEVC: return V4L2_PIX_FMT_HEVC;
        case CodecType::AV1:  return 0;  // AV1 V4L2 format varies by kernel version
    }
    return V4L2_PIX_FMT_H264;
}

// ---------------------------------------------------------------------------
// Constructor / Destructor
// ---------------------------------------------------------------------------

JetsonEncoder::JetsonEncoder() = default;

JetsonEncoder::~JetsonEncoder() {
    release();
}

// ---------------------------------------------------------------------------
// IEncoder interface
// ---------------------------------------------------------------------------

bool JetsonEncoder::initialize(const EncoderConfig& config) {
    JetsonEncoderConfig jetson_config;
    static_cast<EncoderConfig&>(jetson_config) = config;
    return initializeJetson(jetson_config);
}

bool JetsonEncoder::initializeJetson(const JetsonEncoderConfig& config) {
    if (initialized_) {
        release();
    }

    config_ = config;
    platform_info_ = detectJetsonPlatform();
    nvmm_enabled_ = config.use_nvmm && platform_info_.has_nvmm;

    // Adapt encoder settings based on power mode and thermals
    if (config.power_aware) {
        adaptForPowerMode(config_);
    }

    if (!openEncoderDevice()) {
        return false;
    }

    if (!configureV4l2Encoder()) {
        release();
        return false;
    }

    if (nvmm_enabled_) {
        if (!allocateNvmmBuffers()) {
            // Non-fatal: fall back to CPU buffer path
            nvmm_enabled_ = false;
        }
    }

    // Open thermal zone for monitoring
    thermal_zone_fd_ = open("/sys/class/thermal/thermal_zone0/temp", O_RDONLY);

    frame_counter_ = 0;
    initialized_ = true;
    return true;
}

bool JetsonEncoder::encode(const CapturedFrame& frame, EncodedPacket& packet) {
    if (!initialized_ || encoder_fd_ < 0) {
        return false;
    }

    // Check thermal throttling
    if (isThermalThrottled()) {
        // Reduce quality to prevent thermal shutdown
        EncoderConfig throttled = config_;
        adaptForThermal(throttled);
        reconfigure(throttled);
    }

    // Queue the input buffer (capture frame → V4L2 output plane)
    struct v4l2_buffer buf_out = {};
    buf_out.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    buf_out.memory = nvmm_enabled_ ? V4L2_MEMORY_DMABUF : V4L2_MEMORY_MMAP;
    buf_out.index = frame_counter_ % 4;  // Circular buffer (4 buffers)

    struct v4l2_plane planes_out[1] = {};
    buf_out.m.planes = planes_out;
    buf_out.length = 1;

    if (nvmm_enabled_ && frame.gpu_ptr) {
        // NVMM zero-copy: pass the DMABUF fd directly
        // In a real implementation, frame.gpu_ptr would be an NvBufSurface*
        // and we'd extract the DMABUF fd from it.
        planes_out[0].m.fd = -1;  // TODO: Extract DMABUF fd from NVMM surface
        planes_out[0].bytesused = frame.height * frame.pitch;
    } else {
        // CPU copy path: memcpy frame data into V4L2 mmap buffer
        planes_out[0].bytesused = frame.height * frame.pitch;
    }

    // Handle force IDR request
    if (force_idr_.exchange(false)) {
        struct v4l2_control ctrl = {};
        ctrl.id = V4L2_CID_MPEG_VIDEO_FORCE_KEY_FRAME;
        ctrl.value = 1;
        ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);
    }

    // Queue input buffer
    if (ioctl(encoder_fd_, VIDIOC_QBUF, &buf_out) < 0) {
        return false;
    }

    // Dequeue encoded output buffer (V4L2 capture plane)
    struct v4l2_buffer buf_cap = {};
    buf_cap.type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
    buf_cap.memory = V4L2_MEMORY_MMAP;

    struct v4l2_plane planes_cap[1] = {};
    buf_cap.m.planes = planes_cap;
    buf_cap.length = 1;

    if (ioctl(encoder_fd_, VIDIOC_DQBUF, &buf_cap) < 0) {
        return false;
    }

    // Copy encoded data to packet
    uint32_t encoded_size = planes_cap[0].bytesused;
    packet.data.resize(encoded_size);
    // In a real implementation, copy from the mmap'd capture buffer
    // memcpy(packet.data.data(), capture_buffers_[buf_cap.index], encoded_size);

    packet.timestamp_us = frame.timestamp_us;
    packet.frame_number = frame_counter_++;
    packet.codec = config_.codec;

    // Detect keyframe from V4L2 flags
    packet.is_keyframe = (buf_cap.flags & V4L2_BUF_FLAG_KEYFRAME) != 0;

    return true;
}

bool JetsonEncoder::reconfigure(const EncoderConfig& config) {
    if (!initialized_ || encoder_fd_ < 0) {
        return false;
    }

    // V4L2 supports dynamic bitrate changes without session restart
    struct v4l2_control ctrl = {};

    // Update bitrate
    if (config.bitrate_kbps != config_.bitrate_kbps) {
        ctrl.id = V4L2_CID_MPEG_VIDEO_BITRATE;
        ctrl.value = static_cast<int>(config.bitrate_kbps * 1000);
        ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);
    }

    // Update framerate
    if (config.fps != config_.fps) {
        struct v4l2_streamparm parm = {};
        parm.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
        parm.parm.output.timeperframe.numerator = 1;
        parm.parm.output.timeperframe.denominator = config.fps;
        ioctl(encoder_fd_, VIDIOC_S_PARM, &parm);
    }

    // Update GOP length
    if (config.gop_length != config_.gop_length) {
        ctrl.id = V4L2_CID_MPEG_VIDEO_GOP_SIZE;
        ctrl.value = static_cast<int>(config.gop_length);
        ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);
    }

    config_ = config;
    return true;
}

void JetsonEncoder::forceIdr() {
    force_idr_ = true;
}

void JetsonEncoder::flush() {
    if (encoder_fd_ >= 0) {
        // V4L2 stream off/on to flush pipeline
        int type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
        ioctl(encoder_fd_, VIDIOC_STREAMOFF, &type);
        ioctl(encoder_fd_, VIDIOC_STREAMON, &type);

        type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
        ioctl(encoder_fd_, VIDIOC_STREAMOFF, &type);
        ioctl(encoder_fd_, VIDIOC_STREAMON, &type);
    }
}

void JetsonEncoder::release() {
    if (encoder_fd_ >= 0) {
        int type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
        ioctl(encoder_fd_, VIDIOC_STREAMOFF, &type);
        type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
        ioctl(encoder_fd_, VIDIOC_STREAMOFF, &type);
        close(encoder_fd_);
        encoder_fd_ = -1;
    }

    if (thermal_zone_fd_ >= 0) {
        close(thermal_zone_fd_);
        thermal_zone_fd_ = -1;
    }

    initialized_ = false;
    frame_counter_ = 0;
}

std::string JetsonEncoder::getCodecName() const {
    return "Jetson " + std::string(codecTypeName(config_.codec)) + " (" + platform_info_.soc + ")";
}

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

std::vector<CodecType> JetsonEncoder::querySupportedCodecs() {
    JetsonPlatformInfo info = detectJetsonPlatform();
    std::vector<CodecType> codecs;

    // All Jetson platforms support H.264
    codecs.push_back(CodecType::H264);

    // Xavier and Orin support HEVC
    if (info.soc == "Xavier" || info.soc == "Orin" || info.soc == "Grace Blackwell") {
        codecs.push_back(CodecType::HEVC);
    }

    // DGX Spark (Grace Blackwell) supports AV1
    if (info.soc == "Grace Blackwell") {
        codecs.push_back(CodecType::AV1);
    }

    return codecs;
}

bool JetsonEncoder::isThermalThrottled() const {
    int temp = readThermalZone();
    return temp > thermal_throttle_temp_;
}

int JetsonEncoder::getEncoderUtilization() const {
    // Read encoder utilization from NVML or tegra sysfs
    std::ifstream f("/sys/devices/platform/host1x/15340000.vic/load");
    if (!f.is_open()) return 0;
    int load = 0;
    f >> load;
    return std::min(100, std::max(0, load));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

bool JetsonEncoder::openEncoderDevice() {
    // Try Jetson V4L2 encoder devices
    const char* encoder_paths[] = {
        "/dev/nvhost-msenc",   // Primary encoder on Jetson
        "/dev/video0",         // Fallback V4L2 path
        "/dev/video1",
    };

    for (const char* path : encoder_paths) {
        encoder_fd_ = open(path, O_RDWR | O_NONBLOCK);
        if (encoder_fd_ >= 0) {
            // Verify it's actually a video encoder
            struct v4l2_capability cap = {};
            if (ioctl(encoder_fd_, VIDIOC_QUERYCAP, &cap) == 0) {
                if (cap.capabilities & V4L2_CAP_VIDEO_M2M_MPLANE) {
                    return true;  // Found a M2M encoder
                }
            }
            close(encoder_fd_);
            encoder_fd_ = -1;
        }
    }

    return false;
}

bool JetsonEncoder::configureV4l2Encoder() {
    // Set output format (raw video input to encoder)
    struct v4l2_format fmt_out = {};
    fmt_out.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    fmt_out.fmt.pix_mp.width = config_.width;
    fmt_out.fmt.pix_mp.height = config_.height;
    fmt_out.fmt.pix_mp.pixelformat = V4L2_PIX_FMT_NV12M;  // NV12 multiplanar
    fmt_out.fmt.pix_mp.num_planes = 1;

    if (ioctl(encoder_fd_, VIDIOC_S_FMT, &fmt_out) < 0) {
        return false;
    }

    // Set capture format (encoded bitstream output)
    struct v4l2_format fmt_cap = {};
    fmt_cap.type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
    fmt_cap.fmt.pix_mp.pixelformat = codecToV4l2Format(config_.codec);
    fmt_cap.fmt.pix_mp.num_planes = 1;
    // Set a reasonable buffer size for encoded output
    fmt_cap.fmt.pix_mp.plane_fmt[0].sizeimage = config_.width * config_.height;

    if (ioctl(encoder_fd_, VIDIOC_S_FMT, &fmt_cap) < 0) {
        return false;
    }

    // Set encoder controls: bitrate, GOP, profile, etc.
    struct v4l2_control ctrl = {};

    // Bitrate
    ctrl.id = V4L2_CID_MPEG_VIDEO_BITRATE;
    ctrl.value = static_cast<int>(config_.bitrate_kbps * 1000);
    ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);

    // GOP size
    ctrl.id = V4L2_CID_MPEG_VIDEO_GOP_SIZE;
    ctrl.value = static_cast<int>(config_.gop_length);
    ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);

    // Rate control mode (VBR for streaming)
    ctrl.id = V4L2_CID_MPEG_VIDEO_BITRATE_MODE;
    ctrl.value = V4L2_MPEG_VIDEO_BITRATE_MODE_VBR;
    ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);

    // H.264 profile (High for better quality at same bitrate)
    if (config_.codec == CodecType::H264) {
        ctrl.id = V4L2_CID_MPEG_VIDEO_H264_PROFILE;
        ctrl.value = V4L2_MPEG_VIDEO_H264_PROFILE_HIGH;
        ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);

        ctrl.id = V4L2_CID_MPEG_VIDEO_H264_LEVEL;
        ctrl.value = V4L2_MPEG_VIDEO_H264_LEVEL_5_1;
        ioctl(encoder_fd_, VIDIOC_S_CTRL, &ctrl);
    }

    // Set framerate
    struct v4l2_streamparm parm = {};
    parm.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    parm.parm.output.timeperframe.numerator = 1;
    parm.parm.output.timeperframe.denominator = config_.fps;
    ioctl(encoder_fd_, VIDIOC_S_PARM, &parm);

    return true;
}

bool JetsonEncoder::allocateNvmmBuffers() {
    // Request V4L2 buffers with DMABUF memory type for NVMM zero-copy
    struct v4l2_requestbuffers req_out = {};
    req_out.count = 4;  // 4 buffer circular queue
    req_out.type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    req_out.memory = V4L2_MEMORY_DMABUF;

    if (ioctl(encoder_fd_, VIDIOC_REQBUFS, &req_out) < 0) {
        return false;
    }

    struct v4l2_requestbuffers req_cap = {};
    req_cap.count = 4;
    req_cap.type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
    req_cap.memory = V4L2_MEMORY_MMAP;

    if (ioctl(encoder_fd_, VIDIOC_REQBUFS, &req_cap) < 0) {
        return false;
    }

    // Start streaming on both planes
    int type = V4L2_BUF_TYPE_VIDEO_OUTPUT_MPLANE;
    if (ioctl(encoder_fd_, VIDIOC_STREAMON, &type) < 0) {
        return false;
    }

    type = V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE;
    if (ioctl(encoder_fd_, VIDIOC_STREAMON, &type) < 0) {
        return false;
    }

    return true;
}

int JetsonEncoder::readThermalZone() const {
    if (thermal_zone_fd_ < 0) return 0;

    char buf[16] = {};
    lseek(thermal_zone_fd_, 0, SEEK_SET);
    ssize_t n = read(thermal_zone_fd_, buf, sizeof(buf) - 1);
    if (n <= 0) return 0;

    return atoi(buf);  // Temperature in millidegrees Celsius
}

bool JetsonEncoder::adaptForThermal(EncoderConfig& config) {
    int temp = readThermalZone();
    if (temp <= 0) return false;

    // Progressive quality reduction as temperature rises
    if (temp > 90000) {
        // Critical: aggressive reduction
        config.bitrate_kbps = std::min(config.bitrate_kbps, config.min_bitrate_kbps);
        config.fps = std::min(config.fps, 30u);
    } else if (temp > thermal_throttle_temp_) {
        // Warning: moderate reduction
        config.bitrate_kbps = config.bitrate_kbps * 2 / 3;
        config.fps = std::min(config.fps, 60u);
    }

    return true;
}

bool JetsonEncoder::adaptForPowerMode(EncoderConfig& config) {
    // Read power mode and adjust encoder defaults
    // Lower power modes = lower encoder clock = reduce targets
    if (platform_info_.power_mode.find("10W") != std::string::npos ||
        platform_info_.power_mode.find("15W") != std::string::npos) {
        // Low-power mode: reduce defaults
        config.bitrate_kbps = std::min(config.bitrate_kbps, 15000u);  // Cap at 15 Mbps
        config.fps = std::min(config.fps, 60u);  // Cap at 60fps
    }
    // MAXN mode: no restrictions
    return true;
}

} // namespace cs::host

#endif // __aarch64__
#endif // __linux__
