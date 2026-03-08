// hls_ts_worker.h

#include <napi.h>
#include <Hls.h>

class TsWorker : public Napi::AsyncWorker {
public:
    TsWorker(
        Napi::Env env,
        Hls* hls,
        int index,
        Napi::Promise::Deferred deferred
    ) : Napi::AsyncWorker(env), hls(hls), index(index), deferred(deferred) {}

    void Execute() override {
        data = hls->ts(index);
    }

    void OnOK() override {
        auto buffer = Napi::Buffer<uint8_t>::Copy(
            Env(),
            data.data(),
            data.size()
        );
        deferred.Resolve(buffer);
    }

private:
    Hls* hls;
    int index;
    std::vector<uint8_t> data;
    Napi::Promise::Deferred deferred;
};
