import { ContractReceipt, ethers } from "ethers"
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import fse from 'fs-extra';

const cachePath = path.join(process.cwd(), 'cache');

export async function task(taskName, wallet: ethers.Wallet, cb, opts?: {
  runCount?: number
  force?: boolean
  dependies?: string[]
}) {
  const { force, runCount = 1, dependies = [] } = opts || {}
  const walletAddr = wallet.address;
  const logPath = path.join(cachePath, walletAddr);
  const isExsit = await fse.pathExists(logPath)
  const text = `[任务|${taskName}]${walletAddr}:`;
  let log = isExsit
    ? fse.readJSONSync(logPath) || {}
    : fse.writeJSONSync(logPath, {});
  if (dependies.length) {
    if (dependies.some(taskName => !log?.[taskName])) {
      console.log(`[${walletAddr}]前置依赖任务${dependies.join(',')}未完成`)
      return
    }
  }
  if (log?.[taskName] >= runCount && !force) return
  console.log(`${text}⌛️执行中...`)
  try {
    await cb()
    const count = (log?.[taskName] || 0) + 1;
    fse.writeJSONSync(logPath, { ...log, [taskName]: count });
    console.log(`✅${text}执行成功`)
  } catch (error) {
    console.log(`❌${text}执行失败: ${error?.reason || error?.message}`)
  }
}

const receiptsPath = path.join(__dirname, 'receipts.json');

export const saveReceipt = (receipt: ContractReceipt) => {
  const data = JSON.stringify(receipt, null, 2);
  const json = JSON.parse(readFileSync(receiptsPath, 'utf-8'));
  json[receipt.from] = receipt;
  const content = JSON.stringify(json, null, 2);
  writeFileSync(receiptsPath, content);
};

export const readReceipt = (from: string): ContractReceipt => {
  const json = fse.readJSONSync(receiptsPath);
  return json[from]
}

export const formatEther = (value: ethers.BigNumberish, len = 4) => {
  return +(+ethers.utils.formatEther(value)).toFixed(len);
};

export const resetCache = () => {
  fse.writeJSONSync(receiptsPath, {});
  fse.emptyDirSync(cachePath);
}

export const ensureCacheExsit = () => {
  const cacheDirIsExsit = fse.pathExistsSync(cachePath);
  if (!cacheDirIsExsit) {
    fse.mkdirSync(cachePath);
  }
}

// 获取txt文件内容，移除空行和制表符并转换为数组
export function getTxtContent(path: string) {
  const str = readFileSync(path, 'utf-8');
  return str.split(/[(\r\n)\r\n]+/).filter(el => el);
};
