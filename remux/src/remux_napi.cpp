// remux_napi.cpp

#include <string>
#include <remux_napi.h>
#include <JsHttpResponse.h>

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

    if (remux != nullptr) {
        Napi::TypeError::New(info.Env(), "Already started").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    remux = new Remux(std::string(inputPath.Utf8Value()), RemuxNapi::createJsHttpResponse(env, writeFunc, endFunc));
    remux->open(seekSeconds.DoubleValue());
    remux->stream();

    return env.Undefined();
}

Napi::Value RemuxNapi::seek(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Seek time in seconds expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    seekSeconds = info[0].As<Napi::Number>();

    return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return RemuxNapi::Init(env, exports);
}

NODE_API_MODULE(remux, Init)
