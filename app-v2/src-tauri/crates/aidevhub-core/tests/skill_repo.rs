use std::{fs, path::PathBuf};

use aidevhub_core::{
    model::{Client, DeploymentStatus, DeploymentTargetType, FilePrecondition},
    ops::AppPaths,
    skill_repo::{
        apply_create_repo_skill, apply_deployment_add, apply_deployment_remove, apply_import_skill,
        apply_redeploy_outdated_deployment, apply_sync_from_deployment, check_deployment_status,
        ensure_skill_store_layout, get_repo_skill, list_deployments, list_repo_skills,
        list_sync_events, list_target_profiles, preview_deployment_add, preview_deployment_remove,
        preview_redeploy_outdated_deployment, preview_sync_from_deployment,
    },
};

fn mk_paths(tmp: &tempfile::TempDir) -> AppPaths {
    let base = tmp.path().to_path_buf();
    let app_local_data_dir = base.join("appdata");
    AppPaths {
        claude_config_path: base.join("claude.json"),
        claude_commands_dir: base.join(".claude").join("commands"),
        claude_commands_disabled_dir: base.join(".claude").join("commands_disabled"),
        claude_skills_dir: base.join(".claude").join("skills"),
        claude_skills_disabled_dir: base.join(".claude").join("skills_disabled"),
        codex_config_path: base.join("codex.toml"),
        codex_skills_dir: base.join(".codex").join("skills"),
        codex_skills_disabled_dir: base.join(".codex").join("skills_disabled"),
        app_local_data_dir: app_local_data_dir.clone(),
        profiles_path: app_local_data_dir.join("profiles.json"),
        mcp_notes_path: app_local_data_dir.join("mcp_notes.json"),
        mcp_registry_path: app_local_data_dir.join("mcp_registry.json"),
        disabled_pool_path: app_local_data_dir.join("disabled_pool.json"),
        backups_dir: app_local_data_dir.join("backups"),
        backup_index_path: app_local_data_dir.join("backup_index.json"),
        skill_store_root: app_local_data_dir.join("skill-store"),
        skill_repo_root: app_local_data_dir.join("skill-store").join("repo"),
        skill_indexes_root: app_local_data_dir.join("skill-store").join("indexes"),
        skill_index_path: app_local_data_dir
            .join("skill-store")
            .join("indexes")
            .join("skill_index.json"),
    }
}

fn write(path: &PathBuf, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn stale_expected(path: &str) -> Vec<FilePrecondition> {
    vec![FilePrecondition {
        path: path.to_string(),
        expected_before_sha256: Some("sha256:stale".to_string()),
    }]
}

#[test]
fn ensure_skill_store_layout_creates_repository_directories_and_index() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();

    assert!(paths.skill_store_root.exists());
    assert!(paths.skill_repo_root.exists());
    assert!(paths.skill_indexes_root.exists());
    assert!(paths.skill_index_path.exists());
}

#[test]
fn importing_codex_skill_copies_full_directory_into_repository_and_lists_it() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    write(
        &paths.codex_skills_dir.join("alpha").join("SKILL.md"),
        "---\nname: Alpha\ndescription: Imported skill\n---\n\nBody",
    );
    write(
        &paths
            .codex_skills_dir
            .join("alpha")
            .join("scripts")
            .join("run.sh"),
        "echo hi",
    );

    ensure_skill_store_layout(&paths).unwrap();
    let imported = apply_import_skill(
        &paths,
        Client::Codex,
        "alpha",
        &paths.codex_skills_dir.join("alpha"),
    )
    .unwrap();

    let listed = list_repo_skills(&paths).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].skill_id, imported.skill_id);
    assert_eq!(listed[0].display_name, "Alpha");

    let repo_skill = get_repo_skill(&paths, &imported.skill_id).unwrap();
    assert!(PathBuf::from(&repo_skill.manifest.repo_root)
        .join("files")
        .join("SKILL.md")
        .exists());
    assert!(PathBuf::from(&repo_skill.manifest.repo_root)
        .join("files")
        .join("scripts")
        .join("run.sh")
        .exists());
    assert_eq!(
        repo_skill.manifest.source_detail.imported_from_client,
        Some(Client::Codex)
    );
    assert_eq!(
        repo_skill.manifest.source_detail.imported_from_path,
        Some(
            paths
                .codex_skills_dir
                .join("alpha")
                .to_string_lossy()
                .to_string()
        )
    );
}

#[test]
fn creating_repo_skill_writes_manifest_and_skill_md_without_external_deployment() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "repo-skill",
        "Repo Skill",
        "Created in repository",
        Some("## Usage\n\nInternal only".to_string()),
    )
    .unwrap();

    let repo_skill = get_repo_skill(&paths, &created.skill_id).unwrap();
    let skill_md = PathBuf::from(&repo_skill.manifest.repo_root)
        .join("files")
        .join("SKILL.md");
    let content = fs::read_to_string(skill_md).unwrap();

    assert!(content.contains("name: Repo Skill"));
    assert!(content.contains("description: Created in repository"));
    assert!(!paths.codex_skills_dir.join("repo-skill").exists());
    assert!(!paths.claude_skills_dir.join("repo-skill").exists());
}

#[test]
fn deploying_repo_skill_to_codex_global_copies_files_and_records_deployment() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "deploy-me",
        "Deploy Me",
        "Repository deployment test",
        Some("## Use\n\nDeploy globally".to_string()),
    )
    .unwrap();

    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let deployed_skill_md = paths.codex_skills_dir.join("deploy-me").join("SKILL.md");

    assert_eq!(deployment.skill_id, created.skill_id);
    assert!(deployed_skill_md.exists());
    assert!(fs::read_to_string(deployed_skill_md)
        .unwrap()
        .contains("Deploy Me"));

    let deployments = list_deployments(&paths, Some(&created.skill_id)).unwrap();
    assert_eq!(deployments.len(), 1);
    assert_eq!(deployments[0].deployment_id, deployment.deployment_id);
}

#[test]
fn removing_global_deployment_deletes_external_copy_but_keeps_repository_skill() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "undeploy-me",
        "Undeploy Me",
        "Deployment removal test",
        None,
    )
    .unwrap();

    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let repo_skill_md = PathBuf::from(&created.repo_root)
        .join("files")
        .join("SKILL.md");
    let deployed_skill_dir = paths.codex_skills_dir.join("undeploy-me");
    assert!(deployed_skill_dir.exists());

    apply_deployment_remove(&paths, &deployment.deployment_id, Vec::new()).unwrap();

    assert!(repo_skill_md.exists());
    assert!(!deployed_skill_dir.exists());
    let deployments = list_deployments(&paths, Some(&created.skill_id)).unwrap();
    assert_eq!(deployments.len(), 1);
    assert_eq!(
        deployments[0].status,
        aidevhub_core::model::DeploymentStatus::Disabled
    );
}

#[test]
fn deployment_add_preview_points_to_same_global_target_used_by_apply() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "preview-add",
        "Preview Add",
        "Preview add test",
        None,
    )
    .unwrap();

    let preview = preview_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
    )
    .unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();

    assert!(preview.files.iter().any(|f| f.path
        == paths
            .codex_skills_dir
            .join("preview-add")
            .join("SKILL.md")
            .to_string_lossy()));
    assert!(preview.summary.will_enable.contains(&created.skill_id));
    assert_eq!(
        deployment.target_skill_path,
        paths.codex_skills_dir.join("preview-add").to_string_lossy()
    );
}

#[test]
fn deployment_remove_preview_points_to_same_target_removed_by_apply() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "preview-remove",
        "Preview Remove",
        "Preview remove test",
        None,
    )
    .unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();

    let preview = preview_deployment_remove(&paths, &deployment.deployment_id).unwrap();
    apply_deployment_remove(&paths, &deployment.deployment_id, Vec::new()).unwrap();

    assert!(preview
        .moves
        .iter()
        .any(|m| m.from == deployment.target_skill_path && m.to.is_empty()));
    assert!(preview.summary.will_disable.contains(&created.skill_id));
}

#[test]
fn deploying_repo_skill_to_claude_project_uses_project_skill_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-a");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "claude-project-skill",
        "Claude Project Skill",
        "Project deployment test",
        None,
    )
    .unwrap();

    let preview = preview_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::ClaudeProject,
        Some(project_root.to_string_lossy().to_string()),
    )
    .unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::ClaudeProject,
        Some(project_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap();

    let expected_dir = project_root
        .join(".claude")
        .join("skills")
        .join("claude-project-skill");
    assert!(expected_dir.join("SKILL.md").exists());
    assert_eq!(deployment.target_skill_path, expected_dir.to_string_lossy());
    assert!(preview
        .files
        .iter()
        .any(|f| f.path == expected_dir.join("SKILL.md").to_string_lossy()));
    let targets = list_target_profiles(&paths).unwrap();
    assert!(targets
        .iter()
        .any(|target| target.project_root.as_deref()
            == Some(project_root.to_string_lossy().as_ref())));
}

#[test]
fn deploying_repo_skill_to_codex_project_uses_project_skill_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-b");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "codex-project-skill",
        "Codex Project Skill",
        "Project deployment test",
        None,
    )
    .unwrap();

    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(project_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap();

    let expected_dir = project_root
        .join(".codex")
        .join("skills")
        .join("codex-project-skill");
    assert!(expected_dir.join("SKILL.md").exists());
    assert_eq!(deployment.target_skill_path, expected_dir.to_string_lossy());
}

#[test]
fn manual_edit_on_deployed_copy_marks_deployment_as_drifted() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created =
        apply_create_repo_skill(&paths, "drift-me", "Drift Me", "Drift test", None).unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let deployed_skill_md = PathBuf::from(&deployment.target_skill_path).join("SKILL.md");

    fs::write(
        &deployed_skill_md,
        "---\nname: Drift Me\ndescription: changed externally\n---\n\nChanged",
    )
    .unwrap();

    let checked = check_deployment_status(&paths, &deployment.deployment_id).unwrap();
    assert_eq!(checked.status, DeploymentStatus::Drifted);
}

#[test]
fn sync_back_updates_repository_and_marks_sibling_deployment_outdated() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-c");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created =
        apply_create_repo_skill(&paths, "sync-back", "Sync Back", "Sync test", None).unwrap();
    let global = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let project = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(project_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap();

    let deployed_skill_md = PathBuf::from(&global.target_skill_path).join("SKILL.md");
    fs::write(
        &deployed_skill_md,
        "---\nname: Sync Back\ndescription: updated via deployment\n---\n\nUpdated from deployment",
    )
    .unwrap();

    let preview = preview_sync_from_deployment(&paths, &global.deployment_id).unwrap();
    assert!(preview.summary.will_add.is_empty());
    let synced = apply_sync_from_deployment(&paths, &global.deployment_id, Vec::new()).unwrap();

    let repo = get_repo_skill(&paths, &created.skill_id).unwrap();
    assert!(repo.content.contains("updated via deployment"));
    assert_eq!(synced.status, DeploymentStatus::Deployed);

    let deployments = list_deployments(&paths, Some(&created.skill_id)).unwrap();
    let sibling = deployments
        .into_iter()
        .find(|item| item.deployment_id == project.deployment_id)
        .unwrap();
    assert_eq!(sibling.status, DeploymentStatus::Outdated);
    let events = list_sync_events(&paths, Some(&created.skill_id)).unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == aidevhub_core::model::SkillSyncEventType::SyncedBack));
}

#[test]
fn redeploy_outdated_deployment_refreshes_target_and_restores_deployed_status() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-d");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created =
        apply_create_repo_skill(&paths, "redeploy-me", "Redeploy Me", "Redeploy test", None)
            .unwrap();
    let global = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let project = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(project_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap();

    let deployed_skill_md = PathBuf::from(&global.target_skill_path).join("SKILL.md");
    fs::write(
        &deployed_skill_md,
        "---\nname: Redeploy Me\ndescription: updated via deployment\n---\n\nUpdated from deployment",
    )
    .unwrap();
    apply_sync_from_deployment(&paths, &global.deployment_id, Vec::new()).unwrap();

    let outdated = check_deployment_status(&paths, &project.deployment_id).unwrap();
    assert_eq!(outdated.status, DeploymentStatus::Outdated);

    let preview = preview_redeploy_outdated_deployment(&paths, &project.deployment_id).unwrap();
    let preview_skill_md = preview
        .files
        .iter()
        .find(|file| {
            file.path
                == PathBuf::from(&project.target_skill_path)
                    .join("SKILL.md")
                    .to_string_lossy()
        })
        .unwrap();
    assert!(preview_skill_md
        .diff_unified
        .contains("updated via deployment"));

    let redeployed =
        apply_redeploy_outdated_deployment(&paths, &project.deployment_id, Vec::new()).unwrap();
    assert_eq!(redeployed.status, DeploymentStatus::Deployed);

    let project_skill_md = PathBuf::from(&project.target_skill_path).join("SKILL.md");
    let refreshed = fs::read_to_string(project_skill_md).unwrap();
    assert!(refreshed.contains("updated via deployment"));

    let deployments = list_deployments(&paths, Some(&created.skill_id)).unwrap();
    let untouched_global = deployments
        .iter()
        .find(|item| item.deployment_id == global.deployment_id)
        .unwrap();
    assert_eq!(untouched_global.status, DeploymentStatus::Deployed);

    let refreshed_project = deployments
        .iter()
        .find(|item| item.deployment_id == project.deployment_id)
        .unwrap();
    assert_eq!(refreshed_project.status, DeploymentStatus::Deployed);
    assert_eq!(refreshed_project.source_hash, untouched_global.source_hash);
}

#[test]
fn redeploy_requires_deployment_to_still_be_outdated_at_apply_time() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-e");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "redeploy-guard",
        "Redeploy Guard",
        "Redeploy guard test",
        None,
    )
    .unwrap();
    let global = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let project = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(project_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap();

    let deployed_skill_md = PathBuf::from(&global.target_skill_path).join("SKILL.md");
    fs::write(
        &deployed_skill_md,
        "---\nname: Redeploy Guard\ndescription: updated via deployment\n---\n\nUpdated from deployment",
    )
    .unwrap();
    apply_sync_from_deployment(&paths, &global.deployment_id, Vec::new()).unwrap();
    let _ = check_deployment_status(&paths, &project.deployment_id).unwrap();

    let project_skill_md = PathBuf::from(&project.target_skill_path).join("SKILL.md");
    fs::write(
        &project_skill_md,
        "---\nname: Redeploy Guard\ndescription: changed externally\n---\n\nChanged outside repo",
    )
    .unwrap();

    let err =
        apply_redeploy_outdated_deployment(&paths, &project.deployment_id, Vec::new()).unwrap_err();
    assert_eq!(err.code, "VALIDATION_ERROR");
}

#[test]
fn import_and_deploy_create_sync_event_history() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    write(
        &paths.codex_skills_dir.join("events-alpha").join("SKILL.md"),
        "---\nname: Events Alpha\ndescription: Event source\n---\n\nBody",
    );

    ensure_skill_store_layout(&paths).unwrap();
    let imported = apply_import_skill(
        &paths,
        Client::Codex,
        "events-alpha",
        &paths.codex_skills_dir.join("events-alpha"),
    )
    .unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &imported.skill_id,
        DeploymentTargetType::ClaudeGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let _ = check_deployment_status(&paths, &deployment.deployment_id).unwrap();

    let events = list_sync_events(&paths, Some(&imported.skill_id)).unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == aidevhub_core::model::SkillSyncEventType::Imported));
    assert!(events
        .iter()
        .any(|event| event.event_type == aidevhub_core::model::SkillSyncEventType::Deployed));
}

#[test]
fn missing_deployment_directory_marks_status_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created =
        apply_create_repo_skill(&paths, "missing-me", "Missing Me", "Missing test", None).unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    fs::remove_dir_all(PathBuf::from(&deployment.target_skill_path)).unwrap();

    let checked = check_deployment_status(&paths, &deployment.deployment_id).unwrap();
    assert_eq!(checked.status, DeploymentStatus::Missing);
}

#[test]
fn deployment_apply_add_rejects_stale_preconditions() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "precondition-add",
        "Precondition Add",
        "Precondition add test",
        None,
    )
    .unwrap();
    let target_skill_md = paths
        .codex_skills_dir
        .join("precondition-add")
        .join("SKILL.md");

    let err = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        stale_expected(&target_skill_md.to_string_lossy()),
    )
    .unwrap_err();
    assert_eq!(err.code, "PRECONDITION_FAILED");
}

#[test]
fn sync_back_preview_lists_non_entry_files_that_will_change() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "sync-preview",
        "Sync Preview",
        "Sync preview test",
        None,
    )
    .unwrap();
    let deployment = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexGlobal,
        None,
        Vec::new(),
    )
    .unwrap();
    let target_asset = PathBuf::from(&deployment.target_skill_path)
        .join("scripts")
        .join("run.sh");
    write(&target_asset, "echo changed");

    let preview = preview_sync_from_deployment(&paths, &deployment.deployment_id).unwrap();
    assert!(preview
        .files
        .iter()
        .any(|f| f.path.ends_with("scripts\\run.sh") || f.path.ends_with("scripts/run.sh")));
}

#[test]
fn project_deployment_preview_rejects_missing_project_root() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let missing_root = tmp.path().join("missing-project");

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "missing-project-root",
        "Missing Project Root",
        "Missing project root test",
        None,
    )
    .unwrap();

    let err = preview_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(missing_root.to_string_lossy().to_string()),
    )
    .unwrap_err();
    assert_eq!(err.code, "VALIDATION_ERROR");
}

#[test]
fn project_deployment_apply_rejects_file_path_as_project_root() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let file_root = tmp.path().join("not-a-directory.txt");
    write(&file_root, "not a directory");

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "file-project-root",
        "File Project Root",
        "File project root test",
        None,
    )
    .unwrap();

    let err = apply_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::ClaudeProject,
        Some(file_root.to_string_lossy().to_string()),
        Vec::new(),
    )
    .unwrap_err();
    assert_eq!(err.code, "VALIDATION_ERROR");
}

#[test]
fn project_deployment_preview_lists_nested_skill_files() {
    let tmp = tempfile::tempdir().unwrap();
    let paths = mk_paths(&tmp);
    let project_root = tmp.path().join("project-preview");
    fs::create_dir_all(&project_root).unwrap();

    ensure_skill_store_layout(&paths).unwrap();
    let created = apply_create_repo_skill(
        &paths,
        "preview-nested-files",
        "Preview Nested Files",
        "Preview nested files test",
        None,
    )
    .unwrap();
    let repo_asset = PathBuf::from(
        &get_repo_skill(&paths, &created.skill_id)
            .unwrap()
            .manifest
            .files_root,
    )
    .join("scripts")
    .join("run.sh");
    write(&repo_asset, "echo preview");

    let preview = preview_deployment_add(
        &paths,
        &created.skill_id,
        DeploymentTargetType::CodexProject,
        Some(project_root.to_string_lossy().to_string()),
    )
    .unwrap();

    assert!(preview
        .files
        .iter()
        .any(|f| f.path.ends_with("scripts\\run.sh") || f.path.ends_with("scripts/run.sh")));
}
