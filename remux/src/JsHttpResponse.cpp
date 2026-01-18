// JsHttpResponse.cpp

#include <JsHttpResponse.h>

JsHttpResponse::JsHttpResponse(Napi::Env env, const Napi::Function& writeFunc, const Napi::Function& endFunc) : env(env) {
    writeFn.Reset(writeFunc, 1);
    endFn.Reset(endFunc, 1);
}

JsHttpResponse::~JsHttpResponse() {
    writeFn.Reset();
    endFn.Reset();
}

void JsHttpResponse::write(const uint8_t* data, size_t size) {
    auto buf = Napi::Buffer<uint8_t>::Copy(env, data, size);
    writeFn.Call({ buf });
}

void JsHttpResponse::end() {
    endFn.Call({});
}
