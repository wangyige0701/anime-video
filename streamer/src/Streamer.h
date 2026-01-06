#pragma once

#include <string>
extern "C" {
#include <libavformat/avformat.h>
}

struct MediaPacket {
    /** 数据 */
    uint8_t* data = nullptr;
    /** 数据长度 */
    int size = 0;

    /** 原始 stream index */
    int streamIndex = -1;
    /** AVMEDIA_TYPE_VIDEO / AUDIO */
    int mediaType = -1;

    /** 显示时间戳（已转为统一时间基） */
    int64_t pts = AV_NOPTS_VALUE;
    /** 解码时间戳 */
    int64_t dts = AV_NOPTS_VALUE;
    /** 包时长 */
    int64_t duration = 0;

    /** 是否关键帧（视频） */
    bool isKeyFrame = false;

    /** 编码格式 AVCodecID（h264/h265/aac/opus） */
    int codecId = AV_CODEC_ID_NONE;

    // extradata，不拷贝
    bool isExtraData = false;
    const uint8_t* extraData = nullptr;
    int extraDataSize = 0;
};

struct MediaExtraData {
    int streamIndex = -1;
    int codecId = AV_CODEC_ID_NONE;
    int mediaType = -1;

    const uint8_t* data = nullptr;
    int size = 0;
};

class Streamer {
public:
    Streamer();
    ~Streamer();

    Streamer(const Streamer&) = delete;
    Streamer& operator=(const Streamer&) = delete;

    /**
     * 打开本地视频
     * @return 0 成功
     */
    int openInput(const std::string& path);

    /**
     * 读取数据包
     * @return >0 正常读取，=0 到达文件末尾，<0 错误，2 需要发送 extra data
     */
    int readPacket(MediaPacket& out, uint8_t* buffer, int bufferSize);

    /**
     * 定位到指定时间戳
     */
    int seek(int64_t timestamp, int streamIndex);

    /**
     * 获取流的额外数据（SPS/PPS/VPS等）
     * @return  true 成功，false 失败
     */
    bool getExtraData(int streamIndex, MediaExtraData& out);

    int emitExtraData(MediaPacket& out);

    void markExtraDataSent() { needExtraData = false; }

    void close();

    /**
     * 获取视频流索引
     */
    int getVideoIndex() const { return videoIndex; }
    /**
     * 获取音频流索引
     */
    int getAudioIndex() const { return audioIndex; }

private:
    AVFormatContext* format = nullptr;
    AVPacket* packet = nullptr;

    int videoIndex = -1;
    int audioIndex = -1;

    /** seek 后，等待关键帧 */
    bool needKeyFrame = false;
    /** 是否需要重发 extra data */
    bool needExtraData = false;
};
