const builtin = @import("builtin");

const std = @import("std");
const Io = std.Io;
const mem = std.mem;
const Allocator = std.mem.Allocator;
const assert = std.debug.assert;
const Cache = std.Build.Cache;
const fatal = std.process.fatal;

const mime = @import("mime");

pub fn main(init: std.process.Init) !void {
    const arena = init.arena.allocator();
    const gpa = init.gpa;
    const io = init.io;

    var argv = try init.minimal.args.iterateAllocator(arena);
    defer argv.deinit();
    assert(argv.skip());

    var listen_port: u16 = 0;
    var force_open_browser: ?bool = null;
    var root_path: ?[]const u8 = null;
    var opt_zig_exe_path: ?[]const u8 = null;
    var opt_cache_dir: ?[]const u8 = null;
    while (argv.next()) |arg| {
        if (mem.eql(u8, arg, "-h") or mem.eql(u8, arg, "--help")) {
            usage(io);
        } else if (mem.eql(u8, arg, "-p") or mem.eql(u8, arg, "--port")) {
            listen_port = std.fmt.parseInt(u16, argv.next().?, 10) catch |err| {
                std.log.err("expected port number: {}", .{err});
                usage(io);
            };
        } else if (mem.eql(u8, arg, "--open-browser")) {
            force_open_browser = true;
        } else if (mem.eql(u8, arg, "--no-open-browser")) {
            force_open_browser = false;
        } else if (mem.eql(u8, arg, "--root-path")) {
            root_path = argv.next().?;
        } else if (mem.eql(u8, arg, "--zig-exe-path")) {
            opt_zig_exe_path = argv.next().?;
        } else if (mem.eql(u8, arg, "--cache-dir")) {
            opt_cache_dir = argv.next().?;
        } else {
            std.log.err("unrecognized argument: {s}", .{arg});
            usage(io);
        }
    }
    const should_open_browser = force_open_browser orelse (listen_port == 0);

    const address = Io.net.IpAddress.parse("127.0.0.1", listen_port) catch unreachable;
    var http_server = try address.listen(io, .{
        .reuse_address = true,
    });

    std.log.info("listening at http://{f}/", .{http_server.socket.address});
    if (listen_port == 0) {
        std.log.info("pass -p {d} to use the same port next time", .{http_server.socket.address.getPort()});
    }

    if (should_open_browser) {
        const url_with_newline = try std.fmt.allocPrint(arena, "http://{f}/\n", .{http_server.socket.address});
        openBrowserTab(io, url_with_newline[0 .. url_with_newline.len - 1 :'\n']) catch |err| {
            std.log.err("unable to open browser: {t}", .{err});
        };
    }

    const cwd: Io.Dir = .cwd();

    const root_dir: Cache.Directory = .{
        .handle = if (root_path) |p| try cwd.openDir(io, p, .{}) else cwd,
        .path = root_path,
    };

    const cache_root: Cache.Path = if (opt_cache_dir) |cache_dir| .{
        .root_dir = .cwd(),
        .sub_path = cache_dir,
    } else .{
        .root_dir = root_dir,
        .sub_path = ".zig-cache",
    };

    var context: Context = .{
        .gpa = gpa,
        .io = io,
        .root_dir = root_dir,
        .zig_exe_path = opt_zig_exe_path orelse fatal("missing --zig-exe-path arg", .{}),
        .cache_root = cache_root,
    };

    var group: Io.Group = .init;
    defer group.cancel(io);

    while (true) {
        const stream = try http_server.accept(io);
        group.async(io, accept, .{ &context, stream });
    }
}

fn accept(context: *Context, stream: Io.net.Stream) void {
    const io = context.io;
    defer stream.close(io);

    var recv_buffer: [4000]u8 = undefined;
    var send_buffer: [4000]u8 = undefined;
    var conn_reader = stream.reader(io, &recv_buffer);
    var conn_writer = stream.writer(io, &send_buffer);
    var server = std.http.Server.init(&conn_reader.interface, &conn_writer.interface);
    while (server.reader.state == .ready) {
        var request = server.receiveHead() catch |err| switch (err) {
            error.HttpConnectionClosing => return,
            else => {
                std.log.err("closing http connection: {t}", .{err});
                return;
            },
        };
        serveRequest(&request, context) catch |err| switch (err) {
            error.WriteFailed => {
                if (conn_writer.err) |e| {
                    std.log.err("unable to serve {s}: {t}", .{ request.head.target, e });
                } else {
                    std.log.err("unable to serve {s}: {t}", .{ request.head.target, err });
                }
                return;
            },
            else => {
                std.log.err("unable to serve {s}: {t}", .{ request.head.target, err });
                return;
            },
        };
    }
}

const Context = struct {
    gpa: Allocator,
    io: Io,
    root_dir: Cache.Directory,
    cache_root: Cache.Path,
    zig_exe_path: []const u8,
};

fn serveRequest(request: *std.http.Server.Request, context: *Context) !void {
    if (mem.eql(u8, request.head.target, "/") or
        mem.eql(u8, request.head.target, "/debug") or
        mem.eql(u8, request.head.target, "/debug/"))
    {
        try serveStatic(request, context, "assets/index.html", "text/html");
    } else if (mem.eql(u8, request.head.target, "/main.wasm")) {
        try serveWasm(request, context, .ReleaseSmall);
    } else if (mem.eql(u8, request.head.target, "/debug/main.wasm")) {
        try serveWasm(request, context, .Debug);
    } else {
        const sub_path = if (mem.startsWith(u8, request.head.target, "/debug/"))
            request.head.target["/debug/".len..]
        else
            request.head.target["/".len..];

        const ext = Io.Dir.path.extension(sub_path);
        const mime_type = mime.extension_map.get(ext) orelse .@"application/octet-stream";

        const gpa = context.gpa;
        const file_path = try Io.Dir.path.join(gpa, &.{ "assets", sub_path });
        defer gpa.free(file_path);

        std.log.debug("serveStatic {s} {t}", .{ file_path, mime_type });

        serveStatic(request, context, file_path, @tagName(mime_type)) catch |err| switch (err) {
            error.FileNotFound => {
                try request.respond("not found", .{
                    .status = .not_found,
                    .extra_headers = &.{
                        .{ .name = "content-type", .value = "text/plain" },
                    },
                });
            },
            else => |e| return e,
        };
    }
}

const cache_control_header: std.http.Header = .{
    .name = "cache-control",
    .value = "max-age=0, must-revalidate",
};

fn serveStatic(
    request: *std.http.Server.Request,
    context: *Context,
    name: []const u8,
    content_type: []const u8,
) !void {
    const gpa = context.gpa;
    const io = context.io;
    // The desired API is actually sendfile, which will require enhancing std.http.Server.
    // We load the file with every request so that the user can make changes to the file
    // and refresh the HTML page without restarting this server.
    const file_contents = try context.root_dir.handle.readFileAlloc(io, name, gpa, .limited(10 * 1024 * 1024));
    defer gpa.free(file_contents);
    try request.respond(file_contents, .{
        .extra_headers = &.{
            .{ .name = "content-type", .value = content_type },
            cache_control_header,
        },
    });
}

fn serveWasm(
    request: *std.http.Server.Request,
    context: *Context,
    optimize_mode: std.builtin.OptimizeMode,
) !void {
    const gpa = context.gpa;
    const io = context.io;

    var arena_instance = std.heap.ArenaAllocator.init(gpa);
    defer arena_instance.deinit();
    const arena = arena_instance.allocator();

    // Do the compilation every request, so that the user can edit the files
    // and see the changes without restarting the server.
    const wasm_base_path = try buildWasmBinary(arena, context, optimize_mode);
    const bin_name = try std.zig.binNameAlloc(arena, .{
        .root_name = wasm_root_name,
        .target = &(std.zig.system.resolveTargetQuery(io, std.Build.parseTargetQuery(.{
            .arch_os_abi = wasm_arch_os_abi,
            .cpu_features = wasm_cpu_features,
        }) catch unreachable) catch unreachable),
        .output_mode = .Exe,
    });
    // std.http.Server does not have a sendfile API yet.
    const bin_path = try wasm_base_path.join(arena, bin_name);
    const file_contents = try bin_path.root_dir.handle.readFileAlloc(io, bin_path.sub_path, gpa, .limited(10 * 1024 * 1024));
    defer gpa.free(file_contents);
    try request.respond(file_contents, .{
        .extra_headers = &.{
            .{ .name = "content-type", .value = "application/wasm" },
            cache_control_header,
        },
    });
}

const wasm_root_name = "main";
const wasm_arch_os_abi = "wasm32-freestanding";
const wasm_cpu_features = "baseline+atomics+bulk_memory+multivalue+mutable_globals+nontrapping_fptoint+reference_types+sign_ext";

fn buildWasmBinary(
    arena: Allocator,
    context: *Context,
    optimize_mode: std.builtin.OptimizeMode,
) !Cache.Path {
    const gpa = context.gpa;
    const io = context.io;

    var argv: std.ArrayList([]const u8) = .empty;

    const cache_root = try std.fmt.allocPrint(arena, "{f}", .{context.cache_root});

    try argv.appendSlice(arena, &.{
        context.zig_exe_path, //
        "build-exe", //
        "-fno-entry", //
        "-O", @tagName(optimize_mode), //
        "-target", wasm_arch_os_abi, //
        "-mcpu", wasm_cpu_features, //
        "--cache-dir", cache_root, //
        "--name", wasm_root_name, //
        "-rdynamic", //
        try std.fmt.allocPrint(
            arena,
            "-Mroot={s}/src/main.zig",
            .{context.root_dir.path orelse "."},
        ),
        "--listen=-", //
    });

    var child = try std.process.spawn(io, .{
        .argv = argv.items,
        .stdin = .pipe,
        .stdout = .pipe,
        .stderr = .pipe,
    });

    var multi_reader_buffer: Io.File.MultiReader.Buffer(2) = undefined;
    var multi_reader: Io.File.MultiReader = undefined;
    multi_reader.init(gpa, io, multi_reader_buffer.toStreams(), &.{ child.stdout.?, child.stderr.? });
    defer multi_reader.deinit();

    try sendMessage(io, child.stdin.?, .update);
    try sendMessage(io, child.stdin.?, .exit);

    var result: ?Cache.Path = null;
    var result_error_bundle = std.zig.ErrorBundle.empty;

    const stdout = multi_reader.fileReader(0);
    const MessageHeader = std.zig.Server.Message.Header;

    var eos_err: error{EndOfStream}!void = {};

    while (true) {
        const header = stdout.interface.takeStruct(MessageHeader, .little) catch |err| switch (err) {
            error.EndOfStream => break,
            error.ReadFailed => return stdout.err.?,
        };
        const body = stdout.interface.take(header.bytes_len) catch |err| switch (err) {
            error.EndOfStream => |e| {
                eos_err = e;
                break;
            },
            error.ReadFailed => return stdout.err.?,
        };

        switch (header.tag) {
            .zig_version => {
                if (!mem.eql(u8, builtin.zig_version_string, body)) {
                    return error.ZigProtocolVersionMismatch;
                }
            },
            .error_bundle => {
                result_error_bundle = try std.zig.Server.allocErrorBundle(arena, body);
            },
            .emit_digest => {
                var r: Io.Reader = .fixed(body);
                const emit_digest = r.takeStruct(std.zig.Server.Message.EmitDigest, .little) catch unreachable;
                if (!emit_digest.flags.cache_hit) {
                    std.log.info("source changes detected; rebuilt wasm component", .{});
                }
                const digest = r.takeArray(Cache.bin_digest_len) catch unreachable;
                result = try context.cache_root.join(arena, "o" ++ std.fs.path.sep_str ++ Cache.binToHex(digest.*));
            },
            else => {}, // ignore other messages
        }
    }

    try multi_reader.fillRemaining(.none);
    const stderr = multi_reader.reader(1).buffered();

    if (stderr.len > 0) {
        std.debug.print("{s}", .{stderr});
    }

    try eos_err;

    // Send EOF to stdin.
    child.stdin.?.close(io);
    child.stdin = null;

    switch (try child.wait(io)) {
        .exited => |code| {
            if (code != 0) {
                std.log.err(
                    "the following command exited with error code {d}:\n{s}",
                    .{ code, try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items) },
                );
                return error.WasmCompilationFailed;
            }
        },
        .signal => |sig| {
            std.log.err(
                "the following command terminated with signal {t}:\n{s}",
                .{ sig, try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items) },
            );
            return error.WasmCompilationFailed;
        },
        .stopped => |sig| {
            std.log.err(
                "the following command stopped unexpectedly with signal {t}:\n{s}",
                .{ sig, try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items) },
            );
            return error.WasmCompilationFailed;
        },
        .unknown => {
            std.log.err(
                "the following command terminated unexpectedly:\n{s}",
                .{try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items)},
            );
            return error.WasmCompilationFailed;
        },
    }

    if (result_error_bundle.errorMessageCount() > 0) {
        try result_error_bundle.renderToStderr(io, .{}, .auto);
        std.log.err("the following command failed with {d} compilation errors:\n{s}", .{
            result_error_bundle.errorMessageCount(),
            try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items),
        });
        return error.WasmCompilationFailed;
    }

    return result orelse {
        std.log.err("child process failed to report result\n{s}", .{
            try std.Build.Step.allocPrintCmd(arena, .inherit, null, argv.items),
        });
        return error.WasmCompilationFailed;
    };
}

fn sendMessage(io: Io, file: Io.File, tag: std.zig.Client.Message.Tag) !void {
    const header: std.zig.Client.Message.Header = .{
        .tag = tag,
        .bytes_len = 0,
    };
    var w = file.writer(io, &.{});
    w.interface.writeStruct(header, .little) catch |err| switch (err) {
        error.WriteFailed => return w.err.?,
    };
}

fn openBrowserTab(io: Io, url: []const u8) !void {
    // Until https://github.com/ziglang/zig/issues/19205 is implemented, we
    // spawn and then leak a concurrent task for this child process.
    const future = try io.concurrent(openBrowserTabTask, .{ io, url });
    _ = future; // leak it
}

fn openBrowserTabTask(io: Io, url: []const u8) !void {
    const main_exe = switch (builtin.os.tag) {
        .windows => "explorer",
        .macos => "open",
        else => "xdg-open",
    };
    var child = try std.process.spawn(io, .{
        .argv = &.{ main_exe, url },
        .stdin = .ignore,
        .stdout = .ignore,
        .stderr = .ignore,
    });
    _ = try child.wait(io);
}

fn usage(io: Io) noreturn {
    Io.File.stdout().writeStreamingAll(io,
        \\Usage: serve [options]
        \\
        \\Options:
        \\  -h, --help                Print this help and exit
        \\  -p [port], --port [port]  Port to listen on. Default is 0, meaning an ephemeral port chosen by the system.
        \\  --[no-]open-browser       Force enabling or disabling opening a browser tab to the served website.
        \\                            By default, enabled unless a port is specified.
        \\
    ) catch {};
    std.process.exit(0);
}
