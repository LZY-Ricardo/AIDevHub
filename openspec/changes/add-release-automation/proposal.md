# Change: Add Release Automation

## Why
当前仓库虽然已经有 GitHub Actions 构建配置，但发布链路仍依赖本地人工执行：手工提升版本号、手工签名构建、手工上传 release 资产、手工生成 `latest.json`。这使发布过程容易出错，也难以复现和审计。

## What Changes
- 新增一套面向 GitHub Actions 的发布自动化流程
- 让 workflow 在受控输入下自动完成版本一致性校验、构建、签名、release 资产上传与 `latest.json` 生成
- 固化 `v1Compatible` updater 兼容发布模式，保持现有客户端更新端点可用
- 补充发布文档与工作流输入/输出说明

## Impact
- Affected specs: `app-settings-update`, `release-automation`
- Affected code: `.github/workflows/build.yml`, 版本文件、发布脚本/模板、发布文档
