// File: src/Streamer.cpp

#include "Streamer.h"
#include <iostream>

Streamer::Streamer() {
    avformat_network_init();
    packet = av_packet_alloc();
}

Streamer::~Streamer() {
    close();
    if (packet) {
        av_packet_free(&packet);
        packet = nullptr;
    }
    avformat_network_deinit();
}

int Streamer::openInput(const std::string& path) {
    if (format) {
        close();
    }

    int result = avformat_open_input(&format, path.c_str(), NULL, NULL);
    if (result < 0) {
        return result;
    }

    result = avformat_find_stream_info(format, NULL);
    if (result < 0) {
        avformat_close_input(&format);
        return result;
    }

    videoIndex = av_find_best_stream(format, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0);
    audioIndex = av_find_best_stream(format, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);

    return 0;
}

int Streamer::readPacket(MediaPacket& out, uint8_t* buffer, int bufferSize) {
    if (!format) {
        return AVERROR(EINVAL);
    }

    for (;;) {
        int result = av_read_frame(format, packet);
        if (result == AVERROR_EOF) {
            return 0;
        }
        if (result < 0) {
            return result;
        }

        AVStream* stream = format->streams[packet->stream_index];

        int mediaType = stream->codecpar->codec_type;
        bool isKeyFrame = (packet->flags & AV_PKT_FLAG_KEY) != 0;

        // seek 后，丢弃非关键帧（只针对视频）
        if (needKeyFrame && mediaType == AVMEDIA_TYPE_VIDEO && !isKeyFrame) {
            av_packet_unref(packet);
            continue;
        }

        // 命中第一个关键帧
        if (needKeyFrame && mediaType == AVMEDIA_TYPE_VIDEO && isKeyFrame) {
            needKeyFrame = false;

            if (needExtraData) {
                needExtraData = false;
                av_packet_unref(packet);
                out.size = 0;
                out.data = nullptr;
                // 通知上层发 extradata
                return emitExtraData(out);
            }
        }

        // 包没有内容
        if (!packet->data || packet->size <= 0) {
            av_packet_unref(packet);
            continue;
        }

        if (packet->size > bufferSize) {
            av_packet_unref(packet);
            return AVERROR(ENOMEM);
        }

        // 拷贝数据
        memcpy(buffer, packet->data, packet->size);

        out.data = buffer;
        out.size = packet->size;
        out.streamIndex = packet->stream_index;
        out.mediaType = stream->codecpar->codec_type;
        out.codecId = stream->codecpar->codec_id;
        out.isKeyFrame = isKeyFrame;

        // 时间戳统一转为微妙
        if (packet->pts != AV_NOPTS_VALUE) {
            out.pts = av_rescale_q(packet->pts, stream->time_base, AV_TIME_BASE_Q);
        } else {
            out.pts = AV_NOPTS_VALUE;
        }

        if (packet->dts != AV_NOPTS_VALUE) {
            out.dts = av_rescale_q(packet->dts, stream->time_base, AV_TIME_BASE_Q);
        } else {
            out.dts = AV_NOPTS_VALUE;
        }

        out.duration = av_rescale_q(packet->duration, stream->time_base, AV_TIME_BASE_Q);

        av_packet_unref(packet);
        // 成功读取一个包
        return 1;
    }
}

int Streamer::seek(int64_t timestamp, int streamIndex) {
    if (!format) {
        return AVERROR(EINVAL);
    }

    // 后退找关键帧以及任意帧
    int flags = AVSEEK_FLAG_BACKWARD | AVSEEK_FLAG_ANY;

    int result = av_seek_frame(format, streamIndex, timestamp, flags);
    if (result >= 0) {
        // 必须 flush，否则 packet 混合旧数据
        avformat_flush(format);

        // 接下来必须等关键帧
        needKeyFrame = true;

        // 关键帧前必须重发 extra data
        needExtraData = true;
    }
    return result;
}

bool Streamer::getExtraData(int streamIndex, MediaExtraData& out) {
    if (!format) {
        return false;
    }

    if (streamIndex < 0 || streamIndex >= (int) format->nb_streams) {
        return false;
    }

    AVStream* stream = format->streams[streamIndex];
    AVCodecParameters* par = stream->codecpar;

    out.streamIndex = streamIndex;
    out.codecId = par->codec_id;
    out.mediaType = par->codec_type;
    out.data = par->extradata;
    out.size = par->extradata_size;

    return true;
}

int Streamer::emitExtraData(MediaPacket& out) {
    AVStream* stream = format->streams[videoIndex];
    AVCodecParameters* par = stream->codecpar;

    if (!par->extradata || par->extradata_size <= 0) {
        return AVERROR_INVALIDDATA;
    }

    out = MediaPacket{};
    out.isExtraData = true;
    out.mediaType = par->codec_type;
    out.codecId = par->codec_id;
    out.streamIndex = stream->index;
    out.extraData = par->extradata;
    out.extraDataSize = par->extradata_size;

    return 2;
}

void Streamer::close() {
    if (format) {
        avformat_close_input(&format);
        format = nullptr;
    }

    videoIndex = -1;
    audioIndex = -1;
}
