// hls_m3u8_worker.h

#include <napi.h>
#include <Hls.h>

class M3u8Worker : public Napi::AsyncWorker {
public:
    M3u8Worker(Hls* hls, Napi::Promise::Deferred deferred) : Napi::AsyncWorker(nullptr), hls(hls), deferred(deferred) {}

    void Execute() override {
        data = hls->m3u8();
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
    std::vector<uint8_t> data;
    Napi::Promise::Deferred deferred;
};
