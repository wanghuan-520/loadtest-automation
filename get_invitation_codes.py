#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量获取loadtest账户邀请码
从loadtestc1@teml.net到loadtestc30000@teml.net账户获取邀请码信息
"""

import requests
import json
import time
import threading
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import logging
from typing import Dict, List, Optional

# 🚀 配置参数
class Config:
    # 认证相关URL
    AUTH_URL = "https://auth-station-dev-staging.aevatar.ai/connect/token"
    # 用户邀请码获取API（已验证正确）
    INVITATION_CODE_URL = "https://station-developer-dev-staging.aevatar.ai/godgptpressure-client/api/godgpt/invitation/info"
    
    DEFAULT_WORKERS = 30
    REQUEST_TIMEOUT = 30
    
    # 默认密码（根据实际情况调整）
    DEFAULT_PASSWORD = "Wh520520!"

# 📊 全局统计
class GlobalStats:
    def __init__(self):
        self.total_checked = 0
        self.success_count = 0
        self.failed_count = 0
        self.invitation_codes = {}
        self.start_time = time.time()
        self.lock = threading.Lock()

# 🔧 设置日志
def setup_logging(log_filename: str):
    """设置日志配置"""
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

class InvitationCodeFetcher:
    def __init__(self, prefix: str, start_index: int, end_index: int, workers: int, password: str):
        self.prefix = prefix
        self.start_index = start_index
        self.end_index = end_index
        self.workers = workers
        self.password = password
        # 优化连接池配置 - 增加最大连接数
        self.session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=workers,
            pool_maxsize=workers * 2,
            max_retries=1,
            pool_block=False
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        self.invitation_codes = {}
        self.failed_accounts = []
        self.lock = threading.Lock()
        self.start_time = time.time()

    def generate_email(self, index: int) -> str:
        """生成邮箱地址"""
        return f"{self.prefix}{index}@teml.net"

    def get_bearer_token(self, email: str) -> Optional[str]:
        """获取用户的Bearer Token"""
        try:
            response = self.session.post(Config.AUTH_URL, data={
                'grant_type': 'password',
                'client_id': 'AevatarAuthServer',
                'apple_app_id': 'com.gpt.god',
                'scope': 'Aevatar offline_access',
                'username': email,
                'password': self.password
            }, headers={
                'accept': 'application/json',
                'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
                'content-type': 'application/x-www-form-urlencoded',
                'origin': 'https://godgpt-ui-testnet.aelf.dev',
                'referer': 'https://godgpt-ui-testnet.aelf.dev/',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }, timeout=Config.REQUEST_TIMEOUT)

            if response.status_code == 200:
                token_data = response.json()
                return token_data.get('access_token')
            else:
                logging.error(f"❌ {email} - 获取token失败: HTTP {response.status_code}")
                return None
                
        except Exception as e:
            logging.error(f"❌ {email} - 获取token异常: {str(e)}")
            return None

    def get_invitation_code(self, email: str, bearer_token: str) -> Optional[str]:
        """获取用户的邀请码"""
        try:
            # 使用正确的invitation/info API获取邀请码
            response = self.session.get(Config.INVITATION_CODE_URL, headers={
                'accept': 'application/json',
                'authorization': f'Bearer {bearer_token}',
                'content-type': 'application/json',
                'origin': 'https://godgpt-ui-testnet.aelf.dev',
                'referer': 'https://godgpt-ui-testnet.aelf.dev/',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }, timeout=Config.REQUEST_TIMEOUT)

            if response.status_code == 200:
                data = response.json()
                if data.get('code') == '20000' and data.get('data'):
                    # API返回格式: {"code": "20000", "data": {"inviteCode": "xxx", ...}}
                    invite_data = data.get('data', {})
                    if isinstance(invite_data, dict) and 'inviteCode' in invite_data:
                        return invite_data['inviteCode']
            else:
                logging.error(f"❌ {email} - 获取邀请码API失败: HTTP {response.status_code}, 响应: {response.text}")
            
            return None
            
        except Exception as e:
            logging.error(f"❌ {email} - 获取邀请码异常: {str(e)}")
            return None

    def fetch_single_invitation_code(self, index: int):
        """获取单个账户的邀请码"""
        email = self.generate_email(index)
        
        # 步骤1: 获取Bearer Token
        bearer_token = self.get_bearer_token(email)
        if not bearer_token:
            with self.lock:
                self.failed_accounts.append(email)
            return
        
        # 步骤2: 获取邀请码
        invitation_code = self.get_invitation_code(email, bearer_token)
        
        with self.lock:
            if invitation_code:
                self.invitation_codes[email] = invitation_code
                logging.info(f"✅ {email} - 邀请码: {invitation_code}")
            else:
                self.failed_accounts.append(email)
                logging.error(f"❌ {email} - 无法获取邀请码")

    def run_fetch(self):
        """运行邀请码获取"""
        logging.info(f"🔍 获取邀请码 ({self.prefix}{self.start_index}-{self.prefix}{self.end_index})...")
        account_indices = list(range(self.start_index, self.end_index + 1))
        
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [executor.submit(self.fetch_single_invitation_code, idx) for idx in account_indices]
            
            for i, future in enumerate(as_completed(futures)):
                if (i + 1) % 50 == 0:
                    elapsed = time.time() - self.start_time
                    speed = (i + 1) / elapsed if elapsed > 0 else 0
                    logging.info(f"📊 进度: {i+1}/{len(account_indices)} ({((i+1)/len(account_indices))*100:.1f}%), 速度: {speed:.2f}账户/秒")

        elapsed_time = time.time() - self.start_time
        logging.info(f"✨ 获取完成! 总耗时: {elapsed_time:.2f}秒")
        
        success_count = len(self.invitation_codes)
        failed_count = len(self.failed_accounts)
        total_checked = success_count + failed_count
        
        success_rate = (success_count / total_checked) * 100 if total_checked > 0 else 0

        logging.info("📈 统计结果:")
        logging.info(f"   成功获取: {success_count} 个")
        logging.info(f"   获取失败: {failed_count} 个")
        
        print("==================================================")
        print("🎯 获取总结:")
        print(f"   总检查账户: {total_checked}")
        print(f"   ✅ 成功获取: {success_count} 个")
        print(f"   ❌ 获取失败: {failed_count} 个")
        print(f"   📊 成功率: {success_rate:.2f}%")

        # 保存结果
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 保存邀请码数据（JSON格式）
        if self.invitation_codes:
            invitation_codes_filename = f"{self.prefix}_invitation_codes_{timestamp}.json"
            with open(f"results/{invitation_codes_filename}", "w", encoding='utf-8') as f:
                json.dump(self.invitation_codes, f, indent=2, ensure_ascii=False)
            logging.info(f"📁 邀请码数据保存到: results/{invitation_codes_filename}")

        # 保存为k6测试可用的格式（简单数组）
        if self.invitation_codes:
            invite_codes_list = list(self.invitation_codes.values())
            k6_data_filename = f"{self.prefix}_invite_codes_for_k6_{timestamp}.json"
            with open(f"results/{k6_data_filename}", "w", encoding='utf-8') as f:
                json.dump(invite_codes_list, f, indent=2, ensure_ascii=False)
            logging.info(f"📁 K6测试数据保存到: results/{k6_data_filename}")

        # 保存失败账户列表
        if self.failed_accounts:
            failed_filename = f"{self.prefix}_invitation_failed_{timestamp}.txt"
            with open(f"results/{failed_filename}", "w", encoding='utf-8') as f:
                for email in self.failed_accounts:
                    f.write(f"{email}\n")
            logging.info(f"📁 失败账户保存到: results/{failed_filename}")

def main():
    parser = argparse.ArgumentParser(description='🚀 批量获取loadtest账户邀请码')
    parser.add_argument('--prefix', '-p', default="loadtestc", help='邮箱前缀')
    parser.add_argument('--start', '-s', type=int, default=1, help='起始索引')
    parser.add_argument('--count', '-c', type=int, default=100, help='获取数量')
    parser.add_argument('--workers', '-w', type=int, default=Config.DEFAULT_WORKERS, help='并发线程数')
    parser.add_argument('--password', '-pw', default=Config.DEFAULT_PASSWORD, help='账户密码')
    
    args = parser.parse_args()
    
    end_index = args.start + args.count - 1
    
    # 设置日志
    log_filename = f"get_invitation_codes_{args.prefix}_{args.start}-{end_index}.log"
    setup_logging(log_filename)
    
    # 开始获取
    fetcher = InvitationCodeFetcher(args.prefix, args.start, end_index, args.workers, args.password)
    fetcher.run_fetch()

if __name__ == "__main__":
    main()
