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
    inputPath = options.Get("path").As<Napi::String>();

    if (options.Has("seek")) {
        seekSeconds = options.Get("seek").As<Napi::Number>();
    }

    if (options.Has("write")) {
        writeFunc = options.Get("write").As<Napi::Function>();
    } else {
        writeFunc = Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
            return info.Env().Undefined();
        });
    }

    if (options.Has("end")) {
        endFunc = options.Get("end").As<Napi::Function>();
    } else {
        endFunc = Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
            return info.Env().Undefined();
        });
    }
}

RemuxNapi::~RemuxNapi() {
}

Napi::Value RemuxNapi::start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (remux) {
        Napi::TypeError::New(env, "Already started").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto* resp = createJsHttpResponse(env, writeFunc, endFunc);
    remux = new Remux(inputPath.Utf8Value(), resp);

    createWorker();

    return env.Undefined();
}

Napi::Value RemuxNapi::stop(const Napi::CallbackInfo& info) {
    if (worker.joinable()) {
        worker.join();
    }
    return info.Env().Undefined();
}

Napi::Value RemuxNapi::seek(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Seek time in seconds expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    seekSeconds = info[0].As<Napi::Number>();
    double newSeek = seekSeconds.DoubleValue();

    // 停止当前 remux
    if (remux) {
        remux->stop();
    }

    // 等 worker 退出
    if (worker.joinable()) {
        worker.join();
    }

    // 销毁旧实例
    delete remux;
    remux = nullptr;

    // 创建新的 remux
    auto* resp = createJsHttpResponse(env, writeFunc, endFunc);
    remux = new Remux(inputPath.Utf8Value(), resp);

    // 重新启动 worker
    createWorker();

    return env.Undefined();
}

void RemuxNapi::createWorker() {
    double seek = seekSeconds.DoubleValue();
    worker = std::thread([this, seek]() {
        try {
            remux->open(seek);
            remux->stream();
        } catch (const std::exception& e) {
        }
    });
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return RemuxNapi::Init(env, exports);
}

NODE_API_MODULE(remux, Init)
