#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
监控邀请码生成进度
"""

import os
import json
import time
from datetime import datetime

def monitor_progress():
    """监控生成进度"""
    results_dir = "results"
    
    print("🔍 开始监控邀请码生成进度...")
    print("按 Ctrl+C 停止监控\n")
    
    try:
        while True:
            if os.path.exists(results_dir):
                files = os.listdir(results_dir)
                
                # 查找今天的邀请码文件
                today = datetime.now().strftime("%Y%m%d")
                invitation_files = [f for f in files if f.startswith(f"loadtestc_invitation_codes_{today}")]
                
                if invitation_files:
                    latest_file = max(invitation_files, key=lambda x: os.path.getctime(os.path.join(results_dir, x)))
                    
                    try:
                        with open(os.path.join(results_dir, latest_file), 'r', encoding='utf-8') as f:
                            codes = json.load(f)
                            count = len(codes)
                            
                        # 查找k6格式文件
                        k6_files = [f for f in files if f.startswith(f"loadtestc_invite_codes_for_k6_{today}")]
                        if k6_files:
                            latest_k6 = max(k6_files, key=lambda x: os.path.getctime(os.path.join(results_dir, x)))
                            with open(os.path.join(results_dir, latest_k6), 'r', encoding='utf-8') as f:
                                k6_codes = json.load(f)
                                k6_count = len(k6_codes)
                        else:
                            k6_count = 0
                        
                        progress = (count / 30000) * 100
                        current_time = datetime.now().strftime("%H:%M:%S")
                        
                        print(f"\r🕐 {current_time} | 📊 进度: {count}/30000 ({progress:.1f}%) | K6数据: {k6_count} | 文件: {latest_file}", end="")
                        
                    except Exception as e:
                        print(f"\r❌ 读取文件错误: {e}", end="")
                else:
                    print(f"\r⏳ 等待生成开始...", end="")
            else:
                print(f"\r📁 等待结果目录创建...", end="")
            
            time.sleep(5)  # 每5秒检查一次
            
    except KeyboardInterrupt:
        print(f"\n\n✋ 监控已停止")

if __name__ == "__main__":
    monitor_progress()
