#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重新获取失败的邀请码
专门处理之前失败的398个账户
"""

import requests
import threading
import time
import json
import os
from datetime import datetime
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

class FailedCodeRetriever:
    def __init__(self, failed_file: str, workers: int = 30, password: str = "Password123"):
        self.failed_file = failed_file
        self.workers = workers
        self.password = password
        
        # 优化连接池配置
        self.session = requests.Session()
        adapter = HTTPAdapter(
            pool_connections=100,
            pool_maxsize=200,
            max_retries=Retry(
                total=3,
                backoff_factor=0.3,
                status_forcelist=[500, 502, 503, 504]
            )
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        
        self.invitation_codes = {}
        self.failed_accounts = []
        self.lock = threading.Lock()
        self.start_time = time.time()
        
        # 配置日志
        self.setup_logging()
        
    def setup_logging(self):
        """配置日志"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = f"results/retry_failed_codes_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file, encoding='utf-8'),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def load_failed_accounts(self):
        """加载失败的账户列表"""
        failed_accounts = []
        try:
            with open(self.failed_file, 'r', encoding='utf-8') as f:
                for line in f:
                    email = line.strip()
                    if email and '@' in email:
                        failed_accounts.append(email)
            self.logger.info(f"📥 加载了 {len(failed_accounts)} 个失败账户")
            return failed_accounts
        except Exception as e:
            self.logger.error(f"❌ 加载失败账户时出错: {e}")
            return []
    
    def get_invitation_code(self, email: str) -> str:
        """获取单个邀请码"""
        try:
            # 获取token
            auth_url = "https://auth-station-dev-staging.aevatar.ai/api/auth/email/login"
            auth_data = {
                "email": email,
                "password": self.password,
                "recaptcha_token": ""
            }
            
            response = self.session.post(auth_url, json=auth_data, timeout=30)
            response.raise_for_status()
            
            auth_result = response.json()
            if not auth_result.get('success'):
                return None
            
            token = auth_result['data']['access_token']
            
            # 获取邀请码
            invitation_url = "https://auth-station-dev-staging.aevatar.ai/api/invitation/generate"
            headers = {"Authorization": f"Bearer {token}"}
            
            response = self.session.post(invitation_url, headers=headers, timeout=30)
            response.raise_for_status()
            
            invitation_result = response.json()
            if invitation_result.get('success'):
                return invitation_result['data']['code']
            
            return None
            
        except Exception as e:
            self.logger.debug(f"❌ {email} - 获取失败: {str(e)}")
            return None
    
    def worker(self, email_list):
        """工作线程"""
        for email in email_list:
            invitation_code = self.get_invitation_code(email)
            
            with self.lock:
                if invitation_code:
                    self.invitation_codes[email] = invitation_code
                    self.logger.info(f"✅ {email} - 邀请码: {invitation_code}")
                else:
                    self.failed_accounts.append(email)
                    self.logger.warning(f"❌ {email} - 重试失败")
                
                # 进度报告
                completed = len(self.invitation_codes) + len(self.failed_accounts)
                if completed % 50 == 0:
                    success_rate = len(self.invitation_codes) / completed * 100 if completed > 0 else 0
                    elapsed = time.time() - self.start_time
                    speed = completed / elapsed if elapsed > 0 else 0
                    self.logger.info(f"📊 重试进度: {completed}/398 ({completed/398*100:.1f}%), 成功率: {success_rate:.1f}%, 速度: {speed:.2f}账户/秒")
    
    def run_retry(self):
        """运行重试获取"""
        self.logger.info("🔄 开始重新获取失败的邀请码...")
        self.logger.info(f"⚡ 并发数: {self.workers}")
        
        # 加载失败账户
        failed_accounts = self.load_failed_accounts()
        if not failed_accounts:
            self.logger.error("❌ 没有找到失败的账户")
            return
        
        # 分配任务给线程
        chunk_size = len(failed_accounts) // self.workers + 1
        threads = []
        
        for i in range(0, len(failed_accounts), chunk_size):
            chunk = failed_accounts[i:i + chunk_size]
            if chunk:
                thread = threading.Thread(target=self.worker, args=(chunk,))
                threads.append(thread)
                thread.start()
        
        # 等待所有线程完成
        for thread in threads:
            thread.join()
        
        # 保存结果
        self.save_results()
    
    def save_results(self):
        """保存结果"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 统计结果
        total_retry = len(self.invitation_codes) + len(self.failed_accounts)
        success_count = len(self.invitation_codes)
        still_failed = len(self.failed_accounts)
        
        elapsed = time.time() - self.start_time
        
        self.logger.info("✨ 重试完成!")
        self.logger.info(f"📈 重试统计:")
        self.logger.info(f"   重试账户: {total_retry}")
        self.logger.info(f"   ✅ 重试成功: {success_count}")
        self.logger.info(f"   ❌ 仍然失败: {still_failed}")
        self.logger.info(f"   📊 重试成功率: {success_count/total_retry*100:.2f}%")
        self.logger.info(f"   ⏱️  总耗时: {elapsed:.2f}秒")
        
        # 保存新获取的邀请码
        if self.invitation_codes:
            retry_codes_file = f"results/loadtestc_retry_codes_{timestamp}.json"
            with open(retry_codes_file, 'w', encoding='utf-8') as f:
                json.dump(self.invitation_codes, f, ensure_ascii=False, indent=2)
            self.logger.info(f"📁 重试获取的邀请码保存到: {retry_codes_file}")
            
            # K6格式
            k6_codes = [code for code in self.invitation_codes.values()]
            k6_file = f"results/loadtestc_retry_codes_for_k6_{timestamp}.json"
            with open(k6_file, 'w', encoding='utf-8') as f:
                json.dump(k6_codes, f, ensure_ascii=False, indent=2)
            self.logger.info(f"📁 K6格式重试邀请码保存到: {k6_file}")
        
        # 保存仍然失败的账户
        if self.failed_accounts:
            still_failed_file = f"results/loadtestc_still_failed_{timestamp}.txt"
            with open(still_failed_file, 'w', encoding='utf-8') as f:
                for email in self.failed_accounts:
                    f.write(f"{email}\n")
            self.logger.info(f"📁 仍然失败的账户保存到: {still_failed_file}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='重新获取失败的邀请码')
    parser.add_argument('--failed-file', required=True, help='失败账户文件路径')
    parser.add_argument('--workers', type=int, default=30, help='并发线程数')
    parser.add_argument('--password', default='Password123', help='账户密码')
    
    args = parser.parse_args()
    
    retriever = FailedCodeRetriever(
        failed_file=args.failed_file,
        workers=args.workers,
        password=args.password
    )
    
    retriever.run_retry()

if __name__ == "__main__":
    main()
