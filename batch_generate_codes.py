#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量分批获取30000个邀请码
将大任务拆分为多个小批次，提高成功率和可控性
"""

import subprocess
import time
import json
import os
from datetime import datetime

def run_batch_generation():
    """分批生成邀请码"""
    total_count = 30000
    batch_size = 1000  # 每批1000个
    start_index = 1
    
    print("🚀 开始分批生成30000个邀请码...")
    print(f"📦 批次大小: {batch_size}")
    print(f"🔢 总批次数: {total_count // batch_size}")
    
    all_invitation_codes = {}
    all_failed_accounts = []
    
    for batch_num in range(0, total_count, batch_size):
        current_start = start_index + batch_num
        current_count = min(batch_size, total_count - batch_num)
        
        print(f"\n📋 第 {batch_num//batch_size + 1} 批: loadtestc{current_start} - loadtestc{current_start + current_count - 1}")
        
        try:
            # 运行单批次
            cmd = [
                "python", "get_invitation_codes.py",
                "--prefix", "loadtestc", 
                "--start", str(current_start),
                "--count", str(current_count),
                "--workers", "20"
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30分钟超时
            
            if result.returncode == 0:
                print(f"✅ 第 {batch_num//batch_size + 1} 批完成")
                
                # 收集这批的结果
                timestamp_pattern = datetime.now().strftime("%Y%m%d")
                
                # 查找最新生成的文件
                results_dir = "results"
                if os.path.exists(results_dir):
                    files = os.listdir(results_dir)
                    # 查找最新的邀请码文件
                    invitation_files = [f for f in files if f.startswith(f"loadtestc_invitation_codes_{timestamp_pattern}")]
                    if invitation_files:
                        latest_file = max(invitation_files, key=lambda x: os.path.getctime(os.path.join(results_dir, x)))
                        with open(os.path.join(results_dir, latest_file), 'r', encoding='utf-8') as f:
                            batch_codes = json.load(f)
                            all_invitation_codes.update(batch_codes)
                            print(f"📊 已收集 {len(batch_codes)} 个邀请码，总计: {len(all_invitation_codes)}")
                
            else:
                print(f"❌ 第 {batch_num//batch_size + 1} 批失败: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            print(f"⏰ 第 {batch_num//batch_size + 1} 批超时")
        except Exception as e:
            print(f"💥 第 {batch_num//batch_size + 1} 批异常: {str(e)}")
            
        # 批次间休息2秒
        time.sleep(2)
    
    # 保存最终结果
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if all_invitation_codes:
        # 保存完整的邀请码数据
        final_filename = f"results/loadtestc_30k_invitation_codes_{timestamp}.json"
        with open(final_filename, "w", encoding='utf-8') as f:
            json.dump(all_invitation_codes, f, indent=2, ensure_ascii=False)
        
        # 保存k6格式的数据
        invite_codes_list = list(all_invitation_codes.values())
        k6_filename = f"results/loadtestc_30k_invite_codes_for_k6_{timestamp}.json"
        with open(k6_filename, "w", encoding='utf-8') as f:
            json.dump(invite_codes_list, f, indent=2, ensure_ascii=False)
        
        # 更新data目录中的文件
        data_filename = "scripts/stress/data/loadtest_invite_codes_30k.json"
        with open(data_filename, "w", encoding='utf-8') as f:
            json.dump(invite_codes_list, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎉 生成完成!")
        print(f"📁 完整数据: {final_filename}")
        print(f"📁 K6数据: {k6_filename}")
        print(f"📁 测试数据: {data_filename}")
        print(f"📊 总成功数量: {len(all_invitation_codes)}")
        
    else:
        print("❌ 没有获取到任何邀请码")

if __name__ == "__main__":
    run_batch_generation()
