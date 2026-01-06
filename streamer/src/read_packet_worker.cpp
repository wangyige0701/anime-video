#include "read_packet_worker.h"

extern "C" {
#include <libavutil/error.h>
}

static constexpr size_t BUF_SIZE = 1024 * 1024;

ReadPacketWorker::ReadPacketWorker(
    StreamerRef* ref,
    Napi::Env env,
    Napi::Promise::Deferred deferred
) : Napi::AsyncWorker(env), ref_(ref), deferred_(deferred), buffer_(BUF_SIZE) {}

void ReadPacketWorker::Execute() {
    if (ref_->closing || !ref_->handle) {
        ret_ = AVERROR_EOF;
        return;
    }
    ret_ = streamer_read(ref_->handle, &pkt_, buffer_.data(), static_cast<int>(buffer_.size()));
}

void ReadPacketWorker::OnOK() {
    Napi::Env env = Env();

    if (ret_ <= 0) {
        deferred_.Resolve(Napi::Number::New(env, ret_));
    } else {
        Napi::Object obj = Napi::Object::New(env);

        obj.Set("streamIndex", pkt_.streamIndex);
        obj.Set("mediaType", pkt_.mediaType);
        obj.Set("codecId", pkt_.codecId);
        obj.Set("pts", Napi::BigInt::New(env, pkt_.pts));
        obj.Set("dts", Napi::BigInt::New(env, pkt_.dts));
        obj.Set("duration", Napi::BigInt::New(env, pkt_.duration));
        obj.Set("isKeyFrame", Napi::Boolean::New(env, pkt_.isKeyFrame));
        obj.Set("isExtraData", Napi::Boolean::New(env, pkt_.isExtraData));

        if (pkt_.isExtraData) {
            obj.Set("extraData", Napi::Buffer<uint8_t>::Copy(
                env,
                pkt_.extraData,
                pkt_.extraDataSize
            ));
        } else {
            obj.Set("data", Napi::Buffer<uint8_t>::Copy(
                env,
                pkt_.data,
                pkt_.size
            ));
        }

        deferred_.Resolve(obj);
    }

    if (--ref_->refCount == 0 && ref_->closing) {
        streamer_destroy(ref_->handle);
        delete ref_;
    }
}

void ReadPacketWorker::OnError(const Napi::Error& e) {
    deferred_.Reject(e.Value());

    if (--ref_->refCount == 0 && ref_->closing) {
        streamer_destroy(ref_->handle);
        delete ref_;
    }
}
