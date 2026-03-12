// Hls.h

#pragma once

extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
}

#include <string>
#include <vector>
#include <memory>
#include <functional>

struct HlsSegment {
    int index;

    int64_t start_pts;
    int64_t end_pts;

    double start_time;
    double duration;
};

class Hls {
public:
    Hls(const std::string& input_path, int segment_duration);
    ~Hls();

    // 禁止拷贝
    Hls(const Hls&) = delete;
    Hls& operator=(const Hls&) = delete;

    /**
     * 生成 m3u8 列表数据
     */
    std::vector<uint8_t> m3u8();

    /**
     * 生成 ts 切片数据，每次调用需要重新打开输入文件，防止多线程竞争
     * @param index 切片序号，从 0 开始
     */
    std::vector<uint8_t> ts(int index);

private:
    std::string input_path;

    int video_stream_index = -1;
    AVRational video_time_base{};

    /** 视频时长（秒） */
    double duration = 0;

    std::vector<uint8_t> m3u8_cache = {};
    std::vector<HlsSegment> segments;

    /**
     * 生成指定序号的 ts 切片数据
     */
    std::vector<uint8_t> generateSegment(int index);
};
