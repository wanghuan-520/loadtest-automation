#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Turbo 模式：超高速并行生成30000个邀请码
使用多进程 + 高并发策略，预计15-20分钟完成
"""

import multiprocessing as mp
import subprocess
import time
import json
import os
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed

def run_batch(args):
    """运行单个批次"""
    batch_id, start_idx, count, workers = args
    
    cmd = [
        "/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python",
        "get_invitation_codes.py",
        "--prefix", "loadtestc", 
        "--start", str(start_idx),
        "--count", str(count),
        "--workers", str(workers)
    ]
    
    print(f"🚀 批次 {batch_id}: loadtestc{start_idx} - loadtestc{start_idx + count - 1}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)  # 15分钟超时
        
        if result.returncode == 0:
            print(f"✅ 批次 {batch_id} 完成")
            return batch_id, True, None
        else:
            print(f"❌ 批次 {batch_id} 失败: {result.stderr}")
            return batch_id, False, result.stderr
            
    except subprocess.TimeoutExpired:
        print(f"⏰ 批次 {batch_id} 超时")
        return batch_id, False, "timeout"
    except Exception as e:
        print(f"💥 批次 {batch_id} 异常: {str(e)}")
        return batch_id, False, str(e)

def turbo_generate():
    """Turbo模式生成"""
    print("🚀 Turbo模式：超高速生成30000个邀请码")
    print("⚡ 策略：6个并行进程，每进程处理5000个账户，每批500个")
    
    # 配置：6个并行进程，每个处理5000个账户
    total_accounts = 30000
    num_processes = 6
    accounts_per_process = 5000
    batch_size = 500  # 每批500个
    workers_per_batch = 80  # 每批80个并发线程
    
    # 生成所有批次参数
    batches = []
    batch_id = 1
    
    for process_id in range(num_processes):
        process_start = process_id * accounts_per_process + 1
        process_end = min((process_id + 1) * accounts_per_process, total_accounts)
        
        # 将每个进程的任务再分成更小的批次
        for batch_start in range(process_start, process_end + 1, batch_size):
            batch_count = min(batch_size, process_end - batch_start + 1)
            batches.append((batch_id, batch_start, batch_count, workers_per_batch))
            batch_id += 1
    
    print(f"📦 总批次数: {len(batches)}")
    print(f"🔧 并行进程数: {num_processes}")
    print(f"⚡ 每批并发数: {workers_per_batch}")
    
    start_time = time.time()
    
    # 使用进程池并行执行
    with ProcessPoolExecutor(max_workers=num_processes) as executor:
        futures = [executor.submit(run_batch, batch) for batch in batches]
        
        completed = 0
        failed = 0
        
        for future in as_completed(futures):
            batch_id, success, error = future.result()
            
            if success:
                completed += 1
                print(f"📊 进度: {completed}/{len(batches)} 批次完成")
            else:
                failed += 1
                print(f"❌ 批次 {batch_id} 失败: {error}")
    
    elapsed = time.time() - start_time
    print(f"\n🎉 Turbo生成完成!")
    print(f"⏱️  总耗时: {elapsed/60:.1f}分钟")
    print(f"✅ 成功批次: {completed}")
    print(f"❌ 失败批次: {failed}")
    
    # 收集和合并结果
    print("📝 正在收集和合并结果...")
    collect_and_merge_results()

def collect_and_merge_results():
    """收集并合并所有结果"""
    results_dir = "results"
    today = datetime.now().strftime("%Y%m%d")
    
    all_codes = {}
    
    if os.path.exists(results_dir):
        files = os.listdir(results_dir)
        invitation_files = [f for f in files if f.startswith(f"loadtestc_invitation_codes_{today}")]
        
        print(f"🔍 发现 {len(invitation_files)} 个结果文件")
        
        for file in invitation_files:
            try:
                with open(os.path.join(results_dir, file), 'r', encoding='utf-8') as f:
                    batch_codes = json.load(f)
                    all_codes.update(batch_codes)
                    print(f"📁 合并文件: {file} ({len(batch_codes)} 个邀请码)")
            except Exception as e:
                print(f"❌ 读取文件 {file} 失败: {e}")
    
    if all_codes:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 保存合并后的完整数据
        merged_file = f"results/loadtestc_turbo_30k_codes_{timestamp}.json"
        with open(merged_file, "w", encoding='utf-8') as f:
            json.dump(all_codes, f, indent=2, ensure_ascii=False)
        
        # 保存K6格式数据
        codes_list = list(all_codes.values())
        k6_file = f"results/loadtestc_turbo_30k_k6_{timestamp}.json"
        with open(k6_file, "w", encoding='utf-8') as f:
            json.dump(codes_list, f, indent=2, ensure_ascii=False)
        
        # 更新测试数据目录
        test_data_file = "scripts/stress/data/loadtest_invite_codes_turbo.json"
        with open(test_data_file, "w", encoding='utf-8') as f:
            json.dump(codes_list, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎯 最终结果:")
        print(f"📊 总邀请码数量: {len(all_codes)}")
        print(f"📁 完整数据: {merged_file}")
        print(f"📁 K6数据: {k6_file}")
        print(f"📁 测试数据: {test_data_file}")
        
        # 显示覆盖范围
        if all_codes:
            emails = list(all_codes.keys())
            indices = [int(email.replace('loadtestc', '').replace('@teml.net', '')) for email in emails]
            min_idx, max_idx = min(indices), max(indices)
            print(f"📈 覆盖范围: loadtestc{min_idx} - loadtestc{max_idx}")
            print(f"📉 覆盖率: {len(all_codes)/30000*100:.1f}%")
    else:
        print("❌ 没有找到任何邀请码数据")

if __name__ == "__main__":
    print("⚡ 启动 Turbo 邀请码生成器...")
    turbo_generate()
