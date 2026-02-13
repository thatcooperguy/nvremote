{
  "targets": [
    {
      "target_name": "crazystream-viewer",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/addon.cpp",
        "src/viewer.cpp",
        "src/decode/nvdec_decoder.cpp",
        "src/decode/d3d11va_decoder.cpp",
        "src/render/d3d11_renderer.cpp",
        "src/transport/udp_receiver.cpp",
        "src/transport/jitter_buffer.cpp",
        "src/transport/nack_sender.cpp",
        "src/qos/stats_reporter.cpp",
        "src/audio/opus_decoder.cpp",
        "src/audio/wasapi_playback.cpp",
        "src/input/input_capture.cpp",
        "src/input/input_sender.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src",
        "../crazystream-common/include"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=8",
        "WIN32_LEAN_AND_MEAN",
        "NOMINMAX",
        "_CRT_SECURE_NO_WARNINGS"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "defines": ["CS_PLATFORM_WINDOWS=1"],
            "libraries": [
              "-lws2_32",
              "-ld3d11",
              "-ldxgi",
              "-lole32",
              "-ld3dcompiler",
              "-lwinmm",
              "-luuid",
              "-lavcodec",
              "-lavutil",
              "-lswscale",
              "-lssl",
              "-lcrypto",
              "-lopus"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "AdditionalOptions": ["/std:c++17", "/W4", "/MP"],
                "ExceptionHandling": 0
              }
            }
          }
        ]
      ]
    }
  ]
}
