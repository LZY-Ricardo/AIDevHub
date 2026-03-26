use std::fs;

use crate::{
    model::{AppError, AppSettings},
    ops::AppPaths,
};

fn settings_path(paths: &AppPaths) -> std::path::PathBuf {
    paths.app_local_data_dir.join("app_settings.json")
}

pub fn load_settings(paths: &AppPaths) -> Result<AppSettings, AppError> {
    let path = settings_path(paths);
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s)
            .map_err(|e| AppError::new("PARSE_ERROR", format!("parse {}: {e}", path.display()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppSettings::default()),
        Err(e) => Err(AppError::new("IO_ERROR", format!("read {}: {e}", path.display()))),
    }
}

pub fn save_settings(paths: &AppPaths, settings: AppSettings) -> Result<AppSettings, AppError> {
    fs::create_dir_all(&paths.app_local_data_dir)
        .map_err(|e| AppError::new("IO_ERROR", format!("mkdir {}: {e}", paths.app_local_data_dir.display())))?;

    let path = settings_path(paths);
    let text = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize app_settings: {e}")))?;
    fs::write(&path, text).map_err(|e| AppError::new("IO_ERROR", format!("write {}: {e}", path.display())))?;
    Ok(settings)
}
