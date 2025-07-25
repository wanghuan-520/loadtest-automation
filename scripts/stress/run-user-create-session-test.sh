#!/bin/bash

# 已登录用户create-session基准测试运行脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 打印函数
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

# 生成时间戳
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 定义文件路径
OUTPUTS_DIR="../../outputs"
REPORTS_DIR="../../reports"
TEST_NAME="user_create_session_baseline"
JSON_FILE="${OUTPUTS_DIR}/${TEST_NAME}_${TIMESTAMP}.json"
SUMMARY_FILE="${OUTPUTS_DIR}/${TEST_NAME}_summary_${TIMESTAMP}.json"
NATIVE_FILE="${REPORTS_DIR}/native_${TEST_NAME}_${TIMESTAMP}.txt"
ERROR_LOG_FILE="${REPORTS_DIR}/error_${TEST_NAME}_${TIMESTAMP}.log"

# 创建必要的目录
mkdir -p "$OUTPUTS_DIR"
mkdir -p "$REPORTS_DIR"

# 创建错误日志文件
touch "$ERROR_LOG_FILE"

# 记录测试开始信息
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 开始执行已登录用户create-session测试" >> "$ERROR_LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 测试脚本: user-create-session-baseline-test.js" >> "$ERROR_LOG_FILE"

print_info "🚀 开始已登录用户create-session基准测试..."
print_debug "错误日志将保存到: $ERROR_LOG_FILE"
echo
print_info "📂 文件路径配置:"
echo "   - 测试脚本: user-create-session-baseline-test.js"
echo "   - JSON数据: $JSON_FILE"
echo "   - 汇总数据: $SUMMARY_FILE"
echo "   - 原生报告: $NATIVE_FILE"
echo "   - 错误日志: $ERROR_LOG_FILE"
echo

# 第一步：运行K6测试
print_info "📊 第一步: 运行K6测试并保存原生报告..."
echo "运行命令: k6 run --out json=\"$JSON_FILE\" --summary-export=\"$SUMMARY_FILE\" user-create-session-baseline-test.js"
echo

# 运行测试并捕获错误
if k6 run --out json="$JSON_FILE" --summary-export="$SUMMARY_FILE" user-create-session-baseline-test.js 2>&1 | tee "$NATIVE_FILE"; then
    print_success "K6测试执行完成"
else
    K6_EXIT_CODE=$?
    print_error "K6测试执行失败，退出代码: $K6_EXIT_CODE"
    print_error "命令: k6 run --out json=\"$JSON_FILE\" --summary-export=\"$SUMMARY_FILE\" user-create-session-baseline-test.js"
    
    # 继续尝试生成报告（如果有部分数据）
    if [ -f "$SUMMARY_FILE" ]; then
        print_warning "检测到部分汇总数据，尝试生成HTML报告..."
    else
        print_error "无汇总数据，无法生成HTML报告"
        exit 1
    fi
fi

# 第二步：生成HTML报告
print_info "📄 第二步: 生成核心指标HTML报告..."

# 检查generate-core-report.js是否存在
if [ ! -f "generate-core-report.js" ]; then
    print_error "generate-core-report.js 脚本不存在"
    exit 1
fi

# 检查汇总文件是否生成
if [ ! -f "$SUMMARY_FILE" ]; then
    print_error "K6汇总文件未生成: $SUMMARY_FILE"
    exit 1
fi

# 生成HTML报告并捕获错误
echo "生成命令: node generate-core-report.js \"$SUMMARY_FILE\""
if node generate-core-report.js "$SUMMARY_FILE" 2>&1; then
    print_success "HTML报告生成完成并已自动打开"
else
    HTML_EXIT_CODE=$?
    print_error "HTML报告生成失败，退出代码: $HTML_EXIT_CODE"
    print_error "命令: node generate-core-report.js \"$SUMMARY_FILE\""
    
    print_warning "K6测试已完成，但HTML报告生成失败"
    print_info "原生K6报告仍可查看: $NATIVE_FILE"
    exit 1
fi

# 记录测试完成信息
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: 已登录用户create-session测试执行完成" >> "$ERROR_LOG_FILE"

echo
print_success "🎉 已登录用户create-session测试完成！双重报告已生成"
echo
print_info "📋 生成的文件:"
echo "   📊 K6原生报告: $NATIVE_FILE"
echo "   📈 JSON详细数据: $JSON_FILE"
echo "   📋 JSON汇总数据: $SUMMARY_FILE"
echo "   🌐 HTML核心指标报告: 已在浏览器中打开"
echo "   📝 错误日志: $ERROR_LOG_FILE"
echo
print_info "🎯 测试类型: 已登录用户create-session基准测试"
print_info "⏰ 执行时间: $(date)"
print_success "✨ 已登录用户测试系统执行完毕"

# 显示文件大小信息
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

# 显示错误日志状态
if [ -f "$ERROR_LOG_FILE" ]; then
    if [ -s "$ERROR_LOG_FILE" ]; then
        ERROR_SIZE=$(ls -lh "$ERROR_LOG_FILE" | awk '{print $5}')
        ERROR_LINES=$(wc -l < "$ERROR_LOG_FILE")
        echo "   - 错误日志: $ERROR_SIZE ($ERROR_LINES 行)"
        
        # 统计错误类型
        ERROR_COUNT=$(grep -c "ERROR:" "$ERROR_LOG_FILE" 2>/dev/null || echo "0")
        WARNING_COUNT=$(grep -c "WARNING:" "$ERROR_LOG_FILE" 2>/dev/null || echo "0")
        
        if [ "$ERROR_COUNT" -gt 0 ]; then
            print_warning "发现 $ERROR_COUNT 个错误，建议查看: cat $ERROR_LOG_FILE"
        elif [ "$WARNING_COUNT" -gt 0 ]; then
            print_info "发现 $WARNING_COUNT 个警告，详情: cat $ERROR_LOG_FILE"
        else
            echo "   - 状态: 仅包含信息日志 ✅"
        fi
    else
        echo "   - 错误日志: 0B (无错误记录) ✅"
    fi
else
    echo "   - 错误日志: 文件未创建 ❌"
fi

echo
print_info "🔮 已登录用户测试提示: 验证Bearer Token认证的会话创建性能" 