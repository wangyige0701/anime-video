// Hls.cpp

#include <Hls.h>
#include <iostream>
#include <cmath>
#include <algorithm>

Hls::Hls(const std::string& input_path, int target_duration) : input_path(input_path), target_duration(target_duration) {
    AVFormatContext* input_ctx = nullptr;

    if (avformat_open_input(&input_ctx, input_path.c_str(), nullptr, nullptr) < 0) {
        return;
    }

    if (avformat_find_stream_info(input_ctx, nullptr) < 0) {
        avformat_close_input(&input_ctx);
        return;
    }

    // HLS 参数
    duration = input_ctx->duration / (double) AV_TIME_BASE;
    segment_count = static_cast<int>(std::ceil(duration / target_duration));

    avformat_close_input(&input_ctx);
}

Hls::~Hls() = default;

std::vector<uint8_t> Hls::m3u8() {
    if (!m3u8_cache.empty()) {
        return m3u8_cache;
    }

    // 构建 m3u8 内容
    std::string playlist;
    playlist += "#EXTM3U\n";
    playlist += "#EXT-X-VERSION:3\n";
    playlist += "#EXT-X-TARGETDURATION:" + std::to_string(target_duration) + "\n";
    playlist += "#EXT-X-MEDIA-SEQUENCE:0\n";
    playlist += "#EXT-X-PLAYLIST-TYPE:VOD\n"; // 点播类型，支持拖拽

    for (int i = 0; i < segment_count; i++) {
        double segment_duration = target_duration;
        if (i == segment_count - 1) {
            segment_duration = duration - i * target_duration; // 最后一个切片可能不足 2 秒
        }

        playlist += "#EXTINF:" + std::to_string(segment_duration) + ",\n";
        playlist += std::to_string(i) + ".ts\n";
    }

    playlist += "#EXT-X-ENDLIST\n";

    m3u8_cache = std::vector<uint8_t>(playlist.begin(), playlist.end());

    return m3u8_cache;
}

std::vector<uint8_t> Hls::generateSegment(int index) {
    std::vector<uint8_t> segment_data;

    AVFormatContext* input_ctx = nullptr;
    AVFormatContext* output_ctx = nullptr;
    AVIOContext* pb = nullptr;

    if (index < 0 || index >= segment_count) {
        return segment_data;
    }

    // 打开输入文件（每次重新打开，保证线程安全）
    if (avformat_open_input(&input_ctx, input_path.c_str(), nullptr, nullptr) < 0) {
        return segment_data;
    }

    if (avformat_find_stream_info(input_ctx, nullptr) < 0) {
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    double start_time = index * target_duration;
    double end_time = std::min((index + 1.0) * target_duration, duration);

    int64_t seek_target = start_time * AV_TIME_BASE;

    // seek 到目标时间
    av_seek_frame(input_ctx, -1, seek_target, AVSEEK_FLAG_BACKWARD);

    // 创建输出上下文
    avformat_alloc_output_context2(&output_ctx, nullptr, "mpegts", nullptr);

    if (!output_ctx) {
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    std::vector<int> stream_map(input_ctx->nb_streams, -1);
    int stream_index = 0;

    // 只复制音视频流
    for (unsigned int i = 0; i < input_ctx->nb_streams; i++) {
        AVStream* in_stream = input_ctx->streams[i];

        if (in_stream->codecpar->codec_type != AVMEDIA_TYPE_VIDEO &&
            in_stream->codecpar->codec_type != AVMEDIA_TYPE_AUDIO) {
            continue;
        }

        AVStream* out_stream = avformat_new_stream(output_ctx, nullptr);

        avcodec_parameters_copy(out_stream->codecpar, in_stream->codecpar);

        out_stream->time_base = in_stream->time_base;

        stream_map[i] = stream_index++;
    }

    // 打开内存 buffer
    if (avio_open_dyn_buf(&pb) < 0) {
        avformat_free_context(output_ctx);
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    output_ctx->pb = pb;

    // resend_headers 确保 SPS/PPS
    AVDictionary* opts = nullptr;
    av_dict_set(&opts, "mpegts_flags", "resend_headers", 0);

    // 写 header
    if (avformat_write_header(output_ctx, &opts) < 0) {
        av_dict_free(&opts);
        avio_close_dyn_buf(pb, nullptr);
        avformat_free_context(output_ctx);
        avformat_close_input(&input_ctx);
        return {};
    }

    av_dict_free(&opts);

    AVPacket pkt;

    bool started = false;

    while (av_read_frame(input_ctx, &pkt) >= 0) {
        int in_index = pkt.stream_index;

        if (stream_map[in_index] < 0) {
            av_packet_unref(&pkt);
            continue;
        }

        AVStream* in_stream = input_ctx->streams[in_index];
        AVStream* out_stream = output_ctx->streams[stream_map[in_index]];

        if (pkt.pts != AV_NOPTS_VALUE) {
            double pts_sec = pkt.pts * av_q2d(in_stream->time_base);

            if (pts_sec > end_time) {
                av_packet_unref(&pkt);
                break;
            }

            if (pts_sec < start_time) {
                av_packet_unref(&pkt);
                continue;
            }
        }

        // 等待关键帧开始
        if (!started && in_stream->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            if (!(pkt.flags & AV_PKT_FLAG_KEY)) {
                av_packet_unref(&pkt);
                continue;
            }

            started = true;
        }

        // 时间戳转换
        pkt.pts = av_rescale_q_rnd(
            pkt.pts,
            in_stream->time_base,
            out_stream->time_base,
            (AVRounding) (AV_ROUND_NEAR_INF | AV_ROUND_PASS_MINMAX)
        );

        pkt.dts = av_rescale_q_rnd(
            pkt.dts,
            in_stream->time_base,
            out_stream->time_base,
            (AVRounding) (AV_ROUND_NEAR_INF | AV_ROUND_PASS_MINMAX)
        );

        pkt.duration = av_rescale_q(
            pkt.duration,
            in_stream->time_base,
            out_stream->time_base
        );

        if (pkt.pts != AV_NOPTS_VALUE && pkt.dts != AV_NOPTS_VALUE && pkt.pts < pkt.dts) {
            pkt.pts = pkt.dts;
        }

        pkt.pos = -1;

        pkt.stream_index = stream_map[in_index];

        if (av_interleaved_write_frame(output_ctx, &pkt) < 0) {
            av_packet_unref(&pkt);
            break;
        }

        av_packet_unref(&pkt);
    }

    // 写 trailer
    av_write_trailer(output_ctx);

    // 获取内存 buffer
    uint8_t* buffer = nullptr;

    int size = avio_close_dyn_buf(pb, &buffer);

    if (size > 0) {
        segment_data.assign(buffer, buffer + size);
    }

    av_free(buffer);

    // 释放
    avformat_free_context(output_ctx);
    avformat_close_input(&input_ctx);

    return segment_data;
}

std::vector<uint8_t> Hls::ts(int index) {
    return generateSegment(index);
}
