#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
稳定模式实时监控脚本
"""

import os
import json
import time
import glob
from datetime import datetime

def stable_monitor():
    """实时监控稳定生成进度"""
    print("🎯 稳定模式监控器启动...")
    print("📊 目标：30000个邀请码 (预期成功率: 15-25%)")
    print("⏱️  预计时间：30-40分钟")
    print("按 Ctrl+C 停止监控\n")
    
    start_time = time.time()
    last_count = 0
    best_success_rate = 0
    
    try:
        while True:
            current_time = datetime.now().strftime("%H:%M:%S")
            elapsed = time.time() - start_time
            
            # 统计当前邀请码数量
            results_dir = "results"
            total_codes = 0
            file_count = 0
            
            if os.path.exists(results_dir):
                today = datetime.now().strftime("%Y%m%d")
                pattern = os.path.join(results_dir, f"loadtestc_invitation_codes_{today}*.json")
                files = glob.glob(pattern)
                
                for file in files:
                    try:
                        with open(file, 'r', encoding='utf-8') as f:
                            codes = json.load(f)
                            total_codes += len(codes)
                            file_count += 1
                    except:
                        pass
            
            # 计算速度和成功率
            if elapsed > 0:
                speed = total_codes / elapsed
                if last_count > 0:
                    recent_speed = (total_codes - last_count) / 10  # 最近10秒的速度
                else:
                    recent_speed = speed
            else:
                speed = recent_speed = 0
            
            # 计算成功率（基于已处理的批次估算）
            estimated_processed = elapsed * 500 if elapsed > 0 else 0  # 每秒大约处理500个账户
            current_success_rate = (total_codes / max(estimated_processed, 1)) * 100 if estimated_processed > 0 else 0
            current_success_rate = min(current_success_rate, 100)  # 限制在100%以内
            
            if current_success_rate > best_success_rate:
                best_success_rate = current_success_rate
            
            # 计算进度和预估时间
            progress = (total_codes / 30000) * 100
            if speed > 0 and progress < 95:
                remaining = (30000 - total_codes) / speed / 60  # 剩余分钟
            else:
                remaining = 0
            
            # 动态状态显示
            status_emoji = "🚀" if recent_speed > speed * 0.8 else "📈" if recent_speed > 0 else "⏳"
            
            # 显示状态
            print(f"\r{status_emoji} {current_time} | "
                  f"📊 {total_codes:,}/30,000 ({progress:.1f}%) | "
                  f"⚡ {speed:.1f}/秒 (近期:{recent_speed:.1f}/秒) | "
                  f"📁 {file_count}文件 | "
                  f"📈 成功率:{current_success_rate:.1f}% (最佳:{best_success_rate:.1f}%) | "
                  f"⏱️ 剩余:{remaining:.1f}分钟", end="")
            
            last_count = total_codes
            
            # 如果完成了就退出
            if total_codes >= 30000:
                print(f"\n\n🎉 生成完成! 总计: {total_codes:,} 个邀请码")
                print(f"⏱️  总耗时: {elapsed/60:.1f} 分钟")
                print(f"📈 最终成功率: {best_success_rate:.2f}%")
                break
            
            # 如果获得了足够的邀请码（比如5000个），提示用户
            if total_codes >= 5000 and total_codes % 1000 < 50:
                print(f"\n💡 提示：已获得 {total_codes:,} 个邀请码，已足够进行压力测试")
            
            time.sleep(10)  # 每10秒更新一次
            
    except KeyboardInterrupt:
        elapsed = time.time() - start_time
        print(f"\n\n✋ 监控已停止")
        print(f"📊 当前进度: {total_codes:,}/30,000 ({(total_codes/30000)*100:.1f}%)")
        print(f"⏱️  已运行: {elapsed/60:.1f} 分钟")
        print(f"📈 最佳成功率: {best_success_rate:.2f}%")
        if total_codes > 0:
            print(f"⚡ 平均速度: {total_codes/elapsed:.1f} 账户/秒")

if __name__ == "__main__":
    stable_monitor()
