// File: src/streamer_ref.h

#pragma once
#include <atomic>
#include "streamer_capi.h"

struct StreamerRef {
    StreamerHandle handle = nullptr;
    std::atomic<int> refCount{ 0 };
    std::atomic<bool> closing{ false };
};

