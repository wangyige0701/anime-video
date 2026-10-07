use crate::logging;

#[cfg(windows)]
pub enum InstanceState {
    Acquired(InstanceGuard),
    AlreadyRunning,
}

#[cfg(windows)]
pub struct InstanceGuard(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(self.0) };
    }
}

#[cfg(windows)]
pub fn acquire(application_id: &str) -> InstanceState {
    use windows::{
        Win32::{
            Foundation::{ERROR_ALREADY_EXISTS, GetLastError},
            System::Threading::CreateMutexW,
        },
        core::HSTRING,
    };

    let name = HSTRING::from(format!("Local\\{application_id}.desktop"));
    let handle = match unsafe { CreateMutexW(None, true, &name) } {
        Ok(handle) => handle,
        Err(error) => {
            logging::error(format!("创建单实例互斥体失败: {error:?}"));
            return InstanceState::Acquired(InstanceGuard(windows::Win32::Foundation::HANDLE(
                std::ptr::null_mut(),
            )));
        }
    };
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        logging::info("检测到已有桌面端进程，当前进程仅发送已启动通知");
        let _ = unsafe { windows::Win32::Foundation::CloseHandle(handle) };
        return InstanceState::AlreadyRunning;
    }
    logging::info("桌面端单实例互斥体创建成功");
    InstanceState::Acquired(InstanceGuard(handle))
}

#[cfg(not(windows))]
pub struct InstanceGuard;

#[cfg(not(windows))]
pub enum InstanceState {
    Acquired(InstanceGuard),
}

#[cfg(not(windows))]
pub fn acquire(_: &str) -> InstanceState {
    InstanceState::Acquired(InstanceGuard)
}
