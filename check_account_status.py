#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
账户注册状态批量检查器
通过API直接验证账户是否已注册
"""

import requests
import json
import time
import threading
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import logging
from typing import Dict, List

# 🚀 配置参数
class Config:
    CHECK_URL = "https://station-developer-dev-staging.aevatar.ai/godgptpressure-client/api/account/check-email-registered"
    DEFAULT_WORKERS = 20
    REQUEST_TIMEOUT = 10
    
# 📊 全局统计
class GlobalStats:
    def __init__(self):
        self.total_checked = 0
        self.registered = 0
        self.unregistered = 0
        self.failed_check = 0
        self.start_time = time.time()
        self.lock = threading.Lock()

# 🔧 设置日志
def setup_logging(log_filename: str):
    """设置日志配置"""
    # 创建results目录
    import os
    os.makedirs("results", exist_ok=True)
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f"results/{log_filename}", encoding='utf-8'),
            logging.StreamHandler()
        ]
    )

class AccountChecker:
    def __init__(self, prefix: str, start_index: int, end_index: int, workers: int):
        self.prefix = prefix
        self.start_index = start_index
        self.end_index = end_index
        self.workers = workers
        self.check_url = Config.CHECK_URL
        self.session = requests.Session()
        self.results = {'registered': [], 'unregistered': [], 'failed_check': []}
        self.lock = threading.Lock()
        self.start_time = time.time()

    def generate_email(self, index: int) -> str:
        """生成邮箱地址"""
        return f"{self.prefix}{index}@teml.net"

    def check_single_account(self, index: int):
        """检查单个账户注册状态"""
        email = self.generate_email(index)
        url = self.check_url
        payload = {"emailAddress": email}
        
        try:
            response = self.session.post(url, json=payload, timeout=Config.REQUEST_TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                is_registered = data.get('data', False) if data.get('code') == '20000' else False
                
                with self.lock:
                    if is_registered:
                        self.results['registered'].append(email)
                        logging.info(f"✅ {email} - 已注册")
                    else:
                        self.results['unregistered'].append(email)
                        logging.info(f"❌ {email} - 未注册")
            else:
                with self.lock:
                    self.results['failed_check'].append(email)
                    logging.error(f"⚠️ {email} - 检查失败: HTTP {response.status_code}")
                    if response.text:
                        logging.error(f"   响应: {response.text}")
                        
        except requests.exceptions.Timeout:
            with self.lock:
                self.results['failed_check'].append(email)
                logging.error(f"⚠️ {email} - 检查超时")
        except Exception as e:
            with self.lock:
                self.results['failed_check'].append(email)
                logging.error(f"⚠️ {email} - 检查异常: {str(e)}")

    def run_check(self):
        """运行账户状态检查"""
        logging.info(f"🔍 检查账户状态 ({self.prefix}{self.start_index}-{self.prefix}{self.end_index})...")
        account_indices = list(range(self.start_index, self.end_index + 1))
        
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [executor.submit(self.check_single_account, idx) for idx in account_indices]
            
            for i, future in enumerate(as_completed(futures)):
                if (i + 1) % 100 == 0:
                    elapsed = time.time() - self.start_time
                    speed = (i + 1) / elapsed if elapsed > 0 else 0
                    logging.info(f"📊 进度: {i+1}/{len(account_indices)} ({((i+1)/len(account_indices))*100:.1f}%), 速度: {speed:.2f}账户/秒")

        elapsed_time = time.time() - self.start_time
        logging.info(f"✨ 检查完成! 总耗时: {elapsed_time:.2f}秒")
        
        registered_count = len(self.results['registered'])
        unregistered_count = len(self.results['unregistered'])
        failed_count = len(self.results['failed_check'])
        total_checked = registered_count + unregistered_count + failed_count
        
        success_rate = (registered_count / total_checked) * 100 if total_checked > 0 else 0

        logging.info("📈 统计结果:")
        logging.info(f"   已注册: {registered_count} 个")
        logging.info(f"   未注册: {unregistered_count} 个")
        logging.info(f"   检查失败: {failed_count} 个")
        
        print("==================================================")
        print("🎯 验证总结:")
        print(f"   总检查账户: {total_checked}")
        print(f"   ✅ 已注册: {registered_count} 个")
        print(f"   ❌ 未注册: {unregistered_count} 个")
        print(f"   ⚠️ 检查失败: {failed_count} 个")
        print(f"   📊 注册成功率: {success_rate:.2f}%")

        # 保存结果
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 保存已注册账户列表
        if self.results['registered']:
            registered_filename = f"{self.prefix}_verification_registered_{timestamp}.txt"
            with open(f"results/{registered_filename}", "w") as f:
                for email in self.results['registered']:
                    f.write(f"{email}\n")
            logging.info(f"📁 已注册账户保存到: results/{registered_filename}")

        # 保存未注册账户列表
        if self.results['unregistered']:
            unregistered_filename = f"{self.prefix}_verification_unregistered_{timestamp}.txt"
            with open(f"results/{unregistered_filename}", "w") as f:
                for email in self.results['unregistered']:
                    f.write(f"{email}\n")
            logging.info(f"📁 未注册账户保存到: results/{unregistered_filename}")

        # 保存完整结果
        full_results_filename = f"{self.prefix}_verification_complete_{timestamp}.json"
        with open(f"results/{full_results_filename}", "w") as f:
            json.dump(self.results, f, indent=2)
        logging.info(f"📁 完整结果保存到: results/{full_results_filename}")

def main():
    parser = argparse.ArgumentParser(description='🚀 账户注册状态批量检查器')
    parser.add_argument('--prefix', '-p', default="loadtestc", help='邮箱前缀')
    parser.add_argument('--start', '-s', type=int, default=1, help='起始索引')
    parser.add_argument('--count', '-c', type=int, default=100, help='检查数量')
    parser.add_argument('--workers', '-w', type=int, default=Config.DEFAULT_WORKERS, help='并发线程数')
    
    args = parser.parse_args()
    
    end_index = args.start + args.count - 1
    
    # 设置日志
    log_filename = f"check_status_{args.prefix}_{args.start}-{end_index}.log"
    setup_logging(log_filename)
    
    # 开始检查
    checker = AccountChecker(args.prefix, args.start, end_index, args.workers)
    checker.run_check()

if __name__ == "__main__":
    main()