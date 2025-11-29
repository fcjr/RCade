use js_sys::SharedArrayBuffer;

use crate::shmem_runner::{DATA_OFFSET, LOCK_OFFSET, UNLOCKED};

pub struct MemoryGuard<'a> {
    pub(super) lock_view: &'a js_sys::Int32Array,
    pub(super) memory: &'a SharedArrayBuffer,
}

impl<'a> MemoryGuard<'a> {
    /// Get a view of the data region (excludes lock bytes)
    pub fn data_view(&self) -> js_sys::Uint8Array {
        js_sys::Uint8Array::new_with_byte_offset(self.memory, DATA_OFFSET as u32)
    }

    /// Get the full memory buffer
    pub fn memory(&self) -> &SharedArrayBuffer {
        self.memory
    }
}

impl<'a> Drop for MemoryGuard<'a> {
    fn drop(&mut self) {
        // Release lock
        let _ = js_sys::Atomics::store(self.lock_view, LOCK_OFFSET as u32, UNLOCKED);
        // Wake up one waiter
        let _ = js_sys::Atomics::notify_with_count(self.lock_view, LOCK_OFFSET as u32, 1);
    }
}
