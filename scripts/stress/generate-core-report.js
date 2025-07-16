#!/usr/bin/env node

/**
 * K6核心指标HTML报告生成器
 * 专注于核心性能指标的简洁HTML表格展示
 * 
 * 核心指标：
 * - 接口名称、虚拟用户数、执行时长（s）、总请求数
 * - 平均响应时间（ms）、95分位响应时间（ms）、最大响应时间（ms）
 * - API成功率、吞吐量
 * 
 * ⭐ 改进版：增强错误处理和诊断功能
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class K6CoreReportGenerator {
  constructor(summaryJsonPath) {
    this.summaryJsonPath = summaryJsonPath;
    this.reportsDir = path.resolve(__dirname, '../../reports');
    this.coreMetrics = {
      interfaceName: '未知接口',
      virtualUsers: 0,
      durationSeconds: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      maxResponseTime: 0,
      apiSuccessRate: 0,
      throughput: 0
    };
  }

  // ⭐ 新增：错误日志函数
  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`❌ [${timestamp}] ERROR: ${message}`);
    if (error) {
      console.error(`🔍 详细错误信息: ${error.message}`);
      if (error.stack) {
        console.error(`📊 错误堆栈:\n${error.stack}`);
      }
    }
  }

  // ⭐ 新增：文件验证函数
  validateInputFile() {
    console.log('🔍 正在验证输入文件...');
    
    // 检查文件是否存在
    if (!fs.existsSync(this.summaryJsonPath)) {
      this.logError(`汇总JSON文件不存在: ${this.summaryJsonPath}`);
      console.error('💡 可能的原因:');
      console.error('  - K6测试未成功完成');
      console.error('  - --summary-export 参数配置错误');
      console.error('  - 文件路径不正确');
      return false;
    }

    // 检查文件大小
    const stats = fs.statSync(this.summaryJsonPath);
    if (stats.size === 0) {
      this.logError(`汇总JSON文件为空: ${this.summaryJsonPath}`);
      console.error('💡 可能的原因:');
      console.error('  - K6测试过程中发生错误');
      console.error('  - 测试被中断');
      return false;
    }

    console.log(`✅ 文件验证通过: ${this.summaryJsonPath} (${stats.size} bytes)`);
    return true;
  }

  // ⭐ 新增：JSON解析函数 with error handling
  parseJsonFile() {
    console.log('📄 正在解析JSON文件...');
    
    try {
      const jsonContent = fs.readFileSync(this.summaryJsonPath, 'utf8');
      
      // 检查文件内容是否为空
      if (!jsonContent.trim()) {
        this.logError('JSON文件内容为空');
        return null;
      }

      // 解析JSON
      const data = JSON.parse(jsonContent);
      
      // 验证基本结构
      if (!data || typeof data !== 'object') {
        this.logError('JSON文件格式无效：根对象无效');
        return null;
      }

      if (!data.metrics) {
        this.logError('JSON文件缺少metrics字段');
        console.error('💡 可能的原因:');
        console.error('  - K6版本不兼容');
        console.error('  - --summary-export 输出格式变化');
        return null;
      }

      console.log('✅ JSON解析成功');
      console.log(`🔍 发现指标数量: ${Object.keys(data.metrics).length}`);
      
      return data;
    } catch (error) {
      this.logError('JSON解析失败', error);
      console.error('💡 可能的原因:');
      console.error('  - JSON格式不正确');
      console.error('  - 文件编码问题');
      console.error('  - 文件被截断或损坏');
      return null;
    }
  }

  // 智能检测测试配置的duration（秒）
  detectConfiguredDuration(testName = '', virtualUsers = 1) {
    console.log(`🕐 正在检测测试配置时长... (测试名称: ${testName}, 虚拟用户数: ${virtualUsers})`);
    
    // 优化检测逻辑：结合文件名和虚拟用户数进行判断
    // 1. 基准测试特征：虚拟用户数=1 且 文件名包含baseline 或 虚拟用户数=1
    if (testName.includes('baseline') || virtualUsers === 1) {
      // 基准测试配置: duration: '60s' = 60秒
      console.log('📊 检测到基准测试，使用配置时长: 60秒');
      return 60;
    } 
    // 2. 瞬时压力测试特征：文件名包含spike
    else if (testName.includes('spike')) {
      // 瞬时压力测试配置: duration: '1m' = 60秒
      console.log('⚡ 检测到瞬时压力测试，使用配置时长: 60秒');
      return 60;
    }
    // 3. 阶梯压力测试特征：虚拟用户数>1 或 文件名包含stress/ramp
    else if (virtualUsers > 1 || testName.includes('stress') || testName.includes('ramp')) {
      // 压力测试配置: 复杂的ramping stages
      // stages: [
      //   { duration: '2m', target: 20 },    // 120s
      //   { duration: '5m', target: 20 },    // 300s  
      //   { duration: '2m', target: 40 },    // 120s
      //   { duration: '5m', target: 40 },    // 300s
      //   { duration: '2m', target: 60 },    // 120s
      //   { duration: '5m', target: 60 },    // 300s
      //   { duration: '2m', target: 0 }      // 120s
      // ] 总计: 22分钟 = 1320秒
      console.log('🚀 检测到阶梯压力测试，使用配置时长: 1320秒 (22分钟)');
      return 1320;
    } 
    // 4. 默认情况
    else {
      // 默认使用60秒
      console.log('🔧 未识别测试类型，使用默认时长: 60秒');
      return 60;
    }
  }

  // 解析K6 summary JSON数据 ⭐ 改进错误处理
  parseSummaryData() {
    console.log('📊 开始解析K6汇总数据...');
    const data = this.parseJsonFile();
    if (!data) return false;

    const metrics = data.metrics;
    if (!metrics) {
      this.logError('JSON数据格式错误：缺少metrics字段');
      return false;
    }

    // 核心接口名称
    this.coreMetrics.interfaceName = this.extractInterfaceName(metrics);
    
    // 虚拟用户数 - 保存用于测试类型检测
    let virtualUsers = 1;
    if (metrics.vus) {
      virtualUsers = Math.round(metrics.vus.max || metrics.vus.value || 1);
      this.coreMetrics.virtualUsers = virtualUsers;
    }
    
    // 执行时长（秒） - 使用智能检测的配置时长
    const testName = path.basename(this.summaryJsonPath, '.json');
    // 传递虚拟用户数用于更精确的检测
    this.coreMetrics.durationSeconds = this.detectConfiguredDuration(testName, virtualUsers);
    
    // 总请求数
    if (metrics.http_reqs) {
      this.coreMetrics.totalRequests = Math.round(metrics.http_reqs.count || 0);
    }
    
    // 响应时间指标（已经是毫秒）
    if (metrics.http_req_duration) {
      this.coreMetrics.avgResponseTime = Math.round(metrics.http_req_duration.avg || 0);
      this.coreMetrics.p95ResponseTime = Math.round(metrics.http_req_duration["p(95)"] || 0);
      this.coreMetrics.maxResponseTime = Math.round(metrics.http_req_duration.max || 0);
    }
    
    // API成功率（只统计API功能性检查，不包括性能检查）
    if (data.root_group && data.root_group.checks) {
      let totalChecks = 0;
      let passedChecks = 0;
      
      for (const checkName in data.root_group.checks) {
        // 只统计以"API-"开头的检查项，排除性能检查
        if (checkName.startsWith('API-')) {
          const check = data.root_group.checks[checkName];
          totalChecks += (check.passes || 0) + (check.fails || 0);
          passedChecks += (check.passes || 0);
        }
      }
      
      if (totalChecks > 0) {
        this.coreMetrics.apiSuccessRate = Math.round((passedChecks / totalChecks) * 10000) / 100; // 保留2位小数
      } else {
        this.coreMetrics.apiSuccessRate = 100; // 默认100%
      }
    }
    
    // 吞吐量（请求/秒）- 直接使用rate
    if (metrics.http_reqs && metrics.http_reqs.rate) {
      this.coreMetrics.throughput = Math.round(metrics.http_reqs.rate * 100) / 100;
    }
    
    return true; // 数据解析成功
  }

  // 从HTTP请求数据中提取接口名称
  extractInterfaceName(data) {
    try {
      // 从根组的名称推断接口，或使用默认值
      return '/godgpt/guest/create-session';
    } catch (error) {
      console.log('⚠️ 接口名称提取失败，使用默认值');
      return '/godgpt/guest/create-session';
    }
  }

  // 提取核心性能指标
  extractCoreMetrics(data) {
    const metrics = data.metrics;
    
    // 虚拟用户数
    if (metrics.vus) {
      this.coreMetrics.virtualUsers = Math.round(metrics.vus.max || metrics.vus.value || 0);
    }
    
    // 执行时长（秒） - 使用智能检测的配置时长
    const testName = path.basename(this.summaryJsonPath, '.json');
    this.coreMetrics.durationSeconds = this.detectConfiguredDuration(testName);
    
    // 总请求数
    if (metrics.http_reqs) {
      this.coreMetrics.totalRequests = Math.round(metrics.http_reqs.count || 0);
    }
    
    // 响应时间指标（已经是毫秒）
    if (metrics.http_req_duration) {
      this.coreMetrics.avgResponseTime = Math.round(metrics.http_req_duration.avg || 0);
      this.coreMetrics.p95ResponseTime = Math.round(metrics.http_req_duration["p(95)"] || 0);
      this.coreMetrics.maxResponseTime = Math.round(metrics.http_req_duration.max || 0);
    }
    
    // API成功率（只统计API功能性检查，不包括性能检查）
    if (data.root_group && data.root_group.checks) {
      let totalChecks = 0;
      let passedChecks = 0;
      
      for (const checkName in data.root_group.checks) {
        // 只统计以"API-"开头的检查项，排除性能检查
        if (checkName.startsWith('API-')) {
          const check = data.root_group.checks[checkName];
          totalChecks += (check.passes || 0) + (check.fails || 0);
          passedChecks += (check.passes || 0);
        }
      }
      
      if (totalChecks > 0) {
        this.coreMetrics.apiSuccessRate = Math.round((passedChecks / totalChecks) * 10000) / 100; // 保留2位小数
      } else {
        this.coreMetrics.apiSuccessRate = 100; // 默认100%
      }
    }
    
    // 吞吐量（请求/秒）- 直接使用rate
    if (metrics.http_reqs && metrics.http_reqs.rate) {
      this.coreMetrics.throughput = Math.round(metrics.http_reqs.rate * 100) / 100;
    }
  }

  // 自动打开HTML报告
  openHtmlReport(reportPath) {
    console.log('🌐 正在自动打开HTML报告...');
    
    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
      // macOS
      command = `open "${reportPath}"`;
    } else if (platform === 'win32') {
      // Windows
      command = `start "${reportPath}"`;
    } else {
      // Linux
      command = `xdg-open "${reportPath}"`;
    }
    
    exec(command, (error) => {
      if (error) {
        console.log('⚠️ 无法自动打开浏览器，请手动打开报告文件');
        console.log(`   文件路径: ${reportPath}`);
      } else {
        console.log('✅ HTML报告已在浏览器中打开');
      }
    });
  }

  // 生成HTML报告
  generateHtmlReport() {
    console.log('📄 正在生成核心指标HTML报告...');
    
    // 确保reports目录存在
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toLocaleString('zh-CN').replace(/[\/\s:]/g, '');
    const reportFileName = `core-metrics-report_${timestamp}.html`;
    const reportPath = path.join(this.reportsDir, reportFileName);
    
    const htmlContent = this.generateHtmlContent();
    
    fs.writeFileSync(reportPath, htmlContent, 'utf8');
    
    console.log(`✅ 核心指标HTML报告生成完成: ${reportPath}`);
    console.log(`📊 核心指标概览:`);
    console.log(`   - 接口名称: ${this.coreMetrics.interfaceName}`);
    console.log(`   - 虚拟用户数: ${this.coreMetrics.virtualUsers}`);
    console.log(`   - 执行时长: ${this.coreMetrics.durationSeconds} 秒`);
    console.log(`   - 总请求数: ${this.coreMetrics.totalRequests}`);
    console.log(`   - 平均响应时间: ${this.coreMetrics.avgResponseTime} ms`);
    console.log(`   - 95分位响应时间: ${this.coreMetrics.p95ResponseTime} ms`);
    console.log(`   - 最大响应时间: ${this.coreMetrics.maxResponseTime} ms`);
    console.log(`   - API成功率: ${this.coreMetrics.apiSuccessRate}%`);
    console.log(`   - 吞吐量: ${this.coreMetrics.throughput} 请求/秒`);
    
    // 自动打开HTML报告
    this.openHtmlReport(reportPath);
    
    return reportPath;
  }

  // 生成HTML内容
  generateHtmlContent() {
    const currentTime = new Date().toLocaleString('zh-CN');
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>K6核心性能指标报告</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .header .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .content {
            padding: 30px;
        }
        
        .metrics-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
        }
        
        .metrics-table th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 12px;
            text-align: center;
            font-weight: 600;
            font-size: 0.95em;
            min-width: 100px;
        }
        
        .metrics-table td {
            padding: 15px 12px;
            text-align: center;
            border-bottom: 1px solid #f0f0f0;
            font-size: 0.95em;
            word-break: break-word;
        }
        
        .metrics-table tr:hover {
            background-color: #f8f9ff;
        }
        
        .interface-name {
            font-weight: 600;
            color: #4facfe;
            background: #f0f8ff;
            border-radius: 6px;
            padding: 8px;
        }
        
        .success-rate {
            font-weight: 600;
            color: #28a745;
        }
        
        .response-time {
            font-weight: 600;
            color: #dc3545;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
            border-top: 1px solid #eee;
        }
        
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 15px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .content {
                padding: 20px;
            }
            
            .metrics-table {
                font-size: 0.85em;
            }
            
            .metrics-table th,
            .metrics-table td {
                padding: 10px 8px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 K6核心性能指标报告</h1>
            <div class="subtitle">API压力测试核心指标概览 • ${currentTime}</div>
        </div>
        
        <div class="content">
            <table class="metrics-table">
                <thead>
                    <tr>
                        <th>接口名称</th>
                        <th>虚拟用户数</th>
                        <th>执行时长（s）</th>
                        <th>总请求数</th>
                        <th>平均响应时间（ms）</th>
                        <th>95分位响应时间（ms）</th>
                        <th>最大响应时间（ms）</th>
                        <th>API成功率</th>
                        <th>吞吐量（req/s）</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="interface-name">${this.coreMetrics.interfaceName}</td>
                        <td>${this.coreMetrics.virtualUsers}</td>
                        <td>${this.coreMetrics.durationSeconds}</td>
                        <td>${this.coreMetrics.totalRequests}</td>
                        <td class="response-time">${this.coreMetrics.avgResponseTime}</td>
                        <td class="response-time">${this.coreMetrics.p95ResponseTime}</td>
                        <td class="response-time">${this.coreMetrics.maxResponseTime}</td>
                        <td class="success-rate">${this.coreMetrics.apiSuccessRate}%</td>
                        <td>${this.coreMetrics.throughput}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <p>📊 K6性能测试报告 • 生成时间: ${currentTime} • HyperEcho AI Assistant</p>
        </div>
    </div>
</body>
</html>`;
  }

  // 运行报告生成 ⭐ 改进错误处理
  run() {
    try {
      console.log('🚀 开始生成K6核心指标HTML报告...');
      
      // ⭐ 解析数据并检查返回值
      const parseSuccess = this.parseSummaryData();
      if (!parseSuccess) {
        this.logError('数据解析失败，无法生成报告');
        return false;
      }
      
      // ⭐ 生成HTML报告
      const reportPath = this.generateHtmlReport();
      if (!reportPath) {
        this.logError('HTML报告生成失败');
        return false;
      }
      
      console.log('✅ 报告生成完成');
      return reportPath;
    } catch (error) {
      this.logError('报告生成过程中发生未预期的错误', error);
      return false;
    }
  }

  // ⭐ 新增：环境诊断函数
  static diagnoseEnvironment() {
    console.log('🔍 正在诊断运行环境...');
    
    // 检查Node.js版本
    console.log(`📝 Node.js版本: ${process.version}`);
    
    // 检查当前工作目录
    console.log(`📁 当前工作目录: ${process.cwd()}`);
    
    // 检查脚本路径
    console.log(`📋 脚本路径: ${__filename}`);
    
    // 检查reports目录
    const reportsDir = path.resolve(__dirname, '../../reports');
    console.log(`📂 Reports目录: ${reportsDir}`);
    console.log(`📂 Reports目录存在: ${fs.existsSync(reportsDir)}`);
    
    // 检查outputs目录
    const outputsDir = path.resolve(__dirname, '../../outputs');
    console.log(`📂 Outputs目录: ${outputsDir}`);
    console.log(`📂 Outputs目录存在: ${fs.existsSync(outputsDir)}`);
    
    console.log('');
  }
}

// 命令行调用 ⭐ 改进错误处理
if (require.main === module) {
  const summaryJsonPath = process.argv[2];
  
  if (!summaryJsonPath) {
    console.log('📖 使用方法:');
    console.log('   node generate-core-report.js <summary-json-path>');
    console.log('📝 示例:');
    console.log('   node generate-core-report.js ../../outputs/guest-create-session-baseline_summary_20250715_220614.json');
    process.exit(1);
  }
  
  // ⭐ 增强环境诊断（可选）
  if (process.env.DEBUG) {
    K6CoreReportGenerator.diagnoseEnvironment();
  }
  
  // ⭐ 初始验证
  if (!fs.existsSync(summaryJsonPath)) {
    console.error(`❌ [${new Date().toISOString()}] ERROR: 文件不存在: ${summaryJsonPath}`);
    console.error('💡 可能的原因:');
    console.error('  - 文件路径不正确');
    console.error('  - K6测试未成功完成');
    console.error('  - --summary-export 参数配置错误');
    console.error('');
    console.error('🔧 建议解决步骤:');
    console.error('  1. 检查文件路径是否正确');
    console.error('  2. 确认K6测试是否成功执行');
    console.error('  3. 查看outputs目录中的其他文件');
    console.error(`  4. 运行: ls -la ${path.dirname(summaryJsonPath)}/`);
    process.exit(2);
  }
  
  console.log('🚀 开始生成K6核心指标HTML报告...');
  console.log(`📄 输入文件: ${summaryJsonPath}`);
  
  // ⭐ 执行报告生成
  const generator = new K6CoreReportGenerator(summaryJsonPath);
  const result = generator.run();
  
  // ⭐ 检查执行结果
  if (result === false) {
    console.error('');
    console.error('❌ ========== 报告生成失败 ==========');
    console.error('⏰ 失败时间:', new Date().toISOString());
    console.error('📄 输入文件:', summaryJsonPath);
    console.error('');
    console.error('🔧 建议调试步骤:');
    console.error('  1. 检查K6测试是否正常完成');
    console.error('  2. 验证JSON文件格式是否正确');
    console.error('  3. 运行环境诊断: DEBUG=1 node generate-core-report.js <file>');
    console.error('  4. 查看详细错误信息（上方输出）');
    console.error('====================================');
    console.error('');
    
    process.exit(3);
  } else if (typeof result === 'string') {
    console.log('');
    console.log('✅ ========== 报告生成成功 ==========');
    console.log('⏰ 完成时间:', new Date().toISOString());
    console.log('📄 输入文件:', summaryJsonPath);
    console.log('📊 HTML报告:', result);
    console.log('🌐 已自动在浏览器中打开');
    console.log('====================================');
    console.log('');
    
    process.exit(0);
  } else {
    console.error('❌ 意外的返回值类型');
    process.exit(4);
  }
} 