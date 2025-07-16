# 通用性能压测框架

本项目使用 k6 提供一个灵活且可配置的性能压测框架。

## 核心目标

- **验证稳定性**: 检验目标 API 在高并发场景下的稳定性和可靠性。
- **探寻性能拐点**: 确定系统的最大吞吐量（RPS）和临界并发用户数（VUs）。

## 目录结构

```
.
├── config/                # 配置文件目录
│   ├── env.dev.json       # 开发环境配置 (默认)
│   ├── env.prod.json      # 生产环境配置
│   └── test-data.json     # 测试数据
├── scripts/               # k6 测试脚本目录
│   └── performance-test.js # 核心压测脚本
├── outputs/               # 测试结果输出目录
│   ├── k6-results.json    # k6 输出的原始 JSON 数据
│   └── ...
├── libs/                  # k6 库或模块 (如果需要)
└── summary.html           # k6-reporter 生成的 HTML 报告
```

## 配置说明

### 1. 环境配置

测试环境分为 `dev` 和 `prod`，由 `config/` 目录下的 `env.[环境名].json` 文件定义。

- **`baseUrl`**: API 的基础 URL。
- **`authToken`**: 用于身份验证的 Bearer Token。
- **`origin`**: 请求头中的 `Origin` 字段。
- **`referer`**: 请求头中的 `Referer` 字段。

**注意**: `env.prod.json` 中的 `authToken` 是一个占位符 `YOUR_PRODUCTION_AUTH_TOKEN_HERE`，在运行生产环境测试前需要替换为真实有效的 Token。

### 2. 测试数据

测试中使用的数据定义在 `config/test-data.json` 文件中。你可以根据需要添加、修改或删除其中的数据。

## 运行测试

测试的执行环境通过 `K6_ENV` 环境变量来选择。如果未指定，默认使用 `dev` 环境。

### 运行开发环境测试

```bash
# 不需要指定环境变量，默认加载 env.dev.json
k6 run scripts/performance-test.js
```

### 运行生产环境测试

```bash
# 设置 K6_ENV 为 prod，加载 env.prod.json
K6_ENV=prod k6 run scripts/performance-test.js
```

## 查看结果

测试完成后，会自动生成两种报告：

1.  **HTML 报告**:
    -   路径: `summary.html`
    -   由 [k6-reporter](https://github.com/benc-uk/k6-reporter) 生成，提供了详细的图表和指标概览。

2.  **JSON 原始数据**:
    -   路径: `outputs/k6-results.json`
    -   k6 输出的原始度量数据，可用于进一步的分析或自定义报告。
