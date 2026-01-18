// JsHttpResponse.h

#include <napi.h>
#include <queue>
#include <mutex>

class JsHttpResponse {
public:
    JsHttpResponse(
        Napi::Env env,
        const Napi::Function& writeFunc,
        const Napi::Function& endFunc
    );
    ~JsHttpResponse();

    void write(const uint8_t* data, size_t size);
    void end();

private:
    Napi::ThreadSafeFunction writeFn;
    Napi::ThreadSafeFunction endFn;

};
