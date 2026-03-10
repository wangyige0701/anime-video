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

struct HlsPlayList {
    /** m3u8 内容 */
    std::string content;
    /** 当前序号 */
    int mediaSequence;
    /** 最后一个切片序号 */
    int lastSegmentIndex;
};

class Hls {
public:
    Hls(const std::string& input_path, int target_duration);
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
    /** 目标切片时长（秒） */
    int target_duration = 2;

    double duration = 0;
    int segment_count = 0;

    std::vector<uint8_t> m3u8_cache = {};

    /**
     * 生成指定序号的 ts 切片数据
     */
    std::vector<uint8_t> generateSegment(int index);
};
