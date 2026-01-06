#pragma once
#include <napi.h>
#include "streamer_capi.h"
#include "streamer_ref.h"

class StreamerWrap : public Napi::ObjectWrap<StreamerWrap> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    StreamerWrap(const Napi::CallbackInfo& info);
    ~StreamerWrap();

private:
    Napi::Value Open(const Napi::CallbackInfo& info);
    Napi::Value Close(const Napi::CallbackInfo& info);
    Napi::Value ReadPacket(const Napi::CallbackInfo& info);
    Napi::Value Seek(const Napi::CallbackInfo& info);

    StreamerHandle handle_{ nullptr };

    StreamerRef* ref_ = nullptr;
};
