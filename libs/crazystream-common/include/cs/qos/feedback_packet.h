////////////////////////////////////////////////////////////////////////////////
// CrazyStream — QoS Feedback Packet Helpers
//
// Provides serialize/deserialize for the QoS feedback sent from client to host
// every ~200ms. The host QoS controller uses this to adapt encode parameters.
////////////////////////////////////////////////////////////////////////////////

#pragma once

#include "cs/transport/packet.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>

namespace cs {

// Maximum NACKs we can fit in the base feedback packet
static constexpr size_t QOS_FEEDBACK_BASE_NACKS = 2;

// Extended NACK packet can carry more (sent separately if needed)
static constexpr size_t QOS_FEEDBACK_EXT_MAX_NACKS = 64;

struct QosFeedback {
    uint16_t last_seq_received    = 0;
    uint32_t estimated_bw_kbps   = 0;
    uint16_t packet_loss_x100    = 0;     // e.g. 250 = 2.50%
    uint16_t avg_jitter_us       = 0;
    int32_t  delay_gradient_us   = 0;     // signed — positive = increasing delay
    std::vector<uint16_t> nack_seqs;      // Sequence numbers to retransmit

    // Current client-side stats for display
    uint32_t decode_time_us      = 0;
    uint32_t render_time_us      = 0;
    uint32_t frames_decoded      = 0;
    uint32_t frames_dropped      = 0;

    // ------------------------------------------------------------------
    // Serialize to wire format (20 bytes base + optional extended NACKs)
    // ------------------------------------------------------------------
    std::vector<uint8_t> serialize() const {
        QosFeedbackPacket pkt{};
        pkt.type                  = static_cast<uint8_t>(PacketType::QOS_FEEDBACK);
        pkt.flags                 = 0;
        pkt.last_seq_received     = last_seq_received;
        pkt.estimated_bw_kbps    = estimated_bw_kbps;
        pkt.packet_loss_x100     = packet_loss_x100;
        pkt.avg_jitter_us        = avg_jitter_us;
        pkt.delay_gradient_us    = delay_gradient_us;

        uint16_t nack_n = static_cast<uint16_t>(std::min(nack_seqs.size(),
                                                          QOS_FEEDBACK_EXT_MAX_NACKS));
        pkt.nack_count = nack_n;

        // First 2 NACKs fit in the base packet
        if (nack_seqs.size() > 0) pkt.nack_seq_0 = nack_seqs[0];
        if (nack_seqs.size() > 1) pkt.nack_seq_1 = nack_seqs[1];

        // Base packet
        std::vector<uint8_t> buf(sizeof(QosFeedbackPacket));
        std::memcpy(buf.data(), &pkt, sizeof(pkt));

        // Extended NACKs (if more than 2)
        if (nack_n > QOS_FEEDBACK_BASE_NACKS) {
            size_t extra = nack_n - QOS_FEEDBACK_BASE_NACKS;
            size_t ext_size = extra * sizeof(uint16_t);
            buf.resize(sizeof(QosFeedbackPacket) + ext_size);
            for (size_t i = 0; i < extra; ++i) {
                uint16_t seq = nack_seqs[i + QOS_FEEDBACK_BASE_NACKS];
                std::memcpy(buf.data() + sizeof(QosFeedbackPacket) + i * 2, &seq, 2);
            }
        }

        return buf;
    }

    // ------------------------------------------------------------------
    // Deserialize from wire format
    // ------------------------------------------------------------------
    static QosFeedback deserialize(const uint8_t* data, size_t len) {
        QosFeedback fb{};

        if (len < sizeof(QosFeedbackPacket)) return fb;

        QosFeedbackPacket pkt{};
        std::memcpy(&pkt, data, sizeof(pkt));

        fb.last_seq_received  = pkt.last_seq_received;
        fb.estimated_bw_kbps = pkt.estimated_bw_kbps;
        fb.packet_loss_x100  = pkt.packet_loss_x100;
        fb.avg_jitter_us     = pkt.avg_jitter_us;
        fb.delay_gradient_us = pkt.delay_gradient_us;

        // Base NACKs
        if (pkt.nack_count > 0) fb.nack_seqs.push_back(pkt.nack_seq_0);
        if (pkt.nack_count > 1) fb.nack_seqs.push_back(pkt.nack_seq_1);

        // Extended NACKs
        if (pkt.nack_count > QOS_FEEDBACK_BASE_NACKS) {
            size_t extra = std::min(
                static_cast<size_t>(pkt.nack_count - QOS_FEEDBACK_BASE_NACKS),
                (len - sizeof(QosFeedbackPacket)) / sizeof(uint16_t)
            );
            for (size_t i = 0; i < extra; ++i) {
                uint16_t seq = 0;
                std::memcpy(&seq, data + sizeof(QosFeedbackPacket) + i * 2, 2);
                fb.nack_seqs.push_back(seq);
            }
        }

        return fb;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    float getPacketLossPercent() const {
        return static_cast<float>(packet_loss_x100) / 100.0f;
    }

    float getJitterMs() const {
        return static_cast<float>(avg_jitter_us) / 1000.0f;
    }

    float getDelayGradientMs() const {
        return static_cast<float>(delay_gradient_us) / 1000.0f;
    }

    // ------------------------------------------------------------------
    // Human-readable summary for logging / debugging
    // ------------------------------------------------------------------
    std::string toString() const {
        char buf[256];
        std::snprintf(buf, sizeof(buf),
                      "QoS{seq=%u bw=%ukbps loss=%.2f%% jitter=%uus "
                      "delay_grad=%dus nacks=%zu}",
                      last_seq_received,
                      estimated_bw_kbps,
                      packet_loss_x100 / 100.0,
                      avg_jitter_us,
                      delay_gradient_us,
                      nack_seqs.size());
        return buf;
    }
};

} // namespace cs
