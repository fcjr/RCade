const std = @import("std");
const log = std.log;
const assert = std.debug.assert;
const gpa = std.heap.wasm_allocator;

const js = struct {
    extern "js" fn log(ptr: [*]const u8, len: usize) void;
    extern "js" fn panic(ptr: [*]const u8, len: usize) noreturn;
    extern "js" fn buttons(ptr: [*]u8, len: usize) void;
    extern "js" fn fillText(ptr: [*]const u8, len: usize, size: u16, x: u16, y: u16) void;
};

pub const std_options: std.Options = .{
    .logFn = logFn,
    .log_level = .debug,
};

pub fn panic(msg: []const u8, st: ?*std.builtin.StackTrace, addr: ?usize) noreturn {
    _ = st;
    _ = addr;
    log.err("panic: {s}", .{msg});
    @trap();
}

fn logFn(
    comptime message_level: log.Level,
    comptime scope: @TypeOf(.enum_literal),
    comptime format: []const u8,
    args: anytype,
) void {
    const level_txt = comptime message_level.asText();
    const prefix2 = if (scope == .default) ": " else "(" ++ @tagName(scope) ++ "): ";
    var buf: [500]u8 = undefined;
    const line = std.fmt.bufPrint(&buf, level_txt ++ prefix2 ++ format, args) catch l: {
        buf[buf.len - 3 ..][0..3].* = "...".*;
        break :l &buf;
    };
    js.log(line.ptr, line.len);
}

const String = Slice(u8);

fn Slice(T: type) type {
    return packed struct(u64) {
        ptr: u32,
        len: u32,

        const empty: @This() = .{ .ptr = 0, .len = 0 };

        fn init(s: []const T) @This() {
            return .{
                .ptr = @intFromPtr(s.ptr),
                .len = s.len,
            };
        }
    };
}

const Buttons = extern struct {
    a: bool,
    b: bool,
    up: bool,
    down: bool,
    left: bool,
    right: bool,
    start: bool,
};

fn fillText(text: []const u8, size: u16, x: u16, y: u16) void {
    js.fillText(text.ptr, text.len, size, x, y);
}

/// The main game loop.
export fn update() void {
    var button_buffer: [16]u8 = undefined;
    js.buttons(&button_buffer, button_buffer.len);
    const buttons: [2]*const Buttons = .{
        @ptrCast(&button_buffer[0]),
        @ptrCast(&button_buffer[8]),
    };

    if (buttons[0].a) {
        fillText("player 1 A pressed", 30, 1, 100);
    }
    if (buttons[1].b) {
        fillText("player 2 B pressed", 30, 1, 100);
    }
}
