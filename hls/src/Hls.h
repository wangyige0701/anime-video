extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/avutil.h>
#include <libavutil/time.h>
#include <libavutil/mem.h>
#include <libavdevice/avdevice.h>
#include <libswscale/swscale.h>
}

#include <string>

class Hls {
public:
    Hls(const std::string& input_path);
    ~Hls();
};
