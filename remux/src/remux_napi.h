// remux_napi.h

#pragma once
#include <thread>
#include <atomic>
#include <napi.h>
#include <Remux.h>

class RemuxNapi : public Napi::ObjectWrap<RemuxNapi> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    /**
     * ```js
     * const remux = new Remux({
     *  path: '',
     *  seek: 0,
     *  write: (data) => {},
     *  end: () => {},
     * });
     * ```
     */
    RemuxNapi(const Napi::CallbackInfo& info);
    ~RemuxNapi();

    static JsHttpResponse* createJsHttpResponse(
        Napi::Env env,
        Napi::Function writeFunc,
        Napi::Function endFunc
    ) {
        return new JsHttpResponse(env, writeFunc, endFunc);
    }

private:
    std::thread worker;
    std::atomic<bool> seeking{ false };

    std::string inputPath;
    double seekSeconds = -1.0;
    std::unique_ptr<Remux> remux;
    std::unique_ptr<JsHttpResponse> response;

    Napi::Value start(const Napi::CallbackInfo& info);
    Napi::Value seek(const Napi::CallbackInfo& info);
    Napi::Value stop(const Napi::CallbackInfo& info);

    void createWorker();
};
