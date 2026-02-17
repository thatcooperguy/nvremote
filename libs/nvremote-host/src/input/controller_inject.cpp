///////////////////////////////////////////////////////////////////////////////
// controller_inject.cpp -- Virtual controller injection via ViGEmBus
//
// Uses the ViGEmBus C API to create virtual Xbox 360 controllers.
// Maps ControllerPacket fields directly to XUSB_REPORT.
//
// ViGEmBus is loaded dynamically (LoadLibrary) so the host binary
// works even without ViGEm installed — it just logs a warning.
///////////////////////////////////////////////////////////////////////////////

#include "controller_inject.h"

#include <cs/common.h>

#ifdef _WIN32
// ViGEmBus C API
// We load these dynamically to avoid a hard dependency.
#include <windows.h>

// ViGEm types (from ViGEmBus SDK headers)
// We define minimal types here to avoid requiring the SDK at compile time.
// The actual ViGEm functions are loaded via GetProcAddress.

typedef void* PVIGEM_CLIENT;
typedef void* PVIGEM_TARGET;

typedef struct _XUSB_REPORT {
    USHORT wButtons;
    BYTE   bLeftTrigger;
    BYTE   bRightTrigger;
    SHORT  sThumbLX;
    SHORT  sThumbLY;
    SHORT  sThumbRX;
    SHORT  sThumbRY;
} XUSB_REPORT;

// ViGEm error codes
typedef ULONG VIGEM_ERROR;
#define VIGEM_ERROR_NONE              0x20000000
#define VIGEM_ERROR_BUS_NOT_FOUND     0xE0000001
#define VIGEM_ERROR_NO_FREE_SLOT      0xE0000002

// Function pointer types
typedef PVIGEM_CLIENT  (WINAPI* pfn_vigem_alloc)(void);
typedef void           (WINAPI* pfn_vigem_free)(PVIGEM_CLIENT);
typedef VIGEM_ERROR    (WINAPI* pfn_vigem_connect)(PVIGEM_CLIENT);
typedef void           (WINAPI* pfn_vigem_disconnect)(PVIGEM_CLIENT);
typedef PVIGEM_TARGET  (WINAPI* pfn_vigem_target_x360_alloc)(void);
typedef void           (WINAPI* pfn_vigem_target_free)(PVIGEM_TARGET);
typedef VIGEM_ERROR    (WINAPI* pfn_vigem_target_add)(PVIGEM_CLIENT, PVIGEM_TARGET);
typedef VIGEM_ERROR    (WINAPI* pfn_vigem_target_remove)(PVIGEM_CLIENT, PVIGEM_TARGET);
typedef VIGEM_ERROR    (WINAPI* pfn_vigem_target_x360_update)(PVIGEM_CLIENT, PVIGEM_TARGET, XUSB_REPORT);

// Dynamically loaded function pointers
static HMODULE g_vigem_module = nullptr;
static pfn_vigem_alloc            g_vigem_alloc = nullptr;
static pfn_vigem_free             g_vigem_free = nullptr;
static pfn_vigem_connect          g_vigem_connect = nullptr;
static pfn_vigem_disconnect       g_vigem_disconnect = nullptr;
static pfn_vigem_target_x360_alloc g_vigem_target_x360_alloc = nullptr;
static pfn_vigem_target_free      g_vigem_target_free = nullptr;
static pfn_vigem_target_add       g_vigem_target_add = nullptr;
static pfn_vigem_target_remove    g_vigem_target_remove = nullptr;
static pfn_vigem_target_x360_update g_vigem_target_x360_update = nullptr;

static bool loadViGEm() {
    if (g_vigem_module) return true;

    g_vigem_module = LoadLibraryA("ViGEmClient.dll");
    if (!g_vigem_module) {
        return false;
    }

    #define LOAD_FN(name) \
        g_##name = reinterpret_cast<pfn_##name>(GetProcAddress(g_vigem_module, #name)); \
        if (!g_##name) { FreeLibrary(g_vigem_module); g_vigem_module = nullptr; return false; }

    LOAD_FN(vigem_alloc);
    LOAD_FN(vigem_free);
    LOAD_FN(vigem_connect);
    LOAD_FN(vigem_disconnect);
    LOAD_FN(vigem_target_x360_alloc);
    LOAD_FN(vigem_target_free);
    LOAD_FN(vigem_target_add);
    LOAD_FN(vigem_target_remove);
    LOAD_FN(vigem_target_x360_update);

    #undef LOAD_FN
    return true;
}

#endif // _WIN32

namespace cs::host {

ControllerInjector::ControllerInjector() = default;

ControllerInjector::~ControllerInjector() {
    release();
}

bool ControllerInjector::initialize() {
#ifdef _WIN32
    std::lock_guard<std::mutex> lock(mutex_);

    if (!loadViGEm()) {
        CS_LOG(WARN, "ViGEmBus not installed — controller forwarding disabled. "
                     "Install ViGEmBus from https://github.com/nefarius/ViGEmBus/releases");
        available_ = false;
        return false;
    }

    client_ = g_vigem_alloc();
    if (!client_) {
        CS_LOG(ERR, "ViGEm: vigem_alloc failed");
        available_ = false;
        return false;
    }

    VIGEM_ERROR err = g_vigem_connect(static_cast<PVIGEM_CLIENT>(client_));
    if (err != VIGEM_ERROR_NONE) {
        CS_LOG(WARN, "ViGEm: vigem_connect failed (error=0x%08X) — is ViGEmBus installed?", err);
        g_vigem_free(static_cast<PVIGEM_CLIENT>(client_));
        client_ = nullptr;
        available_ = false;
        return false;
    }

    available_ = true;
    CS_LOG(INFO, "ViGEm: connected to ViGEmBus, controller injection ready");
    return true;
#else
    CS_LOG(WARN, "Controller injection only supported on Windows (ViGEmBus)");
    return false;
#endif
}

bool ControllerInjector::createController(uint8_t index) {
#ifdef _WIN32
    if (index >= 4 || !client_) return false;

    if (targets_[index]) return true;  // Already created

    PVIGEM_TARGET target = g_vigem_target_x360_alloc();
    if (!target) {
        CS_LOG(ERR, "ViGEm: vigem_target_x360_alloc failed for slot %u", index);
        return false;
    }

    VIGEM_ERROR err = g_vigem_target_add(
        static_cast<PVIGEM_CLIENT>(client_), target);
    if (err != VIGEM_ERROR_NONE) {
        CS_LOG(ERR, "ViGEm: vigem_target_add failed for slot %u (error=0x%08X)", index, err);
        g_vigem_target_free(target);
        return false;
    }

    targets_[index] = target;
    CS_LOG(INFO, "ViGEm: virtual X360 controller created (slot %u)", index);
    return true;
#else
    (void)index;
    return false;
#endif
}

void ControllerInjector::inject(const cs::ControllerPacket& pkt) {
#ifdef _WIN32
    std::lock_guard<std::mutex> lock(mutex_);

    if (!available_ || !client_) return;

    uint8_t idx = pkt.controller_id;
    if (idx >= 4) return;

    // Out-of-order detection (sequence wraps at 65536)
    if (seq_initialized_[idx]) {
        int16_t diff = static_cast<int16_t>(pkt.sequence - last_seq_[idx]);
        if (diff <= 0) return;  // Old or duplicate packet
    }
    last_seq_[idx] = pkt.sequence;
    seq_initialized_[idx] = true;

    // Create virtual controller on first use
    if (!targets_[idx]) {
        if (!createController(idx)) return;
    }

    // Map ControllerPacket to XUSB_REPORT
    XUSB_REPORT report = {};
    report.wButtons      = pkt.buttons;
    report.bLeftTrigger  = pkt.left_trigger;
    report.bRightTrigger = pkt.right_trigger;
    report.sThumbLX      = pkt.thumb_lx;
    report.sThumbLY      = pkt.thumb_ly;
    report.sThumbRX      = pkt.thumb_rx;
    report.sThumbRY      = pkt.thumb_ry;

    VIGEM_ERROR err = g_vigem_target_x360_update(
        static_cast<PVIGEM_CLIENT>(client_),
        static_cast<PVIGEM_TARGET>(targets_[idx]),
        report);

    if (err != VIGEM_ERROR_NONE) {
        CS_LOG(WARN, "ViGEm: update failed for slot %u (error=0x%08X)", idx, err);
    }
#else
    (void)pkt;
#endif
}

void ControllerInjector::release() {
#ifdef _WIN32
    std::lock_guard<std::mutex> lock(mutex_);

    if (client_) {
        for (int i = 0; i < 4; i++) {
            if (targets_[i]) {
                g_vigem_target_remove(
                    static_cast<PVIGEM_CLIENT>(client_),
                    static_cast<PVIGEM_TARGET>(targets_[i]));
                g_vigem_target_free(static_cast<PVIGEM_TARGET>(targets_[i]));
                targets_[i] = nullptr;
            }
        }

        g_vigem_disconnect(static_cast<PVIGEM_CLIENT>(client_));
        g_vigem_free(static_cast<PVIGEM_CLIENT>(client_));
        client_ = nullptr;
    }

    available_ = false;
    CS_LOG(INFO, "ViGEm: released all virtual controllers");
#endif
}

} // namespace cs::host
