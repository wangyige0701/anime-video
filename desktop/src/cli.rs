use serde::Deserialize;
use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Service {
    Api,
    Web,
}

impl Service {
    pub fn cli_name(self) -> &'static str {
        match self {
            Self::Api => "server",
            Self::Web => "web",
        }
    }

    pub fn key(self) -> usize {
        match self {
            Self::Api => 0,
            Self::Web => 1,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Api => "接口服务",
            Self::Web => "网页服务",
        }
    }

    pub fn log_component(self) -> &'static str {
        match self {
            Self::Api => "app",
            Self::Web => "web",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum ServiceAction {
    Start,
    Stop,
    Restart,
}

impl ServiceAction {
    fn cli_name(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Start => "启动",
            Self::Stop => "停止",
            Self::Restart => "重启",
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ServiceStatus {
    pub service: String,
    pub state: String,
}

impl ServiceStatus {
    pub fn stopped(service: Service) -> Self {
        Self {
            service: service.cli_name().to_string(),
            state: "stopped".to_string(),
            ..Default::default()
        }
    }
}

#[derive(Clone, Debug)]
pub struct Snapshot {
    pub api: ServiceStatus,
    pub web: ServiceStatus,
    pub directories: Vec<String>,
}

#[derive(Deserialize)]
struct StatusResponse {
    services: Vec<ServiceStatus>,
}

pub fn load_snapshot() -> Result<Snapshot, String> {
    let response: StatusResponse = parse_json(&run_cli(&["status", "--json"])?)?;
    let directories: Vec<String> = parse_json(&run_cli(&["dir", "list", "--json"])?)?;

    let api = response
        .services
        .iter()
        .find(|service| service.service == "server")
        .cloned()
        .unwrap_or_else(|| ServiceStatus::stopped(Service::Api));
    let web = response
        .services
        .iter()
        .find(|service| service.service == "web")
        .cloned()
        .unwrap_or_else(|| ServiceStatus::stopped(Service::Web));

    Ok(Snapshot {
        api,
        web,
        directories,
    })
}

pub fn run_service_action(action: ServiceAction, service: Option<Service>) -> Result<(), String> {
    let mut args = vec![action.cli_name()];
    if let Some(service) = service {
        args.push(service.cli_name());
    }
    run_cli(&args).map(|_| ())
}

pub fn add_directories(directories: &[String]) -> Result<(), String> {
    let mut args = vec!["dir", "add"];
    args.extend(directories.iter().map(String::as_str));
    run_cli(&args).map(|_| ())
}

pub fn delete_directory(index: usize) -> Result<(), String> {
    let index = index.to_string();
    run_cli(&["dir", "del", &index]).map(|_| ())
}

pub fn log_directory(service: Service) -> PathBuf {
    workspace_root().join("logs").join(service.log_component())
}

fn run_cli(args: &[&str]) -> Result<String, String> {
    let mut command = cli_command();
    command.args(args);

    let output = command
        .output()
        .map_err(|error| format!("无法执行服务命令: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        return Ok(stdout);
    }

    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(if detail.is_empty() {
        format!("服务命令退出，状态码: {}", output.status)
    } else {
        detail
    })
}

fn cli_command() -> Command {
    if cfg!(debug_assertions) {
        let executable = if cfg!(windows) { "pnpm.cmd" } else { "pnpm" };
        let mut command = Command::new(executable);
        command
            .current_dir(workspace_root())
            .args(["run", "server", "cli"]);
        return command;
    }

    let executable = if cfg!(windows) { "node.exe" } else { "node" };
    let mut command = Command::new(executable);
    command
        .current_dir(workspace_root().join("server"))
        .arg("dist/cli.js");
    command
}

fn parse_json<T: for<'a> Deserialize<'a>>(output: &str) -> Result<T, String> {
    serde_json::from_str(output)
        .or_else(|_| {
            output
                .lines()
                .rev()
                .find(|line| line.trim_start().starts_with(['{', '[']))
                .ok_or_else(|| "服务命令没有返回结构化数据".to_string())
                .and_then(|line| serde_json::from_str(line).map_err(|error| error.to_string()))
        })
        .map_err(|error| format!("无法读取服务状态: {error}"))
}

fn workspace_root() -> PathBuf {
    if let Ok(root) = env::var("ANIME_VIDEO_ROOT") {
        return PathBuf::from(root);
    }

    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("desktop 必须位于工作区根目录下")
        .to_path_buf()
}
