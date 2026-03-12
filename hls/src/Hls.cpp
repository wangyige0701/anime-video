// Hls.cpp

#include <Hls.h>
#include <iostream>
#include <cmath>
#include <algorithm>

Hls::Hls(const std::string& input_path, int segment_duration = 4) : input_path(input_path) {
    AVFormatContext* input_ctx = nullptr;

    if (avformat_open_input(&input_ctx, input_path.c_str(), nullptr, nullptr) < 0) {
        throw std::runtime_error("Failed to open input file");
    }

    if (avformat_find_stream_info(input_ctx, nullptr) < 0) {
        avformat_close_input(&input_ctx);
        throw std::runtime_error("Failed to find stream info");
    }

    // HLS 参数
    duration = input_ctx->duration / (double) AV_TIME_BASE;

    // 找到 video stream
    video_stream_index = av_find_best_stream(input_ctx, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);

    if (video_stream_index < 0) {
        avformat_close_input(&input_ctx);
        throw std::runtime_error("Failed to find video stream");
    }

    AVStream* video_stream = input_ctx->streams[video_stream_index];
    video_time_base = video_stream->time_base;

    AVPacket pkt{};

    bool first_segment = true;

    while (av_read_frame(input_ctx, &pkt) >= 0) {
        if (pkt.stream_index != video_stream_index) {
            av_packet_unref(&pkt);
            continue;
        }

        // 只在关键帧切片
        if (!(pkt.flags & AV_PKT_FLAG_KEY)) {
            av_packet_unref(&pkt);
            continue;
        }

        int64_t pts = pkt.pts;
        if (pts == AV_NOPTS_VALUE) {
            pts = pkt.dts;
        }
        if (pts == AV_NOPTS_VALUE) {
            av_packet_unref(&pkt);
            continue;
        }

        double time_sec = pts * av_q2d(video_time_base);

        HlsSegment seg;

        seg.index = segments.size();
        seg.start_pts = pts;
        seg.start_time = time_sec;

        segments.push_back(seg);

        av_packet_unref(&pkt);
    }

    for (size_t i = 0; i < segments.size(); i++) {
        if (i + 1 < segments.size()) {
            segments[i].end_pts = segments[i + 1].start_pts;
            segments[i].duration = std::max(
                0.1,
                (segments[i + 1].start_pts - segments[i].start_pts) * av_q2d(video_time_base)
            );
        } else {
            segments[i].end_pts = INT64_MAX;
            segments[i].duration = duration - segments[i].start_time;
        }
    }

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

    int max_duration = 0;
    for (auto& seg : segments) {
        max_duration = std::max(max_duration, (int) ceil(seg.duration));
    }

    playlist += "#EXT-X-TARGETDURATION:" + std::to_string(max_duration) + "\n";
    playlist += "#EXT-X-MEDIA-SEQUENCE:0\n";
    playlist += "#EXT-X-PLAYLIST-TYPE:VOD\n"; // 点播类型，支持拖拽

    for (auto& seg : segments) {
        playlist += "#EXTINF:" + std::to_string(seg.duration) + ",\n";
        playlist += std::to_string(seg.index) + ".ts\n";
    }

    playlist += "#EXT-X-ENDLIST\n";

    m3u8_cache = std::vector<uint8_t>(playlist.begin(), playlist.end());

    return m3u8_cache;
}

std::vector<uint8_t> Hls::ts(int index) {
    return generateSegment(index);
}

std::vector<uint8_t> Hls::generateSegment(int index) {
    std::vector<uint8_t> segment_data;

    if (index < 0 || index >= segments.size()) {
        return segment_data;
    }

    HlsSegment& seg = segments[index];

    int64_t start_pts = seg.start_pts;
    int64_t end_pts = seg.end_pts;

    AVFormatContext* input_ctx = nullptr;

    // 打开输入文件（每次重新打开，保证线程安全）
    if (avformat_open_input(&input_ctx, input_path.c_str(), nullptr, nullptr) < 0) {
        return segment_data;
    }

    if (avformat_find_stream_info(input_ctx, nullptr) < 0) {
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    AVFormatContext* output_ctx = nullptr;

    // 创建输出 mpegts
    if (avformat_alloc_output_context2(&output_ctx, nullptr, "mpegts", nullptr) < 0) {
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    std::vector<int> stream_map(input_ctx->nb_streams, -1);

    int stream_index = 0;

    // 创建输出流
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

    AVIOContext* pb = nullptr;

    // 内存 IO
    if (avio_open_dyn_buf(&pb) < 0) {
        avformat_free_context(output_ctx);
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    output_ctx->pb = pb;

    AVDictionary* opts = nullptr;

    // 关键参数：
    // - mpegts_flags=resend_headers：确保每个切片都包含完整的 header
    av_dict_set(&opts, "mpegts_flags", "resend_headers", 0);
    av_dict_set(&opts, "muxdelay", "0", 0);
    av_dict_set(&opts, "muxpreload", "0", 0);

    // 写 header
    if (avformat_write_header(output_ctx, &opts) < 0) {
        av_dict_free(&opts);
        avio_close_dyn_buf(pb, nullptr);
        avformat_free_context(output_ctx);
        avformat_close_input(&input_ctx);
        return segment_data;
    }

    av_dict_free(&opts);

    // seek 到目标时间
    av_seek_frame(input_ctx, video_stream_index, start_pts, AVSEEK_FLAG_BACKWARD);

    AVPacket pkt{};

    bool video_started = false;

    int64_t first_pts = AV_NOPTS_VALUE;
    int64_t first_dts = AV_NOPTS_VALUE;

    while (av_read_frame(input_ctx, &pkt) >= 0) {
        int in_index = pkt.stream_index;

        if (in_index >= stream_map.size() || stream_map[in_index] < 0) {
            av_packet_unref(&pkt);
            continue;
        }

        AVStream* in_stream = input_ctx->streams[in_index];
        AVStream* out_stream = output_ctx->streams[stream_map[in_index]];

        if (in_index == video_stream_index) {
            if (!video_started) {
                if (!(pkt.flags & AV_PKT_FLAG_KEY)) {
                    av_packet_unref(&pkt);
                    continue;
                }

                video_started = true;
            }
        }

        if (pkt.pts == AV_NOPTS_VALUE) {
            av_packet_unref(&pkt);
            continue;
        }

        // 超过 segment 边界
        if (pkt.pts >= end_pts) {
            av_packet_unref(&pkt);
            break;
        }

        if (first_pts == AV_NOPTS_VALUE) {
            first_pts = pkt.pts;
            first_dts = pkt.dts;
        }

        if (pkt.dts != AV_NOPTS_VALUE) {
            pkt.dts -= first_dts;
        }

        if (pkt.pts != AV_NOPTS_VALUE) {
            pkt.pts -= first_dts;
        }

        if (pkt.pts != AV_NOPTS_VALUE &&
            pkt.dts != AV_NOPTS_VALUE &&
            pkt.pts < pkt.dts) {
            pkt.pts = pkt.dts;
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

    if (size > 0 && buffer) {
        segment_data.assign(buffer, buffer + size);
        av_free(buffer);
    }

    // 释放
    avformat_free_context(output_ctx);
    avformat_close_input(&input_ctx);

    return segment_data;
}

