cmake_minimum_required(VERSION 3.15)
project(streamer LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(FFMPEG_ROOT "D:/libs/ffmpeg/ffmpeg-7.1.1-full_build-shared")

include_directories("${FFMPEG_ROOT}/include")
link_directories("${FFMPEG_ROOT}/lib")

# ==========
# Node addon 头文件路径
# ==========
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
)

# 去掉换行
string(REPLACE "\n" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
# 去掉引号
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

message(STATUS "node-addon-api include: ${NODE_ADDON_API_DIR}")

add_definitions(-DNAPI_VERSION=8)

# =========
# 引入需要的库
# =========
add_library(streamer SHARED
    src/Streamer.cpp
    src/streamer_capi.cpp # C API 导出层
    src/streamer_napi.cpp  # N-API 包装层
    src/read_packet_worker.cpp
)

# Node addon 后缀 & 前缀
set_target_properties(streamer PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

target_include_directories(streamer PRIVATE
    ${NODE_ADDON_API_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
    ${CMAKE_CURRENT_SOURCE_DIR}/node-v20.19.5/include/node
)

# libnode.dll.a 是从 node.exe 编译而来
target_link_libraries(streamer
    avformat
    avcodec
    avutil
    swscale
    swresample
    ${CMAKE_CURRENT_SOURCE_DIR}/libnode.dll.a
)

# =========================
# Copy FFmpeg DLLs
# =========================
add_custom_command(TARGET streamer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${FFMPEG_ROOT}/bin"
    $<TARGET_FILE_DIR:streamer>
)

