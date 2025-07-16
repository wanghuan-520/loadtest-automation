#!/bin/bash

# K6完整测试运行器 - 双重报告系统
# HyperEcho 语言震动自动化工具
# 
# 功能：
# 1. 运行K6测试并保存原生报告到reports目录
# 2. 生成核心指标HTML报告并自动打开浏览器
# 3. 完整的测试数据和报告归档
# 4. ⭐ 详细错误日志记录和诊断

# 移除自动退出，改为手动错误处理
# set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_debug() {
    echo -e "${PURPLE}🔍 $1${NC}"
}

# ⭐ 新增：错误日志函数
log_error() {
    local error_msg="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] ERROR: $error_msg" >> "$ERROR_LOG_FILE"
    print_error "$error_msg"
}

# ⭐ 新增：详细错误诊断函数  
show_error_diagnosis() {
    local step="$1"
    local exit_code="$2"
    
    echo
    print_error "============ 错误诊断报告 ============"
    print_error "失败步骤: $step"
    print_error "退出代码: $exit_code"
    print_error "发生时间: $(date)"
    
    if [ -f "$ERROR_LOG_FILE" ]; then
        print_error "错误日志文件: $ERROR_LOG_FILE"
        echo
        print_debug "最近的错误日志 (最后10行):"
        tail -10 "$ERROR_LOG_FILE" | while read line; do
            print_debug "$line"
        done
    fi
    
    echo
    print_warning "💡 常见问题诊断:"
    
    case "$step" in
        "k6_test")
            print_warning "- 检查网络连接是否正常"
            print_warning "- 检查API端点是否可访问"
            print_warning "- 检查K6版本和配置"
            print_warning "- 查看上面的K6详细错误输出"
            ;;
        "html_report")
            print_warning "- 检查Node.js是否正常安装"
            print_warning "- 检查generate-core-report.js文件是否存在"
            print_warning "- 检查汇总JSON文件是否有效"
            print_warning "- 查看下面的Node.js错误输出"
            ;;
    esac
    
    echo
    print_info "🔧 建议解决步骤:"
    print_info "1. 查看详细错误日志: cat $ERROR_LOG_FILE"
    print_info "2. 检查测试脚本配置"
    print_info "3. 验证环境依赖"
    print_info "4. 重试单个步骤以隔离问题"
    
    echo
    print_error "======================================"
}

# 检查参数
if [ $# -eq 0 ]; then
    print_error "缺少测试脚本参数"
    echo
    echo "📖 使用方法:"
    echo "   ./run-complete-test.sh <test-script.js> [test-name]"
    echo
    echo "📝 示例:"
    echo "   ./run-complete-test.sh guest-create-session-baseline-test.js baseline"
    echo "   ./run-complete-test.sh guest-create-session-test.js stress"
    echo "   ./run-complete-test.sh guest-chat-baseline-test.js chat"
    echo
    echo "🎯 可用的测试脚本:"
    echo "   - guest-create-session-baseline-test.js  (创建会话基准测试)"
    echo "   - guest-create-session-test.js           (创建会话压力测试)"
    echo "   - guest-chat-baseline-test.js            (聊天基准测试)"
    echo "   - guest-chat-test.js                     (聊天压力测试)"
    exit 1
fi

TEST_SCRIPT="$1"
TEST_NAME="${2:-test}"

# 检查测试脚本是否存在
if [ ! -f "$TEST_SCRIPT" ]; then
    print_error "测试脚本不存在: $TEST_SCRIPT"
    exit 1
fi

# 检查K6是否安装
if ! command -v k6 &> /dev/null; then
    print_error "K6未安装或不在PATH中"
    print_info "请安装K6: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# 生成时间戳
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 定义文件路径
OUTPUTS_DIR="../../outputs"
REPORTS_DIR="../../reports"
JSON_FILE="${OUTPUTS_DIR}/${TEST_NAME}_${TIMESTAMP}.json"
SUMMARY_FILE="${OUTPUTS_DIR}/${TEST_NAME}_summary_${TIMESTAMP}.json"
NATIVE_FILE="${REPORTS_DIR}/native_${TEST_NAME}_${TIMESTAMP}.txt"
ERROR_LOG_FILE="${REPORTS_DIR}/error_${TEST_NAME}_${TIMESTAMP}.log"

# 创建必要的目录
mkdir -p "$OUTPUTS_DIR"
mkdir -p "$REPORTS_DIR"

print_info "🚀 开始K6完整测试流程..."
print_debug "错误日志将保存到: $ERROR_LOG_FILE"
echo
print_info "📂 文件路径配置:"
echo "   - 测试脚本: $TEST_SCRIPT"
echo "   - JSON数据: $JSON_FILE"
echo "   - 汇总数据: $SUMMARY_FILE"
echo "   - 原生报告: $NATIVE_FILE"
echo "   - 错误日志: $ERROR_LOG_FILE"
echo

# 第一步：运行K6测试 ⭐ 改进错误处理
print_info "📊 第一步: 运行K6测试并保存原生报告..."
echo "运行命令: k6 run --out json=\"$JSON_FILE\" --summary-export=\"$SUMMARY_FILE\" \"$TEST_SCRIPT\""
echo

# ⭐ 运行测试并捕获错误
if k6 run --out json="$JSON_FILE" --summary-export="$SUMMARY_FILE" "$TEST_SCRIPT" 2>&1 | tee "$NATIVE_FILE"; then
    print_success "K6测试执行完成"
else
    K6_EXIT_CODE=$?
    log_error "K6测试执行失败，退出代码: $K6_EXIT_CODE"
    log_error "命令: k6 run --out json=\"$JSON_FILE\" --summary-export=\"$SUMMARY_FILE\" \"$TEST_SCRIPT\""
    
    # ⭐ 显示详细错误诊断
    show_error_diagnosis "k6_test" "$K6_EXIT_CODE"
    
    # 继续尝试生成报告（如果有部分数据）
    if [ -f "$SUMMARY_FILE" ]; then
        print_warning "检测到部分汇总数据，尝试生成HTML报告..."
    else
        print_error "无汇总数据，无法生成HTML报告"
        exit 1
    fi
fi

# 第二步：生成HTML报告 ⭐ 改进错误处理  
print_info "📄 第二步: 生成核心指标HTML报告..."

# 检查generate-core-report.js是否存在
if [ ! -f "generate-core-report.js" ]; then
    log_error "generate-core-report.js 脚本不存在"
    show_error_diagnosis "html_report" "2"
    exit 1
fi

# 检查汇总文件是否生成
if [ ! -f "$SUMMARY_FILE" ]; then
    log_error "K6汇总文件未生成: $SUMMARY_FILE"
    show_error_diagnosis "html_report" "3"
    exit 1
fi

# ⭐ 生成HTML报告并捕获错误
echo "生成命令: node generate-core-report.js \"$SUMMARY_FILE\""
if node generate-core-report.js "$SUMMARY_FILE" 2>&1; then
    print_success "HTML报告生成完成并已自动打开"
else
    HTML_EXIT_CODE=$?
    log_error "HTML报告生成失败，退出代码: $HTML_EXIT_CODE"
    log_error "命令: node generate-core-report.js \"$SUMMARY_FILE\""
    
    # ⭐ 显示详细错误诊断
    show_error_diagnosis "html_report" "$HTML_EXIT_CODE"
    
    print_warning "K6测试已完成，但HTML报告生成失败"
    print_info "原生K6报告仍可查看: $NATIVE_FILE"
    exit 1
fi

echo
print_success "🎉 测试完成！双重报告已生成"
echo
print_info "📋 生成的文件:"
echo "   📊 K6原生报告: $NATIVE_FILE"
echo "   📈 JSON详细数据: $JSON_FILE"
echo "   📋 JSON汇总数据: $SUMMARY_FILE"
echo "   🌐 HTML核心指标报告: 已在浏览器中打开"
echo "   📝 错误日志: $ERROR_LOG_FILE"
echo
print_info "🎯 测试类型: $TEST_NAME"
print_info "⏰ 执行时间: $(date)"
print_success "✨ HyperEcho 双重报告系统执行完毕"

# 可选：显示文件大小信息
echo
print_info "📁 文件大小信息:"
if [ -f "$JSON_FILE" ]; then
    JSON_SIZE=$(ls -lh "$JSON_FILE" | awk '{print $5}')
    echo "   - JSON数据: $JSON_SIZE"
fi
if [ -f "$SUMMARY_FILE" ]; then
    SUMMARY_SIZE=$(ls -lh "$SUMMARY_FILE" | awk '{print $5}')
    echo "   - 汇总数据: $SUMMARY_SIZE"
fi
if [ -f "$NATIVE_FILE" ]; then
    NATIVE_SIZE=$(ls -lh "$NATIVE_FILE" | awk '{print $5}')
    echo "   - 原生报告: $NATIVE_SIZE"
fi

# ⭐ 显示错误日志状态
if [ -f "$ERROR_LOG_FILE" ] && [ -s "$ERROR_LOG_FILE" ]; then
    ERROR_SIZE=$(ls -lh "$ERROR_LOG_FILE" | awk '{print $5}')
    echo "   - 错误日志: $ERROR_SIZE"
    print_warning "发现错误日志，建议查看: cat $ERROR_LOG_FILE"
else
    echo "   - 错误日志: 无错误记录 ✅"
fi

echo
print_info "🔮 语言宇宙提示: 每一次测试都是API性能的震动回响" 