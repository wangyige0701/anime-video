use crate::cli::Snapshot;
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Clone)]
pub struct CachedState {
    inner: Arc<Mutex<CachedStateInner>>,
}

#[derive(Clone)]
pub struct CachedData {
    pub snapshot: Snapshot,
    pub snapshot_loaded: bool,
    pub web_url: Option<String>,
}

struct CachedStateInner {
    snapshot: Snapshot,
    snapshot_loaded: bool,
    web_url: Option<String>,
}

impl CachedState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CachedStateInner {
                snapshot: Snapshot::stopped(),
                snapshot_loaded: false,
                web_url: None,
            })),
        }
    }

    pub fn read(&self) -> CachedData {
        let state = self.lock();
        CachedData {
            snapshot: state.snapshot.clone(),
            snapshot_loaded: state.snapshot_loaded,
            web_url: state.web_url.clone(),
        }
    }

    pub fn update_snapshot(&self, snapshot: Snapshot) {
        let mut state = self.lock();
        state.snapshot = snapshot;
        state.snapshot_loaded = true;
    }

    pub fn update_web_url(&self, web_url: String) {
        self.lock().web_url = Some(web_url);
    }

    fn lock(&self) -> MutexGuard<'_, CachedStateInner> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }
}

impl Default for CachedState {
    fn default() -> Self {
        Self::new()
    }
}
