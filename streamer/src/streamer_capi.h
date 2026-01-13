// File: src/streamer_capi.h

#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

    typedef struct MediaPacketC {
        uint8_t* data;
        int size;

        int streamIndex;
        int mediaType;

        int64_t pts;
        int64_t dts;
        int64_t duration;

        int isKeyFrame;

        int codecId;

        int isExtraData;
        const uint8_t* extraData;
        int extraDataSize;
    } MediaPacketC;

    typedef struct MediaExtraDataC {
        int streamIndex;
        int codecId;
        int mediaType;

        const uint8_t* data;
        int size;
    } MediaExtraDataC;

    /**
     * Streamer handle
     */
    typedef void* StreamerHandle;

    /**
     * API functions
     */
    StreamerHandle streamer_create();
    void streamer_destroy(StreamerHandle handle);

    int streamer_open(StreamerHandle handle, const char* path);

    int streamer_read(StreamerHandle handle, MediaPacketC* out, uint8_t* buffer, int bufferSize);

    int streamer_seek(StreamerHandle handle, int64_t timestamp, int streamIndex);

    int streamer_get_extradata(StreamerHandle handle, int streamIndex, MediaExtraDataC* out);
    int streamer_get_video_index(StreamerHandle handle);
    int streamer_get_audio_index(StreamerHandle handle);

    void streamer_close(StreamerHandle handle);

#ifdef __cplusplus
}
#endif
