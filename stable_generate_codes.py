#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
稳定模式：低并发高成功率生成30000个邀请码
策略：降低并发数，增加成功率，预计30-40分钟完成
"""

import multiprocessing as mp
import subprocess
import time
import json
import os
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed

def run_stable_batch(args):
    """运行稳定批次 - 低并发高成功率"""
    batch_id, start_idx, count, workers = args
    
    cmd = [
        "/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python",
        "get_invitation_codes.py",
        "--prefix", "loadtestc", 
        "--start", str(start_idx),
        "--count", str(count),
        "--workers", str(workers)
    ]
    
    print(f"🚀 稳定批次 {batch_id}: loadtestc{start_idx} - loadtestc{start_idx + count - 1} (并发:{workers})")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)  # 30分钟超时
        
        if result.returncode == 0:
            print(f"✅ 稳定批次 {batch_id} 完成")
            return batch_id, True, None
        else:
            print(f"❌ 稳定批次 {batch_id} 失败: {result.stderr}")
            return batch_id, False, result.stderr
            
    except subprocess.TimeoutExpired:
        print(f"⏰ 稳定批次 {batch_id} 超时")
        return batch_id, False, "timeout"
    except Exception as e:
        print(f"💥 稳定批次 {batch_id} 异常: {str(e)}")
        return batch_id, False, str(e)

def stable_generate():
    """稳定模式生成 - 平衡速度与成功率"""
    print("🎯 稳定模式：平衡速度与成功率的邀请码生成")
    print("⚖️  策略：适中并发数，提高成功率，预计30-40分钟完成")
    
    # 优化配置：平衡速度与稳定性
    total_accounts = 30000
    num_processes = 4  # 减少到4个并行进程
    batch_size = 1000  # 每批1000个
    workers_per_batch = 30  # 每批30个并发线程（降低并发压力）
    
    # 生成所有批次参数
    batches = []
    batch_id = 1
    
    for start_idx in range(1, total_accounts + 1, batch_size):
        batch_count = min(batch_size, total_accounts - start_idx + 1)
        batches.append((batch_id, start_idx, batch_count, workers_per_batch))
        batch_id += 1
    
    print(f"📦 总批次数: {len(batches)}")
    print(f"🔧 并行进程数: {num_processes}")
    print(f"⚡ 每批并发数: {workers_per_batch}")
    print(f"🎯 预期成功率: 15-25%")
    print(f"⏱️  预计时间: 30-40分钟")
    
    start_time = time.time()
    
    # 使用进程池并行执行（降低并行度）
    with ProcessPoolExecutor(max_workers=num_processes) as executor:
        futures = [executor.submit(run_stable_batch, batch) for batch in batches]
        
        completed = 0
        failed = 0
        
        for future in as_completed(futures):
            batch_id, success, error = future.result()
            
            if success:
                completed += 1
                elapsed = time.time() - start_time
                remaining_batches = len(batches) - completed
                avg_time_per_batch = elapsed / completed
                eta_minutes = (remaining_batches * avg_time_per_batch) / 60
                
                print(f"📊 进度: {completed}/{len(batches)} 批次完成 (预计剩余: {eta_minutes:.1f}分钟)")
            else:
                failed += 1
                print(f"❌ 批次 {batch_id} 失败: {error}")
    
    elapsed = time.time() - start_time
    print(f"\n🎉 稳定生成完成!")
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
        merged_file = f"results/loadtestc_stable_30k_codes_{timestamp}.json"
        with open(merged_file, "w", encoding='utf-8') as f:
            json.dump(all_codes, f, indent=2, ensure_ascii=False)
        
        # 保存K6格式数据
        codes_list = list(all_codes.values())
        k6_file = f"results/loadtestc_stable_30k_k6_{timestamp}.json"
        with open(k6_file, "w", encoding='utf-8') as f:
            json.dump(codes_list, f, indent=2, ensure_ascii=False)
        
        # 更新测试数据目录
        test_data_file = "scripts/stress/data/loadtest_invite_codes_stable.json"
        with open(test_data_file, "w", encoding='utf-8') as f:
            json.dump(codes_list, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎯 最终结果:")
        print(f"📊 总邀请码数量: {len(all_codes):,}")
        print(f"📁 完整数据: {merged_file}")
        print(f"📁 K6数据: {k6_file}")
        print(f"📁 测试数据: {test_data_file}")
        
        # 计算成功率
        if all_codes:
            emails = list(all_codes.keys())
            indices = [int(email.replace('loadtestc', '').replace('@teml.net', '')) for email in emails]
            min_idx, max_idx = min(indices), max(indices)
            success_rate = len(all_codes) / 30000 * 100
            
            print(f"📈 覆盖范围: loadtestc{min_idx} - loadtestc{max_idx}")
            print(f"📉 总体成功率: {success_rate:.2f}%")
            
            if success_rate >= 10:
                print("🎉 成功率良好，可用于压力测试!")
            elif success_rate >= 5:
                print("⚠️ 成功率一般，建议继续优化")
            else:
                print("❌ 成功率较低，需要进一步优化策略")
    else:
        print("❌ 没有找到任何邀请码数据")

if __name__ == "__main__":
    print("⚖️ 启动稳定邀请码生成器...")
    stable_generate()
