use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    model::{
        AppError, Client, DeploymentStatus, DeploymentTargetType, ManagedSkillView,
        SkillCatalogEntry, SkillDeployment, SkillManifest, SkillRepoGetResponse, SkillRepoSource,
        SkillSourceDetail, SkillSupportMode, SkillSyncEvent, SkillSyncEventType,
        SkillTargetProfile, Warning, WritePreview, WriteSummary,
    },
    ops::AppPaths,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SkillIndexStore {
    version: u32,
    #[serde(default)]
    skills: Vec<SkillCatalogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SkillDeploymentStore {
    version: u32,
    #[serde(default)]
    deployments: Vec<SkillDeployment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SkillTargetProfileStore {
    version: u32,
    #[serde(default)]
    targets: Vec<SkillTargetProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SkillSyncEventStore {
    version: u32,
    #[serde(default)]
    events: Vec<SkillSyncEvent>,
}

fn io_error(action: &str, path: &Path, err: impl std::fmt::Display) -> AppError {
    AppError::new("IO_ERROR", format!("{action} {}: {err}", path.display()))
}

fn validation_error(message: impl Into<String>) -> AppError {
    AppError::new("VALIDATION_ERROR", message.into())
}

fn ensure_dir(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path).map_err(|e| io_error("mkdir", path, e))
}

fn read_to_string(path: &Path) -> Result<String, AppError> {
    fs::read_to_string(path).map_err(|e| io_error("read", path, e))
}

fn read_to_string_lossy(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|e| io_error("read", path, e))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn write_atomic(path: &Path, content: &str) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let parent = path.parent().ok_or_else(|| {
        AppError::new(
            "INTERNAL_ERROR",
            format!("missing parent for {}", path.display()),
        )
    })?;
    let tmp = parent.join(format!(
        ".tmp-{}-{}.json",
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("file"),
        Uuid::new_v4()
    ));
    fs::write(&tmp, content).map_err(|e| io_error("write", &tmp, e))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path).map_err(|e| io_error("remove", path, e))?;
    }
    fs::rename(&tmp, path).map_err(|e| io_error("rename", path, e))
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), AppError> {
    ensure_dir(to)?;
    for entry in fs::read_dir(from).map_err(|e| io_error("read_dir", from, e))? {
        let entry = entry.map_err(|e| io_error("read_dir", from, e))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| io_error("file_type", &src, e))?;
        if file_type.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else if file_type.is_file() {
            if let Some(parent) = dst.parent() {
                ensure_dir(parent)?;
            }
            fs::copy(&src, &dst).map_err(|e| io_error("copy", &src, e))?;
        }
    }
    Ok(())
}

fn replace_dir_contents(from: &Path, to: &Path) -> Result<(), AppError> {
    if to.exists() {
        fs::remove_dir_all(to).map_err(|e| io_error("remove_dir", to, e))?;
    }
    copy_dir_recursive(from, to)
}

fn collect_tree_files(root: &Path) -> Result<Vec<PathBuf>, AppError> {
    let mut out = Vec::new();
    fn walk(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), AppError> {
        for entry in fs::read_dir(current).map_err(|e| io_error("read_dir", current, e))? {
            let entry = entry.map_err(|e| io_error("read_dir", current, e))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|e| io_error("file_type", &path, e))?;
            if file_type.is_dir() {
                walk(root, &path, out)?;
            } else if file_type.is_file() {
                out.push(path.strip_prefix(root).unwrap_or(&path).to_path_buf());
            }
        }
        Ok(())
    }
    if root.exists() {
        walk(root, root, &mut out)?;
    }
    out.sort();
    Ok(out)
}

fn hash_tree(root: &Path) -> Result<String, AppError> {
    let mut hasher = Sha256::new();
    for rel in collect_tree_files(root)? {
        hasher.update(rel.to_string_lossy().as_bytes());
        let bytes = fs::read(root.join(&rel)).map_err(|e| io_error("read", &root.join(&rel), e))?;
        hasher.update(&bytes);
    }
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

fn parse_frontmatter(text: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut lines = text.lines();
    if lines.next().map(|l| l.trim()) != Some("---") {
        return out;
    }
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            out.insert(
                k.trim().to_string(),
                v.trim().trim_matches('"').trim_matches('\'').to_string(),
            );
        }
    }
    out
}

fn slug_is_valid(slug: &str) -> bool {
    !slug.trim().is_empty()
        && slug == slug.trim()
        && !slug.contains('/')
        && !slug.contains('\\')
        && !slug.contains("..")
        && !slug.ends_with('.')
        && !slug.ends_with(' ')
}

fn skill_dir_name(client: Client, name: &str) -> String {
    match client {
        Client::ClaudeCode => name.to_string(),
        Client::Codex => name.to_string(),
    }
}

fn skill_support_mode_for_client(client: Client) -> SkillSupportMode {
    match client {
        Client::ClaudeCode => SkillSupportMode::ClaudeOnly,
        Client::Codex => SkillSupportMode::CodexOnly,
    }
}

fn stable_skill_id(slug: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(slug.as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    format!("skill-{}", &hex[..16])
}

fn manifest_path(repo_root: &Path) -> PathBuf {
    repo_root.join("manifest.json")
}

fn deployment_index_path(paths: &AppPaths) -> PathBuf {
    paths.skill_indexes_root.join("skill_deployments.json")
}

fn target_profiles_path(paths: &AppPaths) -> PathBuf {
    paths.skill_indexes_root.join("skill_targets.json")
}

fn sync_events_path(paths: &AppPaths) -> PathBuf {
    paths.skill_indexes_root.join("skill_sync_events.json")
}

fn entry_rel_path() -> &'static str {
    "SKILL.md"
}

fn load_index(paths: &AppPaths) -> Result<SkillIndexStore, AppError> {
    ensure_skill_store_layout(paths)?;
    let raw = read_to_string(&paths.skill_index_path)?;
    serde_json::from_str(&raw).map_err(|e| {
        AppError::new(
            "PARSE_ERROR",
            format!("parse {}: {e}", paths.skill_index_path.display()),
        )
    })
}

fn load_deployments(paths: &AppPaths) -> Result<SkillDeploymentStore, AppError> {
    ensure_skill_store_layout(paths)?;
    let path = deployment_index_path(paths);
    let raw = read_to_string(&path)?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::new("PARSE_ERROR", format!("parse {}: {e}", path.display())))
}

fn load_target_profiles(paths: &AppPaths) -> Result<SkillTargetProfileStore, AppError> {
    ensure_skill_store_layout(paths)?;
    let path = target_profiles_path(paths);
    let raw = read_to_string(&path)?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::new("PARSE_ERROR", format!("parse {}: {e}", path.display())))
}

fn load_sync_events(paths: &AppPaths) -> Result<SkillSyncEventStore, AppError> {
    ensure_skill_store_layout(paths)?;
    let path = sync_events_path(paths);
    let raw = read_to_string(&path)?;
    serde_json::from_str(&raw)
        .map_err(|e| AppError::new("PARSE_ERROR", format!("parse {}: {e}", path.display())))
}

fn save_index(paths: &AppPaths, store: &SkillIndexStore) -> Result<(), AppError> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize skill index: {e}")))?;
    write_atomic(&paths.skill_index_path, &raw)
}

fn save_deployments(paths: &AppPaths, store: &SkillDeploymentStore) -> Result<(), AppError> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize deployment index: {e}")))?;
    write_atomic(&deployment_index_path(paths), &raw)
}

fn save_target_profiles(paths: &AppPaths, store: &SkillTargetProfileStore) -> Result<(), AppError> {
    let raw = serde_json::to_string_pretty(store).map_err(|e| {
        AppError::new(
            "INTERNAL_ERROR",
            format!("serialize target profile index: {e}"),
        )
    })?;
    write_atomic(&target_profiles_path(paths), &raw)
}

fn save_sync_events(paths: &AppPaths, store: &SkillSyncEventStore) -> Result<(), AppError> {
    let raw = serde_json::to_string_pretty(store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize sync event index: {e}")))?;
    write_atomic(&sync_events_path(paths), &raw)
}

fn sha256_text(s: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(s.as_bytes()))
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|e| io_error("read", path, e))?;
    Ok(format!("sha256:{:x}", Sha256::digest(&bytes)))
}

fn current_file_hash(path: &Path) -> Result<Option<String>, AppError> {
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(sha256_file(path)?))
}

fn verify_expected_files(
    expected_files: &[crate::model::FilePrecondition],
) -> Result<(), AppError> {
    let mismatches: Vec<_> = expected_files
        .iter()
        .filter_map(|expected| {
            let path = PathBuf::from(&expected.path);
            let current = current_file_hash(&path).ok().flatten();
            if current != expected.expected_before_sha256 {
                Some(expected.clone())
            } else {
                None
            }
        })
        .collect();
    if mismatches.is_empty() {
        Ok(())
    } else {
        Err(AppError::new(
            "PRECONDITION_FAILED",
            "Target files changed since preview; please preview again.",
        )
        .with_details(serde_json::json!({ "mismatches": mismatches })))
    }
}

fn write_manifest(repo_root: &Path, manifest: &SkillManifest) -> Result<(), AppError> {
    let raw = serde_json::to_string_pretty(manifest)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize manifest: {e}")))?;
    write_atomic(&manifest_path(repo_root), &raw)
}

fn map_entry_to_view(entry: &SkillCatalogEntry) -> ManagedSkillView {
    ManagedSkillView {
        skill_id: entry.skill_id.clone(),
        slug: entry.slug.clone(),
        display_name: entry.display_name.clone(),
        description: entry.description.clone(),
        support_mode: entry.support_mode,
        version: entry.version,
        updated_at: entry.updated_at.clone(),
    }
}

fn map_entry_to_manifest(entry: &SkillCatalogEntry) -> SkillManifest {
    SkillManifest {
        skill_id: entry.skill_id.clone(),
        slug: entry.slug.clone(),
        display_name: entry.display_name.clone(),
        description: entry.description.clone(),
        support_mode: entry.support_mode,
        repo_root: entry.repo_root.clone(),
        files_root: entry.files_root.clone(),
        entry_rel_path: entry.entry_rel_path.clone(),
        source: entry.source,
        source_detail: entry.source_detail.clone(),
        content_hash: entry.content_hash.clone(),
        version: entry.version,
        created_at: entry.created_at.clone(),
        updated_at: entry.updated_at.clone(),
    }
}

fn update_catalog_entry(paths: &AppPaths, updated: &SkillCatalogEntry) -> Result<(), AppError> {
    let mut store = load_index(paths)?;
    let entry = store
        .skills
        .iter_mut()
        .find(|skill| skill.skill_id == updated.skill_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {}", updated.skill_id),
            )
        })?;
    *entry = updated.clone();
    save_index(paths, &store)
}

fn append_sync_event(
    paths: &AppPaths,
    skill_id: &str,
    deployment_id: Option<String>,
    event_type: SkillSyncEventType,
    message: String,
) -> Result<(), AppError> {
    let mut store = load_sync_events(paths)?;
    store.events.push(SkillSyncEvent {
        event_id: Uuid::new_v4().to_string(),
        skill_id: skill_id.to_string(),
        deployment_id,
        event_type,
        message,
        created_at: Utc::now().to_rfc3339(),
    });
    save_sync_events(paths, &store)
}

fn upsert_target_profile(
    paths: &AppPaths,
    target_type: DeploymentTargetType,
    client: Client,
    project_root: Option<String>,
    target_root: String,
) -> Result<(), AppError> {
    if project_root.is_none() {
        return Ok(());
    }
    let mut store = load_target_profiles(paths)?;
    if let Some(existing) = store
        .targets
        .iter_mut()
        .find(|target| target.target_type == target_type && target.project_root == project_root)
    {
        existing.updated_at = Utc::now().to_rfc3339();
        existing.target_root = target_root;
    } else {
        let project_root_value = project_root.clone();
        store.targets.push(SkillTargetProfile {
            target_profile_id: Uuid::new_v4().to_string(),
            name: format!(
                "{} {}",
                match client {
                    Client::ClaudeCode => "Claude",
                    Client::Codex => "Codex",
                },
                project_root_value.clone().unwrap_or_default()
            ),
            target_type,
            client,
            project_root,
            target_root,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        });
    }
    save_target_profiles(paths, &store)
}

fn build_tree_preview(
    from_root: &Path,
    to_root: &Path,
) -> Result<Vec<crate::model::FileChangePreview>, AppError> {
    let mut rels = collect_tree_files(from_root)?;
    for rel in collect_tree_files(to_root)? {
        if !rels.contains(&rel) {
            rels.push(rel);
        }
    }
    rels.sort();
    rels.dedup();

    rels.into_iter()
        .map(|rel| {
            let from_path = from_root.join(&rel);
            let to_path = to_root.join(&rel);
            let before = if to_path.exists() {
                Some(read_to_string_lossy(&to_path)?)
            } else {
                None
            };
            let after = if from_path.exists() {
                read_to_string_lossy(&from_path)?
            } else {
                String::new()
            };
            Ok(crate::model::FileChangePreview {
                path: to_path.to_string_lossy().to_string(),
                will_create: !to_path.exists() && from_path.exists(),
                before_sha256: before.as_deref().map(sha256_text),
                after_sha256: sha256_text(&after),
                diff_unified: after,
            })
        })
        .collect()
}

fn detect_deployment_status(
    target_root: &Path,
    deployment: &SkillDeployment,
    repo_hash: &str,
) -> Result<DeploymentStatus, AppError> {
    if deployment.status == DeploymentStatus::Disabled {
        return Ok(DeploymentStatus::Disabled);
    }
    if !target_root.exists() {
        return Ok(DeploymentStatus::Missing);
    }

    let current_hash = hash_tree(target_root)?;
    if current_hash == repo_hash {
        Ok(DeploymentStatus::Deployed)
    } else if current_hash == deployment.source_hash {
        Ok(DeploymentStatus::Outdated)
    } else {
        Ok(DeploymentStatus::Drifted)
    }
}

pub fn ensure_skill_store_layout(paths: &AppPaths) -> Result<(), AppError> {
    ensure_dir(&paths.skill_store_root)?;
    ensure_dir(&paths.skill_repo_root)?;
    ensure_dir(&paths.skill_indexes_root)?;
    if !paths.skill_index_path.exists() {
        let store = SkillIndexStore {
            version: 1,
            skills: Vec::new(),
        };
        save_index(paths, &store)?;
    }
    let deployments_path = deployment_index_path(paths);
    if !deployments_path.exists() {
        let store = SkillDeploymentStore {
            version: 1,
            deployments: Vec::new(),
        };
        save_deployments(paths, &store)?;
    }
    let targets_path = target_profiles_path(paths);
    if !targets_path.exists() {
        save_target_profiles(
            paths,
            &SkillTargetProfileStore {
                version: 1,
                targets: Vec::new(),
            },
        )?;
    }
    let events_path = sync_events_path(paths);
    if !events_path.exists() {
        save_sync_events(
            paths,
            &SkillSyncEventStore {
                version: 1,
                events: Vec::new(),
            },
        )?;
    }
    Ok(())
}

pub fn preview_import_skill(
    paths: &AppPaths,
    client: Client,
    name: &str,
    source_dir: &Path,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    if !source_dir.join(entry_rel_path()).exists() {
        return Err(validation_error(
            "only directory-based skills with SKILL.md can be imported",
        ));
    }
    let store = load_index(paths)?;
    if store.skills.iter().any(|s| s.slug == name && !s.archived) {
        return Err(validation_error(format!(
            "repository skill already exists: {name}"
        )));
    }
    let content = read_to_string(&source_dir.join(entry_rel_path()))?;
    let fm = parse_frontmatter(&content);
    let display_name = fm
        .get("name")
        .cloned()
        .unwrap_or_else(|| skill_dir_name(client, name));
    let description = fm.get("description").cloned().unwrap_or_default();
    let tmp_skill_id = stable_skill_id(name);
    let repo_root = paths.skill_repo_root.join(&tmp_skill_id);
    let manifest = SkillManifest {
        skill_id: tmp_skill_id.clone(),
        slug: name.to_string(),
        display_name,
        description,
        support_mode: skill_support_mode_for_client(client),
        repo_root: repo_root.to_string_lossy().to_string(),
        files_root: repo_root.join("files").to_string_lossy().to_string(),
        entry_rel_path: entry_rel_path().to_string(),
        source: SkillRepoSource::ImportedGlobal,
        source_detail: SkillSourceDetail {
            imported_from_client: Some(client),
            imported_from_path: Some(source_dir.to_string_lossy().to_string()),
            imported_at: Some(Utc::now().to_rfc3339()),
        },
        content_hash: "sha256:pending".to_string(),
        version: 1,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    let manifest_raw = serde_json::to_string_pretty(&manifest)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize manifest: {e}")))?;
    let mut next_store = store;
    next_store.skills.push(SkillCatalogEntry {
        skill_id: manifest.skill_id.clone(),
        slug: manifest.slug.clone(),
        display_name: manifest.display_name.clone(),
        description: manifest.description.clone(),
        support_mode: manifest.support_mode,
        repo_root: manifest.repo_root.clone(),
        files_root: manifest.files_root.clone(),
        entry_rel_path: manifest.entry_rel_path.clone(),
        source: manifest.source,
        source_detail: manifest.source_detail.clone(),
        content_hash: manifest.content_hash.clone(),
        version: manifest.version,
        created_at: manifest.created_at.clone(),
        updated_at: manifest.updated_at.clone(),
        archived: false,
    });
    let index_raw = serde_json::to_string_pretty(&next_store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize skill index: {e}")))?;

    Ok(WritePreview {
        files: vec![
            crate::model::FileChangePreview {
                path: manifest_path(&repo_root).to_string_lossy().to_string(),
                will_create: true,
                before_sha256: None,
                after_sha256: format!("sha256:{:x}", Sha256::digest(manifest_raw.as_bytes())),
                diff_unified: manifest_raw,
            },
            crate::model::FileChangePreview {
                path: paths.skill_index_path.to_string_lossy().to_string(),
                will_create: !paths.skill_index_path.exists(),
                before_sha256: None,
                after_sha256: format!("sha256:{:x}", Sha256::digest(index_raw.as_bytes())),
                diff_unified: index_raw,
            },
        ],
        moves: Vec::new(),
        expected_files: Vec::new(),
        summary: WriteSummary {
            will_add: vec![format!("repo:{name}")],
            ..WriteSummary::default()
        },
        warnings: vec![Warning {
            code: "SKIPPED".to_string(),
            message: "Repository preview does not list every copied file in the first phase."
                .to_string(),
            details: None,
        }],
    })
}

pub fn apply_import_skill(
    paths: &AppPaths,
    client: Client,
    name: &str,
    source_dir: &Path,
) -> Result<SkillCatalogEntry, AppError> {
    ensure_skill_store_layout(paths)?;
    if !source_dir.join(entry_rel_path()).exists() {
        return Err(validation_error(
            "only directory-based skills with SKILL.md can be imported",
        ));
    }
    let mut store = load_index(paths)?;
    if store.skills.iter().any(|s| s.slug == name && !s.archived) {
        return Err(validation_error(format!(
            "repository skill already exists: {name}"
        )));
    }

    let content = read_to_string(&source_dir.join(entry_rel_path()))?;
    let fm = parse_frontmatter(&content);
    let skill_id = stable_skill_id(name);
    let repo_root = paths.skill_repo_root.join(&skill_id);
    let files_root = repo_root.join("files");
    copy_dir_recursive(source_dir, &files_root)?;
    let content_hash = hash_tree(&files_root)?;
    let now = Utc::now().to_rfc3339();

    let entry = SkillCatalogEntry {
        skill_id: skill_id.clone(),
        slug: name.to_string(),
        display_name: fm
            .get("name")
            .cloned()
            .unwrap_or_else(|| skill_dir_name(client, name)),
        description: fm.get("description").cloned().unwrap_or_default(),
        support_mode: skill_support_mode_for_client(client),
        repo_root: repo_root.to_string_lossy().to_string(),
        files_root: files_root.to_string_lossy().to_string(),
        entry_rel_path: entry_rel_path().to_string(),
        source: SkillRepoSource::ImportedGlobal,
        source_detail: SkillSourceDetail {
            imported_from_client: Some(client),
            imported_from_path: Some(source_dir.to_string_lossy().to_string()),
            imported_at: Some(now.clone()),
        },
        content_hash,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        archived: false,
    };

    write_manifest(&repo_root, &map_entry_to_manifest(&entry))?;
    store.skills.push(entry.clone());
    save_index(paths, &store)?;
    append_sync_event(
        paths,
        &entry.skill_id,
        None,
        SkillSyncEventType::Imported,
        format!("Imported skill from {}", source_dir.display()),
    )?;
    Ok(entry)
}

pub fn preview_create_repo_skill(
    paths: &AppPaths,
    slug: &str,
    display_name: &str,
    description: &str,
    body: Option<String>,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    if !slug_is_valid(slug) {
        return Err(validation_error("slug is invalid"));
    }
    if display_name.trim().is_empty() {
        return Err(validation_error("display_name is required"));
    }
    if description.trim().is_empty() {
        return Err(validation_error("description is required"));
    }
    let store = load_index(paths)?;
    if store.skills.iter().any(|s| s.slug == slug && !s.archived) {
        return Err(validation_error(format!(
            "repository skill already exists: {slug}"
        )));
    }

    let tmp_skill_id = stable_skill_id(slug);
    let repo_root = paths.skill_repo_root.join(&tmp_skill_id);
    let body_text = body
        .unwrap_or_else(|| "## Instructions\n\n- Describe when to use this skill.\n".to_string());
    let skill_md = format!(
        "---\nname: {display_name}\ndescription: {description}\n---\n\n# {display_name}\n\n{body_text}"
    );
    let manifest = SkillManifest {
        skill_id: tmp_skill_id.clone(),
        slug: slug.to_string(),
        display_name: display_name.to_string(),
        description: description.to_string(),
        support_mode: SkillSupportMode::Both,
        repo_root: repo_root.to_string_lossy().to_string(),
        files_root: repo_root.join("files").to_string_lossy().to_string(),
        entry_rel_path: entry_rel_path().to_string(),
        source: SkillRepoSource::CreatedInternal,
        source_detail: SkillSourceDetail::default(),
        content_hash: "sha256:pending".to_string(),
        version: 1,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    let manifest_raw = serde_json::to_string_pretty(&manifest)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize manifest: {e}")))?;
    let mut next_store = store;
    next_store.skills.push(SkillCatalogEntry {
        skill_id: manifest.skill_id.clone(),
        slug: manifest.slug.clone(),
        display_name: manifest.display_name.clone(),
        description: manifest.description.clone(),
        support_mode: manifest.support_mode,
        repo_root: manifest.repo_root.clone(),
        files_root: manifest.files_root.clone(),
        entry_rel_path: manifest.entry_rel_path.clone(),
        source: manifest.source,
        source_detail: manifest.source_detail.clone(),
        content_hash: manifest.content_hash.clone(),
        version: manifest.version,
        created_at: manifest.created_at.clone(),
        updated_at: manifest.updated_at.clone(),
        archived: false,
    });
    let index_raw = serde_json::to_string_pretty(&next_store)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize skill index: {e}")))?;

    Ok(WritePreview {
        files: vec![
            crate::model::FileChangePreview {
                path: repo_root
                    .join("files")
                    .join(entry_rel_path())
                    .to_string_lossy()
                    .to_string(),
                will_create: true,
                before_sha256: None,
                after_sha256: format!("sha256:{:x}", Sha256::digest(skill_md.as_bytes())),
                diff_unified: skill_md,
            },
            crate::model::FileChangePreview {
                path: manifest_path(&repo_root).to_string_lossy().to_string(),
                will_create: true,
                before_sha256: None,
                after_sha256: format!("sha256:{:x}", Sha256::digest(manifest_raw.as_bytes())),
                diff_unified: manifest_raw,
            },
            crate::model::FileChangePreview {
                path: paths.skill_index_path.to_string_lossy().to_string(),
                will_create: !paths.skill_index_path.exists(),
                before_sha256: None,
                after_sha256: format!("sha256:{:x}", Sha256::digest(index_raw.as_bytes())),
                diff_unified: index_raw,
            },
        ],
        moves: Vec::new(),
        expected_files: Vec::new(),
        summary: WriteSummary {
            will_add: vec![format!("repo:{slug}")],
            ..WriteSummary::default()
        },
        warnings: Vec::new(),
    })
}

pub fn apply_create_repo_skill(
    paths: &AppPaths,
    slug: &str,
    display_name: &str,
    description: &str,
    body: Option<String>,
) -> Result<SkillCatalogEntry, AppError> {
    ensure_skill_store_layout(paths)?;
    if !slug_is_valid(slug) {
        return Err(validation_error("slug is invalid"));
    }
    if display_name.trim().is_empty() {
        return Err(validation_error("display_name is required"));
    }
    if description.trim().is_empty() {
        return Err(validation_error("description is required"));
    }
    let mut store = load_index(paths)?;
    if store.skills.iter().any(|s| s.slug == slug && !s.archived) {
        return Err(validation_error(format!(
            "repository skill already exists: {slug}"
        )));
    }

    let skill_id = stable_skill_id(slug);
    let repo_root = paths.skill_repo_root.join(&skill_id);
    let files_root = repo_root.join("files");
    ensure_dir(&files_root)?;
    let body_text = body
        .unwrap_or_else(|| "## Instructions\n\n- Describe when to use this skill.\n".to_string());
    let skill_md = format!(
        "---\nname: {display_name}\ndescription: {description}\n---\n\n# {display_name}\n\n{body_text}"
    );
    write_atomic(&files_root.join(entry_rel_path()), &skill_md)?;
    let content_hash = hash_tree(&files_root)?;
    let now = Utc::now().to_rfc3339();
    let entry = SkillCatalogEntry {
        skill_id: skill_id.clone(),
        slug: slug.to_string(),
        display_name: display_name.to_string(),
        description: description.to_string(),
        support_mode: SkillSupportMode::Both,
        repo_root: repo_root.to_string_lossy().to_string(),
        files_root: files_root.to_string_lossy().to_string(),
        entry_rel_path: entry_rel_path().to_string(),
        source: SkillRepoSource::CreatedInternal,
        source_detail: SkillSourceDetail::default(),
        content_hash,
        version: 1,
        created_at: now.clone(),
        updated_at: now,
        archived: false,
    };
    write_manifest(&repo_root, &map_entry_to_manifest(&entry))?;
    store.skills.push(entry.clone());
    save_index(paths, &store)?;
    append_sync_event(
        paths,
        &entry.skill_id,
        None,
        SkillSyncEventType::Created,
        format!("Created repository skill {}", entry.slug),
    )?;
    Ok(entry)
}

pub fn list_repo_skills(paths: &AppPaths) -> Result<Vec<ManagedSkillView>, AppError> {
    let mut views: Vec<_> = load_index(paths)?
        .skills
        .into_iter()
        .filter(|skill| !skill.archived)
        .map(|skill| map_entry_to_view(&skill))
        .collect();
    views.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(views)
}

pub fn get_repo_skill(paths: &AppPaths, skill_id: &str) -> Result<SkillRepoGetResponse, AppError> {
    let store = load_index(paths)?;
    let entry = store
        .skills
        .into_iter()
        .find(|skill| skill.skill_id == skill_id && !skill.archived)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {skill_id}"),
            )
        })?;
    let manifest = map_entry_to_manifest(&entry);
    let content =
        read_to_string(&PathBuf::from(&manifest.files_root).join(&manifest.entry_rel_path))?;
    Ok(SkillRepoGetResponse { manifest, content })
}

fn target_root_for(
    paths: &AppPaths,
    target_type: DeploymentTargetType,
    project_root: Option<&str>,
) -> Result<(Client, Option<String>, PathBuf), AppError> {
    match target_type {
        DeploymentTargetType::ClaudeGlobal => {
            Ok((Client::ClaudeCode, None, paths.claude_skills_dir.clone()))
        }
        DeploymentTargetType::CodexGlobal => {
            Ok((Client::Codex, None, paths.codex_skills_dir.clone()))
        }
        DeploymentTargetType::ClaudeProject => {
            let project_root = project_root
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| {
                    validation_error("project_root is required for project deployment")
                })?;
            let root = PathBuf::from(project_root).join(".claude").join("skills");
            Ok((Client::ClaudeCode, Some(project_root.to_string()), root))
        }
        DeploymentTargetType::CodexProject => {
            let project_root = project_root
                .filter(|v| !v.trim().is_empty())
                .ok_or_else(|| {
                    validation_error("project_root is required for project deployment")
                })?;
            let root = PathBuf::from(project_root).join(".codex").join("skills");
            Ok((Client::Codex, Some(project_root.to_string()), root))
        }
    }
}

pub fn list_deployments(
    paths: &AppPaths,
    skill_id: Option<&str>,
) -> Result<Vec<SkillDeployment>, AppError> {
    let mut items = load_deployments(paths)?.deployments;
    if let Some(skill_id) = skill_id {
        items.retain(|deployment| deployment.skill_id == skill_id);
    }
    items.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(items)
}

pub fn preview_deployment_add(
    paths: &AppPaths,
    skill_id: &str,
    target_type: DeploymentTargetType,
    project_root: Option<String>,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    let store = load_index(paths)?;
    let skill = store
        .skills
        .into_iter()
        .find(|item| item.skill_id == skill_id && !item.archived)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {skill_id}"),
            )
        })?;
    let mut deployments = load_deployments(paths)?;
    let (client, project_root, target_root) =
        target_root_for(paths, target_type, project_root.as_deref())?;
    let target_skill_path = target_root.join(&skill.slug);
    if target_skill_path.exists() {
        return Err(validation_error(format!(
            "deployment target already exists: {}",
            target_skill_path.display()
        )));
    }
    let deployment = SkillDeployment {
        deployment_id: Uuid::new_v4().to_string(),
        skill_id: skill.skill_id.clone(),
        target_type,
        client,
        project_root: project_root.clone(),
        target_root: target_root.to_string_lossy().to_string(),
        target_skill_path: target_skill_path.to_string_lossy().to_string(),
        deployed_name: skill.slug.clone(),
        status: DeploymentStatus::Deployed,
        source_hash: skill.content_hash.clone(),
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    deployments.deployments.push(deployment);
    let deployment_raw = serde_json::to_string_pretty(&deployments)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize deployment index: {e}")))?;
    let skill_md_path = PathBuf::from(&skill.files_root).join(&skill.entry_rel_path);
    let skill_md = read_to_string(&skill_md_path)?;
    let expected_files = vec![
        crate::model::FilePrecondition {
            path: target_skill_path
                .join("SKILL.md")
                .to_string_lossy()
                .to_string(),
            expected_before_sha256: None,
        },
        crate::model::FilePrecondition {
            path: deployment_index_path(paths).to_string_lossy().to_string(),
            expected_before_sha256: current_file_hash(&deployment_index_path(paths))?,
        },
    ];

    Ok(WritePreview {
        files: vec![
            crate::model::FileChangePreview {
                path: target_skill_path
                    .join("SKILL.md")
                    .to_string_lossy()
                    .to_string(),
                will_create: true,
                before_sha256: None,
                after_sha256: sha256_text(&skill_md),
                diff_unified: skill_md,
            },
            crate::model::FileChangePreview {
                path: deployment_index_path(paths).to_string_lossy().to_string(),
                will_create: !deployment_index_path(paths).exists(),
                before_sha256: None,
                after_sha256: sha256_text(&deployment_raw),
                diff_unified: deployment_raw,
            },
        ],
        moves: Vec::new(),
        expected_files,
        summary: WriteSummary {
            will_enable: vec![skill.skill_id.clone()],
            ..WriteSummary::default()
        },
        warnings: vec![Warning {
            code: "SKIPPED".to_string(),
            message: "Deployment preview lists the entry file and index update in this phase."
                .to_string(),
            details: None,
        }],
    })
}

pub fn apply_deployment_add(
    paths: &AppPaths,
    skill_id: &str,
    target_type: DeploymentTargetType,
    project_root: Option<String>,
    expected_files: Vec<crate::model::FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    ensure_skill_store_layout(paths)?;
    verify_expected_files(&expected_files)?;
    let store = load_index(paths)?;
    let skill = store
        .skills
        .into_iter()
        .find(|item| item.skill_id == skill_id && !item.archived)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {skill_id}"),
            )
        })?;
    let mut deployments = load_deployments(paths)?;
    let (client, project_root, target_root) =
        target_root_for(paths, target_type, project_root.as_deref())?;
    let target_skill_path = target_root.join(&skill.slug);
    if target_skill_path.exists() {
        return Err(validation_error(format!(
            "deployment target already exists: {}",
            target_skill_path.display()
        )));
    }
    copy_dir_recursive(Path::new(&skill.files_root), &target_skill_path)?;
    let now = Utc::now().to_rfc3339();
    let deployment = SkillDeployment {
        deployment_id: Uuid::new_v4().to_string(),
        skill_id: skill.skill_id.clone(),
        target_type,
        client,
        project_root: project_root.clone(),
        target_root: target_root.to_string_lossy().to_string(),
        target_skill_path: target_skill_path.to_string_lossy().to_string(),
        deployed_name: skill.slug.clone(),
        status: DeploymentStatus::Deployed,
        source_hash: skill.content_hash.clone(),
        created_at: now.clone(),
        updated_at: now,
    };
    deployments.deployments.push(deployment.clone());
    save_deployments(paths, &deployments)?;
    upsert_target_profile(
        paths,
        target_type,
        client,
        project_root.clone(),
        target_root.to_string_lossy().to_string(),
    )?;
    append_sync_event(
        paths,
        &deployment.skill_id,
        Some(deployment.deployment_id.clone()),
        SkillSyncEventType::Deployed,
        format!("Deployed skill to {}", deployment.target_skill_path),
    )?;
    Ok(deployment)
}

pub fn preview_deployment_remove(
    paths: &AppPaths,
    deployment_id: &str,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    let current = load_deployments(paths)?;
    let deployment = current
        .deployments
        .iter()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let mut next = current.clone();
    let skill_id = deployment.skill_id.clone();
    let dep = next
        .deployments
        .iter_mut()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    dep.status = DeploymentStatus::Disabled;
    dep.updated_at = Utc::now().to_rfc3339();
    let deployment_raw = serde_json::to_string_pretty(&next)
        .map_err(|e| AppError::new("INTERNAL_ERROR", format!("serialize deployment index: {e}")))?;
    let expected_files = vec![
        crate::model::FilePrecondition {
            path: PathBuf::from(&deployment.target_skill_path)
                .join("SKILL.md")
                .to_string_lossy()
                .to_string(),
            expected_before_sha256: current_file_hash(
                &PathBuf::from(&deployment.target_skill_path).join("SKILL.md"),
            )?,
        },
        crate::model::FilePrecondition {
            path: deployment_index_path(paths).to_string_lossy().to_string(),
            expected_before_sha256: current_file_hash(&deployment_index_path(paths))?,
        },
    ];

    Ok(WritePreview {
        files: vec![crate::model::FileChangePreview {
            path: deployment_index_path(paths).to_string_lossy().to_string(),
            will_create: false,
            before_sha256: None,
            after_sha256: sha256_text(&deployment_raw),
            diff_unified: deployment_raw,
        }],
        moves: vec![crate::model::MovePreview {
            from: deployment.target_skill_path.clone(),
            to: String::new(),
            kind: crate::model::SkillKind::Dir,
        }],
        expected_files,
        summary: WriteSummary {
            will_disable: vec![skill_id],
            ..WriteSummary::default()
        },
        warnings: Vec::new(),
    })
}

pub fn apply_deployment_remove(
    paths: &AppPaths,
    deployment_id: &str,
    expected_files: Vec<crate::model::FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    ensure_skill_store_layout(paths)?;
    verify_expected_files(&expected_files)?;
    let mut deployments = load_deployments(paths)?;
    let deployment = deployments
        .deployments
        .iter_mut()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let target = PathBuf::from(&deployment.target_skill_path);
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| io_error("remove_dir", &target, e))?;
    }
    deployment.status = DeploymentStatus::Disabled;
    deployment.updated_at = Utc::now().to_rfc3339();
    let result = deployment.clone();
    save_deployments(paths, &deployments)?;
    append_sync_event(
        paths,
        &result.skill_id,
        Some(result.deployment_id.clone()),
        SkillSyncEventType::Removed,
        format!("Removed deployment from {}", result.target_skill_path),
    )?;
    Ok(result)
}

pub fn check_deployment_status(
    paths: &AppPaths,
    deployment_id: &str,
) -> Result<SkillDeployment, AppError> {
    ensure_skill_store_layout(paths)?;
    let mut deployments = load_deployments(paths)?;
    let deployment = deployments
        .deployments
        .iter_mut()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let store = load_index(paths)?;
    let skill = store
        .skills
        .into_iter()
        .find(|item| item.skill_id == deployment.skill_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found for deployment: {deployment_id}"),
            )
        })?;

    if deployment.status == DeploymentStatus::Disabled {
        return Ok(deployment.clone());
    }

    let target = PathBuf::from(&deployment.target_skill_path);
    deployment.status = detect_deployment_status(&target, deployment, &skill.content_hash)?;
    deployment.updated_at = Utc::now().to_rfc3339();
    let result = deployment.clone();
    save_deployments(paths, &deployments)?;
    if result.status == DeploymentStatus::Drifted {
        append_sync_event(
            paths,
            &result.skill_id,
            Some(result.deployment_id.clone()),
            SkillSyncEventType::DriftDetected,
            format!("Detected drift at {}", result.target_skill_path),
        )?;
    }
    Ok(result)
}

pub fn preview_redeploy_outdated_deployment(
    paths: &AppPaths,
    deployment_id: &str,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    let deployments = load_deployments(paths)?;
    let deployment = deployments
        .deployments
        .iter()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let repo = get_repo_skill(paths, &deployment.skill_id)?;
    let target_root = PathBuf::from(&deployment.target_skill_path);
    if detect_deployment_status(&target_root, deployment, &repo.manifest.content_hash)?
        != DeploymentStatus::Outdated
    {
        return Err(validation_error(
            "only outdated deployments can be redeployed",
        ));
    }
    let repo_root = PathBuf::from(&repo.manifest.files_root);
    let deployment_index = deployment_index_path(paths);

    let mut expected_files = collect_tree_files(&target_root)?
        .into_iter()
        .map(|rel| {
            let full = target_root.join(&rel);
            Ok(crate::model::FilePrecondition {
                path: full.to_string_lossy().to_string(),
                expected_before_sha256: current_file_hash(&full)?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    expected_files.extend(
        collect_tree_files(&repo_root)?
            .into_iter()
            .map(|rel| {
                let full = repo_root.join(&rel);
                Ok(crate::model::FilePrecondition {
                    path: full.to_string_lossy().to_string(),
                    expected_before_sha256: current_file_hash(&full)?,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?,
    );
    expected_files.push(crate::model::FilePrecondition {
        path: deployment_index.to_string_lossy().to_string(),
        expected_before_sha256: current_file_hash(&deployment_index)?,
    });

    Ok(WritePreview {
        files: build_tree_preview(&repo_root, &target_root)?,
        moves: Vec::new(),
        expected_files,
        summary: WriteSummary::default(),
        warnings: Vec::new(),
    })
}

pub fn preview_sync_from_deployment(
    paths: &AppPaths,
    deployment_id: &str,
) -> Result<WritePreview, AppError> {
    ensure_skill_store_layout(paths)?;
    let deployments = load_deployments(paths)?;
    let deployment = deployments
        .deployments
        .iter()
        .find(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let repo = get_repo_skill(paths, &deployment.skill_id)?;
    let target_root = PathBuf::from(&deployment.target_skill_path);
    let repo_root = PathBuf::from(&repo.manifest.files_root);
    let deployment_index = deployment_index_path(paths);
    let expected_files = collect_tree_files(&repo_root)?
        .into_iter()
        .map(|rel| {
            let full = repo_root.join(&rel);
            Ok(crate::model::FilePrecondition {
                path: full.to_string_lossy().to_string(),
                expected_before_sha256: current_file_hash(&full)?,
            })
        })
        .collect::<Result<Vec<_>, AppError>>()?;

    Ok(WritePreview {
        files: build_tree_preview(&target_root, &repo_root)?,
        moves: Vec::new(),
        expected_files: {
            let mut files = expected_files;
            files.push(crate::model::FilePrecondition {
                path: deployment_index.to_string_lossy().to_string(),
                expected_before_sha256: current_file_hash(&deployment_index)?,
            });
            files
        },
        summary: WriteSummary::default(),
        warnings: Vec::new(),
    })
}

pub fn apply_redeploy_outdated_deployment(
    paths: &AppPaths,
    deployment_id: &str,
    expected_files: Vec<crate::model::FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    ensure_skill_store_layout(paths)?;
    verify_expected_files(&expected_files)?;
    let mut deployments = load_deployments(paths)?;
    let dep_index = deployments
        .deployments
        .iter()
        .position(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;

    let skill_id = deployments.deployments[dep_index].skill_id.clone();
    let target_root = PathBuf::from(&deployments.deployments[dep_index].target_skill_path);
    let store = load_index(paths)?;
    let skill = store
        .skills
        .into_iter()
        .find(|item| item.skill_id == skill_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {skill_id}"),
            )
        })?;
    if detect_deployment_status(
        &target_root,
        &deployments.deployments[dep_index],
        &skill.content_hash,
    )? != DeploymentStatus::Outdated
    {
        return Err(validation_error(
            "only outdated deployments can be redeployed",
        ));
    }

    replace_dir_contents(Path::new(&skill.files_root), &target_root)?;

    let deployment = &mut deployments.deployments[dep_index];
    deployment.status = DeploymentStatus::Deployed;
    deployment.source_hash = skill.content_hash.clone();
    deployment.updated_at = Utc::now().to_rfc3339();

    let result = deployment.clone();
    save_deployments(paths, &deployments)?;
    append_sync_event(
        paths,
        &result.skill_id,
        Some(result.deployment_id.clone()),
        SkillSyncEventType::Deployed,
        format!(
            "Redeployed latest repository version to {}",
            result.target_skill_path
        ),
    )?;
    Ok(result)
}

pub fn apply_sync_from_deployment(
    paths: &AppPaths,
    deployment_id: &str,
    expected_files: Vec<crate::model::FilePrecondition>,
) -> Result<SkillDeployment, AppError> {
    ensure_skill_store_layout(paths)?;
    verify_expected_files(&expected_files)?;
    let mut deployments = load_deployments(paths)?;
    let dep_index = deployments
        .deployments
        .iter()
        .position(|item| item.deployment_id == deployment_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("deployment not found: {deployment_id}"),
            )
        })?;
    let skill_id = deployments.deployments[dep_index].skill_id.clone();
    let source_target = PathBuf::from(&deployments.deployments[dep_index].target_skill_path);

    let store = load_index(paths)?;
    let mut entry = store
        .skills
        .into_iter()
        .find(|item| item.skill_id == skill_id)
        .ok_or_else(|| {
            AppError::new(
                "NOT_FOUND",
                format!("repository skill not found: {skill_id}"),
            )
        })?;

    let files_root = PathBuf::from(&entry.files_root);
    replace_dir_contents(&source_target, &files_root)?;
    let new_hash = hash_tree(&files_root)?;
    entry.content_hash = new_hash.clone();
    entry.version += 1;
    entry.updated_at = Utc::now().to_rfc3339();
    write_manifest(Path::new(&entry.repo_root), &map_entry_to_manifest(&entry))?;
    update_catalog_entry(paths, &entry)?;

    for deployment in deployments
        .deployments
        .iter_mut()
        .filter(|d| d.skill_id == skill_id)
    {
        if deployment.deployment_id == deployment_id {
            deployment.status = DeploymentStatus::Deployed;
            deployment.source_hash = new_hash.clone();
        } else if deployment.status != DeploymentStatus::Disabled {
            deployment.status = DeploymentStatus::Outdated;
        }
        deployment.updated_at = Utc::now().to_rfc3339();
    }

    let result = deployments.deployments[dep_index].clone();
    save_deployments(paths, &deployments)?;
    append_sync_event(
        paths,
        &result.skill_id,
        Some(result.deployment_id.clone()),
        SkillSyncEventType::SyncedBack,
        format!(
            "Synced deployment back into repository from {}",
            result.target_skill_path
        ),
    )?;
    Ok(result)
}

pub fn list_target_profiles(paths: &AppPaths) -> Result<Vec<SkillTargetProfile>, AppError> {
    let mut targets = load_target_profiles(paths)?.targets;
    targets.sort_by(|a, b| a.updated_at.cmp(&b.updated_at));
    Ok(targets)
}

pub fn list_sync_events(
    paths: &AppPaths,
    skill_id: Option<&str>,
) -> Result<Vec<SkillSyncEvent>, AppError> {
    let mut events = load_sync_events(paths)?.events;
    if let Some(skill_id) = skill_id {
        events.retain(|event| event.skill_id == skill_id);
    }
    events.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(events)
}
