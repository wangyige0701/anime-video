// File: src/streamer_napi.cpp

#include "streamer_napi.h"
#include "read_packet_worker.h"

Napi::Object StreamerWrap::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "Streamer", {
            InstanceMethod("open", &StreamerWrap::Open),
            InstanceMethod("readPacket", &StreamerWrap::ReadPacket),
            InstanceMethod("seek", &StreamerWrap::Seek),
            InstanceMethod("close", &StreamerWrap::Close),
        });

    exports.Set("Streamer", ctor);
    return exports;
}

StreamerWrap::StreamerWrap(const Napi::CallbackInfo& info) : Napi::ObjectWrap<StreamerWrap>(info) {

}

StreamerWrap::~StreamerWrap() {
    printf("~StreamerWrap called\n");
    if (ref_) {
        ref_->closing = true;
        if (ref_->refCount == 0) {
            streamer_close(ref_->handle);
            streamer_destroy(ref_->handle);
            delete ref_;
        }
    }
}

Napi::Value StreamerWrap::Open(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "path required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string path = info[0].As<Napi::String>().Utf8Value();

    if (ref_) {
        ref_->closing = true;
        if (ref_->refCount == 0) {
            streamer_destroy(ref_->handle);
            delete ref_;
        }
        ref_ = nullptr;
    }

    ref_ = new StreamerRef();
    ref_->handle = streamer_create();

    int ret = streamer_open(ref_->handle, path.c_str());
    if (ret < 0) {
        streamer_destroy(ref_->handle);
        delete ref_;
        ref_ = nullptr;
        Napi::Error::New(env, "failed to open streamer").ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}

Napi::Value StreamerWrap::ReadPacket(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!ref_ || ref_->closing) {
        Napi::Error::New(env, "streamer is closing").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (!ref_->handle) {
        Napi::Error::New(env, "streamer not opened").ThrowAsJavaScriptException();
        return env.Null();
    }

    auto deferred = Napi::Promise::Deferred::New(env);

    auto* worker = new ReadPacketWorker(
        ref_,
        env,
        deferred
    );

    worker->Queue();
    return deferred.Promise();
}

Napi::Value StreamerWrap::Seek(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "timestamp, streamIndex required")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless = false;
    int64_t timestamp =
        info[0].As<Napi::BigInt>().Int64Value(&lossless);

    int streamIndex = info[1].As<Napi::Number>().Int32Value();

    int ret = streamer_seek(ref_->handle, timestamp, streamIndex);
    return Napi::Number::New(env, ret);
}

Napi::Value StreamerWrap::Close(const Napi::CallbackInfo& info) {
    if (ref_) {
        ref_->closing = true;

        if (ref_->refCount == 0) {
            streamer_destroy(ref_->handle);
            delete ref_;
        }

        ref_ = nullptr;
    }
    return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return StreamerWrap::Init(env, exports);
}

NODE_API_MODULE(streamer, Init)
