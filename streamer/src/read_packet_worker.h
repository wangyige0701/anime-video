#pragma once
#include <napi.h>
#include "streamer_capi.h"
#include "streamer_ref.h"

class ReadPacketWorker : public Napi::AsyncWorker {
public:
    ReadPacketWorker(StreamerRef* ref, Napi::Env env, Napi::Promise::Deferred deferred);

    void Execute() override;

    void OnOK() override;

    void OnError(const Napi::Error& e) override;

private:
    StreamerHandle handle_;
    Napi::Promise::Deferred deferred_;

    MediaPacketC pkt_;
    std::vector<uint8_t> buffer_;

    int ret_;

    StreamerRef* ref_;
};
