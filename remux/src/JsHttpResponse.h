// JsHttpResponse.h

#include <napi.h>

class JsHttpResponse {
public:
    JsHttpResponse(Napi::Env env, const Napi::Function& writeFunc, const Napi::Function& endFunc);
    ~JsHttpResponse();

    void write(const uint8_t* data, size_t size);
    void end();

private:
    Napi::Env env;
    Napi::FunctionReference writeFn;
    Napi::FunctionReference endFn;

};
