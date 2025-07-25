#!/bin/bash

# guest/create-session 固定QPS压力测试运行脚本
# 使用说明：
# 默认QPS运行: ./run-guest-create-session-qps-test.sh
# 自定义QPS运行: ./run-guest-create-session-qps-test.sh 80
# 查看帮助: ./run-guest-create-session-qps-test.sh -h

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo -e "${BLUE}guest/create-session 固定QPS压力测试脚本${NC}"
    echo -e "${YELLOW}使用方法:${NC}"
    echo "  $0                    # 使用默认QPS (50)"
    echo "  $0 [QPS数值]          # 使用指定QPS"
    echo "  $0 -h                 # 显示此帮助信息"
    echo ""
    echo -e "${YELLOW}示例:${NC}"
    echo "  $0                    # 50 QPS测试"
    echo "  $0 100                # 100 QPS测试"
    echo "  $0 200                # 200 QPS测试"
    echo ""
    echo -e "${YELLOW}测试配置:${NC}"
    echo "  • 测试时长: 5分钟"
    echo "  • 测试模式: 固定QPS（恒定请求速率）"
    echo "  • 接口: guest/create-session"
    echo "  • 环境: 开发环境 (dev)"
}

# 检查参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# 获取QPS参数，默认为50
TARGET_QPS=${1:-50}

# 验证QPS参数是否为正整数
if ! [[ "$TARGET_QPS" =~ ^[1-9][0-9]*$ ]]; then
    echo -e "${RED}❌ 错误: QPS必须为正整数${NC}"
    echo -e "${YELLOW}示例: $0 100${NC}"
    exit 1
fi

# 检查k6是否安装
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ 错误: k6未安装或不在PATH中${NC}"
    echo -e "${YELLOW}请安装k6: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
fi

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 检查测试脚本是否存在
SCRIPT_FILE="guest-create-session-fixed-qps-test.js"
if [ ! -f "$SCRIPT_FILE" ]; then
    echo -e "${RED}❌ 错误: 测试脚本 $SCRIPT_FILE 不存在${NC}"
    exit 1
fi

# 显示测试信息
echo -e "${BLUE}🎯 guest/create-session 固定QPS压力测试${NC}"
echo -e "${GREEN}目标QPS: ${TARGET_QPS}${NC}"
echo -e "${GREEN}测试时长: 5分钟${NC}"
echo -e "${GREEN}预估总请求数: $((TARGET_QPS * 300))${NC}"
echo ""

# 运行测试
echo -e "${YELLOW}🚀 开始执行测试...${NC}"
k6 run -e TARGET_QPS="$TARGET_QPS" "$SCRIPT_FILE"

# 显示测试完成信息
echo ""
echo -e "${GREEN}✅ 测试执行完成${NC}"
echo -e "${BLUE}📊 请查看测试报告中的关键指标:${NC}"
echo "  • QPS稳定性"
echo "  • API调用成功率"
echo "  • 响应时间分布"
echo "  • 系统资源使用情况" 