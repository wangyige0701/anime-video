// hls_napi.cpp

#include <hls_napi.h>
#include <hls_ts_worker.h>

Napi::Object HlsNapi::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "Hls", {
        InstanceMethod("m3u8", &HlsNapi::m3u8),
        InstanceMethod("ts", &HlsNapi::ts),
    });

    exports.Set("Hls", ctor);
    return exports;
}

HlsNapi::HlsNapi(const Napi::CallbackInfo& info) : Napi::ObjectWrap<HlsNapi>(info) {
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(info.Env(), "Expected a string for file path").ThrowAsJavaScriptException();
        return;
    }

    if (info.Length() == 2 && !info[1].IsNumber()) {
        Napi::TypeError::New(info.Env(), "Expected a number for target duration").ThrowAsJavaScriptException();
        return;
    }

    Napi::Env env = info.Env();

    // 视频路径
    Napi::String inputPath = info[0].As<Napi::String>();
    std::string path = inputPath.Utf8Value();

    // 切片时长
    Napi::Number targetDuration = info.Length() > 1 ? info[1].As<Napi::Number>() : Napi::Number::New(env, 2);
    int64_t duration = targetDuration.Int64Value();

    hls = std::make_unique<Hls>(path, static_cast<int>(duration));
}

HlsNapi::~HlsNapi() {
    hls.reset();
}

Napi::Value HlsNapi::m3u8(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::vector<uint8_t> buffer = hls->m3u8();

    if (buffer.empty()) {
        return env.Null();
    }

    return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), buffer.size());
}

Napi::Value HlsNapi::ts(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected a number for segment index").ThrowAsJavaScriptException();
        return env.Null();
    }

    int index = info[0].As<Napi::Number>().Int32Value();

    auto deferred = Napi::Promise::Deferred::New(env);

    auto worker = new TsWorker(env, hls.get(), index, deferred);
    worker->Queue();

    return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return HlsNapi::Init(env, exports);
}

NODE_API_MODULE(hls, Init)
