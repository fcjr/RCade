const std = @import("std");

pub fn build(b: *std.Build) void {
    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseSmall,
    });
    const target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .freestanding,
        .cpu_features_add = std.Target.wasm.featureSet(&.{
            .atomics,
            .bulk_memory,
            // .extended_const, not supported by Safari
            .multivalue,
            .mutable_globals,
            .nontrapping_fptoint,
            .reference_types,
            //.relaxed_simd, not supported by Firefox or Safari
            .sign_ext,
            // observed to cause Error occured during wast conversion :
            // Unknown operator: 0xfd058 in Firefox 117
            //.simd128,
            // .tail_call, not supported by Safari
        }),
    });

    const serve_exe = b.addExecutable(.{
        .name = "serve",
        .root_module = b.createModule(.{
            .root_source_file = b.path("tools/serve.zig"),
            .optimize = .Debug,
            .target = b.graph.host,
            .imports = &.{
                .{
                    .name = "mime",
                    .module = b.dependency("mime", .{
                        .target = b.graph.host,
                        .optimize = .Debug,
                    }).module("mime"),
                },
            },
        }),
    });

    const run_serve = b.addRunArtifact(serve_exe);
    run_serve.addArg("--zig-exe-path");
    run_serve.addArg(b.graph.zig_exe);

    if (b.args) |args| {
        run_serve.addArgs(args);
    }

    const wasm = b.addExecutable(.{
        .name = "main",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    wasm.rdynamic = true; // expose exported functions to wasm
    wasm.entry = .disabled;

    const serve_step = b.step("serve", "Start a web server to test the game");
    serve_step.dependOn(&run_serve.step);

    b.getInstallStep().dependOn(&b.addInstallFile(wasm.getEmittedBin(), "main.wasm").step);
    b.installDirectory(.{
        .source_dir = b.path("assets"),
        .install_dir = .prefix,
        .install_subdir = "",
    });
}
