// Remux.h

extern "C" {
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
}

#include <string>
#include <atomic>
#include <JsHttpResponse.h>

class Remux {
public:
    Remux(const std::string& path, JsHttpResponse* response);
    ~Remux();

    void open(double seekSeconds = -1.0);
    void stop();

    void stream();

private:
    std::atomic<bool> stopped{ false };

    std::string inputPath;
    JsHttpResponse* response = nullptr;

    AVFormatContext* ifmt = nullptr;
    AVFormatContext* ofmt = nullptr;
    AVIOContext* avio = nullptr;
    uint8_t* avioBuffer = nullptr;

    void openInput();
    void openOutput();
    void writeHeader();
    void seek(double seconds);
    void cleanup();

    /**
     * AVIO 写回调
     */
    static int writePacket(void* opaque, const uint8_t* buf, int size);
};
