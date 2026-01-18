// remux_napi.h

#pragma once
#include <napi.h>
#include <Remux.h>
#include <JsHttpResponse.h>

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
    Remux* remux = nullptr;

    Napi::String inputPath;
    Napi::Number seekSeconds = Napi::Number::New(Env(), -1);
    Napi::Function writeFunc;
    Napi::Function endFunc;

    Napi::Value start(const Napi::CallbackInfo& info);
    Napi::Value seek(const Napi::CallbackInfo& info);
    Napi::Value stop(const Napi::CallbackInfo& info);
};
