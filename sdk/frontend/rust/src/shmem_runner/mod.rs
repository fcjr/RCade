pub mod guard;

use js_sys::SharedArrayBuffer;
use wasm_bindgen::prelude::*;
use web_sys::{Worker, WorkerOptions, WorkerType};

use crate::channel::PluginChannel;
use crate::shmem_runner::guard::MemoryGuard;

// Lock states
const UNLOCKED: i32 = 0;
const LOCKED_BY_RUST: i32 = 1;

#[allow(unused)]
const LOCKED_BY_JS: i32 = 2;

// Memory layout:
// [0-3]: lock (i32)
// [4..]: user data
const LOCK_OFFSET: usize = 0;
const DATA_OFFSET: usize = 4;

pub struct PluginSharedMemoryRunner {
    memory: SharedArrayBuffer,
    worker: Worker,
    lock_view: js_sys::Int32Array,
}

impl Drop for PluginSharedMemoryRunner {
    fn drop(&mut self) {
        self.worker.terminate();
    }
}

impl PluginSharedMemoryRunner {
    /// Spawns a new plugin worker with the given JS code and communication channel
    pub fn spawn(js_code: &str, channel: PluginChannel, memory_size: u32) -> Result<Self, JsValue> {
        let memory = SharedArrayBuffer::new(memory_size + 4);

        // Create lock view
        let lock_view = js_sys::Int32Array::new_with_byte_offset_and_length(&memory, 0, 1);

        // Create worker options for module worker
        let opts = WorkerOptions::new();
        opts.set_type(WorkerType::Module);

        let bag = web_sys::BlobPropertyBag::new();
        bag.set_type("application/javascript");

        // Create a blob URL for the worker code
        let worker_code = Self::create_worker_code(js_code);
        let blob = web_sys::Blob::new_with_str_sequence_and_options(
            &js_sys::Array::of1(&JsValue::from_str(&worker_code)),
            &bag,
        )?;

        let url = web_sys::Url::create_object_url_with_blob(&blob)?;
        let worker = Worker::new_with_options(&url, &opts)?;

        // Transfer the MessagePort to the worker along with shared memory
        let init_msg = js_sys::Object::new();
        js_sys::Reflect::set(&init_msg, &"memory".into(), &memory)?;

        let transfer = js_sys::Array::new();
        transfer.push(&channel.get_port());

        worker.post_message_with_transfer(&init_msg, &transfer)?;

        // Clean up blob URL
        web_sys::Url::revoke_object_url(&url)?;

        Ok(Self {
            memory,
            worker,
            lock_view,
        })
    }

    /// Acquires the lock for Rust access (blocking)
    pub fn lock_blocking<'a>(&'a self) -> MemoryGuard<'a> {
        loop {
            // Try to acquire lock
            let prev = js_sys::Atomics::compare_exchange(
                &self.lock_view,
                LOCK_OFFSET as u32,
                UNLOCKED,
                LOCKED_BY_RUST,
            )
            .unwrap();

            if prev == UNLOCKED {
                // Successfully acquired lock
                break;
            }

            // Wait for lock to be released
            let _ = js_sys::Atomics::wait(&self.lock_view, LOCK_OFFSET as u32, prev);
        }

        MemoryGuard {
            lock_view: &self.lock_view,
            memory: &self.memory,
        }
    }

    /// Tries to acquire the lock without blocking
    pub fn try_lock<'a>(&'a self) -> Option<MemoryGuard<'a>> {
        let prev = js_sys::Atomics::compare_exchange(
            &self.lock_view,
            LOCK_OFFSET as u32,
            UNLOCKED,
            LOCKED_BY_RUST,
        )
        .unwrap();

        if prev == UNLOCKED {
            Some(MemoryGuard {
                lock_view: &self.lock_view,
                memory: &self.memory,
            })
        } else {
            None
        }
    }

    /// Creates the wrapper code that sets up the worker environment
    fn create_worker_code(user_code: &str) -> String {
        static WORKER_FOOTER: &'static str = include_str!("./worker.js");

        format!("{user_code}\n{WORKER_FOOTER}")
    }
}
