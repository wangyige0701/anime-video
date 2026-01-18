// JsHttpResponse.cpp

#include <JsHttpResponse.h>

JsHttpResponse::JsHttpResponse(
    Napi::Env env,
    const Napi::Function& writeFunc,
    const Napi::Function& endFunc
) {
    writeFn = Napi::ThreadSafeFunction::New(env, writeFunc, "writeFn", 0, 1);
    endFn = Napi::ThreadSafeFunction::New(env, endFunc, "endFn", 0, 1);
}

JsHttpResponse::~JsHttpResponse() {
}

void JsHttpResponse::write(const uint8_t* data, size_t size) {
    auto copy = new std::vector<uint8_t>(data, data + size);

    writeFn.BlockingCall(copy, [](Napi::Env env, Napi::Function callback, std::vector<uint8_t>* buf) {
        auto jsBuf = Napi::Buffer<uint8_t>::Copy(env, buf->data(), buf->size());
        callback.Call({ jsBuf });
        delete buf;
    });
}

void JsHttpResponse::end() {
    endFn.BlockingCall([](Napi::Env env, Napi::Function callback) {
        callback.Call({});
    });
}
