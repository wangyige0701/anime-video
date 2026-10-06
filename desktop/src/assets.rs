use gpui::{AssetSource, Result, SharedString};
use std::borrow::Cow;

pub struct FileAssets;

impl AssetSource for FileAssets {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        std::fs::read(path)
            .map(Cow::Owned)
            .map(Some)
            .map_err(Into::into)
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        Ok(std::fs::read_dir(path)?
            .filter_map(|entry| {
                Some(SharedString::from(
                    entry.ok()?.path().to_string_lossy().into_owned(),
                ))
            })
            .collect())
    }
}
