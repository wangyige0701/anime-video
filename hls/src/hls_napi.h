// hls_napi.h

#pragma once

#include <napi.h>
#include <Hls.h>

class HlsNapi : public Napi::ObjectWrap<HlsNapi> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);

    HlsNapi(const Napi::CallbackInfo& info);
    ~HlsNapi();

private:
    std::unique_ptr<Hls> hls;

    Napi::Value m3u8(const Napi::CallbackInfo& info);
    Napi::Value ts(const Napi::CallbackInfo& info);
};
