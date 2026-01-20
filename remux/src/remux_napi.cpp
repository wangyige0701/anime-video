// remux_napi.cpp

#include <string>
#include <remux_napi.h>

Napi::Object RemuxNapi::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "Remux", {
            InstanceMethod("start", &RemuxNapi::start),
            InstanceMethod("seek", &RemuxNapi::seek),
            InstanceMethod("stop", &RemuxNapi::stop),
        });

    exports.Set("Remux", ctor);
    return exports;
}

RemuxNapi::RemuxNapi(const Napi::CallbackInfo& info) : Napi::ObjectWrap<RemuxNapi>(info) {
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(info.Env(), "Options object expected").ThrowAsJavaScriptException();
        return;
    }

    Napi::Env env = info.Env();
    Napi::Object options = info[0].As<Napi::Object>();

    if (!options.Has("path")) {
        Napi::TypeError::New(env, "Path is required").ThrowAsJavaScriptException();
        return;
    }
    inputPath = options.Get("path").As<Napi::String>().Utf8Value();

    if (options.Has("seek")) {
        seekSeconds = options.Get("seek").As<Napi::Number>().DoubleValue();
    }

    if (!options.Has("write")) {
        Napi::TypeError::New(env, "Write function is required").ThrowAsJavaScriptException();
        return;
    }
    Napi::Function writeFunc = options.Get("write").As<Napi::Function>();

    if (!options.Has("end")) {
        Napi::TypeError::New(env, "End function is required").ThrowAsJavaScriptException();
        return;
    }
    Napi::Function endFunc = options.Get("end").As<Napi::Function>();

    response = std::make_unique<JsHttpResponse>(env, writeFunc, endFunc);
}

RemuxNapi::~RemuxNapi() {
    if (remux) {
        remux->stop();
    }
    if (worker.joinable()) {
        worker.join();
    }
    remux.reset();
    response.reset();
}

Napi::Value RemuxNapi::start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (remux) {
        Napi::TypeError::New(env, "Already started").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    remux = std::make_unique<Remux>(inputPath, response.get());
    createWorker();

    return env.Undefined();
}

Napi::Value RemuxNapi::stop(const Napi::CallbackInfo& info) {
    if (remux) {
        remux->stop();
    }
    if (worker.joinable()) {
        worker.join();
    }
    remux.reset();
    return info.Env().Undefined();
}

Napi::Value RemuxNapi::seek(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Seek time in seconds expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    seekSeconds = info[0].As<Napi::Number>().DoubleValue();

    // 停止当前 remux
    if (remux) {
        remux->stop();
    }

    // 等 worker 退出
    if (worker.joinable()) {
        worker.join();
    }

    // 销毁旧实例
    remux.reset();

    // 创建新的 remux
    remux = std::make_unique<Remux>(inputPath, response.get());
    // 重新启动 worker
    createWorker();

    return env.Undefined();
}

void RemuxNapi::createWorker() {
    double seek = seekSeconds;
    worker = std::thread([this, seek]() {
        try {
            remux->open(seekSeconds);
            remux->stream();
        } catch (const std::exception& e) {
        }
    });
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return RemuxNapi::Init(env, exports);
}

NODE_API_MODULE(remux, Init)
