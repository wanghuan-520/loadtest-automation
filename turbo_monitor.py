#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Turbo模式实时监控脚本
"""

import os
import json
import time
import glob
from datetime import datetime

def turbo_monitor():
    """实时监控Turbo生成进度"""
    print("🔍 Turbo模式监控器启动...")
    print("监控目标：30000个邀请码")
    print("按 Ctrl+C 停止监控\n")
    
    start_time = time.time()
    last_count = 0
    
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
            
            # 计算速度
            if elapsed > 0:
                speed = total_codes / elapsed
                if last_count > 0:
                    recent_speed = (total_codes - last_count) / 5  # 最近5秒的速度
                else:
                    recent_speed = speed
            else:
                speed = recent_speed = 0
            
            # 计算进度和预估时间
            progress = (total_codes / 30000) * 100
            if speed > 0:
                remaining = (30000 - total_codes) / speed / 60  # 剩余分钟
            else:
                remaining = 0
            
            # 显示状态
            print(f"\r🕐 {current_time} | "
                  f"📊 {total_codes:,}/30,000 ({progress:.1f}%) | "
                  f"⚡ {speed:.1f}/秒 (近期:{recent_speed:.1f}/秒) | "
                  f"📁 {file_count}文件 | "
                  f"⏱️ 剩余:{remaining:.1f}分钟", end="")
            
            last_count = total_codes
            
            # 如果完成了就退出
            if total_codes >= 30000:
                print(f"\n\n🎉 生成完成! 总计: {total_codes:,} 个邀请码")
                print(f"⏱️  总耗时: {elapsed/60:.1f} 分钟")
                break
            
            time.sleep(5)  # 每5秒更新一次
            
    except KeyboardInterrupt:
        elapsed = time.time() - start_time
        print(f"\n\n✋ 监控已停止")
        print(f"📊 当前进度: {total_codes:,}/30,000 ({(total_codes/30000)*100:.1f}%)")
        print(f"⏱️  已运行: {elapsed/60:.1f} 分钟")
        if total_codes > 0:
            print(f"⚡ 平均速度: {total_codes/elapsed:.1f} 账户/秒")

if __name__ == "__main__":
    turbo_monitor()
