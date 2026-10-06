use std::path::PathBuf;

#[cfg(windows)]
pub fn choose_directories() -> async_channel::Receiver<Result<Option<Vec<PathBuf>>, String>> {
    let (sender, receiver) = async_channel::bounded(1);
    std::thread::spawn(move || {
        let _ = sender.send_blocking(choose_directories_on_sta_thread());
    });
    receiver
}

#[cfg(windows)]
fn choose_directories_on_sta_thread() -> Result<Option<Vec<PathBuf>>, String> {
    use windows::{
        Win32::{
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoTaskMemFree, CoUninitialize,
            },
            UI::Shell::{
                FOLDERID_Desktop, FOLDERID_Videos, FOS_ALLOWMULTISELECT, FOS_DONTADDTORECENT,
                FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, FileOpenDialog,
                IFileOpenDialog, IShellItem, KF_FLAG_DEFAULT, SHGetKnownFolderItem,
                SIGDN_FILESYSPATH,
            },
        },
        core::{HRESULT, HSTRING},
    };

    struct ComApartment;

    impl Drop for ComApartment {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }
        .ok()
        .map_err(|error| format!("无法初始化目录选择器: {error}"))?;
    let _apartment = ComApartment;

    let dialog: IFileOpenDialog = unsafe {
        CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| format!("无法创建目录选择器: {error}"))?
    };
    let options = FOS_PICKFOLDERS
        | FOS_ALLOWMULTISELECT
        | FOS_FORCEFILESYSTEM
        | FOS_PATHMUSTEXIST
        | FOS_DONTADDTORECENT;
    unsafe {
        dialog
            .SetOptions(options)
            .map_err(|error| format!("无法配置目录选择器: {error}"))?;
        dialog
            .SetTitle(&HSTRING::from("选择视频检索目录"))
            .map_err(|error| format!("无法设置目录选择器标题: {error}"))?;
        dialog
            .SetOkButtonLabel(&HSTRING::from("选择文件夹"))
            .map_err(|error| format!("无法设置目录选择器按钮: {error}"))?;

        // SetFolder 会覆盖系统记住的上次位置，保证每次都从“视频”目录开始。
        let initial_folder =
            SHGetKnownFolderItem::<IShellItem>(&FOLDERID_Videos, KF_FLAG_DEFAULT, None)
                .or_else(|_| {
                    SHGetKnownFolderItem::<IShellItem>(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None)
                })
                .map_err(|error| format!("无法定位目录选择器初始位置: {error}"))?;
        dialog
            .SetFolder(&initial_folder)
            .map_err(|error| format!("无法设置目录选择器初始位置: {error}"))?;
    }

    if let Err(error) = unsafe { dialog.Show(None) } {
        const CANCELLED: HRESULT = HRESULT(0x800704c7_u32 as i32);
        if error.code() == CANCELLED {
            return Ok(None);
        }
        return Err(format!("无法显示目录选择器: {error}"));
    }

    let results = unsafe {
        dialog
            .GetResults()
            .map_err(|error| format!("无法读取所选目录: {error}"))?
    };
    let count = unsafe {
        results
            .GetCount()
            .map_err(|error| format!("无法读取所选目录数量: {error}"))?
    };
    let mut paths = Vec::with_capacity(count as usize);
    for index in 0..count {
        let item = unsafe {
            results
                .GetItemAt(index)
                .map_err(|error| format!("无法读取所选目录: {error}"))?
        };
        let raw_path = unsafe {
            item.GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|error| format!("无法解析所选目录: {error}"))?
        };
        let path = unsafe { raw_path.to_string() };
        unsafe { CoTaskMemFree(Some(raw_path.0.cast())) };
        let path = path.map_err(|error| format!("无法解析所选目录: {error}"))?;
        paths.push(PathBuf::from(path));
    }

    Ok(Some(paths))
}

#[cfg(not(windows))]
pub fn choose_directories() -> async_channel::Receiver<Result<Option<Vec<PathBuf>>, String>> {
    let (sender, receiver) = async_channel::bounded(1);
    let _ = sender.try_send(Err("目录选择器仅支持 Windows".to_string()));
    receiver
}
