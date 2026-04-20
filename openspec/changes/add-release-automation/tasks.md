## 1. Implementation
- [x] 1.1 为发布自动化定义 workflow 触发输入（版本号、发布说明）
- [x] 1.2 实现 workflow 内的版本一致性校验与主分支保护
- [x] 1.3 在 CI 中配置签名构建环境变量并生成 Windows 安装包、签名文件和 v1Compatible updater 产物
- [x] 1.4 在 workflow 中自动生成 `latest.json`
- [x] 1.5 自动创建全新 GitHub Release 并上传全部资产，同时在已有错误 tag/release 时 fail-fast
- [x] 1.6 补充发布流程文档，说明 secrets、输入参数和失败恢复方式
