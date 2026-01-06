#include "streamer_capi.h"
#include "streamer.h"

#include <new>

/**
 * Helpers
 */
static inline Streamer* to_streamer(StreamerHandle handle) {
    return static_cast<Streamer*>(handle);
}

StreamerHandle streamer_create() {
    try {
        return new Streamer();
    } catch (...) {
        return nullptr;
    }
}

void streamer_destroy(StreamerHandle handle) {
    if (!handle) {
        return;
    }
    delete to_streamer(handle);
}

int streamer_open(StreamerHandle handle, const char* path) {
    if (!handle || !path) {
        return AVERROR(EINVAL);
    }
    return to_streamer(handle)->openInput(std::string(path));
}

int streamer_read(StreamerHandle handle, MediaPacketC* outC, uint8_t* buffer, int bufferSize) {
    if (!handle || !outC || !buffer || bufferSize <= 0) {
        return AVERROR(EINVAL);
    }

    MediaPacket pkt;
    int result = to_streamer(handle)->readPacket(pkt, buffer, bufferSize);
    if (result <= 0) {
        return result;
    }

    // 填充 C 结构体
    outC->data = pkt.data;
    outC->size = pkt.size;
    outC->streamIndex = pkt.streamIndex;
    outC->mediaType = pkt.mediaType;
    outC->codecId = pkt.codecId;

    outC->pts = pkt.pts;
    outC->dts = pkt.dts;
    outC->duration = pkt.duration;

    outC->isKeyFrame = pkt.isKeyFrame ? 1 : 0;
    outC->isExtraData = pkt.isExtraData ? 1 : 0;
    outC->extraData = pkt.extraData;
    outC->extraDataSize = pkt.extraDataSize;

    return result;
}

int streamer_seek(StreamerHandle handle, int64_t timestamp, int streamIndex) {
    if (!handle) {
        return AVERROR(EINVAL);
    }
    return to_streamer(handle)->seek(timestamp, streamIndex);
}

int streamer_get_extradata(StreamerHandle handle, int streamIndex, MediaExtraDataC* out) {
    if (!handle || !out) {
        return AVERROR(EINVAL);
    }
    MediaExtraData extraData;
    if (!to_streamer(handle)->getExtraData(streamIndex, extraData)) {
        return AVERROR(EINVAL);
    }

    out->streamIndex = extraData.streamIndex;
    out->codecId = extraData.codecId;
    out->mediaType = extraData.mediaType;
    out->data = extraData.data;
    out->size = extraData.size;

    // 成功
    return 0;
}

int streamer_get_video_index(StreamerHandle handle) {
    if (!handle) {
        return -1;
    }
    return to_streamer(handle)->getVideoIndex();
}

int streamer_get_audio_index(StreamerHandle handle) {
    if (!handle) {
        return -1;
    }
    return to_streamer(handle)->getAudioIndex();
}

void streamer_close(StreamerHandle handle) {
    if (!handle) {
        return;
    }
    to_streamer(handle)->close();
}
