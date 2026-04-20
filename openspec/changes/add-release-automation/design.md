## Context

当前仓库的 `.github/workflows/build.yml` 具备基础的 Tauri 构建能力，但并没有闭环发布：它没有自动管理版本号，也没有自动生成并上传 `latest.json`。另一方面，应用侧 updater endpoint 已经固定指向 GitHub Release 上的 `latest.json`，因此发布链必须稳定地产出该文件。

## Goals / Non-Goals

- Goals:
  - 用 GitHub Actions 自动化发布 `app-vX.Y.Z`
  - 自动上传安装包、签名文件、兼容 updater zip 包和 `latest.json`
  - 尽量减少本地手工步骤
- Non-Goals:
  - 不重构应用内 updater 客户端逻辑
  - 不在本次变更中切换到 Tauri v2 原生 updater 元数据链
  - 不覆盖所有平台的复杂发布矩阵，优先保证当前已验证的 Windows 路径

## Decisions

- Decision: 继续使用 `createUpdaterArtifacts: "v1Compatible"`
  - Why: 现有 updater endpoint 与 release 分发方式都依赖 `latest.json` 风格
- Decision: release automation 由 GitHub Actions 驱动，而不是本地脚本独占
  - Why: secrets 管理、可审计性和复现性更适合放到 CI
- Decision: `latest.json` 由 workflow 明确生成
  - Why: 实测 Tauri 构建不会自动在当前 Windows 路径产出该文件

## Risks / Trade-offs

- Risk: GitHub Secrets 中的签名私钥配置错误会导致 workflow 只能产出安装包，不能产出完整 updater 元数据
  - Mitigation: 在 workflow 中对私钥存在性和构建产物完整性做显式检查
- Risk: 已存在错误 tag 或 release 时，重跑 workflow 可能覆盖错误发布状态
  - Mitigation: workflow 对同版本 tag/release 先做 fail-fast，不允许在脏状态上继续覆盖
- Risk: 创建 release 过程中如果上传资产失败，可能留下半成品 release/tag
  - Mitigation: workflow 在创建 release 失败后自动删除本次新建的 release 与 tag

## Migration Plan

1. 新增 release automation workflow
2. 用手动触发模式验证一次
3. 确认 release 资产、`latest.json` 和 updater 链路可用

## Open Questions

- 是否要把 Linux/macOS 的 updater 元数据也纳入同一份 `latest.json`
- 版本号是否继续坚持“先提交到 main，再触发 workflow”的模式
